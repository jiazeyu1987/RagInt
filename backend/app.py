#!/usr/bin/env python3
import sys
import os
from pathlib import Path
from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS
import json
import threading
import time
import uuid
import copy
import logging
import contextlib

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class _DashscopeByeNoiseFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:
            return True
        # DashScope websocket-client sometimes logs normal close (code 1000, "Bye") as ERROR.
        if "opcode=8" in msg and "Bye" in msg and ("goodbye" in msg.lower() or "websocket closed" in msg.lower()):
            return False
        # Noisy but expected connection churn from the SDK/pool.
        if "Websocket connected" in msg:
            return False
        if "SpeechSynthesizerObjectPool" in msg and "renew synthesizer after" in msg:
            return False
        return True


for _name in (
    "dashscope.audio.tts_v2.speech_synthesizer",
    "dashscope",
    "websocket",
    "websocket._logging",
    "websocket._app",
):
    with contextlib.suppress(Exception):
        logging.getLogger(_name).addFilter(_DashscopeByeNoiseFilter())
        # Keep our app logs at INFO; reduce third-party log spam.
        logging.getLogger(_name).setLevel(logging.WARNING)

# Ensure the filter applies even if third-party libs attach their own handlers.
with contextlib.suppress(Exception):
    _root_logger = logging.getLogger()
    for _h in list(getattr(_root_logger, "handlers", []) or []):
        _h.addFilter(_DashscopeByeNoiseFilter())

# websocket-client may add its own StreamHandler (no timestamp) when trace is enabled; remove non-null handlers.
with contextlib.suppress(Exception):
    from logging import NullHandler as _NullHandler  # type: ignore
    _ws_logger = logging.getLogger("websocket")
    for _h in list(_ws_logger.handlers):
        if not isinstance(_h, _NullHandler):
            _ws_logger.removeHandler(_h)

sys.path.append(str(Path(__file__).parent))

app = Flask(__name__)
# CORS: frontend runs on :3000 and calls backend :8000 (cross-origin).
# We enable credentials to support browser behaviors like sendBeacon/fetch with cookies if present.
CORS(
    app,
    supports_credentials=True,
    resources={
        r"/api/*": {
            "origins": [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
            ]
        }
    },
    allow_headers=["Content-Type", "X-Client-ID", "X-Request-ID", "X-Recording-ID", "X-TTS-Provider", "X-TTS-Voice"],
)

sys.path.append(str(Path(__file__).parent.parent))
sys.path.append(str(Path(__file__).parent.parent / "ragflow_demo"))
sys.path.append(str(Path(__file__).parent.parent / "fuasr_demo"))
sys.path.append(str(Path(__file__).parent.parent / "tts_demo"))

from services.asr_service import ASRService
from services.config_utils import get_nested
from services.history_store import HistoryStore
from services.intent_service import IntentService
from services.ragflow_agent_service import RagflowAgentService
from services.ragflow_service import RagflowService
from services.tour_planner import TourPlanner
from services.tts_service import TTSSvc
from services.recording_store import RecordingStore
from infra.cancellation import CancellationRegistry
from infra.event_store import EventStore
from orchestrators.conversation_orchestrator import AskInput, ConversationOrchestrator

ragflow_service = RagflowService(Path(__file__).parent.parent / "ragflow_demo" / "ragflow_config.json", logger=logger)
ragflow_agent_service = RagflowAgentService(Path(__file__).parent.parent / "ragflow_demo" / "ragflow_config.json", logger=logger)
history_store = HistoryStore(Path(__file__).parent / "data" / "qa_history.db", logger=logger)
asr_service = ASRService(logger=logger)
tts_service = TTSSvc(logger=logger)
intent_service = IntentService()
tour_planner = TourPlanner()
request_registry = CancellationRegistry()
event_store = EventStore()
asr_model_loaded = asr_service.funasr_loaded
recording_store = RecordingStore(Path(__file__).parent / "data" / "recordings", logger=logger)

class SuppressOutput:
    def __enter__(self):
        import sys
        self._original_stdout = sys.stdout
        self._original_stderr = sys.stderr
        sys.stdout = open(os.devnull, 'w')
        sys.stderr = open(os.devnull, 'w')
        return self
    def __exit__(self, exc_type, exc_val, exc_tb):
        import sys
        sys.stdout.close()
        sys.stderr.close()
        sys.stdout = self._original_stdout
        sys.stderr = self._original_stderr

ragflow_client = None
session = None
ragflow_dataset_id = None
ragflow_default_chat_name = None

ASK_TIMINGS = {}
ASK_TIMINGS_LOCK = threading.Lock()


def _timings_prune(now_perf: float, ttl_s: float = 300.0, max_items: int = 500):
    with ASK_TIMINGS_LOCK:
        if len(ASK_TIMINGS) <= max_items:
            items = list(ASK_TIMINGS.items())
        else:
            items = list(ASK_TIMINGS.items())
        for key, value in items:
            t_submit = value.get("t_submit")
            if isinstance(t_submit, (int, float)) and (now_perf - float(t_submit)) > ttl_s:
                ASK_TIMINGS.pop(key, None)
        if len(ASK_TIMINGS) > max_items:
            # best-effort: drop oldest by t_submit
            ordered = sorted(
                ASK_TIMINGS.items(),
                key=lambda kv: float(kv[1].get("t_submit", now_perf)),
            )
            for key, _ in ordered[: max(0, len(ASK_TIMINGS) - max_items)]:
                ASK_TIMINGS.pop(key, None)


def _timings_set(request_id: str, **fields):
    now_perf = time.perf_counter()
    _timings_prune(now_perf)
    with ASK_TIMINGS_LOCK:
        entry = ASK_TIMINGS.get(request_id) or {}
        entry.update(fields)
        ASK_TIMINGS[request_id] = entry


