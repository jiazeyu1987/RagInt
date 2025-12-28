# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**RagInt** is an AI-powered voice-based Q&A system designed for exhibition/demo scenarios. The system enables users to ask questions verbally and receive spoken answers, integrating multiple AI services including speech recognition (ASR), knowledge retrieval (RAG), and text-to-speech synthesis (TTS).

## Core Architecture

### System Flow

```
Audio Input → VAD Trigger → ASR → Intent Classification → Fixed QA / RAGFlow Agent → LLM →
Text Cleaning & Segmentation → TTS (Multiple Providers) → Audio Playback
```

### Main Components

1. **Audio Pipeline**: `fuasr_demo/` - Real-time speech recognition using FunASR with VAD
2. **Knowledge & Chat**: `ragflow_demo/` - RAGFlow integration for knowledge retrieval
3. **Text-to-Speech**: `tts_demo/` - Multi-provider TTS (GPT-SoVITS V1/V2, Edge TTS, SAPI, DashScope)
4. **Backend**: `backend/` - Flask server orchestrating all services
5. **Frontend**: `fronted/` - React web interface with voice/text I/O

### Backend Architecture

```
backend/
├── app.py                    # Main Flask application (1017 lines)
├── services/                 # Business logic services
│   ├── asr_service.py       # Speech recognition (FunASR, DashScope)
│   ├── tts_service.py       # TTS orchestration (all 5 providers)
│   ├── ragflow_service.py   # RAGFlow chat integration
│   ├── ragflow_agent_service.py  # RAGFlow agent integration
│   ├── intent_service.py    # Intent classification
│   ├── history_store.py     # SQLite Q&A history
│   ├── tour_planner.py      # Tour route planning
│   ├── nav_service.py       # Navigation service
│   ├── request_registry.py  # Request tracking & cancellation
│   ├── edge_tts_service.py  # Microsoft Edge TTS
│   └── sapi_tts.py          # Windows SAPI TTS
├── orchestrators/
│   └── conversation_orchestrator.py  # Main conversation flow
├── infra/
│   ├── cancellation.py      # Cancellation token implementation
│   └── event_store.py       # Event tracking & metrics
└── data/
    └── qa_history.db        # SQLite database
```

### Frontend Architecture

```
fronted/
├── src/
│   ├── App.js               # Main React application (841 lines)
│   ├── api/
│   │   └── backendClient.js # Backend API client
│   ├── audio/
│   │   └── ttsAudio.js      # Audio playback & TTS management
│   ├── components/          # React components
│   │   ├── ControlBar.jsx   # Settings & controls
│   │   ├── Composer.jsx     # Input & recording
│   │   ├── ChatPanel.jsx    # Q&A display
│   │   ├── HistoryPanel.jsx # Q&A history
│   │   └── DebugPanel.jsx   # Debug & timing info
│   ├── hooks/
│   │   ├── useRecorderWorkflow.js  # Voice recording workflow
│   │   ├── useAskWorkflowManager.js # Q&A orchestration
│   │   ├── useTourState.js          # Tour state management
│   │   ├── useTourPipelineManager.js # Tour prefetch
│   │   ├── useBackendStatus.js      # Backend health
│   │   ├── useBackendEvents.js      # Event streaming
│   │   ├── useRagflowBootstrap.js   # RAGFlow setup
│   │   └── useLocalStorageState.js  # Local storage
│   └── managers/
│       ├── TourController.js       # Tour navigation
│       ├── createTtsManager.js     # TTS queue management
│       └── createTtsOnStopIndexChange.js # TTS on tour change
```

### Key Files

- `backend/app.py` - Flask application with comprehensive API endpoints
- `fronted/src/App.js` - React frontend with voice/text support
- `ragflow_demo/ragflow_config.json` - Central configuration for all services
- `ragflow_demo/text_cleaner.py` - Text normalization and TTS optimization
- `ragflow_demo/tts_buffer.py` - TTS buffering system

## Development Commands

### Running Individual Demos

**ASR Demo (FunASR with VAD):**
```bash
cd fuasr_demo
python fuasr_advance.py
```

**RAGFlow Chat Demo:**
```bash
cd ragflow_demo
python chat_agent_chat.py
```

**TTS Demos:**
```bash
cd tts_demo
python test1.py          # Basic TTS demo
```

**TTS API Servers (choose one):**
```bash
# GPT-SoVITS V1 (port 9882)
cd tts_demo/GPT-SoVITS-v2pro-20250604
python api.py

# GPT-SoVITS V2 with streaming (port 9880)
cd tts_demo/GPT-SoVITS-v2pro-20250604
python api_v2.py
```

### Running Complete System

**Full System (3 terminals required):**

