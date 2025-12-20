#!/usr/bin/env python3
import sys
import os
from pathlib import Path
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import json
import threading
import queue 
import time
import uuid
import numpy as np
import pyaudio
import webrtcvad
import requests
import subprocess
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

sys.path.append(str(Path(__file__).parent))

app = Flask(__name__)
CORS(app)

sys.path.append(str(Path(__file__).parent.parent))
sys.path.append(str(Path(__file__).parent.parent / "ragflow_demo"))
sys.path.append(str(Path(__file__).parent.parent / "fuasr_demo"))
sys.path.append(str(Path(__file__).parent.parent / "tts_demo"))

from ragflow_sdk import RAGFlow

try:
    from funasr import AutoModel
    asr_model = AutoModel(model="iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch", device="cpu", disable_update=True)
    asr_model_loaded = True
    logger.info("FunASR模型加载成功")
except Exception as e:
    asr_model = None
    asr_model_loaded = False
    logger.error(f"FunASR模型加载失败: {e}")

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

RATE = 16000
FRAME_MS = 20
FRAME_SAMPLES = RATE * FRAME_MS // 1000
FRAME_BYTES = FRAME_SAMPLES * 2
ENERGY_GATE = 0.008
VAD_MODE = 2
MIN_SPEECH_MS = 250
SILENCE_END_MS = 600
MAX_UTTER_MS = 15000

ragflow_client = None
session = None

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

def find_dataset_by_name(client, dataset_name):
    if not dataset_name:
        return None

    try:
        datasets = client.list_datasets()
        for dataset in datasets:
            if hasattr(dataset, 'name'):
                if dataset.name == dataset_name:
                    return dataset.id if hasattr(dataset, 'id') else dataset
            elif isinstance(dataset, dict):
                if dataset.get('name') == dataset_name:
                    return dataset.get('id') or dataset
            else:
                if dataset_name in str(dataset):
                    return dataset
    except Exception as e:
        logger.error(f"查找dataset失败: {e}")

    return None

def find_chat_by_name(client, chat_name):
    try:
        chats = client.list_chats()
        for chat in chats:
            if hasattr(chat, 'name'):
                if chat.name == chat_name:
                    return chat
            elif isinstance(chat, dict):
                if chat.get('name') == chat_name:
                    return chat
            else:
                if chat_name in str(chat):
                    return chat
    except Exception as e:
        logger.error(f"查找chat失败: {e}")

    return None

def init_ragflow():
    global ragflow_client, session
    try:
        ragflow_config_path = Path(__file__).parent.parent / "ragflow_demo" / "ragflow_config.json"

        if not ragflow_config_path.exists():
            logger.error(f"RAGFlow配置文件不存在: {ragflow_config_path}")
            return False

        logger.info(f"找到RAGFlow配置文件: {ragflow_config_path}")
        with open(ragflow_config_path, 'r', encoding='utf-8') as f:
            ragflow_config = json.load(f)

        api_key = ragflow_config.get('api_key', '')
        base_url = ragflow_config.get('base_url', 'http://127.0.0.1')
        dataset_name = ragflow_config.get('dataset_name', '')
        conversation_name = ragflow_config.get('default_conversation_name', '语音问答')

        if not api_key or api_key in ['YOUR_RAGFLOW_API_KEY_HERE', 'your_api_key_here']:
            logger.error("RAGFlow API key无效")
            return False

        logger.info(f"RAGFlow配置: {base_url}")
        logger.info("正在创建RAGFlow客户端...")

        ragflow_client = RAGFlow(api_key=api_key, base_url=base_url)
        logger.info("RAGFlow客户端创建成功")

        # Find dataset if specified
        dataset_id = None
        if dataset_name:
            logger.info(f"正在查找dataset: {dataset_name}")
            dataset_id = find_dataset_by_name(ragflow_client, dataset_name)
            if dataset_id:
                logger.info(f"找到dataset: {dataset_id}")
            else:
                logger.warning(f"dataset '{dataset_name}' 未找到，使用通用聊天")

        # Find or create chat
        logger.info(f"正在查找chat: {conversation_name}")
        chat = find_chat_by_name(ragflow_client, conversation_name)

        if chat:
            logger.info("使用现有chat")
        else:
            logger.info("创建新chat...")
            chat = ragflow_client.create_chat(
                name=conversation_name,
                dataset_ids=[dataset_id] if dataset_id else []
            )
            logger.info("新chat创建成功")

        # Create session
        logger.info("正在创建session...")
        session = chat.create_session("Chat Session")
        logger.info("RAGFlow初始化成功")
        return True

    except Exception as e:
        logger.error(f"RAGFlow初始化失败: {e}")
        import traceback
        traceback.print_exc()
        return False

