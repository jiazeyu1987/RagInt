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
├── __main__.py              # Entry point for `python -m backend`
├── app.py                   # Flask app factory (create_app)
├── app_deps.py              # Dependency injection container
├── api/                     # Flask blueprints (API endpoints)
│   ├── speech.py           # /api/ask, /api/speech_to_text, /api/cancel
│   ├── tts.py              # /api/text_to_speech, /api/text_to_speech_stream
│   ├── system.py           # /health, /api/status, /api/events
│   ├── tour_control.py     # /api/tour/plan, /api/tour/stops, /api/tour/meta
│   ├── tour_command.py     # /api/tour/command (parse and execute)
│   ├── ragflow_tour_history.py  # /api/ragflow/history
│   ├── ops.py              # /api/ops/* (operations, selling points)
│   ├── selling_points.py   # /api/selling_points
│   ├── wake_word.py        # /api/wake_word
│   ├── breakpoint.py       # /api/breakpoint
│   ├── recordings.py       # /api/recordings
│   └── offline.py          # /api/offline/*
├── services/
│   ├── asr_service.py      # ASRService (FunASR, DashScope)
│   ├── tts_service.py      # TTSSvc (orchestrates TTS providers)
│   ├── tts/
│   │   ├── registry.py     # Provider routing (sovtts1/2, edge, sapi, bailian)
│   │   └── providers/      # Individual TTS implementations
│   ├── ragflow_service.py  # RagflowService (chat mode)
│   ├── ragflow_agent_service.py  # RagflowAgentService (agent mode)
│   ├── intent_service.py   # Intent classification
│   ├── history_store.py    # SQLite Q&A history
│   ├── tour_planner.py     # Tour route planning
│   ├── tour_control_store.py  # Tour state management
│   ├── tour_command_service.py  # Tour command parsing
│   ├── nav_service.py      # Navigation service
│   ├── request_registry.py # RequestRegistry (cancellation, rate limiting)
│   ├── selling_points_store.py  # Selling points per stop
│   ├── ops_store.py        # Operations data store
│   ├── wake_word_service.py  # Wake word detection
│   ├── recording_store.py  # Tour recording storage
│   ├── breakpoint_store.py # Breakpoint (resume) storage
│   ├── config_service.py   # Config loading from ragflow_config.json
│   ├── env_overrides.py    # Environment variable overrides
│   ├── safety_filter.py    # Sensitive word filtering
│   └── question_normalizer.py  # Text normalization
├── orchestrators/
│   ├── conversation_orchestrator.py  # Main ask workflow (streaming)
│   └── guide_prompt.py     # Tour guide prompt generation
├── infra/
│   ├── cancellation.py     # CancellationRegistry, cancel events
│   ├── event_store.py      # EventStore, RedisEventStore (metrics/timeline)
│   ├── ask_timings.py      # AskTimings (performance tracking)
│   └── redis_client.py     # Redis client wrapper
└── data/
    └── qa_history.db        # SQLite database
