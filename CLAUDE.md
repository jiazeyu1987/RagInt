# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**RagInt** is an AI-powered voice-based Q&A system designed for exhibition/demo scenarios. The system enables users to ask questions verbally and receive spoken answers in a specified voice, integrating multiple AI services including speech recognition, knowledge retrieval, and text-to-speech synthesis.

## Core Architecture

### Main Components

1. **Audio Pipeline**: `fuasr_demo/` - Real-time speech recognition using FunASR with VAD (Voice Activity Detection)
2. **Knowledge & Chat**: `ragflow_demo/` - RAGFlow integration for knowledge retrieval and chat functionality
3. **Text-to-Speech**: `tts_demo/` - GPT-SoVITS integration for voice synthesis
4. **Backend**: `backend/` - Flask server orchestrating all services
5. **Frontend**: `fronted/` - Web interface for desktop and mobile

### Key Files

- `backend/app.py` - Main Flask application with all API endpoints
- `fronted/src/App.js` - React frontend application with voice/text support
- `ragflow_demo/ragflow_config.json` - Configuration for RAGFlow API integration
- `test_tts_prequeue.py` - TTS pre-queue testing script for performance validation
- `task.txt` - Implementation requirements and specifications

## Development Commands

### Running Individual Components

**ASR Demo:**
```bash
cd fuasr_demo
python fuasr_advance.py
```

**RAGFlow Chat:**
```bash
cd ragflow_demo
python chat_agent_chat.py
```

**TTS Demo:**
```bash
cd tts_demo
python test1.py
```

**TTS API Server (GPT-SoVITS):**
```bash
cd tts_demo/GPT-SoVITS-v2pro-20250604
python api.py
# or
python api_v2.py
```

### Running Complete System

**Backend Flask Server:**
```bash
cd backend
python app.py
# Server runs on http://localhost:8000
```

**Frontend React App:**
```bash
cd fronted
npm install
npm start
# App runs on http://localhost:3000 (React default)
```

**Full System (requires multiple terminals):**
1. Start TTS service: `cd tts_demo/GPT-SoVITS-v2pro-20250604 && python api.py`
2. Start backend: `cd backend && python app.py`
3. Start frontend: `cd fronted && npm start`

**TTS Pre-Queue Testing:**
```bash
python test_tts_prequeue.py
# Tests TTS pre-queue functionality and performance
```

### Testing

**Run All Tests:**
```bash
pytest test/ -v
```

**Run Specific Tests:**
```bash
pytest test/test_task1_flask_app.py -v
pytest test/test_task7_qa_service.py -v
pytest test/test_task24_frontend_foundation.py -v
pytest test/test_final_complete.py -v
```

### Environment Setup

The project uses Python with several key dependencies:
- `funasr` - ASR functionality
- `flask` - Web framework (as specified in task.txt)
- `requests` - API calls
- `pyaudio` - Audio handling
- `webrtcvad` - Voice activity detection
- `websockets` - Real-time communication

## System Flow

```
Audio Input → VAD Trigger → ASR → Fixed QA / RAG → LLM → Text Normalizer → TTS → Audio Output
```

## API Integration Notes

### RAGFlow Configuration
Configure your RAGFlow integration in `ragflow_demo/ragflow_config.json`:
- `api_key`: Your RAGFlow API key
- `base_url`: RAGFlow server URL
- `dataset_name`: Target knowledge dataset
- `conversation_name`: Default conversation context

### TTS Configuration
The TTS system uses GPT-SoVITS with these key parameters:
- `text`: Input text to synthesize
- `text_lang`: Language code ("zh" for Chinese)
- `ref_audio_path`: Reference audio for voice cloning
- `prompt_text`: Reference text matching the reference audio
- `streaming_mode`: Enable real-time audio streaming

## Implementation Requirements (from task.txt)

- Frontend must support both voice and text input/output
- Support both desktop and mobile platforms
- Backend using Python + Flask (NOT FastAPI as stated elsewhere)
- Frontend in React framework
- No complex error handling needed for demo
- No code comments required
- Frontend in `fronted/`, backend in `backend/`
- Do not add extra functionality beyond specified requirements
- Simple error handling - expose errors directly

## Backend API Endpoints

The Flask backend (`backend/app.py`) provides these main endpoints:

- **`GET /health`** - Check system health and service status
- **`POST /api/speech_to_text`** - Convert audio to text using FunASR
- **`POST /api/ask`** - Stream chat responses from RAGFlow (Server-Sent Events)
- **`POST /api/text_to_speech`** - Convert text to speech audio (non-streaming)
- **`POST /api/text_to_speech_stream`** - Convert text to speech audio (streaming)

### Dependencies

**Backend Python Dependencies:**
```bash
pip install -r backend/requirements.txt
```

**Frontend Node.js Dependencies:**
```bash
cd fronted && npm install
```

## Implementation Status

**COMPLETED COMPONENTS:**
- ASR demo in `fuasr_demo/fuasr_advance.py` with FunASR integration
- RAGFlow chat in `ragflow_demo/chat_agent_chat.py` with knowledge retrieval
- TTS demo in `tts_demo/test1.py` with GPT-SoVITS voice synthesis
- Backend Flask application in `backend/app.py` with full API endpoints including streaming
- React frontend in `fronted/src/App.js` with voice and text input/output support
- TTS pre-queue system for improved audio streaming performance
- Comprehensive test infrastructure in `test/` including integration tests
- Complete project documentation and configuration files

**RECENT ENHANCEMENTS:**
- Improved streaming TTS with buffering for smoother audio playback
- TTS pre-queue functionality to reduce latency
- Enhanced audio processing pipeline with better VAD integration
- Cross-platform compatibility improvements

**TO BE IMPLEMENTED:**
- Production deployment configuration
- Advanced audio streaming optimizations
- Comprehensive error handling and logging improvements
- Performance monitoring and metrics collection

## Demo Scope

The demo focuses on core functionality:
- 20 fixed Q&A pairs for 100% accuracy
- RAG + LLM for additional responses
- Manual interrupt capability
- Response time ≤ 3 seconds
- Stable operation for ≥ 30 minutes

## File Naming Note

The frontend directory is named `fronted/` (not `frontend/`) - maintain this naming convention.

## Key Service Ports

- Backend API: http://localhost:8000
- Frontend Web: http://localhost:3000 (React default)
- TTS Service: http://localhost:9880
- RAGFlow: http://localhost:9380

## Audio Processing Pipeline

The system processes voice input through these stages:
1. **Audio Capture** - WebRTC VAD detects voice activity
2. **ASR (FunASR)** - Speech-to-text conversion
3. **QA Processing** - Fixed Q&A pairs or RAGFlow for general queries
4. **Response Streaming** - Real-time text response via Server-Sent Events
5. **TTS (GPT-SoVITS)** - Text-to-speech synthesis with voice cloning
6. **Audio Playback** - Streaming audio output

## RAGFlow Integration

The system integrates with RAGFlow for knowledge retrieval:
- Dataset: "展厅" (Exhibition Hall)
- Default conversation: "展厅聊天" (Exhibition Chat)
- Text cleaning enabled with semantic chunking
- TTS buffering for smooth audio generation
- Timeout: 10 seconds, 3 retries

## TTS Pre-Queue System

The system includes a TTS pre-queue mechanism to improve performance:
- **Purpose**: Reduces TTS latency by pre-generating common responses
- **Testing**: Use `test_tts_prequeue.py` to validate functionality
- **Integration**: Works with streaming TTS endpoints for smoother playback
- **Benefits**: Faster response times for frequently used phrases
- **Configuration**: Configurable queue size and pre-generation strategies