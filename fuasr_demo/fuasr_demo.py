import os
import sys
os.environ['FUNASR_DISABLE_UPDATE'] = '1'
os.environ['PYTHONIOENCODING'] = 'utf-8'

import warnings
warnings.filterwarnings("ignore")

class SuppressOutput:
    def __enter__(self):
        import sys
        self.original_stdout = sys.stdout
        self.original_stderr = sys.stderr
        sys.stdout = open(os.devnull, 'w')
        sys.stderr = open(os.devnull, 'w')
        return self
    def __exit__(self, exc_type, exc_val, exc_tb):
        import sys
        sys.stdout.close()
        sys.stderr.close()
        sys.stdout = self.original_stdout
        sys.stderr = self.original_stderr

try:
    with SuppressOutput():
        from funasr import AutoModel
        model = AutoModel(model="iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch", device="cpu", disable_update=True, print_progress=False)
    model_loaded = True
except:
    try:
        with SuppressOutput():
            from funasr import AutoModel
            model = AutoModel(model="damo/speech_asr_conformer_u2pp_offline_ngram_cn-en_16k_common-vocab8404", device="cpu", disable_update=True, print_progress=False)
        model_loaded = True
    except:
        model_loaded = False

import pyaudio
import numpy as np
import threading
import time

audio = pyaudio.PyAudio()
stream = audio.open(format=pyaudio.paFloat32, channels=1, rate=16000, input=True, frames_per_buffer=1600)
buffer = []
last_text = ""

def process_audio():
    global last_text
    while True:
        time.sleep(0.3)
        if len(buffer) > 0 and model_loaded:
            audio_data = np.concatenate(buffer[-5:])
            buffer.clear()
            try:
                with SuppressOutput():
                    result = model.generate(input=audio_data, is_final=False)
                if result and len(result) > 0 and "text" in result[0]:
                    text = result[0]["text"].strip()
                    if text and text != last_text:
                        print(f"\r{text}", end="", flush=True)
                        last_text = text
            except:
                pass

if model_loaded:
    threading.Thread(target=process_audio, daemon=True).start()
    print("开始监听麦克风...")
else:
    print("模型未加载，仅测试麦克风")

stream.start_stream()

try:
    while True:
        data = stream.read(1600, exception_on_overflow=False)
        audio_array = np.frombuffer(data, dtype=np.float32)
        buffer.append(audio_array)
        if not model_loaded and len(buffer) % 100 == 0:
            print(f"\r音频数据收集中... {len(buffer)}", end="", flush=True)
except KeyboardInterrupt:
    stream.stop_stream()
    stream.close()
    audio.terminate()
    print("\n结束")