1. **Terminal 1 - Start TTS Service:**
   ```bash
   cd tts_demo/GPT-SoVITS-v2pro-20250604
   python api_v2.py
   # Runs on http://localhost:9880
   ```

2. **Terminal 2 - Start Backend:**
   ```bash
   cd backend
   python app.py
   # Runs on http://localhost:8000
   ```

3. **Terminal 3 - Start Frontend:**
   ```bash
   cd fronted
   npm install  # First time only
   npm start
   # Runs on http://localhost:3000
   ```

**Access the application:** Open http://localhost:3000 in your browser

### Testing

**Note:** The `test/` directory exists but is currently empty. Automated tests should be added for:
- Backend API endpoints
- ASR/TTS service integration
- Frontend components
- End-to-end workflows

## Configuration

### Central Configuration: `ragflow_demo/ragflow_config.json`

This file configures ALL services including RAGFlow, ASR, TTS, tour planning, and text cleaning.

**Key Sections:**

1. **RAGFlow Connection:**
   - `api_key`: RAGFlow API key
   - `base_url`: RAGFlow server URL
   - `dataset_name`: Target knowledge dataset ("展厅")
   - `default_conversation_name`: Default conversation context

2. **ASR Configuration:**
   - `provider`: "funasr" | "faster_whisper" | "dashscope"
   - `funasr.model`: Paraformer model path
   - `dashscope.api_key`: DashScope API key (if using DashScope)

3. **TTS Providers** (5 providers available):
   - `sovtts1`: GPT-SoVITS V1 (port 9882)
   - `local`: GPT-SoVITS V2 (port 9880)
   - `sovtts2`: GPT-SoVITS V2 streaming (port 9880)
   - `sapi`: Windows SAPI
   - `edge`: Microsoft Edge TTS (zh-CN-XiaoxiaoNeural)
   - `bailian`: Alibaba DashScope (cosyvoice-v3-plus)

4. **Tour Planning:**
   - `stops`: 10 exhibition stops
   - `zones`: Tour routes ("展厅顺序", "默认路线")
   - `profiles`: Audience types ("大众", "儿童", "专业")
   - `stop_durations_s`: Duration per stop per zone (in seconds)

5. **Text Cleaning:**
   - `enabled`: Enable text normalization
   - `semantic_chunking`: Break text into optimal TTS segments
   - `max_chunk_size`: Maximum characters per chunk (260)
   - `tts_buffer_enabled`: Buffering for smooth playback

### TTS Configuration Details

**Voice Reference**: Dr. Liang's voice samples are used for cloning
- Reference audio: `Liang/converted_temp_first_90s.wav_0000000000_0000182720.wav`
- Prompt text: "平台呢因为从我们的初创团队的理解的角度呢,我们觉得一个初创公司。"

## Backend API Endpoints

The Flask backend provides these main endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | System health check |
| `/api/speech_to_text` | POST | Audio to text via ASR |
| `/api/ask` | POST | Stream chat responses (SSE) |
| `/api/text_to_speech` | POST | Text to audio (non-streaming) |
| `/api/text_to_speech_stream` | GET/POST | Text to audio (streaming) |
| `/api/ragflow/chats` | GET | List RAGFlow conversations |
| `/api/ragflow/agents` | GET | List RAGFlow agents |
| `/api/history` | GET | Q&A history (by time/count) |
| `/api/tour/stops` | GET | Tour stops list |
| `/api/tour/meta` | GET | Tour metadata (zones/profiles) |
| `/api/tour/plan` | POST | Generate tour plan |
| `/api/cancel` | POST | Cancel active request |
| `/api/events` | GET | Request events/logs |
| `/api/client_events` | POST | Client-side event ingestion |
| `/api/status` | GET | Request status & timing metrics |

### Advanced Backend Features

- **Cancellation Registry**: Track and cancel active requests by `client_id` or `request_id`
- **Event Store**: Timeline tracking for performance monitoring
- **Rate Limiting**: Per-client rate limits for ASR and ASK endpoints
- **Text Cleaning**: Semantic chunking with TTS buffer optimization
- **Intent Classification**: Detect question types (greeting, tour_control, etc.)
- **History Management**: SQLite-based Q&A history with frequency tracking

## Frontend Features

- **Dual Input**: Voice recording (with VAD) and text input
- **Dual Output**: Text display and TTS audio playback
- **Tour Mode**: Guided exhibition tour with 10 configurable stops
- **Group Mode**: Question queue for multiple speakers
- **Agent Mode**: RAGFlow agent vs. chat conversation selection
- **TTS Queue**: Pre-generation and buffering for smooth playback
- **Debug Panel**: Real-time timing metrics and event logs
- **Responsive Design**: Desktop and mobile support
- **Local Storage**: Persistent settings (TTS mode, tour preferences)

