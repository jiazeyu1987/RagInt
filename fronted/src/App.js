import React, { useState, useRef } from 'react';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [queueStatus, setQueueStatus] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // 原始文本队列和预生成音频队列
  const ttsTextQueueRef = useRef([]);
  const ttsAudioQueueRef = useRef([]);

  // 工作线程引用
  const ttsGeneratorPromiseRef = useRef(null);
  const ttsPlayerPromiseRef = useRef(null);

  const ragflowDoneRef = useRef(false);
  const runIdRef = useRef(0);
  const currentAudioRef = useRef(null);
  const receivedSegmentsRef = useRef(false);

  // TTS预生成配置
  const MAX_PRE_GENERATE_COUNT = 2; // 最多预生成2段音频

  // 更新队列状态显示
  const updateQueueStatus = () => {
    const textCount = ttsTextQueueRef.current.length;
    const audioCount = ttsAudioQueueRef.current.length;
    const generatorRunning = !!ttsGeneratorPromiseRef.current;
    const playerRunning = !!ttsPlayerPromiseRef.current;

    setQueueStatus(
      `📝待生成: ${textCount} | 🔊预生成: ${audioCount} | ` +
      `${generatorRunning ? '🎵生成中' : '⏸️生成空闲'} | ` +
      `${playerRunning ? '🔊播放中' : '⏸️播放空闲'}`
    );
  };

  // 启动队列状态监控
  const startStatusMonitor = (runId) => {
    const interval = setInterval(() => {
      if (runIdRef.current === runId && (isLoading || ttsGeneratorPromiseRef.current || ttsPlayerPromiseRef.current)) {
        updateQueueStatus();
      } else {
        setQueueStatus('');
        clearInterval(interval);
      }
    }, 200); // 每200ms更新一次状态
  };

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

    // 清空所有队列
    ttsTextQueueRef.current = [];
    ttsAudioQueueRef.current = [];
    ragflowDoneRef.current = false;
    receivedSegmentsRef.current = false;

    // 启动状态监控
    startStatusMonitor(runId);

    // 停止当前播放的音频
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.src = '';
      } catch (_) {
        // ignore
      }
      currentAudioRef.current = null;
    }

    // 终止之前的工作线程
    if (ttsGeneratorPromiseRef.current) {
      ttsGeneratorPromiseRef.current = null;
    }
    if (ttsPlayerPromiseRef.current) {
      ttsPlayerPromiseRef.current = null;
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // TTS音频生成函数
    const generateAudioSegment = async (segmentText) => {
      try {
        console.log(`🎵 开始生成音频: "${segmentText.substring(0, 30)}..."`);
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
        console.log(`✅ 音频生成完成: ${audioBlob.size} bytes`);
        return audioBlob;
      } catch (err) {
        console.error(`❌ 音频生成失败: "${segmentText}"`, err);
        return null;
      }
    };

    // TTS音频播放函数
    const playAudioBlob = async (audioBlob, segmentText) => {
      if (!audioBlob) return;

      const audioUrl = URL.createObjectURL(audioBlob);
      try {
        console.log(`🔊 开始播放: "${segmentText.substring(0, 30)}..."`);
        await new Promise((resolve, reject) => {
          const audio = new Audio(audioUrl);
          currentAudioRef.current = audio;

          audio.onended = () => {
            console.log(`✅ 播放完成: "${segmentText.substring(0, 30)}..."`);
            resolve();
          };
          audio.onerror = () => reject(new Error('Audio playback failed'));

          audio.play().catch(reject);
        });
      } catch (err) {
        console.error(`❌ 播放失败: "${segmentText}"`, err);
      } finally {
        URL.revokeObjectURL(audioUrl);
        if (currentAudioRef.current) {
          currentAudioRef.current = null;
        }
      }
    };

    // TTS音频生成工作线程 - 后台预生成音频
    const startTTSGenerator = () => {
      if (ttsGeneratorPromiseRef.current) return;

      ttsGeneratorPromiseRef.current = (async () => {
        while (runIdRef.current === runId) {
          // 如果音频队列已经有足够的预生成音频，等待
          if (ttsAudioQueueRef.current.length >= MAX_PRE_GENERATE_COUNT) {
            await sleep(50);
            continue;
          }

          // 检查是否有待生成的文本
          const nextSegment = ttsTextQueueRef.current[0]; // 查看但不移除
          if (!nextSegment) {
            if (ragflowDoneRef.current) {
              console.log('🏁 TTS生成器: 所有文本已处理完毕');
              break;
            }
            await sleep(50);
            continue;
          }

          // 移除文本并生成音频
          ttsTextQueueRef.current.shift();
          const audioBlob = await generateAudioSegment(nextSegment);

          if (audioBlob) {
            ttsAudioQueueRef.current.push({
              text: nextSegment,
              blob: audioBlob
            });
          }

          // 检查是否应该启动播放器
          if (!ttsPlayerPromiseRef.current && ttsAudioQueueRef.current.length > 0) {
            startTTSPlayer();
          }
        }
      })()
        .catch((err) => {
          console.error('❌ TTS生成线程出错:', err);
        })
        .finally(() => {
          ttsGeneratorPromiseRef.current = null;
        });
    };

    // TTS音频播放工作线程 - 专门负责播放
    const startTTSPlayer = () => {
      if (ttsPlayerPromiseRef.current) return;

      ttsPlayerPromiseRef.current = (async () => {
        while (runIdRef.current === runId) {
          const audioItem = ttsAudioQueueRef.current.shift();
          if (!audioItem) {
            // 检查是否所有工作都已完成
            if (ragflowDoneRef.current && !ttsGeneratorPromiseRef.current) {
              console.log('🏁 TTS播放器: 所有音频播放完毕');
              break;
            }
            await sleep(50);
            continue;
          }

          await playAudioBlob(audioItem.blob, audioItem.text);
        }
      })()
        .catch((err) => {
          console.error('❌ TTS播放线程出错:', err);
        })
        .finally(() => {
          if (runIdRef.current === runId) {
            setIsLoading(false);
          }
          ttsPlayerPromiseRef.current = null;
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
                  ttsTextQueueRef.current.push(seg);
                  console.log(`📝 收到文本段落: "${seg.substring(0, 30)}..."`);
                  startTTSGenerator();
                }
              }

              if (data.done) {
                if (!receivedSegmentsRef.current && fullAnswer.trim()) {
                  ttsTextQueueRef.current.push(fullAnswer.trim());
                  console.log(`📝 收到完整文本: "${fullAnswer.substring(0, 30)}..."`);
                }
                ragflowDoneRef.current = true;
                console.log('📚 RAGFlow响应完成，等待TTS处理完毕');
                startTTSGenerator();

                // 等待TTS生成器完成
                if (ttsGeneratorPromiseRef.current) {
                  await ttsGeneratorPromiseRef.current;
                }

                // 等待TTS播放器完成
                if (ttsPlayerPromiseRef.current) {
                  await ttsPlayerPromiseRef.current;
                }
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

        {queueStatus && (
          <div className="queue-status">
            <small>{queueStatus}</small>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
