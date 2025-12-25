from __future__ import annotations

import json
import logging
import contextlib
import threading
import time
from pathlib import Path
from typing import Iterable, Iterator

import requests
from requests.exceptions import ChunkedEncodingError, RequestException

from .env_overrides import apply_env_overrides


class RagflowAgentService:
    def __init__(self, config_path: Path, logger: logging.Logger | None = None):
        self._logger = logger or logging.getLogger(__name__)
        self._config_path = config_path
        self._lock = threading.Lock()
        self._agent_sessions: dict[str, str] = {}

    def load_config(self) -> dict:
        if self._config_path.exists():
            with open(self._config_path, "r", encoding="utf-8") as f:
                raw = json.load(f)
                return apply_env_overrides(raw if isinstance(raw, dict) else {})
        return apply_env_overrides({})

    def _auth_headers(self) -> tuple[str, dict]:
        cfg = self.load_config() or {}
        api_key = (cfg.get("api_key") or "").strip()
        base_url = (cfg.get("base_url") or "http://127.0.0.1").strip().rstrip("/")
        if not api_key or api_key in ["YOUR_RAGFLOW_API_KEY_HERE", "your_api_key_here"]:
            raise RuntimeError("ragflow_api_key_invalid")
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }
        return base_url, headers

    def get_or_create_session_id(
        self,
        agent_id: str,
        request_id: str | None = None,
        begin_kwargs: dict | None = None,
    ) -> str:
        agent_id = str(agent_id or "").strip()
        if not agent_id:
            raise ValueError("agent_id_empty")

        with self._lock:
            sid = self._agent_sessions.get(agent_id)
            if sid:
                return sid

        base_url, headers = self._auth_headers()
        url = f"{base_url}/api/v1/agents/{agent_id}/sessions"
        t0 = time.perf_counter()
        self._logger.info(
            f"[{request_id or '-'}] ragflow_agent_session_create_start agent_id={agent_id} url={url} begin_keys={list((begin_kwargs or {}).keys())}"
        )
        with requests.post(url, headers=headers, json=begin_kwargs or {}, timeout=15) as r:
            self._logger.info(
                f"[{request_id or '-'}] ragflow_agent_session_create_resp agent_id={agent_id} status={r.status_code} ct={r.headers.get('content-type')}"
            )
            r.raise_for_status()
            payload = r.json()
        sid = (payload or {}).get("data", {}) if isinstance(payload, dict) else {}
        session_id = sid.get("id") if isinstance(sid, dict) else None
        if not session_id:
            self._logger.error(
                f"[{request_id or '-'}] ragflow_agent_session_create_no_id agent_id={agent_id} payload_type={type(payload)} payload_preview={str(payload)[:300]}"
            )
            raise RuntimeError(f"ragflow_agent_session_create_failed payload={payload}")

        with self._lock:
            self._agent_sessions[agent_id] = str(session_id)

        self._logger.info(
            f"[{request_id or '-'}] ragflow_agent_session_created agent_id={agent_id} session_id={session_id} dt={time.perf_counter()-t0:.3f}s"
        )
        return str(session_id)

    @staticmethod
    def _iter_sse_lines(resp: requests.Response) -> Iterator[str]:
        for raw in resp.iter_lines(decode_unicode=True):
            if raw is None:
                continue
            line = raw.strip()
            if not line:
                continue
            yield line

    @staticmethod
    def _extract_text_from_sse_data(obj) -> str:
        if obj is None:
            return ""
        if isinstance(obj, str):
            return obj
        if isinstance(obj, dict):
            for k in ("delta", "content", "text", "answer", "output"):
                v = obj.get(k)
                if isinstance(v, str) and v:
                    return v
            nested = obj.get("data")
            if isinstance(nested, dict):
                for k in ("delta", "content", "text", "answer", "output"):
                    v = nested.get(k)
                    if isinstance(v, str) and v:
                        return v
            msg = obj.get("message")
            if isinstance(msg, dict):
                v = msg.get("content")
                if isinstance(v, str) and v:
                    return v
        return ""

    def stream_completion_text(
        self,
        agent_id: str,
        question: str,
        request_id: str,
        cancel_event: threading.Event | None = None,
    ) -> Iterable[str]:
        """
        Streaming text generator for Ragflow Agent completions, aligned with official docs:
        - Create session: POST `/api/v1/agents/{agent_id}/sessions`
        - Converse: Session.ask(question, stream=True) -> POST `/api/v1/agents/{agent_id}/completions`
          payload: {"question": "...", "stream": True, "session_id": "..."}
        """
        base_url, headers = self._auth_headers()
        session_id = self.get_or_create_session_id(agent_id, request_id=request_id, begin_kwargs=None)

        url = f"{base_url}/api/v1/agents/{agent_id}/completions"
        q = str(question or "").strip()
        if not q:
            return []

        payload = {"question": q, "stream": True, "session_id": session_id}
        t0 = time.perf_counter()
        last_answer = ""
        cancel_event = cancel_event or threading.Event()
        try:
            self._logger.info(
                f"[{request_id}] ragflow_agent_completion_start agent_id={agent_id} session_id={session_id} url={url} q_chars={len(q)}"
            )
            with requests.post(url, headers=headers, json=payload, stream=True, timeout=(10, 120)) as r:
                r.raise_for_status()
                self._logger.info(
                    f"[{request_id}] ragflow_agent_completion_resp agent_id={agent_id} session_id={session_id} "
                    f"status={r.status_code} ct={r.headers.get('content-type')} te={r.headers.get('transfer-encoding')} "
                    f"conn={r.headers.get('connection')} server={r.headers.get('server')} x_accel={r.headers.get('x-accel-buffering')}"
                )
                any_line = False
                lines_count = 0
                bytes_count = 0
                try:
                    for raw in r.iter_lines():
                        if cancel_event.is_set():
                            self._logger.info(
                                f"[{request_id}] ragflow_agent_cancelled_during_stream agent_id={agent_id} session_id={session_id}"
                            )
                            with contextlib.suppress(Exception):
                                r.close()
                            return
                        if raw is None:
                            continue
                        bytes_count += len(raw)
                        line = raw.decode("utf-8", errors="ignore").strip()
                        if not line:
                            continue
                        any_line = True
                        lines_count += 1

                        # Per ragflow-sdk Session.ask behavior:
                        # - error line may start with JSON: {"code":...,"message":...}
                        # - normal SSE frames: data: {...}
                        if line.startswith("{"):
                            obj = json.loads(line)
                            raise RuntimeError(obj.get("message") or line)
                        if not line.startswith("data:"):
                            continue

                        obj = json.loads(line[5:])
                        data = obj.get("data") if isinstance(obj, dict) else None
                        if data is True:
                            continue
                        if isinstance(data, dict):
                            answer = data.get("answer") or ""
                        else:
                            answer = ""

                        if not isinstance(answer, str) or not answer:
                            continue
                        if answer.startswith(last_answer):
                            delta = answer[len(last_answer) :]
                        else:
                            delta = answer
                        last_answer = answer
                        if delta:
                            yield delta
                except ChunkedEncodingError:
                    self._logger.warning(
                        f"[{request_id}] ragflow_agent_completion_chunked_error agent_id={agent_id} session_id={session_id} "
                        f"dt={time.perf_counter()-t0:.3f}s lines={lines_count} bytes={bytes_count}"
                    )
                    any_line = False

                if not any_line:
                    self._logger.warning(
                        f"[{request_id}] ragflow_agent_completion_empty agent_id={agent_id} session_id={session_id} "
                        f"url={url} dt={time.perf_counter()-t0:.3f}s lines={lines_count} bytes={bytes_count}"
                    )
                    raise RuntimeError("ragflow_agent_completion_no_data")
        except ChunkedEncodingError as e:
            self._logger.warning(
                f"[{request_id}] ragflow_agent_completion_closed_early agent_id={agent_id} session_id={session_id} "
                f"url={url} dt={time.perf_counter()-t0:.3f}s err={e}"
            )
            raise RuntimeError("ragflow_agent_completion_no_data") from e
        except RequestException as e:
            self._logger.error(
                f"[{request_id}] ragflow_agent_completion_failed agent_id={agent_id} session_id={session_id} "
                f"url={url} dt={time.perf_counter()-t0:.3f}s err={e}",
                exc_info=True,
            )
            raise
