#!/usr/bin/env python3
"""
RAGFlow Demo Utilities
Helper functions for running RAGFlow demonstrations.
"""

import json
import yaml
import logging
import sys
from pathlib import Path
from typing import Dict, Any, Optional, List


def setup_logging(log_level: str = "INFO", log_file: Optional[str] = None) -> logging.Logger:
    """Setup logging configuration."""
    logger = logging.getLogger("ragflow_demo")
    logger.setLevel(getattr(logging, log_level.upper()))

    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # File handler (if specified)
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger


def load_config(config_path: Optional[str] = None) -> Dict[str, Any]:
    """Load configuration from JSON or YAML file."""
    if config_path is None:
        config_dir = Path(__file__).parent / "configs"

        # Try JSON first
        config_path = config_dir / "config.json"
        if not config_path.exists():
            config_path = config_dir / "config.yaml"

    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    with open(config_path, 'r', encoding='utf-8') as f:
        if config_path.suffix.lower() in ['.json']:
            return json.load(f)
        elif config_path.suffix.lower() in ['.yaml', '.yml']:
            return yaml.safe_load(f)
        else:
            raise ValueError(f"Unsupported config file format: {config_path.suffix}")


def save_config(config: Dict[str, Any], config_path: str) -> None:
    """Save configuration to file."""
    config_path = Path(config_path)
    config_path.parent.mkdir(parents=True, exist_ok=True)

    with open(config_path, 'w', encoding='utf-8') as f:
        if config_path.suffix.lower() in ['.json']:
            json.dump(config, f, indent=2, ensure_ascii=False)
        elif config_path.suffix.lower() in ['.yaml', '.yml']:
            yaml.dump(config, f, default_flow_style=False, allow_unicode=True)
        else:
            raise ValueError(f"Unsupported config file format: {config_path.suffix}")


def validate_config(config: Dict[str, Any]) -> List[str]:
    """Validate configuration and return list of issues."""
    issues = []

    # Check ragflow section
    ragflow_config = config.get('ragflow', {})
    required_fields = ['api_key', 'base_url']

    for field in required_fields:
        if not ragflow_config.get(field):
            issues.append(f"Missing required ragflow.{field}")

    # Check for placeholder values
    placeholders = ['your_', 'example_', 'change_me']
    for key, value in ragflow_config.items():
        if isinstance(value, str):
            for placeholder in placeholders:
                if value.startswith(placeholder):
                    issues.append(f"Placeholder value for ragflow.{key}: {value}")

    # Validate knowledge base config
    kb_config = config.get('knowledge_base', {})
    if kb_config.get('chunk_size', 0) <= 0:
        issues.append("knowledge_base.chunk_size must be positive")

    if kb_config.get('chunk_overlap', 0) < 0:
        issues.append("knowledge_base.chunk_overlap cannot be negative")

    # Validate chat config
    chat_config = config.get('chat', {})
    if not 0 <= chat_config.get('temperature', 0.7) <= 2:
        issues.append("chat.temperature must be between 0 and 2")

    if chat_config.get('max_tokens', 0) <= 0:
        issues.append("chat.max_tokens must be positive")

    if chat_config.get('top_k', 0) <= 0:
        issues.append("chat.top_k must be positive")

    return issues


def format_file_size(size_bytes: int) -> str:
    """Format file size in human-readable format."""
    if size_bytes == 0:
        return "0 B"

    size_names = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    while size_bytes >= 1024 and i < len(size_names) - 1:
        size_bytes /= 1024.0
        i += 1

    return f"{size_bytes:.1f} {size_names[i]}"


