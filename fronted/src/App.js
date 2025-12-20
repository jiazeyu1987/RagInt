import React, { useState, useRef } from 'react';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const ttsQueueRef = useRef([]);
  const ttsWorkerPromiseRef = useRef(null);
  const ragflowDoneRef = useRef(false);
  const runIdRef = useRef(0);
  const currentAudioRef = useRef(null);
  const receivedSegmentsRef = useRef(false);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        stream.getTracks().forEach(track => track.stop());
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (audioBlob) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob);

      const response = await fetch('http://localhost:8000/api/speech_to_text', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      const text = result.text || '';

      if (text) {
        await askQuestion(text);
      } else {
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Error processing audio:', err);
      setIsLoading(false);
    }
  };

  const askQuestion = async (text) => {
    const runId = ++runIdRef.current;
    setQuestion(text);
    setAnswer('');
    setIsLoading(true);
    ttsQueueRef.current = [];
    ragflowDoneRef.current = false;
    receivedSegmentsRef.current = false;

    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.src = '';
      } catch (_) {
        // ignore
      }
      currentAudioRef.current = null;
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const playAudioBlob = async (audioBlob) => {
      const audioUrl = URL.createObjectURL(audioBlob);
      try {
        await new Promise((resolve, reject) => {
          const audio = new Audio(audioUrl);
          currentAudioRef.current = audio;

          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error('Audio playback failed'));

          audio.play().catch(reject);
        });
      } finally {
        URL.revokeObjectURL(audioUrl);
        if (currentAudioRef.current) {
          currentAudioRef.current = null;
        }
      }
    };

    const synthesizeAndPlaySegment = async (segmentText) => {
      const response = await fetch('http://localhost:8000/api/text_to_speech_stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: segmentText })
      });

      if (!response.ok) {
        throw new Error(`TTS HTTP error! status: ${response.status}`);
      }

      const audioBlob = await response.blob();
      await playAudioBlob(audioBlob);
    };

    const startTTSWorkerIfNeeded = () => {
      if (ttsWorkerPromiseRef.current) return;

      ttsWorkerPromiseRef.current = (async () => {
        while (runIdRef.current === runId) {
          const nextSegment = ttsQueueRef.current.shift();
          if (!nextSegment) {
            if (ragflowDoneRef.current) return;
            await sleep(50);
            continue;
          }

          await synthesizeAndPlaySegment(nextSegment);
        }
      })()
        .catch((err) => {
          console.error('TTS分段播放出错:', err);
        })
        .finally(() => {
          if (runIdRef.current === runId) {
            setIsLoading(false);
          }
          ttsWorkerPromiseRef.current = null;
        });
    };

    try {
      const response = await fetch('http://localhost:8000/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: text })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullAnswer = '';
      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.chunk && !data.done) {
                fullAnswer += data.chunk;
                setAnswer(fullAnswer);
              }

              if (data.segment && !data.done) {
                const seg = String(data.segment).trim();
                if (seg) {
                  receivedSegmentsRef.current = true;
                  ttsQueueRef.current.push(seg);
                  startTTSWorkerIfNeeded();
                }
              }

              if (data.done) {
                if (!receivedSegmentsRef.current && fullAnswer.trim()) {
                  ttsQueueRef.current.push(fullAnswer.trim());
                }
                ragflowDoneRef.current = true;
                startTTSWorkerIfNeeded();
                await ttsWorkerPromiseRef.current;
                return;
              }
            } catch (err) {
              console.error('Error parsing chunk:', err);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error asking question:', err);
      setIsLoading(false);
    }
  };

  const handleTextSubmit = async (e) => {
    e.preventDefault();
    if (question.trim() && !isLoading) {
      await askQuestion(question);
    }
  };

  return (
    <div className="app">
      <div className="container">
        <h1>AI语音问答</h1>

        <div className="input-section">
          <div className="voice-input">
            <button
              className={`record-btn ${isRecording ? 'recording' : ''}`}
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              disabled={isLoading}
            >
              {isRecording ? '🔴 录音中...' : '🎤 按住说话'}
            </button>
          </div>

          <form className="text-input" onSubmit={handleTextSubmit}>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="或者输入文字问题..."
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading}>
              发送
            </button>
          </form>
        </div>

        {question && (
          <div className="question-section">
            <h3>问题: {question}</h3>
          </div>
        )}

        {answer && (
          <div className="answer-section">
            <h3>回答:</h3>
            <p>{answer}</p>
          </div>
        )}

        {isLoading && (
          <div className="loading">
            处理中...
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