```

### Frontend Architecture

```
fronted/
├── src/
│   ├── App.js               # Main React application (root component)
│   ├── api/
│   │   ├── backendClient.js # Backend API client (fetch wrappers)
│   │   ├── tourControl.js   # Tour control API calls
│   │   └── tourCommand.js   # Tour command parsing
│   ├── audio/
│   │   └── ttsAudio.js      # Audio playback utilities
│   ├── components/          # React components
│   │   ├── ControlBar.js    # Settings & controls
│   │   ├── Composer.js      # Input & recording
│   │   ├── ChatPanel.js     # Q&A display
│   │   ├── HistoryPanel.js  # Q&A history
│   │   ├── DebugPanel.js    # Debug & timing info
│   │   ├── StagePanel.js    # Tour stage display
│   │   ├── TourModePanel.js # Tour mode UI
│   │   ├── SellingPointsPanel.js  # Selling points display
│   │   └── SettingsDrawer.js  # Settings drawer
│   ├── hooks/
│   │   ├── useRecorderWorkflow.js  # Voice recording workflow
│   │   ├── useAskWorkflowManager.js # Q&A orchestration
│   │   ├── useTourState.js          # Tour state management
│   │   ├── useTourPipelineManager.js # Tour prefetch
│   │   ├── useBackendStatus.js      # Backend health
│   │   ├── useBackendEvents.js      # Event streaming
│   │   ├── useRagflowBootstrap.js   # RAGFlow setup
│   │   ├── useAppSettings.js        # Settings state
│   │   ├── useClientId.js           # Client ID generation
│   │   ├── useLocalStorageState.js  # Local storage
│   │   ├── useTourBootstrap.js      # Tour initialization
│   │   ├── useBreakpointSync.js     # Breakpoint sync
│   │   ├── useWakeWordListener.js   # Wake word detection
│   │   ├── useTourTemplates.js      # Tour templates
│   │   ├── useTourRecordingOptions.js  # Recording options
│   │   └── useTourRecordings.js     # Tour recordings
│   ├── managers/
│   │   ├── AskWorkflowManager.js  # Ask workflow orchestration
│   │   ├── TourController.js      # Tour navigation
│   │   ├── TourPipelineManager.js # Tour prefetch pipeline
│   │   ├── TourStateMachine.js    # Tour state transitions
│   │   ├── InterruptManager.js    # Interrupt epoch tracking
│   │   ├── RunCoordinator.js      # Run policy coordination
│   │   ├── RunPolicies.js         # Interrupt classification
│   │   ├── RunReasons.js          # Run reason constants
│   │   ├── TtsQueueManager.js     # TTS queue management
│   │   ├── createTtsManager.js    # TTS manager factory
│   │   ├── createTtsOnStopIndexChange.js # TTS on tour change
│   │   ├── RecorderManager.js     # Audio recording
│   │   ├── PcmWsRecorderManager.js # WebSocket PCM recorder
│   │   ├── LocalSpeechTtsManager.js  # Local TTS fallback
│   │   ├── TtsBroadcastManager.js   # TTS broadcast
│   │   ├── OfflineScriptPlayer.js   # Offline script playback
│   │   └── RecordingWorkflowManager.js  # Recording workflow
│   └── config/
│       └── backend.js        # Backend URL config
```

### Key Files

- `backend/app.py` - Flask application with comprehensive API endpoints
- `fronted/src/App.js` - React frontend with voice/text support
- `ragflow_demo/ragflow_config.json` - Central configuration for all services
- `ragflow_demo/text_cleaner.py` - Text normalization and TTS optimization
- `ragflow_demo/tts_buffer.py` - TTS buffering system

## Development Commands

### Running the Complete System

**Full System (3 terminals required):**

1. **Terminal 1 - Start TTS Service:**
   ```bash
   cd tts_demo/GPT-SoVITS-v2pro-20250604
   python api_v2.py
   # Runs on http://localhost:9880
   ```
   Alternative: Use Edge TTS, SAPI, or Bailian (DashScope) without local server.

2. **Terminal 2 - Start Backend:**
   ```bash
   # From repo root
   python -m backend
   # Or: python -m backend.app
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

### Running Individual Demos

**ASR Demo (FunASR with VAD):**
```bash
cd fuasr_demo
python fuasr_advance.py
```

**ASR CLI (DashScope):**
```bash
cd fuasr_demo
python asr_cli.py
```

**RAGFlow Chat Demo:**
```bash
cd ragflow_demo
python chat_agent_chat.py
```

**TTS Basic Demo:**
```bash
cd tts_demo
python test1.py
```

**Edge TTS Demo:**
```bash
cd tts_demo
python cv.py              # Basic
python cv_stream.py       # Streaming
```

### Testing