def _timings_get(request_id: str):
    with ASK_TIMINGS_LOCK:
        entry = ASK_TIMINGS.get(request_id)
        return dict(entry) if isinstance(entry, dict) else None


def load_app_config():
    return ragflow_service.load_config() or {}

def _get_nested(config: dict, path: list, default=None):
    return get_nested(config, path, default)


def _apply_tts_overrides(app_config: dict, *, provider: str, data: dict) -> dict:
    """
    Per-request overrides (do not mutate cached config dict from RagflowService).

    Supported:
    - tts_voice: override `tts.bailian.voice` when provider is modelscope/bailian/dashscope/flash.
    - tts_model: override `tts.bailian.model` when provider is modelscope/bailian/dashscope/flash.
    """
    cfg = app_config
    provider_norm = str(provider or "").strip().lower()
    tts_voice = ""
    tts_model = ""
    try:
        tts_voice = str((data or {}).get("tts_voice") or "").strip()
    except Exception:
        tts_voice = ""

    try:
        tts_model = str((data or {}).get("tts_model") or "").strip()
    except Exception:
        tts_model = ""

    # Provider-specific preset: "flash" means use cosyvoice-v3-flash with a reasonable default system voice.
    if provider_norm == "flash":
        if not tts_model:
            tts_model = "cosyvoice-v3-flash"
        if not tts_voice:
            tts_voice = "longanyang"

    if not tts_voice and not tts_model:
        return cfg
    if provider_norm not in ("modelscope", "bailian", "dashscope", "flash"):
        return cfg

    # Deep copy to avoid mutating cached config (ragflow_service._last_loaded_cfg).
    cfg = copy.deepcopy(app_config or {})
    if not isinstance(cfg, dict):
        cfg = {}
    if not isinstance(cfg.get("tts"), dict):
        cfg["tts"] = {}
    if not isinstance(cfg["tts"].get("bailian"), dict):
        cfg["tts"]["bailian"] = {}
    if tts_voice:
        cfg["tts"]["bailian"]["voice"] = tts_voice
    if tts_model:
        cfg["tts"]["bailian"]["model"] = tts_model
    return cfg


def init_ragflow():
    global ragflow_client, session, ragflow_dataset_id, ragflow_default_chat_name
    try:
        ok = ragflow_service.init()
        ragflow_client = ragflow_service.client
        ragflow_dataset_id = ragflow_service.dataset_id
        ragflow_default_chat_name = ragflow_service.default_chat_name
        session = ragflow_service.get_session(ragflow_default_chat_name) if ok else None
        return bool(ok)

    except Exception as e:
        logger.error(f"RAGFlow初始化失败: {e}")
        import traceback
        traceback.print_exc()
        return False

init_ragflow()

def load_ragflow_config():
    return ragflow_service.load_config() or {}


def _ragflow_chat_to_dict(chat):
    if chat is None:
        return None
    if hasattr(chat, "name"):
        return {"id": getattr(chat, "id", None), "name": getattr(chat, "name", None)}
    if isinstance(chat, dict):
        return {"id": chat.get("id"), "name": chat.get("name")}
    return {"id": None, "name": str(chat)}


def get_ragflow_session(chat_name: str):
    return ragflow_service.get_session(chat_name)


@app.route('/api/ragflow/chats', methods=['GET'])
def ragflow_list_chats():
    return jsonify(ragflow_service.list_chats())

@app.route('/api/ragflow/agents', methods=['GET'])
def ragflow_list_agents():
    res = ragflow_service.list_agents()
    try:
        logger.info(f"ragflow_agents_list count={len(res.get('agents') or [])}")
    except Exception:
        pass
    return jsonify(res)


@app.route('/api/history', methods=['GET'])
def api_history_list():
    sort_mode = (request.args.get("sort") or "time").strip().lower()
    order = (request.args.get("order") or "desc").strip().lower()
    limit = int(request.args.get("limit") or 100)
    desc = order != "asc"

    if sort_mode in ("count", "freq", "frequency"):
        items = history_store.list_by_count(limit=limit, desc=desc)
        return jsonify({"sort": "count", "items": items})

    items = history_store.list_by_time(limit=limit, desc=desc)
    return jsonify({"sort": "time", "items": items})

@app.route('/api/tour/stops', methods=['GET'])
def api_tour_stops():
    cfg = load_ragflow_config() or {}
    tour_cfg = cfg.get("tour", {}) if isinstance(cfg, dict) else {}
    stops = tour_cfg.get("stops") if isinstance(tour_cfg, dict) else None
    source = "default"
    if isinstance(stops, list) and stops:
        source = "ragflow_config.tour.stops"
    else:
        stops = [
            "公司总体介绍",
            "核心产品概览",
            "骨科产品",
            "泌尿产品",
            "其他产品与应用场景",
            "总结与提问引导",
        ]
    stops = [str(s).strip() for s in stops if str(s).strip()]
    return jsonify({"stops": stops, "source": source})

@app.route('/api/tour/meta', methods=['GET'])
def api_tour_meta():
    cfg = load_ragflow_config() or {}
    meta = tour_planner.get_meta(cfg if isinstance(cfg, dict) else {})
    return jsonify(meta)