def format_duration(seconds: float) -> str:
    """Format duration in human-readable format."""
    if seconds < 1:
        return f"{seconds*1000:.0f}ms"
    elif seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        minutes = int(seconds // 60)
        remaining_seconds = seconds % 60
        return f"{minutes}m {remaining_seconds:.0f}s"
    else:
        hours = int(seconds // 3600)
        remaining_minutes = int((seconds % 3600) // 60)
        return f"{hours}h {remaining_minutes}m"


def create_sample_data(data_dir: Path) -> Dict[str, str]:
    """Create sample data files for demonstrations."""
    data_dir.mkdir(parents=True, exist_ok=True)
    created_files = {}

    # Sample document 1: Technical documentation
    tech_doc = """
# Getting Started with RAGFlow

RAGFlow is an open-source RAG (Retrieval-Augmented Generation) framework
that enables developers to build powerful question-answering systems.

## Installation

```bash
pip install ragflow
```

## Basic Usage

1. Initialize RAGFlow client
2. Create a knowledge base
3. Upload documents
4. Query your knowledge base

## Features

- Multiple vector stores (ChromaDB, Milvus, FAISS)
- Support for various document formats
- Advanced chunking strategies
- Real-time document processing
- RESTful API

## Supported Document Formats

- Text files (.txt)
- Markdown (.md)
- PDF documents (.pdf)
- Microsoft Word (.docx)
- HTML files (.html)
"""

    tech_doc_path = data_dir / "ragflow_guide.md"
    with open(tech_doc_path, 'w', encoding='utf-8') as f:
        f.write(tech_doc)
    created_files['technical_guide'] = str(tech_doc_path)

    # Sample document 2: FAQ
    faq_doc = """
# RAGFlow Frequently Asked Questions

## General Questions

Q: What is RAGFlow?
A: RAGFlow is an open-source framework for building RAG-based applications.

Q: Is RAGFlow free to use?
A: Yes, RAGFlow is open-source and free to use under the Apache 2.0 license.

## Technical Questions

Q: What programming languages are supported?
A: RAGFlow provides Python SDK and REST API that can be used from any language.

Q: Which vector databases are supported?
A: RAGFlow supports ChromaDB, Milvus, FAISS, and other popular vector stores.

Q: Can I use custom embedding models?
A: Yes, RAGFlow supports custom embedding models including OpenAI, Hugging Face, and local models.

## Performance Questions

Q: How many documents can RAGFlow handle?
A: RAGFlow can handle millions of documents depending on your hardware and vector store configuration.

Q: What is the recommended hardware for production?
A: For production, we recommend at least 16GB RAM and SSD storage for the vector database.
"""

    faq_doc_path = data_dir / "ragflow_faq.md"
    with open(faq_doc_path, 'w', encoding='utf-8') as f:
        f.write(faq_doc)
    created_files['faq'] = str(faq_doc_path)

    # Sample document 3: Plain text
    sample_text = """
    Artificial Intelligence and Machine Learning Fundamentals

    Artificial Intelligence (AI) is a branch of computer science that aims to create
    intelligent machines capable of performing tasks that typically require human
    intelligence.

    Machine Learning (ML) is a subset of AI that focuses on algorithms and statistical
    models that enable computer systems to improve their performance through experience.

    Key ML Concepts:
    1. Training Data - Historical data used to train models
    2. Features - Individual measurable properties of the data
    3. Labels - The target or outcome we want to predict
    4. Model - The mathematical representation of patterns in data
    5. Training - The process of learning patterns from data
    6. Inference - Using the trained model to make predictions

    Common ML Applications:
    - Image recognition and classification
    - Natural language processing
    - Recommendation systems
    - Fraud detection
    - Autonomous vehicles
    - Medical diagnosis
    - Financial forecasting
    """

    sample_text_path = data_dir / "ml_fundamentals.txt"
    with open(sample_text_path, 'w', encoding='utf-8') as f:
        f.write(sample_text)
    created_files['sample_text'] = str(sample_text_path)

    return created_files


def clean_sample_data(data_dir: Path) -> None:
    """Clean up sample data files."""
    if not data_dir.exists():
        return

    for file_path in data_dir.iterdir():
        if file_path.is_file():
            try:
                file_path.unlink()
                print(f"Deleted: {file_path}")
            except Exception as e:
                print(f"Error deleting {file_path}: {e}")


def retry_on_failure(max_retries: int = 3, delay: float = 1.0, exceptions: tuple = (Exception,)):
    """Decorator to retry function calls on failure."""
    def decorator(func):
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    if attempt == max_retries - 1:
                        raise e
                    wait_time = delay * (2 ** attempt)  # Exponential backoff
                    print(f"Attempt {attempt + 1} failed: {e}. Retrying in {wait_time}s...")
                    import time
                    time.sleep(wait_time)
            return None
        return wrapper
    return decorator


def truncate_text(text: str, max_length: int = 100, suffix: str = "...") -> str:
    """Truncate text to specified length."""
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)] + suffix


def print_separator(title: str = "", width: int = 60, char: str = "=") -> None:
    """Print a separator line with optional title."""
    line = char * width
    if title:
        title_pos = (width - len(title) - 2) // 2
        line = char * title_pos + f" {title} " + char * (width - title_pos - len(title) - 2)
    print(line)


if __name__ == "__main__":
    # Demo utility functions
    print("RAGFlow Demo Utilities")
    print("=" * 50)

    # Test configuration loading
    try:
        config = load_config()
        print("✅ Configuration loaded successfully")

        issues = validate_config(config)
        if issues:
            print("⚠️  Configuration issues found:")
            for issue in issues:
                print(f"   - {issue}")
        else:
            print("✅ Configuration is valid")
    except Exception as e:
        print(f"❌ Error: {e}")

    # Test sample data creation
    data_dir = Path("data")
    created_files = create_sample_data(data_dir)
    print(f"\n✅ Created {len(created_files)} sample files:")
    for name, path in created_files.items():
        print(f"   - {name}: {path}")