**Note:** The `test/` directory exists but is currently empty.

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
| `/api/cancel` | POST | Cancel active request |
| `/api/text_to_speech` | POST | Text to audio (non-streaming) |
| `/api/text_to_speech_stream` | GET/POST | Text to audio (streaming) |
| `/api/tour/stops` | GET | Tour stops list |
| `/api/tour/meta` | GET | Tour metadata (zones/profiles) |
| `/api/tour/plan` | POST | Generate tour plan |
| `/api/tour/command` | POST | Parse and execute tour command |
| `/api/selling_points` | GET | Selling points by stop |
| `/api/ragflow/history` | GET | RAGFlow conversation history |
| `/api/breakpoint` | GET/POST/DELETE | Tour breakpoints (resume) |
| `/api/recordings` | GET/POST | Tour recordings |
| `/api/office/script` | GET/POST | Offline scripts |
| `/api/offline/audio` | GET | Offline audio segments |
| `/api/wake_word` | POST | Detect wake word in audio |
| `/api/ops/*` | GET | Operations data |
| `/api/status` | GET | Request status & timing metrics |
| `/api/events` | GET | Request events/logs (SSE) |
| `/api/client_events` | POST | Client-side event ingestion |

### Advanced Backend Features

- **Cancellation Registry** (`request_registry.py`): Track and cancel active requests by `client_id` or `request_id`
- **Event Store** (`event_store.py`): Timeline tracking for performance monitoring (in-memory or Redis)
- **Rate Limiting**: Per-client rate limits for ASR (6 req/3s) and ASK endpoints
- **Text Cleaning**: Semantic chunking with TTS buffer optimization (in `ragflow_demo/text_cleaner.py`)
- **Intent Classification** (`intent_service.py`): Detect question types (greeting, tour_control, etc.)
- **History Management** (`history_store.py`): SQLite-based Q&A history with frequency tracking
- **Safety Filter** (`safety_filter.py`): Sensitive word filtering
- **Guide Prompt** (`guide_prompt.py`): Tour guide prompt generation with style and duration controls

## Frontend Features

- **Dual Input**: Voice recording (with VAD) and text input
- **Dual Output**: Text display and TTS audio playback
- **Tour Mode**: Guided exhibition tour with 10 configurable stops
- **Group Mode**: Question queue for multiple speakers
- **Agent Mode**: RAGFlow agent vs. chat conversation selection
- **TTS Queue**: Pre-generation and buffering for smooth playback
- **Debug Panel**: Real-time timing metrics and event logs
- **Wake Word**: Hands-free voice activation
- **Tour Recording**: Record and replay tour guides
- **Selling Points**: Display key selling points per stop
- **Offline Scripts**: Pre-recorded audio script playback
- **Responsive Design**: Desktop and mobile support
- **Local Storage**: Persistent settings (TTS mode, tour preferences)

### TTS Manager (Frontend)

- Queue-based text-to-speech processing (`TtsQueueManager.js`)
- Pre-generation of upcoming segments (configurable via `MAX_PRE_GENERATE_COUNT`)
- Buffer management for seamless playback
- Support for all 5 TTS providers (sovtts1, sovtts2, edge, sapi, bailian)
- Per-segment audio URL management and playback

### Tour Pipeline

- `TourController.js`: Tour navigation (start/next/prev/jump/reset)
- `TourPipelineManager.js`: Prefetch upcoming tour stop explanations
- `TourStateMachine.js`: Tour state transitions (ready, tour_action, user_question)
- `InterruptManager.js`: Interrupt epoch tracking for cancellation
- `AskWorkflowManager.js`: Ask workflow orchestration with interrupt handling
- Configurable zones and audience profiles
- Stop duration planning (chars/second calculation)
- Continuous or manual navigation modes
- Tour recording and playback

## Key Integration Points

### 1. ASR → RAGFlow Pipeline
```
Frontend (audio blob) → /api/speech_to_text → ASRService → FunASR/DashScope → text
```

### 2. RAGFlow Streaming Pipeline
```
Frontend (question) → /api/ask → ConversationOrchestrator.stream_ask() →
RagflowAgentService → RAGFlow SDK → streaming SSE → Frontend (text chunks)
```