### TTS Manager (Frontend)

- Queue-based text-to-speech processing
- Pre-generation of upcoming segments (configurable via `MAX_PRE_GENERATE_COUNT`)
- Buffer management for seamless playback
- Support for all 5 TTS providers

### Tour Pipeline

- Prefetch upcoming tour stop explanations
- Configurable zones and audience profiles
- Stop duration planning (chars/second calculation)
- Continuous or manual navigation modes

## Key Integration Points

### 1. ASR → RAGFlow Pipeline
```
Frontend (audio blob) → /api/speech_to_text → ASRService → FunASR → text
```

### 2. RAGFlow Streaming Pipeline
```
Frontend (question) → /api/ask → ConversationOrchestrator →
RAGFlowAgentService → streaming SSE → Frontend (text chunks)
```

### 3. Text → TTS Pipeline
```
Frontend (text segment) → /api/text_to_speech_stream → TTSSvc →
provider selection → streaming audio → Frontend playback
```

### 4. Tour Prefetch Pipeline
```
TourController → TourPipelineManager → /api/ask (kind=prefetch) →
pre-generate TTS → buffer → seamless playback
```

## Performance Optimization

### TTS Pre-Generation
- Frontend maintains TTS queue manager
- Pre-generates next 2 segments while playing current
- Reduces time-to-first-audio

### Semantic Chunking
- Text cleaner breaks responses into optimal TTS segments
- Configurable chunk size (260 chars default)
- Balances latency vs. completeness

### Streaming Architecture
- Server-Sent Events (SSE) for real-time text streaming
- Chunked audio streaming for TTS
- Reduces latency throughout the pipeline

### Request Cancellation
- Client-initiated cancellation via `/api/cancel`
- Stops ASR, RAG, and TTS processing
- Frees resources for new requests

## Service Ports

| Service | Port | Protocol |
|---------|------|----------|
| Backend API | 8000 | HTTP |
| Frontend Web | 3000 | HTTP |
| GPT-SoVITS V1 | 9882 | HTTP |
| GPT-SoVITS V2 | 9880 | HTTP |
| RAGFlow | 9380 | HTTP |

## Tour Stops

The system includes 10 predefined exhibition stops:
1. 公司与孵化转化平台介绍
2. 心脏介入展厅
3. 心脏植入展厅
4. 外周介植入展厅
5. 神经介植入展厅
6. 外泌体与超声聚焦展厅
7. 骨科与泌尿产品展厅
8. 非介入类产品展厅
9. 医疗标准件展厅
10. 企业荣誉展厅

## Environment Setup

### Python Dependencies
```bash
pip install -r backend/requirements.txt
```

Key dependencies:
- `Flask>=2.3.0` - Web framework
- `Flask-CORS>=3.0.0` - CORS support
- `ragflow-sdk>=0.12.0` - RAGFlow SDK
- `pyaudio>=0.2.11` - Audio handling
- `webrtcvad>=2.0.10` - Voice activity detection
- `numpy>=1.21.0` - Numerical operations
- `requests>=2.25.0` - HTTP client

Optional:
- `funasr>=0.8.0` - ASR functionality

### Node.js Dependencies
```bash
cd fronted
npm install
```

Key dependencies:
- `react@^18.2.0` - UI framework
- `react-dom@^18.2.0` - React DOM
- `react-scripts@5.0.1` - Build tool

### System Requirements
- Python 3.8+
- Node.js 16+
- PyAudio (requires PortAudio on Windows/Linux)
- Microphone for ASR
- Speakers for TTS playback

## File Naming Convention

**Important**: The frontend directory is `fronted/` (not `frontend/`) - maintain this naming convention throughout the codebase.

## Implementation Notes

### Error Handling
- Simple error handling for demo purposes
- Errors are exposed directly to frontend
- No complex error recovery logic

### Code Style
- No code comments required (as per project requirements)
- Focus on functionality over documentation

### Scope
- Do not add extra functionality beyond specified requirements
- Demo-focused, not production-ready
- Core functionality: 20 fixed Q&A pairs + RAG for additional responses
- Target: Response time ≤ 3 seconds, stable operation ≥ 30 minutes

## Recent Enhancements (from git log)

- Edge TTS integration for voice synthesis
- Local TTS support with V1/V2 switching
- Improved streaming TTS with buffering
- Enhanced audio processing pipeline with better VAD integration
- Cross-platform compatibility improvements

## Known Limitations

- Test directory is empty (no automated tests)
- No production deployment configuration
- Simple error handling (errors exposed directly)
- Limited monitoring/metrics collection
- No authentication/authorization
- No fixed Q&A pairs implementation yet (planned for 100% accuracy on common questions)
