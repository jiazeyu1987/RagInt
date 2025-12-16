import sys, os, time, threading, queue
import numpy as np
import pyaudio
import webrtcvad

# 模型加载
try:
    from funasr import AutoModel
    model = AutoModel(model="iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch", device="cpu", disable_update=True)
    model_loaded = True
    print("FunASR模型加载成功")
except:
    model = None
    model_loaded = False
    print("模型加载失败")

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
FRAME_MS = 20                               # VAD 支持 10/20/30ms
FRAME_SAMPLES = RATE * FRAME_MS // 1000     # 320
FRAME_BYTES = FRAME_SAMPLES * 2             # int16 -> 2 bytes

ENERGY_GATE = 0.008     # 能量阈值：越大越“只听近处”，需要你现场微调
VAD_MODE = 2            # 0~3 越大越激进(更容易判定为语音/更少噪声触发)
MIN_SPEECH_MS = 250     # 少于这个时长不算一句（过滤误触发）
SILENCE_END_MS = 600    # 连续静音超过这个时长 -> 认为一句结束
MAX_UTTER_MS = 15000    # 单句最长，防止一直不结束

# 是否要在说话过程中输出流式字幕（临时结果）
PRINT_PARTIAL = True
PARTIAL_EVERY_MS = 300  # 临时字幕刷新频率

audio_q = queue.Queue(maxsize=200)
stop_event = threading.Event()

vad = webrtcvad.Vad(VAD_MODE)

def rms_energy_float32(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(x * x) + 1e-12))

def int16_bytes_to_float32(b: bytes) -> np.ndarray:
    x = np.frombuffer(b, dtype=np.int16).astype(np.float32) / 32768.0
    return x

def mic_reader():
    p = pyaudio.PyAudio()
    stream = p.open(
        format=pyaudio.paInt16, channels=1, rate=RATE,
        input=True, frames_per_buffer=FRAME_SAMPLES
    )
    stream.start_stream()
    try:
        while not stop_event.is_set():
            b = stream.read(FRAME_SAMPLES, exception_on_overflow=False)
            # 队列满就丢最旧的，保证实时
            if audio_q.full():
                try: audio_q.get_nowait()
                except queue.Empty: pass
            audio_q.put_nowait(b)
    finally:
        stream.stop_stream(); stream.close(); p.terminate()

def asr_endpoint_worker(model, model_loaded: bool):
    if not model_loaded:
        print("模型未加载，仅测试端点检测")
    in_speech = False
    speech_frames = []             # 保存本句 int16 bytes 帧
    speech_ms = 0
    silence_ms = 0
    last_partial_t = 0.0
    last_partial_text = ""

    def run_partial():
        nonlocal last_partial_text, last_partial_t
        if not PRINT_PARTIAL or not model_loaded:
            return
        now = time.time()
        if (now - last_partial_t) * 1000 < PARTIAL_EVERY_MS:
            return
        last_partial_t = now
        audio = np.concatenate([int16_bytes_to_float32(f) for f in speech_frames], axis=0)
        # 太短就别跑，避免抖动
        if len(audio) < RATE * 0.3:
            return
        try:
            with SuppressOutput():
                r = model.generate(input=audio, is_final=False)
            if r and isinstance(r, list) and r[0].get("text"):
                txt = r[0]["text"].strip()
                if txt and txt != last_partial_text:
                    # 临时字幕：不换行覆盖
                    sys.stdout.write("\r" + txt + " " * max(0, 60 - len(txt)))
                    sys.stdout.flush()
                    last_partial_text = txt
        except:
            pass

    def finalize_and_print():
        nonlocal last_partial_text
        if not speech_frames:
            return
        audio = np.concatenate([int16_bytes_to_float32(f) for f in speech_frames], axis=0)
        if not model_loaded:
            print("\n[一句结束] (模型未加载)")
            return
        try:
            with SuppressOutput():
                r = model.generate(input=audio, is_final=True)
            txt = ""
            if r and isinstance(r, list) and r[0].get("text"):
                txt = r[0]["text"].strip()
            # 换行打印最终句子
            if txt:
                sys.stdout.write("\r" + " " * 100 + "\r")  # 清掉临时字幕
                print(txt)
            last_partial_text = ""
        except:
            pass

    while not stop_event.is_set():
        try:
            b = audio_q.get(timeout=0.2)
        except queue.Empty:
            continue

        x = int16_bytes_to_float32(b)

        # 1) 能量门限：太小直接当静音（不进VAD，抗底噪）
        if rms_energy_float32(x) < ENERGY_GATE:
            is_speech = False
        else:
            # 2) VAD 判定
            is_speech = vad.is_speech(b, RATE)

        if not in_speech:
            if is_speech:
                in_speech = True
                speech_frames = [b]
                speech_ms = FRAME_MS
                silence_ms = 0
                last_partial_t = 0.0
                last_partial_text = ""
            # else: 仍然静音
        else:
            # 已在一句中
            speech_frames.append(b)
            speech_ms += FRAME_MS

            if is_speech:
                silence_ms = 0
                run_partial()
            else:
                silence_ms += FRAME_MS
                run_partial()

            # 句子结束条件：连续静音够长
            if silence_ms >= SILENCE_END_MS:
                # 太短的不算一句
                if speech_ms >= MIN_SPEECH_MS:
                    finalize_and_print()
                # reset
                in_speech = False
                speech_frames = []
                speech_ms = 0
                silence_ms = 0

            # 防止一句无限长
            if speech_ms >= MAX_UTTER_MS:
                finalize_and_print()
                in_speech = False
                speech_frames = []
                speech_ms = 0
                silence_ms = 0

# 启动
print("开始监听麦克风（端点检测 + 流式识别）... Ctrl+C 结束")
t1 = threading.Thread(target=mic_reader, daemon=True)
t2 = threading.Thread(target=asr_endpoint_worker, args=(model, model_loaded), daemon=True)
t1.start(); t2.start()

try:
    while True:
        time.sleep(0.2)
except KeyboardInterrupt:
    stop_event.set()
    print("\n结束")
