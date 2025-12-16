# RAGFlow API Demo Suite

This repository contains comprehensive demonstrations of RAGFlow Python API functions, showcasing various features and capabilities of the RAGFlow framework.

## 📋 Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Available Demos](#available-demos)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [API Functions Covered](#api-functions-covered)

## 🚀 Installation

### Prerequisites

- Python 3.7 or higher
- Git
- RAGFlow Server (for real functionality)

### Quick Start (Demo Mode)

无需安装 RAGFlow 即可运行所有演示！

```bash
# 1. 克隆或下载仓库
git clone <repository-url>
cd ragflow_demo

# 2. 安装基础依赖
pip install pyyaml requests python-dotenv

# 3. 立即运行演示
python main.py --demo chat
```

### Real RAGFlow Setup

要使用真实的 RAGFlow 功能：

```bash
# 1. 安装 RAGFlow Python SDK
pip install ragflow-sdk

# 2. 启动 RAGFlow 服务器
# 详见 INSTALLATION.md 或官方文档: https://ragflow.io/docs

# 3. 配置 API 密钥
cp configs/config.example.json configs/config.json
# 编辑 configs/config.json，设置您的真实 API 密钥

# 4. 验证配置
python main.py --check-config

# 5. 运行演示
python main.py --demo all
```

### Configuration Setup

1. **Clone or download this repository**

2. **Install basic dependencies:**
   ```bash
   cd ragflow_demo
   pip install pyyaml requests python-dotenv
   ```

3. **Install RAGFlow SDK (可选 - 用于真实功能):**
   ```bash
   pip install ragflow-sdk
   ```

4. **Configure (如果使用真实 RAGFlow):**
   - Edit `configs/config.json`
   - Add your RAGFlow API key and server URL

## ⚙️ Configuration

### Configuration Files

The demo suite supports both JSON and YAML configuration formats:

- `configs/config.json` (recommended)
- `configs/config.yaml`

### Required Configuration

```json
{
  "ragflow": {
    "api_key": "your_actual_api_key",
    "base_url": "http://localhost:9380",
    "username": "your_username",
    "password": "your_password"
  }
}
```

### Optional Configuration

```json
{
  "knowledge_base": {
    "default_vs_type": "chromadb",
    "default_embed_model": "text2vec",
    "chunk_size": 512,
    "chunk_overlap": 50
  },
  "chat": {
    "temperature": 0.7,
    "max_tokens": 1000,
    "top_k": 3,
    "similarity_threshold": 0.0,
    "rerank": true
  }
}
```

## 🎭 Available Demos

### 1. Chat API Demo (`chat_demo.py`)

Demonstrates conversational AI capabilities:

- Basic chat functionality
- Retrieval-augmented conversations
- Parameter tuning (temperature, tokens, etc.)
- Streaming responses
- Conversation history management

### 2. Knowledge Base Demo (`knowledge_base_demo.py`)

Shows knowledge base management:

- Create and delete knowledge bases
- List and update knowledge bases
- Document upload to knowledge bases
- Knowledge base configuration

### 3. Retrieval Demo (`retrieval_demo.py`)

Covers document retrieval and search:

- Basic similarity search
- Similarity threshold tuning
- Top-K retrieval
- Reranking options
- Hybrid search methods
- Batch retrieval operations

### 4. Document Management Demo (`document_management_demo.py`)

Document processing and management:

- Upload various document formats
- Document processing status monitoring
- Metadata management
- Batch upload operations
- Document chunking strategies

### 5. Advanced Features Demo (`advanced_features_demo.py`)

Advanced RAGFlow capabilities:

- Custom chunking strategies
- Multiple embedding models
- Vector store configurations
- Workflow automation
- Concurrent operations
- Analytics and metrics

## 🏃 Usage

### Demo Mode vs Real Mode

The demo suite can run in two modes:

1. **Demo Mode (Mock)**: Uses mock implementations to showcase API functionality
   - No RAGFlow installation required
   - No server needed
   - Simulated responses and data
   - Perfect for learning the API structure

2. **Real Mode**: Connects to actual RAGFlow server
   - Requires RAGFlow installation
   - RAGFlow server must be running
   - Real functionality and responses
   - Uses your actual data and configuration

### Running All Demos

```bash
python main.py
# or
python main.py --demo all
```

### Running Specific Demos

```bash
# Chat API demo
python main.py --demo chat

# Knowledge base demo
python main.py --demo kb

# Retrieval demo
python main.py --demo retrieval

# Document management demo
python main.py --demo docs

# Advanced features demo
python main.py --demo advanced
```

### Individual Demo Scripts

Each demo can also be run directly:

```bash
python demos/chat_demo.py
python demos/knowledge_base_demo.py
python demos/retrieval_demo.py
python demos/document_management_demo.py
python demos/advanced_features_demo.py
```

### Configuration Check

Check if your configuration is properly set up:

```bash
python main.py --check-config
```

### List Available Demos

```bash
python main.py --list
```

## 📁 Project Structure

```
ragflow_demo/
├── main.py                 # Main demo runner
├── utils.py                # Utility functions
├── requirements.txt        # Python dependencies
├── README.md              # This file
├── configs/
│   ├── config.json        # JSON configuration template
│   └── config.yaml        # YAML configuration template
├── demos/
│   ├── chat_demo.py       # Chat API demonstrations
│   ├── knowledge_base_demo.py    # Knowledge base management
│   ├── retrieval_demo.py  # Document retrieval
│   ├── document_management_demo.py # Document operations
│   └── advanced_features_demo.py   # Advanced features
└── data/
    └── (generated sample files)
```

## 📚 API Functions Covered

### Chat API
- `chat()` - Basic conversation
- Retrieval-augmented chat
- Streaming responses
- Conversation history

### Knowledge Base API
- `create_kb()` - Create knowledge base
- `list_knowledge_bases()` - List all knowledge bases
- `get_knowledge_base()` - Get knowledge base details
- `update_knowledge_base()` - Update knowledge base
- `delete_knowledge_base()` - Delete knowledge base

### Document API
- `upload_document()` - Upload documents
- `list_documents()` - List documents in KB
- `get_document()` - Get document details
- `get_document_chunks()` - Get document chunks
- `update_document()` - Update document metadata
- `delete_document()` - Delete document
- `get_document_status()` - Check processing status

### Retrieval API
- `query_kb()` - Query knowledge base
- `search_kb()` - Advanced search
- `batch_query()` - Batch retrieval

### Advanced API
- Custom chunking methods
- Multiple embedding models
- Vector store management
- Workflow automation
- Analytics and metrics

## 🔧 Troubleshooting

### Common Issues

1. **Configuration not found**
   - Ensure `configs/config.json` or `configs/config.yaml` exists
   - Check file paths and permissions

2. **API key invalid**
   - Verify your RAGFlow API key
   - Check if the RAGFlow server is running

3. **Connection errors**
   - Verify the base URL in configuration
   - Check network connectivity
   - Ensure RAGFlow server is accessible

4. **Missing dependencies**
   - Run `pip install -r requirements.txt`
   - Check Python version compatibility

### Debug Mode

Enable debug logging by setting the log level in configuration:

```json
{
  "logging": {
    "level": "DEBUG"
  }
}
```

### Getting Help

- Check the [RAGFlow Documentation](https://ragflow.io/docs)
- Review the RAGFlow [GitHub Repository](https://github.com/infiniflow/ragflow)
- Create an issue for bugs or feature requests

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This demo suite is provided as educational material under the same license as RAGFlow.

## 🙏 Acknowledgments

- RAGFlow team for the powerful framework
- Contributors and community members
- Documentation authors and maintainers