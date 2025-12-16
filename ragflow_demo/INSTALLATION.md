# RAGFlow Demo Installation Guide

## Quick Start

The RAGFlow demo suite can run immediately without RAGFlow installed using mock implementations.

### For Demo Mode (Recommended for learning)

```bash
# Clone or download the repository
git clone <repository-url>
cd ragflow_demo

# Install basic dependencies
pip install -r requirements.txt

# Run the demo
python main.py --demo chat
```

### For Real RAGFlow Functionality

Follow the steps below to install RAGFlow and run with real functionality.

## 1. System Requirements

- Python 3.8+ (3.9+ recommended)
- Git
- 8GB+ RAM (for RAGFlow server)
- 50GB+ disk space (for models)

## 2. Install RAGFlow

### Option A: Install Python SDK (Recommended)

```bash
# Latest stable version from PyPI
pip install ragflow-sdk

# Or specific version
pip install ragflow-sdk==0.1.3
```

### Option B: Install from GitHub (Development Version)

```bash
# Latest development version
pip install git+https://github.com/ragflow/ragflow-sdk.git
```

## 3. Set Up RAGFlow Server

### Option A: Docker Installation (Recommended for production)

```bash
# Clone RAGFlow repository
git clone https://github.com/infiniflow/ragflow.git
cd ragflow

# Build and run with Docker
docker-compose up -d
```

### Option B: Local Development Setup

```bash
# Clone and setup RAGFlow
git clone https://github.com/infiniflow/ragflow.git
cd ragflow

# Install dependencies
pip install -e .

# Start the server
python ragflow/serve.py
```

The server typically runs on `http://localhost:9380`

## 4. Configure the Demo

### Create Configuration File

Copy the example configuration:
```bash
cp configs/config.json.example configs/config.json
# or
cp configs/config.yaml.example configs/config.yaml
```

### Edit Configuration

Edit `configs/config.json` with your settings:

```json
{
  "ragflow": {
    "api_key": "your_actual_api_key_here",
    "base_url": "http://localhost:9380",
    "username": "your_username",
    "password": "your_password"
  }
}
```

### Environment Variables (Optional)

Create `.env` file:
```bash
cp .env.example .env
```

Edit `.env` with your credentials.

## 5. Verify Installation

### Check Configuration
```bash
python main.py --check-config
```

### Run a Simple Demo
```bash
python main.py --demo chat
```

## 6. Troubleshooting

### Common Issues

1. **Import Error: No module named 'ragflow'**
   ```bash
   # Install RAGFlow from source
   pip install git+https://github.com/infiniflow/ragflow.git
   ```

2. **Connection Refused**
   - Ensure RAGFlow server is running
   - Check the base_url in configuration
   - Verify firewall settings

3. **API Key Invalid**
   - Check your RAGFlow server configuration
   - Verify the API key in config file

4. **Memory Issues**
   - Ensure sufficient RAM (8GB+)
   - Consider using smaller models
   - Close other applications

5. **Docker Issues**
   ```bash
   # Clean up Docker
   docker system prune -a
   docker-compose down
   docker-compose up -d
   ```

### Debug Mode

Enable debug logging in config:
```json
{
  "logging": {
    "level": "DEBUG",
    "file": "ragflow_debug.log"
  }
}
```

### Getting Help

- [RAGFlow Documentation](https://ragflow.io/docs)
- [RAGFlow GitHub Issues](https://github.com/infiniflow/ragflow/issues)
- [Discord Community](https://discord.gg/ragflow)

## 7. Alternative: Use Demo Mode

If you encounter installation issues, you can still run all demos using mock implementations:

```bash
# Just install basic dependencies
pip install pyyaml requests python-dotenv

# Run demos in mock mode
python main.py --demo all
```

Demo mode provides:
- Full API demonstration
- No server required
- Educational value for learning API structure
- Easy setup and execution

## Next Steps

Once installed, explore the different demos:

```bash
python main.py --demo chat          # Chat API
python main.py --demo kb            # Knowledge base
python main.py --demo retrieval     # Document search
python main.py --demo docs          # Document management
python main.py --demo advanced      # Advanced features
```

For detailed API documentation, see the main [README.md](README.md).