**Request kinds** (via `kind` parameter):
- `ask`: Normal user question
- `ask_prefetch`: Tour stop prefetch (pre-generates TTS for upcoming stops)
- `wake_word`: Wake word triggered question

### 3. Text → TTS Pipeline
```
Frontend (text segment) → /api/text_to_speech_stream → TTSSvc.stream() →
registry.stream_tts() → provider selection → streaming audio → Frontend playback
```

**Provider routing** (`tts/registry.py`):
- `sovtts1`: GPT-SoVITS V1 (api.py, port 9882)
- `sovtts2`: GPT-SoVITS V2 (api_v2.py, port 9880)
- `edge`: Microsoft Edge TTS (zh-CN-XiaoxiaoNeural)
- `sapi`: Windows SAPI
- `bailian`: Alibaba DashScope (cosyvoice-v3-plus)

### 4. Tour Prefetch Pipeline
```
TourController.start() → TourPipelineManager.start() →
/api/ask (kind=ask_prefetch) for N stops ahead →
pre-generate TTS segments → buffer → seamless playback on stop change
```

### 5. Interrupt & Cancellation Pipeline
```
User action (new question/stop/cancel) → AskWorkflowManager.interrupt() →
InterruptManager.bump() (new epoch) →
cancel previous ASR/RAG/TTS via CancellationRegistry →
start new workflow
```

## Performance Optimization

### TTS Pre-Generation
- Frontend `TtsQueueManager.js` maintains TTS queue
- Pre-generates next 2 segments while playing current
- Reduces time-to-first-audio

### Semantic Chunking
- `text_cleaner.py` breaks responses into optimal TTS segments
- Configurable chunk size (260 chars default)
- Balances latency vs. completeness
- Respects sentence boundaries

### Streaming Architecture
- Server-Sent Events (SSE) for real-time text streaming
- Chunked audio streaming for TTS
- Reduces latency throughout the pipeline

### Request Cancellation
- Client-initiated cancellation via `/api/cancel`
- `CancellationRegistry` tracks active requests by `client_id` and `request_id`
- Stops ASR, RAG, and TTS processing via `cancel_event` (threading.Event)
- Frees resources for new requests

### Tour Prefetch
- `TourPipelineManager` prefetches next N stops (configurable)
- Pre-generates TTS segments for upcoming stops
- Cached in `_prefetchStore` Map
- Replayed to TTS queue on stop change for seamless playback

## Service Ports

| Service | Port | Protocol |
|---------|------|----------|
| Backend API | 8000 | HTTP |
| Frontend Web | 3000 | HTTP |
| GPT-SoVITS V1 | 9882 | HTTP |
| GPT-SoVITS V2 | 9880 | HTTP |
| RAGFlow | 9380 | HTTP |
| Redis (optional) | 6379 | TCP |

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
- `redis>=5.0.0` - Redis client (optional)

Optional:
- `funasr>=0.8.0` - FunASR for local ASR
- `dashscope` - Alibaba DashScope for ASR/TTS
- `edge-tts` - Microsoft Edge TTS

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

### Configuration

All services are configured via `ragflow_demo/ragflow_config.json`:

1. Copy and edit the config file:
   - Update `api_key` for RAGFlow
   - Update `dashscope.api_key` for DashScope ASR/TTS
   - Update `tts.bailian.api_key` for Bailian TTS
   - Adjust model paths and URLs as needed

2. Environment variable overrides (optional):
   - `RAGFLOW_API_KEY`: Override RAGFlow API key
   - `RAGFLOW_BASE_URL`: Override RAGFlow base URL
   - `DASHSCOPE_API_KEY`: Override DashScope API key
   - `TTS_MODE`: Override default TTS provider
   - See `env_overrides.py` for all available overrides

## Common Development Tasks

### Adding a New API Endpoint