@app.route('/api/tour/plan', methods=['POST'])
def api_tour_plan():
    cfg = load_ragflow_config() or {}
    data = request.get_json() or {}
    zone = str((data.get("zone") or "")).strip()
    profile = str((data.get("profile") or "")).strip()
    duration_s = data.get("duration_s") or 60
    plan = tour_planner.make_plan(cfg if isinstance(cfg, dict) else {}, zone=zone, profile=profile, duration_s=duration_s)
    stops_meta = []
    try:
        for name, d, tc in zip(list(plan.stops), list(plan.stop_durations_s), list(plan.stop_target_chars)):
            stops_meta.append({"name": str(name), "duration_s": int(d), "target_chars": int(tc)})
    except Exception:
        stops_meta = [{"name": str(s)} for s in list(plan.stops)]
    return jsonify(
        {
            "zone": plan.zone,
            "profile": plan.profile,
            "duration_s": plan.duration_s,
            "stops": list(plan.stops),
            "stop_durations_s": list(getattr(plan, "stop_durations_s", ()) or ()),
            "stop_target_chars": list(getattr(plan, "stop_target_chars", ()) or ()),
            "stops_meta": stops_meta,
            "source": plan.source,
        }
    )

@app.route('/api/cancel', methods=['POST'])
def api_cancel():
    data = request.get_json() or {}
    request_id = str((data.get("request_id") or "")).strip()
    client_id = str((data.get("client_id") or request.headers.get("X-Client-ID") or "")).strip() or "-"
    reason = str((data.get("reason") or "client_cancel")).strip()

    cancelled = False
    cancelled_id = None
    if request_id:
        cancelled = request_registry.cancel(request_id, reason=reason)
        cancelled_id = request_id if cancelled else None
    else:
        cancelled_id = request_registry.cancel_active(client_id=client_id, kind="ask", reason=reason)
        cancelled = bool(cancelled_id)

    logger.info(f"[{request_id or '-'}] cancel_request client_id={client_id} cancelled={cancelled} target={cancelled_id} reason={reason}")
    if cancelled_id:
        event_store.emit(
            request_id=cancelled_id,
            client_id=client_id,
            kind="cancel",
            name="cancel",
            level="info",
            reason=reason,
        )
    return jsonify({"ok": True, "cancelled": cancelled, "request_id": cancelled_id, "client_id": client_id})

@app.route('/api/events', methods=['GET'])
def api_events():
    request_id = str((request.args.get("request_id") or request.headers.get("X-Request-ID") or "")).strip()
    try:
        limit = int(request.args.get("limit") or 200)
    except Exception:
        limit = 200
    try:
        since_ms = int(request.args.get("since_ms")) if request.args.get("since_ms") is not None else None
    except Exception:
        since_ms = None

    fmt = str((request.args.get("format") or "json")).strip().lower()

    if request_id:
        items = event_store.list_events(request_id=request_id, limit=limit, since_ms=since_ms)
        last_error = event_store.last_error(request_id=request_id)
    else:
        items = event_store.list_recent(limit=limit, since_ms=since_ms)
        last_error = None

    if fmt in ("ndjson", "jsonl"):
        body = "\n".join(json.dumps(it, ensure_ascii=False) for it in items) + ("\n" if items else "")
        return Response(body, mimetype="application/x-ndjson", headers={"Cache-Control": "no-cache"})

    return jsonify({"request_id": request_id or None, "items": items, "last_error": last_error})

@app.route('/api/client_events', methods=['POST'])
def api_client_events():
    """
    Frontend -> backend event ingest for observability.
    Used for client-only timeline points like playback end and nav UI state.
    """
    data = request.get_json() or {}
    request_id = str((data.get("request_id") or data.get("rid") or request.headers.get("X-Request-ID") or "")).strip()
    client_id = str((data.get("client_id") or data.get("cid") or request.headers.get("X-Client-ID") or "")).strip() or "-"
    kind = str((data.get("kind") or "client")).strip() or "client"
    name = str((data.get("name") or data.get("event") or "")).strip()
    level = str((data.get("level") or "info")).strip() or "info"
    fields = data.get("fields") if isinstance(data.get("fields"), dict) else {}
    if not request_id or not name:
        return jsonify({"ok": False, "error": "request_id_and_name_required"}), 400

    # Emit to event store (best-effort).
    with contextlib.suppress(Exception):
        event_store.emit(
            request_id=request_id,
            client_id=client_id,
            kind=kind,
            name=name,
            level=level,
            **(fields or {}),
        )

    # Mirror selected events into perf-counter timings for /api/status derived_ms.
    with contextlib.suppress(Exception):
        now_perf = time.perf_counter()
        if name in ("play_end", "tts_play_end", "playback_end"):
            _timings_set(request_id, t_play_end=now_perf)

    return jsonify({"ok": True})

