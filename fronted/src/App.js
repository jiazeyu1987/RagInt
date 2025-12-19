import React, { useState, useRef } from 'react';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

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
    setQuestion(text);
    setAnswer('');
    setIsLoading(true);

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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.chunk && !data.done) {
                fullAnswer += data.chunk;
                setAnswer(fullAnswer);
              }
              if (data.done) {
                console.log('RAGFlow响应完成，开始TTS播放');
                console.log('完整回答文本:', fullAnswer);
                await playTTS(fullAnswer);
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

  const playTTS = async (text) => {
    try {
      console.log('开始流式TTS语音合成，文本长度:', text.length);
      console.log('TTS文本内容:', text);

      const response = await fetch('http://localhost:8000/api/text_to_speech_stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: text })
      });

      console.log('TTS流式响应状态:', response.status);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 创建音频上下文进行流式播放
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      let chunks = [];
      let totalBytes = 0;

      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        totalBytes += value.length;
        console.log('收到音频chunk，大小:', value.length);
      }

      console.log('音频流接收完成，总大小:', totalBytes);

      // 合并所有chunk
      const audioData = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        audioData.set(chunk, offset);
        offset += chunk.length;
      }

      // 解码音频并播放
      try {
        console.log('开始解码音频...');
        const audioBuffer = await audioContext.decodeAudioData(audioData.buffer);
        console.log('音频解码成功，时长:', audioBuffer.duration);

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        source.onended = () => {
          console.log('流式音频播放结束');
          setIsLoading(false);
          audioContext.close();
        };

        source.start(0);
        console.log('流式音频播放开始');

      } catch (decodeError) {
        console.error('音频解码失败:', decodeError);

        // 如果解码失败，尝试作为blob播放
        const audioBlob = new Blob([audioData], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audio.onended = () => {
          console.log('备用音频播放结束');
          URL.revokeObjectURL(audioUrl);
          setIsLoading(false);
          audioContext.close();
        };

        await audio.play();
        console.log('备用音频播放开始');
      }

    } catch (err) {
      console.error('流式TTS过程中发生错误:', err);
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