1. Create a new blueprint in `backend/api/your_feature.py`:
   ```python
   def create_blueprint(deps):
       bp = Blueprint("your_feature_api", __name__)

       @bp.route("/api/your_endpoint", methods=["POST"])
       def your_endpoint():
           # Access deps.services, deps.logger, etc.
           return jsonify({"ok": True})

       return bp
   ```

2. Register in `backend/app.py:create_app()`:
   ```python
   from backend.api.your_feature import create_blueprint as create_your_feature_blueprint
   app.register_blueprint(create_your_feature_blueprint(deps))
   ```

### Adding a New Service

1. Create `backend/services/your_service.py`:
   ```python
   class YourService:
       def __init__(self, config, logger):
           self._config = config
           self._logger = logger
   ```

2. Initialize in `backend/app.py:create_app()` and add to `AppDeps`

### Adding a New Frontend Component

1. Create component in `fronted/src/components/YourComponent.js`
2. Import and use in `fronted/src/App.js` or parent component
3. Use existing hooks (`useAppSettings`, `useBackendStatus`, etc.) for state management

### Debugging

- **Backend logs**: Check console output (filtered by log level)
- **Frontend debug panel**: Enable via settings in UI
- **Event timeline**: `/api/events` provides request event timeline
- **Status endpoint**: `/api/status` provides timing metrics

### Modifying TTS Providers

TTS providers are implemented in `backend/services/tts/providers/`:
- `local_gpt_sovits.py`: GPT-SoVITS V1/V2
- `edge.py`: Microsoft Edge TTS
- `sapi.py`: Windows SAPI
- `bailian.py`: Alibaba DashScope

To add a new provider:
1. Create provider function returning audio generator
2. Add routing logic in `tts/registry.py:stream_tts()`
3. Update config schema in `ragflow_config.json`

## File Naming Convention

**Important**: The frontend directory is `fronted/` (not `frontend/`) - maintain this naming convention throughout the codebase.

## Architecture Patterns

### App Factory Pattern
- `backend/app.py:create_app()` returns a configured Flask app
- `backend/__main__.py` enables `python -m backend` execution
- `backend/app_deps.py` provides dependency injection container

### Blueprint Organization
- API endpoints organized by domain into Flask blueprints
- Each blueprint created via `create_blueprint(deps)` function
- `deps` contains all service dependencies (services, stores, registry)

### Manager Pattern (Frontend)
- Complex state management extracted into manager classes
- Managers receive dependencies via `setDeps()` method
- Enables reuse and testability

### React Hooks
- Custom hooks encapsulate business logic and state
- Hooks use `useRef` to maintain stable manager instances
- Props destructuring allows flexible dependency injection

### Streaming Responses
- `/api/ask` uses Server-Sent Events (SSE) for text streaming
- `/api/text_to_speech_stream` uses chunked audio streaming
- Frontend `EventSource` and `ReadableStream` for consumption

## Implementation Notes

### Error Handling
- Simple error handling for demo purposes
- Errors are exposed directly to frontend via JSON
- No complex error recovery logic

### Code Style
- No code comments required (as per project requirements)
- Focus on functionality over documentation

### Scope
- Do not add extra functionality beyond specified requirements
- Demo-focused, not production-ready
- Core functionality: 20 fixed Q&A pairs + RAG for additional responses
- Target: Response time ≤ 3 seconds, stable operation ≥ 30 minutes

## Known Limitations

- Test directory is empty (no automated tests)
- No production deployment configuration
- Simple error handling (errors exposed directly)
- Limited monitoring/metrics collection
- No authentication/authorization
- No fixed Q&A pairs implementation yet (planned for 100% accuracy on common questions)

## Recent Enhancements (from git log)

Based on recent commits:
- Tour recording and playback functionality
- Breakpoint (resume) support for tour interruption
- Wake word detection for hands-free activation
- Selling points per tour stop
- Offline script playback
- Tour command parsing (e.g., "跳到第3个展厅")
- Safety word filtering
- Multiple TTS provider support with fallback
- Improved interrupt handling and cancellation
- Tour templates and customizable stops