init_ragflow()

def load_ragflow_config():
    config_path = Path(__file__).parent.parent / "ragflow_demo" / "ragflow_config.json"
    if config_path.exists():
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None

@app.route('/health')
def health():
    return jsonify({
        "asr_loaded": asr_model_loaded,
        "ragflow_connected": session is not None
    })

@app.route('/api/speech_to_text', methods=['POST'])
def speech_to_text():
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file"}), 400

    audio_file = request.files['audio']
    audio_data = audio_file.read()

    if not asr_model_loaded:
        return jsonify({"text": ""})

    try:
        x = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
        with SuppressOutput():
            result = asr_model.generate(input=x, is_final=True)

        text = ""
        if result and isinstance(result, list) and result[0].get("text"):
            text = result[0]["text"].strip()

        return jsonify({"text": text})
    except:
        return jsonify({"text": ""})

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
    request_id = (
        data.get("request_id")
        or request.headers.get("X-Request-ID")
        or f"ask_{uuid.uuid4().hex[:12]}"
    )
    logger.info(f"[{request_id}] 问题: {question}")
    _timings_set(request_id, t_submit=t_submit)

    def generate_response():
        def sse_event(payload: dict) -> str:
            payload.setdefault("request_id", request_id)
            payload.setdefault("t_ms", int((time.perf_counter() - t_submit) * 1000))
            return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

        try:
            ragflow_config = load_ragflow_config() or {}
            text_cleaning = ragflow_config.get("text_cleaning", {}) or {}

            enable_cleaning = bool(text_cleaning.get("enabled", False))
            cleaning_level = text_cleaning.get("cleaning_level", "standard")
            language = text_cleaning.get("language", "zh-CN")
            tts_buffer_enabled = bool(text_cleaning.get("tts_buffer_enabled", True))
            max_chunk_size = int(text_cleaning.get("max_chunk_size", 200))
            start_tts_on_first_chunk = bool(text_cleaning.get("start_tts_on_first_chunk", True))
            first_segment_min_chars = int(text_cleaning.get("first_segment_min_chars", 10))
            segment_flush_interval_s = float(text_cleaning.get("segment_flush_interval_s", 0.8))
            segment_min_chars = int(text_cleaning.get("segment_min_chars", first_segment_min_chars))

            text_cleaner = None
            tts_buffer = None
            emitted_segments = set()
            last_segment_emit_at = t_submit
            segment_seq = 0

            if enable_cleaning:
                try:
                    from text_cleaner import TTSTextCleaner
                    from tts_buffer import TTSBuffer

                    text_cleaner = TTSTextCleaner(language=language, cleaning_level=cleaning_level)
                    tts_buffer = TTSBuffer(max_chunk_size=max_chunk_size, language=language) if tts_buffer_enabled else None
                except Exception as e:
                    logger.warning(f"文本清洗/分段模块不可用，降级为整段TTS: {e}")
                    enable_cleaning = False

            if not session:
                logger.warning("RAGFlow不可用，使用固定回答")
                fallback_answer = f"我收到了你的问题：{question}。由于RAGFlow服务暂时不可用，我现在只能给你一个固定的回答。请确保RAGFlow服务正在运行。"

                for char in fallback_answer:
                    yield sse_event({"chunk": char, "done": False})

                    if text_cleaner and tts_buffer:
                        cleaned = text_cleaner.clean_streaming_chunk(char, is_partial=True)
                        for seg in tts_buffer.add_cleaned_chunk(cleaned):
                            seg = seg.strip()
                            if not seg or seg in emitted_segments:
                                continue
                            emitted_segments.add(seg)
                            yield sse_event({"segment": seg, "done": False})

                    time.sleep(0.05)  # 模拟流式输出

                if text_cleaner and tts_buffer:
                    for seg in tts_buffer.finalize():
                        seg = seg.strip()
                        if not seg or seg in emitted_segments:
                            continue
                        emitted_segments.add(seg)
                        yield sse_event({"segment": seg, "done": False})

                yield sse_event({"chunk": "", "done": True})
                return

            t_ragflow_request = time.perf_counter()
            logger.info(f"[{request_id}] 开始RAGFlow流式响应")
            response = session.ask(question, stream=True)
            logger.info(
                f"[{request_id}] RAGFlow响应对象创建成功 dt={time.perf_counter() - t_ragflow_request:.3f}s"
            )

            last_complete_content = ""
            chunk_count = 0
            first_ragflow_chunk_at = None
            first_ragflow_text_at = None
            first_segment_at = None

            for chunk in response:
                chunk_count += 1
                if first_ragflow_chunk_at is None:
                    first_ragflow_chunk_at = time.perf_counter()
                    logger.info(
                        f"[{request_id}] ragflow_first_chunk dt={first_ragflow_chunk_at - t_submit:.3f}s chunk_type={type(chunk)}"
                    )
                    _timings_set(request_id, t_ragflow_first_chunk=first_ragflow_chunk_at)
                logger.info(f"收到chunk #{chunk_count}: {type(chunk)} - {chunk}")

                if chunk and hasattr(chunk, 'content'):
                    content = chunk.content
                    logger.info(f"Chunk内容长度: {len(content)}")

                    # 只处理更长和更完整的内容（去重）
                    if len(content) > len(last_complete_content):
                        new_part = content[len(last_complete_content):]
                        logger.info(f"增量内容: {new_part[:50]}...")
                        if first_ragflow_text_at is None and new_part.strip():
                            first_ragflow_text_at = time.perf_counter()
                            logger.info(
                                f"[{request_id}] ragflow_first_text dt={first_ragflow_text_at - t_submit:.3f}s chars={len(new_part)}"
                            )
                            _timings_set(request_id, t_ragflow_first_text=first_ragflow_text_at)

                        yield sse_event({"chunk": new_part, "done": False})

                        if text_cleaner and tts_buffer:
                            cleaned = text_cleaner.clean_streaming_chunk(new_part, is_partial=True)
                            ready_segments = tts_buffer.add_cleaned_chunk(cleaned)
                            if (
                                start_tts_on_first_chunk
                                and not ready_segments
                                and first_segment_at is None
                                and first_ragflow_chunk_at is not None
                            ):
                                forced = tts_buffer.force_emit(min_chars=first_segment_min_chars)
                                if forced:
                                    logger.info(
                                        f"[{request_id}] force_emit_first_segment chars={len(forced[0])} min_chars={first_segment_min_chars}"
                                    )
                                ready_segments = ready_segments + forced
                            if (
                                segment_flush_interval_s > 0
                                and not ready_segments
                                and (time.perf_counter() - last_segment_emit_at) >= segment_flush_interval_s
                            ):
                                forced = tts_buffer.force_emit(min_chars=segment_min_chars)
                                if forced:
                                    logger.info(
                                        f"[{request_id}] force_emit_segment chars={len(forced[0])} min_chars={segment_min_chars} flush_interval_s={segment_flush_interval_s}"
                                    )
                                ready_segments = ready_segments + forced
                            for seg in ready_segments:
                                seg = seg.strip()
                                if not seg or seg in emitted_segments:
                                    continue
                                emitted_segments.add(seg)
                                segment_seq += 1
                                last_segment_emit_at = time.perf_counter()
                                logger.info(
                                    f"[{request_id}] emit_segment seq={segment_seq} dt={last_segment_emit_at - t_submit:.3f}s chars={len(seg)}"
                                )
                                if first_segment_at is None:
                                    first_segment_at = time.perf_counter()
                                    logger.info(
                                        f"[{request_id}] first_tts_segment dt={first_segment_at - t_submit:.3f}s chars={len(seg)}"
                                    )
                                    _timings_set(request_id, t_first_tts_segment=first_segment_at)
                                yield sse_event({"segment": seg, "done": False})

                        last_complete_content = content
                    else:
                        logger.info("跳过重复或较短的内容")
                else:
                    logger.warning(f"Chunk没有content属性: {chunk}")

            logger.info(
                f"[{request_id}] 流式响应结束 total_dt={time.perf_counter() - t_submit:.3f}s total_chunks={chunk_count}"
            )

            if text_cleaner and tts_buffer:
                for seg in tts_buffer.finalize():
                    seg = seg.strip()
                    if not seg or seg in emitted_segments:
                        continue
                    emitted_segments.add(seg)
                    if first_segment_at is None:
                        first_segment_at = time.perf_counter()
                        logger.info(
                            f"[{request_id}] first_tts_segment_finalize dt={first_segment_at - t_submit:.3f}s chars={len(seg)}"
                        )
                        _timings_set(request_id, t_first_tts_segment=first_segment_at)
                    yield sse_event({"segment": seg, "done": False})

            yield sse_event({"chunk": "", "done": True})

        except Exception as e:
            logger.error(f"[{request_id}] 流式响应异常: {e}", exc_info=True)
            yield sse_event({"chunk": f"错误: {str(e)}", "done": True})

    logger.info("返回流式响应")
    return Response(
        generate_response(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

@app.route('/api/text_to_speech', methods=['POST'])
def text_to_speech():
    logger.info("收到TTS请求")
    data = request.get_json()
    logger.info(f"TTS请求数据: {data}")

    if not data or not data.get('text'):
        logger.error("TTS请求缺少文本")
        return jsonify({"error": "No text"}), 400

    text = data.get('text', '')
    logger.info(f"TTS文本长度: {len(text)}")
    logger.info(f"TTS文本内容: {text[:100]}...")

    def generate_audio():
        try:
            logger.info("开始TTS音频生成")
            url = "http://127.0.0.1:9880/tts"
            payload = {
                "text": text,
                "text_lang": "zh",
                "ref_audio_path": "Liang/converted_temp_first_90s.wav_0000000000_0000182720.wav",
                "prompt_lang": "zh",
                "prompt_text": "平台呢因为从我们的初创团队的理解的角度呢，我们觉得一个初创公司。",
                "streaming_mode": True,
                "media_type": "wav"
            }

            logger.info(f"发送TTS请求到: {url}")
            logger.info(f"TTS payload: {payload}")

            with requests.post(url, json=payload, stream=True) as r:
                logger.info(f"TTS响应状态: {r.status_code}")
                logger.info(f"TTS响应头: {dict(r.headers)}")

                if r.status_code != 200:
                    logger.error(f"TTS服务返回错误: {r.status_code}")
                    return

                total_size = 0
                chunk_count = 0

                for chunk in r.iter_content(chunk_size=4096):
                    if chunk:
                        chunk_count += 1
                        total_size += len(chunk)
                        yield chunk

                        if chunk_count <= 5:  # 只记录前几个chunk的日志
                            logger.info(f"音频chunk #{chunk_count}, 大小: {len(chunk)}")

                logger.info(f"TTS音频生成完成，总大小: {total_size} bytes, chunk数量: {chunk_count}")

        except requests.exceptions.ConnectionError as e:
            logger.error(f"TTS服务连接失败: {e}")
        except requests.exceptions.Timeout as e:
            logger.error(f"TTS服务请求超时: {e}")
        except Exception as e:
            logger.error(f"TTS音频生成异常: {e}", exc_info=True)

    return Response(generate_audio(), mimetype='audio/wav')

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
    segment_index = data.get("segment_index", None)
    logger.info(f"[{request_id}] 流式TTS文本长度: {len(text)} segment_index={segment_index}")
    ask_timing = _timings_get(request_id)
    if ask_timing and isinstance(ask_timing.get("t_submit"), (int, float)):
        dt_since_submit = time.perf_counter() - float(ask_timing["t_submit"])
        logger.info(f"[{request_id}] tts_request_received_since_submit dt={dt_since_submit:.3f}s")

    def generate_streaming_audio():
        try:
            logger.info(f"[{request_id}] 开始流式TTS音频生成")
            url = "http://127.0.0.1:9880/tts"
            payload = {
                "text": text,
                "text_lang": "zh",
                "ref_audio_path": "Liang/converted_temp_first_90s.wav_0000000000_0000182720.wav",
                "prompt_lang": "zh",
                "prompt_text": "平台呢因为从我们的初创团队的理解的角度呢，我们觉得一个初创公司。",
                "low_latency": True,
                "media_type": "wav",
            }

            headers = {"X-Request-ID": request_id}
            logger.info(f"[{request_id}] 发送流式TTS请求到: {url}")

            with requests.post(url, json=payload, headers=headers, stream=True, timeout=30) as r:
                logger.info(
                    f"[{request_id}] 流式TTS响应状态: {r.status_code} dt={time.perf_counter() - t_received:.3f}s"
                )

                if r.status_code != 200:
                    logger.error(f"[{request_id}] 流式TTS服务返回错误: {r.status_code}")
                    return

                total_size = 0
                chunk_count = 0
                first_audio_chunk_at = None

                for chunk in r.iter_content(chunk_size=4096):
                    if chunk:
                        chunk_count += 1
                        total_size += len(chunk)
                        if first_audio_chunk_at is None:
                            first_audio_chunk_at = time.perf_counter()
                            logger.info(
                                f"[{request_id}] tts_first_audio_chunk dt={first_audio_chunk_at - t_received:.3f}s bytes={len(chunk)}"
                            )
                            ask_timing = _timings_get(request_id)
                            if ask_timing and isinstance(ask_timing.get("t_submit"), (int, float)):
                                since_submit = first_audio_chunk_at - float(ask_timing["t_submit"])
                                logger.info(f"[{request_id}] tts_first_audio_chunk_since_submit dt={since_submit:.3f}s")
                                if isinstance(ask_timing.get("t_first_tts_segment"), (int, float)):
                                    since_first_segment = first_audio_chunk_at - float(ask_timing["t_first_tts_segment"])
                                    logger.info(
                                        f"[{request_id}] tts_first_audio_chunk_since_first_segment dt={since_first_segment:.3f}s"
                                    )
                        yield chunk

                        if chunk_count <= 3:  # 只记录前几个chunk
                            logger.info(f"[{request_id}] 流式音频chunk #{chunk_count}, 大小: {len(chunk)}")

                logger.info(
                    f"[{request_id}] 流式TTS音频生成完成 total_dt={time.perf_counter() - t_received:.3f}s 总大小: {total_size} bytes, chunk数量: {chunk_count}"
                )

        except requests.exceptions.ConnectionError as e:
            logger.error(f"[{request_id}] 流式TTS服务连接失败: {e}")
        except requests.exceptions.Timeout as e:
            logger.error(f"[{request_id}] 流式TTS服务请求超时: {e}")
        except Exception as e:
            logger.error(f"[{request_id}] 流式TTS音频生成异常: {e}", exc_info=True)

    return Response(
        generate_streaming_audio(),
        mimetype="audio/wav",
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
