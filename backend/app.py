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
    logger.info("收到问答请求")
    data = request.get_json()
    logger.info(f"请求数据: {data}")

    if not data or not data.get('question'):
        logger.error("没有问题数据")
        return jsonify({"error": "No question"}), 400

    question = data.get('question', '')
    logger.info(f"问题: {question}")

    def generate_response():
        def sse_event(payload: dict) -> str:
            return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

        try:
            ragflow_config = load_ragflow_config() or {}
            text_cleaning = ragflow_config.get("text_cleaning", {}) or {}

            enable_cleaning = bool(text_cleaning.get("enabled", False))
            cleaning_level = text_cleaning.get("cleaning_level", "standard")
            language = text_cleaning.get("language", "zh-CN")
            tts_buffer_enabled = bool(text_cleaning.get("tts_buffer_enabled", True))
            max_chunk_size = int(text_cleaning.get("max_chunk_size", 200))

            text_cleaner = None
            tts_buffer = None
            emitted_segments = set()

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

            logger.info("开始RAGFlow流式响应")
            response = session.ask(question, stream=True)
            logger.info("RAGFlow响应对象创建成功")

            last_complete_content = ""
            chunk_count = 0

            for chunk in response:
                chunk_count += 1
                logger.info(f"收到chunk #{chunk_count}: {type(chunk)} - {chunk}")

                if chunk and hasattr(chunk, 'content'):
                    content = chunk.content
                    logger.info(f"Chunk内容长度: {len(content)}")

                    # 只处理更长和更完整的内容（去重）
                    if len(content) > len(last_complete_content):
                        new_part = content[len(last_complete_content):]
                        logger.info(f"增量内容: {new_part[:50]}...")

                        yield sse_event({"chunk": new_part, "done": False})

                        if text_cleaner and tts_buffer:
                            cleaned = text_cleaner.clean_streaming_chunk(new_part, is_partial=True)
                            ready_segments = tts_buffer.add_cleaned_chunk(cleaned)
                            for seg in ready_segments:
                                seg = seg.strip()
                                if not seg or seg in emitted_segments:
                                    continue
                                emitted_segments.add(seg)
                                yield sse_event({"segment": seg, "done": False})

                        last_complete_content = content
                    else:
                        logger.info("跳过重复或较短的内容")
                else:
                    logger.warning(f"Chunk没有content属性: {chunk}")

            logger.info("流式响应结束")

            if text_cleaner and tts_buffer:
                for seg in tts_buffer.finalize():
                    seg = seg.strip()
                    if not seg or seg in emitted_segments:
                        continue
                    emitted_segments.add(seg)
                    yield sse_event({"segment": seg, "done": False})

            yield sse_event({"chunk": "", "done": True})

        except Exception as e:
            logger.error(f"流式响应异常: {e}", exc_info=True)
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

@app.route('/api/text_to_speech_stream', methods=['POST'])
def text_to_speech_stream():
    logger.info("收到流式TTS请求")
    data = request.get_json()
    logger.info(f"流式TTS请求数据: {data}")

    if not data or not data.get('text'):
        logger.error("流式TTS请求缺少文本")
        return jsonify({"error": "No text"}), 400

    text = data.get('text', '')
    logger.info(f"流式TTS文本长度: {len(text)}")

    def generate_streaming_audio():
        try:
            logger.info("开始流式TTS音频生成")
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

            logger.info(f"发送流式TTS请求到: {url}")

            with requests.post(url, json=payload, stream=True, timeout=30) as r:
                logger.info(f"流式TTS响应状态: {r.status_code}")

                if r.status_code != 200:
                    logger.error(f"流式TTS服务返回错误: {r.status_code}")
                    return

                total_size = 0
                chunk_count = 0

                for chunk in r.iter_content(chunk_size=4096):
                    if chunk:
                        chunk_count += 1
                        total_size += len(chunk)
                        yield chunk

                        if chunk_count <= 3:  # 只记录前几个chunk
                            logger.info(f"流式音频chunk #{chunk_count}, 大小: {len(chunk)}")

                logger.info(f"流式TTS音频生成完成，总大小: {total_size} bytes, chunk数量: {chunk_count}")

        except requests.exceptions.ConnectionError as e:
            logger.error(f"流式TTS服务连接失败: {e}")
        except requests.exceptions.Timeout as e:
            logger.error(f"流式TTS服务请求超时: {e}")
        except Exception as e:
            logger.error(f"流式TTS音频生成异常: {e}", exc_info=True)

    return Response(generate_streaming_audio(), mimetype='audio/wav')

if __name__ == '__main__':
    logger.info("启动语音问答后端服务")
    logger.info(f"FunASR模型状态: {'已加载' if asr_model_loaded else '未加载'}")
    logger.info(f"RAGFlow状态: {'已连接' if session else '未连接'}")
    app.run(host='0.0.0.0', port=8000, debug=True)