@app.route('/api/status', methods=['GET'])
def api_status():
    request_id = str((request.args.get("request_id") or request.headers.get("X-Request-ID") or "")).strip()
    if not request_id:
        return jsonify({"error": "request_id_required"}), 400

    now = time.perf_counter()
    timing = _timings_get(request_id) or {}
    cancel_info = request_registry.get_info(request_id) or {}
    cancelled = bool(cancel_info.get("canceled_at")) or request_registry.is_cancelled(request_id)
    tts_state = tts_service.tts_state_get(request_id) or {}

    def _dt(a, b):
        if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
            return None
        return round((float(a) - float(b)) * 1000.0, 1)

    t_submit = timing.get("t_submit")
    t_rag_first_chunk = timing.get("t_ragflow_first_chunk")
    t_rag_first_text = timing.get("t_ragflow_first_text")
    t_first_seg = timing.get("t_first_tts_segment")
    t_tts_first_audio = timing.get("t_tts_first_audio")
    t_play_end = timing.get("t_play_end")

    derived = {
        "submit_to_rag_first_chunk_ms": _dt(t_rag_first_chunk, t_submit),
        "submit_to_rag_first_text_ms": _dt(t_rag_first_text, t_submit),
        "submit_to_first_segment_ms": _dt(t_first_seg, t_submit),
        "submit_to_tts_first_audio_ms": _dt(t_tts_first_audio, t_submit),
        "submit_to_play_end_ms": _dt(t_play_end, t_submit),
        "now_since_submit_ms": _dt(now, t_submit),
    }
    derived = {k: v for k, v in derived.items() if v is not None}

    # Best-effort: infer SD-6 "stop/action" metadata from ask_received event.
    stop_id = None
    stop_name = None
    action_type = None
    with contextlib.suppress(Exception):
        for e in reversed(event_store.list_events(request_id=request_id, limit=200)):
            if e.get("name") != "ask_received":
                continue
            f = e.get("fields") if isinstance(e.get("fields"), dict) else {}
            stop_id = f.get("stop_id") or f.get("stop_index")
            stop_name = f.get("stop_name")
            action_type = f.get("action_type")
            break

    return jsonify(
        {
            "request_id": request_id,
            "cancelled": cancelled,
            "cancel": cancel_info,
            "timing": timing,
            "derived_ms": derived,
            "tts_state": tts_state,
            "last_error": event_store.last_error(request_id=request_id),
            "context": {"stop_id": stop_id, "stop_name": stop_name, "action_type": action_type},
        }
    )

@app.route('/health')
def health():
    return jsonify({
        "asr_loaded": asr_service.funasr_loaded,
        "ragflow_connected": session is not None
    })

@app.route('/api/speech_to_text', methods=['POST'])
def speech_to_text():
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file"}), 400

    audio_file = request.files['audio']
    raw_bytes = audio_file.read()

    request_id = str((request.form.get("request_id") or request.headers.get("X-Request-ID") or f"asr_{uuid.uuid4().hex[:12]}")).strip()
    client_id = str((request.form.get("client_id") or request.headers.get("X-Client-ID") or request.remote_addr or "-")).strip() or "-"
    event_store.emit(
        request_id=request_id,
        client_id=client_id,
        kind="asr",
        name="asr_received",
        bytes=len(raw_bytes),
        filename=getattr(audio_file, "filename", None),
        mimetype=getattr(audio_file, "mimetype", None),
    )

    if not request_registry.rate_allow(client_id, "asr", limit=6, window_s=3.0):
        logger.warning(f"[{request_id}] asr_rate_limited client_id={client_id}")
        event_store.emit(request_id=request_id, client_id=client_id, kind="asr", name="asr_rate_limited", level="warn")
        return jsonify({"text": ""})

    cancel_event = request_registry.register(
        client_id=client_id,
        request_id=request_id,
        kind="asr",
        cancel_previous=True,
        cancel_reason="asr_replaced_by_new",
    )
    if cancel_event.is_set():
        logger.info(f"[{request_id}] asr_cancelled_before_start client_id={client_id}")
        event_store.emit(request_id=request_id, client_id=client_id, kind="asr", name="asr_cancelled_before_start", level="info")
        request_registry.clear_active(client_id=client_id, kind="asr", request_id=request_id)
        return jsonify({"text": ""})

    app_config = load_app_config()
    t0 = time.perf_counter()
    try:
        event_store.emit(request_id=request_id, client_id=client_id, kind="asr", name="asr_start")
        text = asr_service.transcribe(
            raw_bytes,
            app_config,
            cancel_event=cancel_event,
            src_filename=getattr(audio_file, "filename", None),
            src_mime=getattr(audio_file, "mimetype", None),
        )
        dt_s = time.perf_counter() - t0
        logger.info(f"asr_done dt={dt_s:.3f}s chars={len(text)}")
        event_store.emit(
            request_id=request_id,
            client_id=client_id,
            kind="asr",
            name="asr_done",
            dt_ms=int(dt_s * 1000.0),
            chars=len(text or ""),
        )
        return jsonify({"text": text})
    except Exception as e:
        logger.error(f"asr_failed err={e}", exc_info=True)
        event_store.emit(
            request_id=request_id,
            client_id=client_id,
            kind="asr",
            name="asr_failed",
            level="error",
            err=str(e),
        )
        return jsonify({"text": ""})
    finally:
        request_registry.clear_active(client_id=client_id, kind="asr", request_id=request_id)

