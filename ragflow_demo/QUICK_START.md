# RAGFlow Demo Quick Start Guide

## 🎯 What You Need to Know

**Key Correction**: The official RAGFlow Python package is `ragflow-sdk`, NOT the main RAGFlow repository.

## ⚡ Quick Start (5 Minutes)

### 1. Basic Demo Mode (No Installation Required)

```bash
# Install basic dependencies only
pip install pyyaml requests python-dotenv

# Run any demo immediately
python main.py --demo chat
python main.py --demo kb
```

### 2. Full RAGFlow SDK Installation

```bash
# Install the official RAGFlow Python SDK
pip install ragflow-sdk

# Set up RAGFlow server (if not already running)
# Configure configs/config.json with your server details

# Run with real functionality
python main.py --demo all
```

## 📋 Installation Commands Summary

| Purpose | Command | When to Use |
|---------|---------|-------------|
| **Demo Mode** | `pip install pyyaml requests python-dotenv` | Learning API structure |
| **Real RAGFlow** | `pip install ragflow-sdk` | Production use |
| **Development** | `pip install git+https://github.com/ragflow/ragflow-sdk.git` | Latest features |

## 🔧 Correct Import Patterns

```python
# ✅ CORRECT - Official SDK import
from ragflow_sdk import RAGFlow

# ✅ CORRECT - Alternative import
import ragflow_sdk
client = ragflow_sdk.RAGFlow(...)

# ❌ INCORRECT - These will NOT work
# from ragflow import RAGFlow
# from ragflow.ragflow import RAGFlow
# pip install ragflow
```

## 📂 What Each File Does

- **`main.py`**: Demo runner and configuration checker
- **`demo_utils.py`**: Mock implementations and smart client handling
- **`demos/*.py`**: Individual API demonstrations
- **`configs/`**: Configuration templates
- **`requirements.txt`**: Dependency list with correct package names

## 🎮 Running Demos

```bash
# List all available demos
python main.py --list

# Run specific demos
python main.py --demo chat           # Chat functionality
python main.py --demo kb             # Knowledge base management
python main.py --demo retrieval      # Document search
python main.py --demo docs           # Document upload/processing
python main.py --demo advanced       # Advanced features

# Run everything
python main.py --demo all

# Check your setup
python main.py --check-config
```

## 🚨 Common Mistakes to Avoid

1. **Wrong Package Name**
   ```bash
   # ❌ WRONG
   pip install ragflow

   # ✅ CORRECT
   pip install ragflow-sdk
   ```

2. **Wrong Import**
   ```python
   # ❌ WRONG
   from ragflow import RAGFlow

   # ✅ CORRECT
   from ragflow_sdk import RAGFlow
   ```

3. **Installing from Wrong Repository**
   ```bash
   # ❌ WRONG (main RAGFlow repo, not Python SDK)
   pip install git+https://github.com/infiniflow/ragflow.git

   # ✅ CORRECT (Python SDK repo)
   pip install git+https://github.com/ragflow/ragflow-sdk.git
   ```

## 🔍 Official Resources

- **Python SDK**: https://pypi.org/project/ragflow-sdk/
- **SDK Repository**: https://github.com/ragflow/ragflow-sdk
- **Main RAGFlow**: https://github.com/infiniflow/ragflow
- **Documentation**: https://docs.ragflow.io

## 💡 Pro Tips

1. **Start with Demo Mode**: Learn the API structure first
2. **Use Virtual Environment**: `python -m venv venv && source venv/bin/activate`
3. **Check Configuration**: Run `python main.py --check-config` first
4. **Update Regularly**: `pip install --upgrade ragflow-sdk`

## 🎯 What This Demo Suite Shows

- ✅ **Chat API**: Conversational AI with retrieval
- ✅ **Knowledge Base**: Create, manage, and query KBs
- ✅ **Document Management**: Upload, process, and index documents
- ✅ **Retrieval**: Search and similarity matching
- ✅ **Advanced Features**: Workflows, analytics, custom configs

## 🆘 Need Help?

1. Check the demo output for error messages
2. Review the configuration in `configs/config.json`
3. Ensure RAGFlow server is running (for real functionality)
4. Visit the official documentation links above

Now you're ready to explore RAGFlow! 🚀