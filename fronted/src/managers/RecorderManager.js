export class RecorderManager {
  constructor({ minRecordMs = 900, onStateChange, onBlob, onError, onLog } = {}) {
    this._minRecordMs = Number(minRecordMs) || 900;
    this._onStateChange = typeof onStateChange === 'function' ? onStateChange : null;
    this._onBlob = typeof onBlob === 'function' ? onBlob : null;
    this._onError = typeof onError === 'function' ? onError : null;
    this._log = typeof onLog === 'function' ? onLog : null;

    this._stream = null;
    this._recorder = null;
    this._chunks = [];
    this._startMs = 0;
    this._canceled = false;
    this._isRecording = false;
    this._mimeType = '';
  }

  get isRecording() {
    return !!this._isRecording;
  }

  _setRecording(next) {
    this._isRecording = !!next;
    if (this._onStateChange) {
      try {
        this._onStateChange(this._isRecording);
      } catch (_) {
        // ignore
      }
    }
  }

  _fail(msg, err) {
    if (this._log) this._log('[REC]', msg, err || '');
    if (this._onError) {
      try {
        this._onError(msg);
        return;
      } catch (_) {
        // ignore
      }
    }
    try {
      alert(msg);
    } catch (_) {
      // ignore
    }
  }

  async start() {
    if (this._isRecording) return;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      this._fail('当前浏览器不支持麦克风录音（getUserMedia 不可用）');
      return;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      this._fail('浏览器限制：非安全环境无法使用麦克风。请用 https 或 localhost/127.0.0.1 访问。');
      return;
    }

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      this._fail('无法获取麦克风权限，请检查浏览器权限设置。', err);
      return;
    }

    this._stream = stream;
    this._startMs = Date.now();
    this._canceled = false;
    this._chunks = [];

    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
    let mimeType = '';
    for (const c of candidates) {
      try {
        if (window.MediaRecorder && typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(c)) {
          mimeType = c;
          break;
        }
      } catch (_) {
        // ignore
      }
    }
    this._mimeType = mimeType;

    let mediaRecorder = null;
    try {
      mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (err) {
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch (_) {
        // ignore
      }
      this._stream = null;
      this._fail('初始化录音失败：当前浏览器不支持 MediaRecorder 或音频编码格式。', err);
      return;
    }

    this._recorder = mediaRecorder;
    mediaRecorder.ondataavailable = (event) => {
      if (event && event.data && event.data.size > 0) this._chunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const dt = Date.now() - (this._startMs || Date.now());
      const blobType = (this._mimeType || (mediaRecorder && mediaRecorder.mimeType) || 'application/octet-stream').split(';')[0];
      const audioBlob = new Blob(this._chunks || [], { type: blobType });

      const s = this._stream;
      this._stream = null;
      try {
        if (s) s.getTracks().forEach((track) => track.stop());
      } catch (_) {
        // ignore
      }

      const canceled = this._canceled;
      this._canceled = false;
      this._chunks = [];
      this._recorder = null;

      if (canceled) {
        if (this._log) this._log('[REC] canceled drop', { type: audioBlob.type, bytes: audioBlob.size, dt });
        return;
      }
      if (dt < this._minRecordMs) {
        this._fail('录音太短，请按住说话 1 秒以上');
        return;
      }
      if (!audioBlob || audioBlob.size <= 0) {
        if (this._log) this._log('[REC] empty blob, skip');
        return;
      }
      if (this._log) this._log('[REC] recorded', { type: audioBlob.type, bytes: audioBlob.size, dt });
      if (this._onBlob) {
        try {
          await this._onBlob(audioBlob, { mimeType: audioBlob.type });
        } catch (err) {
          this._fail('语音处理失败，请重试。', err);
        }
      }
    };

    try {
      mediaRecorder.start(250);
    } catch (err) {
      this._fail('启动录音失败，请重试。', err);
      return;
    }
    this._setRecording(true);
  }

  stop() {
    if (!this._isRecording) return;
    this._setRecording(false);
    const r = this._recorder;
    if (r) {
      try {
        if (r.state !== 'inactive') r.stop();
      } catch (_) {
        // ignore
      }
    }
  }

  cancel() {
    if (!this._isRecording) return;
    this._canceled = true;
    this.stop();
  }
}