@app.route('/api/ask', methods=['POST'])
def ask_question():
    t_submit = time.perf_counter()
    logger.info("收到问答请求")
    data = request.get_json()
    logger.info(f"请求数据: {data}")

    if not data or not data.get('question'):
        logger.error("没有问题数据")
        return jsonify({"error": "No question"}), 400

    question = data.get('question', '')
    agent_id = (data.get("agent_id") or "").strip()
    conversation_name = (data.get("conversation_name") or data.get("chat_name") or ragflow_default_chat_name or "").strip()
    guide = data.get("guide") or {}
    if not isinstance(guide, dict):
        guide = {}
    client_id = str((data.get("client_id") or request.headers.get("X-Client-ID") or request.remote_addr or "-")).strip() or "-"
    kind = str((data.get("kind") or "ask")).strip() or "ask"
    save_history = kind not in ("ask_prefetch", "prefetch", "prefetch_ask")
    request_id = (
        data.get("request_id")
        or request.headers.get("X-Request-ID")
        or f"ask_{uuid.uuid4().hex[:12]}"
    )
    recording_id = str((data.get("recording_id") or request.headers.get("X-Recording-ID") or "")).strip() or None
    # SD-6 stop/action metadata (best-effort, provided by frontend guide context).
    stop_name = str((guide.get("stop_name") or "")).strip() or None
    stop_index = guide.get("stop_index", None)
    try:
        stop_index = int(stop_index) if stop_index is not None and str(stop_index).strip() != "" else None
    except Exception:
        stop_index = None
    tour_action = str((guide.get("tour_action") or "")).strip() or None
    action_type = str((guide.get("action_type") or "")).strip() or None
    if not action_type:
        if tour_action in ("next", "prev", "jump"):
            action_type = "切站"
        elif tour_action:
            action_type = "讲解"
        else:
            action_type = "问答"

    event_store.emit(
        request_id=request_id,
        client_id=client_id,
        kind="ask",
        name="ask_received",
        ask_kind=kind,
        agent_id=agent_id,
        chat_name=conversation_name,
        question_preview=str(question or "")[:120],
        stop_name=stop_name,
        stop_index=stop_index,
        stop_id=(f"stop_{stop_index}" if stop_index is not None else None),
        tour_action=tour_action,
        action_type=action_type,
    )
    # Rate limit to avoid jitter (best-effort, per client). Prefetch is stricter.
    rl_limit = 3
    rl_window_s = 2.5
    if kind in ("ask_prefetch", "prefetch", "prefetch_ask"):
        rl_limit = 1
        rl_window_s = 2.5
    if not request_registry.rate_allow(client_id, kind, limit=rl_limit, window_s=rl_window_s):
        logger.warning(f"[{request_id}] ask_rate_limited client_id={client_id} kind={kind}")
        event_store.emit(
            request_id=request_id,
            client_id=client_id,
            kind="ask",
            name="ask_rate_limited",
            level="warn",
            ask_kind=kind,
            limit=rl_limit,
            window_s=rl_window_s,
        )
        def _rl():
            payload = {"chunk": "请求过于频繁，请稍等 1-2 秒再提问。", "done": True, "request_id": request_id}
            return Response(f"data: {json.dumps(payload, ensure_ascii=False)}\n\n", mimetype="text/event-stream")
        return _rl()

    cancel_previous = kind in ("ask", "chat", "agent")
    cancel_event = request_registry.register(
        client_id=client_id, request_id=request_id, kind=kind, cancel_previous=cancel_previous
    )
    event_store.emit(
        request_id=request_id,
        client_id=client_id,
        kind="ask",
        name="ask_registered",
        ask_kind=kind,
        cancel_previous=bool(cancel_previous),
    )
    if agent_id:
        conversation_name = ""
        logger.info(f"[{request_id}] 问题: {question} agent_id={agent_id}")
    else:
        logger.info(f"[{request_id}] 问题: {question} chat={conversation_name or 'default'}")
    _timings_set(request_id, t_submit=t_submit)

    orchestrator = ConversationOrchestrator(
        ragflow_service=ragflow_service,
        ragflow_agent_service=ragflow_agent_service,
        intent_service=intent_service,
        history_store=history_store,
        logger=logger,
        timings_set=_timings_set,
        timings_get=_timings_get,
        default_session=session,
    )
    ragflow_config = load_ragflow_config() or {}
    inp = AskInput(
        question=question,
        request_id=request_id,
        client_id=client_id,
        kind=kind,
        agent_id=agent_id,
        conversation_name=conversation_name,
        guide=guide,
        save_history=save_history,
    )

    def generate_response():
        def sse_event(payload: dict) -> str:
            payload.setdefault("request_id", request_id)
            payload.setdefault("t_ms", int((time.perf_counter() - t_submit) * 1000))
            return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

        try:
            event_store.emit(request_id=request_id, client_id=client_id, kind="ask", name="ask_stream_start")
            seen_first_text = False
            seen_first_segment = False
            for payload in orchestrator.stream_ask(
                inp=inp,
                ragflow_config=ragflow_config,
                cancel_event=cancel_event,
                t_submit=t_submit,
            ):
                # Persist tour recordings (only for tour stops; not for ad-hoc Q&A).
                try:
                    if recording_id and stop_index is not None and tour_action:
                        if isinstance(payload, dict) and payload.get("done"):
                            recording_store.add_ask_event(
                                recording_id=recording_id,
                                stop_index=int(stop_index),
                                request_id=request_id,
                                kind="done",
                                text=None,
                            )
                        elif isinstance(payload, dict) and payload.get("segment") and not payload.get("done"):
                            recording_store.add_ask_event(
                                recording_id=recording_id,
                                stop_index=int(stop_index),
                                request_id=request_id,
                                kind="segment",
                                text=str(payload.get("segment") or ""),
                            )
                        elif isinstance(payload, dict) and payload.get("chunk") and not payload.get("done"):
                            recording_store.add_ask_event(
                                recording_id=recording_id,
                                stop_index=int(stop_index),
                                request_id=request_id,
                                kind="chunk",
                                text=str(payload.get("chunk") or ""),
                            )
                except Exception:
                    pass

                try:
                    if not seen_first_text and isinstance(payload, dict) and (payload.get("chunk") or "").strip():
                        seen_first_text = True
                        with contextlib.suppress(Exception):
                            _timings_set(request_id, t_ragflow_first_text=time.perf_counter())
                        event_store.emit(
                            request_id=request_id,
                            client_id=client_id,
                            kind="ask",
                            name="rag_first_text",
                            chars=len(str(payload.get("chunk") or "")),
                        )
                    if not seen_first_segment and isinstance(payload, dict) and (payload.get("segment") or "").strip():
                        seen_first_segment = True
                        seg = str(payload.get("segment") or "")
                        event_store.emit(
                            request_id=request_id,
                            client_id=client_id,
                            kind="ask",
                            name="first_tts_segment",
                            chars=len(seg),
                            segment_seq=payload.get("segment_seq"),
                        )
                except Exception:
                    pass
                yield sse_event(payload)
            event_store.emit(request_id=request_id, client_id=client_id, kind="ask", name="ask_done")
            return
        except GeneratorExit:
            logger.info(f"[{request_id}] ask_stream_generator_exit (client_disconnect?)")
            request_registry.cancel(request_id, reason="client_disconnect")
            event_store.emit(
                request_id=request_id,
                client_id=client_id,
                kind="ask",
                name="ask_client_disconnect",
                level="warn",
            )
            return
        except Exception as e:
            logger.error(f"[{request_id}] 流式响应异常: {e}", exc_info=True)
            event_store.emit(
                request_id=request_id,
                client_id=client_id,
                kind="ask",
                name="ask_stream_failed",
                level="error",
                err=str(e),
            )
            if agent_id and "ragflow_agent_completion_no_data" in str(e):
                msg = (
                    f"智能体接口暂时不可用（RAGFlow /api/v1/agents/{agent_id}/completions 无输出）。"
                    f"请检查 RAGFlow 服务日志/版本或接口权限。"
                )
                yield sse_event({"chunk": msg, "done": True})
            else:
                yield sse_event({"chunk": f"错误: {str(e)}", "done": True})
        finally:
            request_registry.clear_active(client_id=client_id, kind=kind, request_id=request_id)

    logger.info("返回流式响应")
    return Response(
        generate_response(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/api/recordings", methods=["GET"])
def list_recordings():
    limit = request.args.get("limit", 50)
    try:
        limit = int(limit)
    except Exception:
        limit = 50
    items = recording_store.list(limit=limit)
    return jsonify({"items": items})


@app.route("/api/recordings/start", methods=["POST"])
def start_recording():
    data = request.get_json(silent=True) or {}
    stops = data.get("stops") or []
    if not isinstance(stops, list) or not stops:
        return jsonify({"error": "stops_required"}), 400
    rid = str(data.get("recording_id") or "").strip() or f"rec_{int(time.time()*1000)}"
    info = recording_store.create(recording_id=rid, stops=[str(s or "").strip() for s in stops if str(s or "").strip()])
    return jsonify({"recording_id": info.recording_id, "created_at_ms": info.created_at_ms})


@app.route("/api/recordings/<recording_id>/finish", methods=["POST"])
def finish_recording(recording_id: str):
    recording_store.finish(recording_id)
    return jsonify({"ok": True})


@app.route("/api/recordings/<recording_id>", methods=["GET"])
def get_recording(recording_id: str):
    meta = recording_store.get(recording_id)
    if not meta:
        return jsonify({"error": "not_found"}), 404
    return jsonify(meta)


@app.route("/api/recordings/<recording_id>/stop/<int:stop_index>", methods=["GET"])
def get_recording_stop(recording_id: str, stop_index: int):
    base_url = str(request.host_url).rstrip("/")
    payload = recording_store.get_stop_payload(recording_id=recording_id, stop_index=int(stop_index), base_url=base_url)
    if not payload:
        return jsonify({"error": "not_found"}), 404
    return jsonify(payload)


@app.route("/api/recordings/<recording_id>/audio/<path:filename>", methods=["GET"])
def get_recording_audio(recording_id: str, filename: str):
    try:
        path = recording_store.safe_rel_audio_path(recording_id, filename)
        path = recording_store.ensure_within_audio_dir(recording_id, path)
    except Exception:
        return jsonify({"error": "bad_path"}), 400
    if not path.exists() or not path.is_file():
        return jsonify({"error": "not_found"}), 404
    return send_file(str(path), mimetype="audio/wav", conditional=True)

@app.route('/api/text_to_speech', methods=['POST'])
def text_to_speech():
    logger.info("收到TTS请求")
    data = request.get_json()
    logger.info(f"TTS请求数据: {data}")

    if not data or not data.get('text'):
        logger.error("TTS请求缺少文本")
        return jsonify({"error": "No text"}), 400

    text = data.get('text', '')
    request_id = (
        data.get("request_id")
        or request.headers.get("X-Request-ID")
        or f"tts_{uuid.uuid4().hex[:12]}"
    )
    client_id = str((data.get("client_id") or request.headers.get("X-Client-ID") or request.remote_addr or "-")).strip() or "-"
    event_store.emit(
        request_id=request_id,
        client_id=client_id,
        kind="tts",
        name="tts_request_received",
        endpoint="/api/text_to_speech",
        chars=len(text or ""),
        segment_index=data.get("segment_index", None),
    )
    cancel_event = request_registry.get_cancel_event(request_id)
    if cancel_event.is_set():
        logger.info(f"[{request_id}] tts_cancelled_before_start endpoint=/api/text_to_speech client_id={client_id}")
        event_store.emit(
            request_id=request_id,
            client_id=client_id,
            kind="tts",
            name="tts_cancelled_before_start",
            level="info",
            endpoint="/api/text_to_speech",
        )
        return Response(b"", status=204, mimetype=_get_nested(load_app_config(), ["tts", "mimetype"], "audio/wav"))
    logger.info(f"[{request_id}] tts_request_received endpoint=/api/text_to_speech chars={len(text)} preview={text[:60]!r}")

    app_config = load_app_config()
    provider = (
        data.get("tts_provider")
        or request.headers.get("X-TTS-Provider")
        or _get_nested(app_config, ["tts", "provider"], "modelscope")
    )
    # Allow per-request voice override (e.g. modelscope/cosyvoice voice id).
    with contextlib.suppress(Exception):
        if request.headers.get("X-TTS-Voice") and not data.get("tts_voice"):
            data["tts_voice"] = request.headers.get("X-TTS-Voice")
    app_config = _apply_tts_overrides(app_config, provider=str(provider), data=data or {})
    tts_service.tts_state_update(
        request_id,
        data.get("segment_index", None),
        provider=str(provider),
        endpoint="/api/text_to_speech",
    )
    logger.info(f"[{request_id}] tts_provider={provider} response_mimetype={_get_nested(app_config, ['tts', 'mimetype'], 'audio/wav')}")

    def generate_audio():
        try:
            logger.info(f"[{request_id}] 开始TTS音频生成 provider={provider}")
            yield from tts_service.stream(
                text=text,
                request_id=request_id,
                config=app_config,
                provider=provider,
                endpoint="/api/text_to_speech",
                segment_index=data.get("segment_index", None),
                cancel_event=cancel_event,
            )
        except GeneratorExit:
            logger.info(f"[{request_id}] tts_generator_exit endpoint=/api/text_to_speech (client_disconnect?)")
            event_store.emit(
                request_id=request_id,
                client_id=client_id,
                kind="tts",
                name="tts_client_disconnect",
                level="warn",
                endpoint="/api/text_to_speech",
            )
            raise
        except Exception as e:
            logger.error(f"[{request_id}] TTS音频生成异常: {e}", exc_info=True)
            event_store.emit(
                request_id=request_id,
                client_id=client_id,
                kind="tts",
                name="tts_failed",
                level="error",
                endpoint="/api/text_to_speech",
                err=str(e),
            )

    return Response(
        generate_audio(),
        mimetype=_get_nested(app_config, ["tts", "mimetype"], "audio/wav"),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

@app.route('/api/text_to_speech_stream', methods=['GET', 'POST'])
def text_to_speech_stream():
    t_received = time.perf_counter()
    logger.info("收到流式TTS请求")
    if request.method == "GET":
        data = dict(request.args) if request.args else {}
        logger.info(f"流式TTS请求数据(GET): {data}")
    else:
        data = request.get_json()
        logger.info(f"流式TTS请求数据(POST): {data}")

    if not data or not data.get('text'):
        logger.error("流式TTS请求缺少文本")
        return jsonify({"error": "No text"}), 400

    text = data.get('text', '')
    request_id = (
        data.get("request_id")
        or request.headers.get("X-Request-ID")
        or f"tts_{uuid.uuid4().hex[:12]}"
    )
    client_id = str((data.get("client_id") or request.headers.get("X-Client-ID") or request.remote_addr or "-")).strip() or "-"
    event_store.emit(
        request_id=request_id,
        client_id=client_id,
        kind="tts",
        name="tts_request_received",
        endpoint="/api/text_to_speech_stream",
        method=request.method,
        chars=len(text or ""),
        segment_index=data.get("segment_index", None),
    )
    cancel_event = request_registry.get_cancel_event(request_id)
    segment_index = data.get("segment_index", None)
    logger.info(
        f"[{request_id}] tts_request_received endpoint=/api/text_to_speech_stream method={request.method} chars={len(text)} seg={segment_index} preview={text[:60]!r}"
    )
    if cancel_event.is_set():
        logger.info(f"[{request_id}] tts_cancelled_before_start endpoint=/api/text_to_speech_stream client_id={client_id} seg={segment_index}")
        event_store.emit(
            request_id=request_id,
            client_id=client_id,
            kind="tts",
            name="tts_cancelled_before_start",
            level="info",
            endpoint="/api/text_to_speech_stream",
            segment_index=segment_index,
        )
        return Response(b"", status=204, mimetype=_get_nested(load_app_config(), ["tts", "mimetype"], "audio/wav"))
    ask_timing = _timings_get(request_id)
    if ask_timing and isinstance(ask_timing.get("t_submit"), (int, float)):
        dt_since_submit = time.perf_counter() - float(ask_timing["t_submit"])
        logger.info(f"[{request_id}] tts_request_received_since_submit dt={dt_since_submit:.3f}s")

    app_config = load_app_config()
    provider = (
        data.get("tts_provider")
        or request.headers.get("X-TTS-Provider")
        or _get_nested(app_config, ["tts", "provider"], "modelscope")
    )
    with contextlib.suppress(Exception):
        if request.headers.get("X-TTS-Voice") and not data.get("tts_voice"):
            data["tts_voice"] = request.headers.get("X-TTS-Voice")
    app_config = _apply_tts_overrides(app_config, provider=str(provider), data=data or {})
    tts_service.tts_state_update(
        request_id,
        segment_index,
        provider=str(provider),
        endpoint="/api/text_to_speech_stream",
    )
    logger.info(
        f"[{request_id}] tts_provider={provider} response_mimetype={_get_nested(app_config, ['tts', 'mimetype'], 'audio/wav')} remote={request.remote_addr} ua={(request.headers.get('User-Agent') or '')[:60]!r}"
    )

    recording_id = str((data.get("recording_id") or request.headers.get("X-Recording-ID") or "")).strip() or None
    stop_index_arg = data.get("stop_index", None)
    try:
        stop_index_arg = int(stop_index_arg) if stop_index_arg is not None and str(stop_index_arg).strip() != "" else None
    except Exception:
        stop_index_arg = None

    def generate_streaming_audio():
        audio_file = None
        tmp_path = None
        final_rel = None
        try:
            logger.info(f"[{request_id}] 开始流式TTS音频生成 provider={provider}")

            total_size = 0
            chunk_count = 0
            first_audio_chunk_at = None
            first_emitted = False

            if recording_id and stop_index_arg is not None:
                try:
                    audio_dir = recording_store.audio_dir(recording_id)
                    seg_name = f"{request_id}_{segment_index if segment_index is not None else 'x'}.wav"
                    final_rel = seg_name
                    tmp_path = (audio_dir / f"{seg_name}.part").resolve()
                    audio_file = open(tmp_path, "wb")
                except Exception as e:
                    logger.warning(f"[REC] tts_open_failed recording_id={recording_id} err={e}")
                    audio_file = None
                    tmp_path = None
                    final_rel = None

            for chunk in tts_service.stream(
                text=text,
                request_id=request_id,
                config=app_config,
                provider=provider,
                endpoint="/api/text_to_speech_stream",
                segment_index=segment_index,
                cancel_event=cancel_event,
            ):
                if cancel_event.is_set():
                    logger.info(f"[{request_id}] tts_cancelled_during_stream endpoint=/api/text_to_speech_stream client_id={client_id} seg={segment_index}")
                    event_store.emit(
                        request_id=request_id,
                        client_id=client_id,
                        kind="tts",
                        name="tts_cancelled_during_stream",
                        level="info",
                        endpoint="/api/text_to_speech_stream",
                        segment_index=segment_index,
                    )
                    break
                if not chunk:
                    continue
                chunk_count += 1
                total_size += len(chunk)
                if audio_file is not None:
                    try:
                        audio_file.write(chunk)
                    except Exception:
                        audio_file = None
                if first_audio_chunk_at is None:
                    first_audio_chunk_at = time.perf_counter()
                    with contextlib.suppress(Exception):
                        _timings_set(request_id, t_tts_first_audio=first_audio_chunk_at)
                    if not first_emitted:
                        first_emitted = True
                        event_store.emit(
                            request_id=request_id,
                            client_id=client_id,
                            kind="tts",
                            name="tts_first_audio_chunk",
                            endpoint="/api/text_to_speech_stream",
                            segment_index=segment_index,
                            bytes=len(chunk),
                        )
                    logger.info(
                        f"[{request_id}] tts_first_audio_chunk dt={first_audio_chunk_at - t_received:.3f}s bytes={len(chunk)}"
                    )
                    ask_timing = _timings_get(request_id)
                    if ask_timing and isinstance(ask_timing.get('t_submit'), (int, float)):
                        since_submit = first_audio_chunk_at - float(ask_timing['t_submit'])
                        logger.info(f"[{request_id}] tts_first_audio_chunk_since_submit dt={since_submit:.3f}s")
                        if isinstance(ask_timing.get('t_first_tts_segment'), (int, float)):
                            since_first_segment = first_audio_chunk_at - float(ask_timing['t_first_tts_segment'])
                            logger.info(
                                f"[{request_id}] tts_first_audio_chunk_since_first_segment dt={since_first_segment:.3f}s"
                            )
                yield chunk

                if chunk_count <= 3:  # 只记录前几个chunk
                    logger.info(f"[{request_id}] 流式音频chunk #{chunk_count}, 大小: {len(chunk)}")

            logger.info(
                f"[{request_id}] 流式TTS音频生成完成 total_dt={time.perf_counter() - t_received:.3f}s 总大小: {total_size} bytes, chunk数量: {chunk_count}"
            )
            event_store.emit(
                request_id=request_id,
                client_id=client_id,
                kind="tts",
                name="tts_stream_done",
                endpoint="/api/text_to_speech_stream",
                segment_index=segment_index,
                bytes=int(total_size),
                chunks=int(chunk_count),
            )

            if audio_file is not None and tmp_path is not None and final_rel is not None and recording_id and stop_index_arg is not None:
                try:
                    audio_file.flush()
                    audio_file.close()
                    audio_file = None
                except Exception:
                    pass
                try:
                    audio_dir = recording_store.audio_dir(recording_id)
                    final_path = (audio_dir / final_rel).resolve()
                    os.replace(str(tmp_path), str(final_path))
                    recording_store.add_tts_audio(
                        recording_id=recording_id,
                        stop_index=int(stop_index_arg),
                        request_id=request_id,
                        segment_index=segment_index if segment_index is not None else None,
                        text=text,
                        rel_path=final_rel,
                    )
                except Exception as e:
                    logger.warning(f"[REC] tts_save_failed recording_id={recording_id} err={e}")
            return

        except GeneratorExit:
            logger.info(f"[{request_id}] tts_stream_generator_exit endpoint=/api/text_to_speech_stream (client_disconnect?)")
            event_store.emit(
                request_id=request_id,
                client_id=client_id,
                kind="tts",
                name="tts_client_disconnect",
                level="warn",
                endpoint="/api/text_to_speech_stream",
                segment_index=segment_index,
            )
            raise
        except Exception as e:
            logger.error(f"[{request_id}] tts_stream_exception {e} provider={provider}", exc_info=True)
            event_store.emit(
                request_id=request_id,
                client_id=client_id,
                kind="tts",
                name="tts_stream_failed",
                level="error",
                endpoint="/api/text_to_speech_stream",
                segment_index=segment_index,
                err=str(e),
            )
        finally:
            # Cleanup partial file on errors/cancel.
            try:
                if audio_file is not None:
                    with contextlib.suppress(Exception):
                        audio_file.close()
                if tmp_path is not None:
                    with contextlib.suppress(Exception):
                        if Path(tmp_path).exists():
                            Path(tmp_path).unlink(missing_ok=True)
            except Exception:
                pass

    return Response(
        generate_streaming_audio(),
        mimetype=_get_nested(app_config, ["tts", "mimetype"], "audio/wav"),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == '__main__':
    logger.info("启动语音问答后端服务")
    logger.info(f"FunASR模型状态: {'已加载' if asr_model_loaded else '未加载'}")
    logger.info(f"RAGFlow状态: {'已连接' if session else '未连接'}")
    app.run(host='0.0.0.0', port=8000, debug=True)
