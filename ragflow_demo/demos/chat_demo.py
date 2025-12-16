#!/usr/bin/env python3
"""
RAGFlow Chat API Demo
Demonstrates how to use the chat functionality with various parameters.
"""

import sys
import os
import json
import yaml
from pathlib import Path

# Add the ragflow_demo root to Python path
sys.path.append(str(Path(__file__).parent.parent))

# Import will be handled by demo_utils.py - no need to check here


def load_config():
    """Load configuration from config file."""
    config_path = Path(__file__).parent.parent / "configs" / "config.json"

    if not config_path.exists():
        # Try YAML config
        config_path = config_path.with_suffix('.yaml')

    if not config_path.exists():
        raise FileNotFoundError("Configuration file not found. Please create config.json or config.yaml")

    with open(config_path, 'r', encoding='utf-8') as f:
        if config_path.suffix == '.json':
            return json.load(f)
        else:
            return yaml.safe_load(f)


def basic_chat_demo(ragflow_client):
    """Basic chat demonstration using knowledge base queries."""
    print("=== Basic Chat Demo ===")

    # Get or create a dataset for the demo
    datasets = ragflow_client.list_datasets()

    if not datasets:
        # Create a demo dataset
        dataset = ragflow_client.create_dataset(
            name="chat_demo_dataset",
            description="Demo dataset for chat functionality"
        )
        print("Created demo dataset for chat")
        kb = dataset  # For compatibility with rest of the code
    else:
        kb = datasets[0]
        print(f"Using existing dataset: {kb.get('name', 'Unknown')}")

    print()

    # Perform chat using RAGFlow SDK
    try:
        # Create a chat session
        chat = ragflow_client.create_chat(
            dataset_ids=[kb.get('id')] if kb.get('id') else None,
            name="chat_demo_session"
        )

        # Send first message
        response = chat.send_message("Hello! Can you help me learn about RAGFlow?")
        print(f"User: Hello! Can you help me learn about RAGFlow?")
        print(f"RAGFlow: {response}")
        print()

        # Send another message
        response = chat.send_message("What are the main features?")
        print(f"User: What are the main features?")
        print(f"RAGFlow: {response}")
        print()
    except Exception as e:
        print(f"Error in chat: {str(e)}")
        # Fallback to demo mode message
        print("Demo mode: Chat functionality requires a valid RAGFlow server connection")


def retrieval_chat_demo(ragflow_client, kb_id=None):
    """Chat with retrieval from knowledge base."""
    print("=== Retrieval-Enhanced Chat Demo ===")

    messages = [
        {"role": "user", "content": "What is artificial intelligence?"}
    ]

    # Retrieval configuration
    retrieval_config = {
        "kb_id": kb_id,
        "top_k": 5,
        "similarity_threshold": 0.5
    }

    response = ragflow_client.chat(
        messages=messages,
        retrieval_config=retrieval_config,
        top_k=3,
        similarity_threshold=0.0,
        rerank=True
    )

    print(f"Retrieval-enhanced response: {response}")
    print()


def parameterized_chat_demo(ragflow_client):
    """Chat with various parameters."""
    print("=== Parameterized Chat Demo ===")

    messages = [
        {"role": "user", "content": "Explain quantum computing in simple terms."}
    ]

    # High creativity response
    print("High creativity (temperature=1.0):")
    response = ragflow_client.chat(
        messages=messages,
        temperature=1.0,
        max_tokens=200
    )
    print(f"Response: {response}")

    # Low creativity response
    print("\nLow creativity (temperature=0.1):")
    response = ragflow_client.chat(
        messages=messages,
        temperature=0.1,
        max_tokens=200
    )
    print(f"Response: {response}")
    print()


def streaming_chat_demo(ragflow_client):
    """Demonstrate streaming chat."""
    print("=== Streaming Chat Demo ===")

    messages = [
        {"role": "user", "content": "Write a short poem about technology."}
    ]

    print("Streaming response:")
    for chunk in ragflow_client.chat(messages=messages, stream=True):
        print(chunk, end='', flush=True)

    print("\n")


def conversation_history_demo(ragflow_client):
    """Demo with conversation history."""
    print("=== Conversation History Demo ===")

    conversation = [
        {"role": "system", "content": "You are a math tutor."},
        {"role": "user", "content": "What is 2 + 2?"},
        {"role": "assistant", "content": "2 + 2 equals 4."},
        {"role": "user", "content": "Now what is 4 + 4?"},
    ]

    response = ragflow_client.chat(messages=conversation)
    print(f"Contextual response: {response}")
    print()


def main():
    """Main function to run chat demos."""
    print("RAGFlow Chat API Demo")
    print("=" * 50)

    try:
        # Load configuration
        config = load_config()

        # Initialize RAGFlow client (will use mock if RAGFlow not available)
        from demo_utils import get_ragflow_client, print_demo_notice, is_ragflow_available

        # Show demo notice only if in demo mode
        if not is_ragflow_available():
            print_demo_notice()
        else:
            print("[OK] RAGFlow SDK detected - real functionality enabled")

        # Get client (real or mock) with complete ragflow configuration
        ragflow_config = config.get('ragflow', {})
        client = get_ragflow_client(ragflow_config)

        print()

        # Run basic chat demo (using official API)
        basic_chat_demo(client)

    except Exception as e:
        print(f"Error running chat demo: {str(e)}")
        print("Please check your configuration and RAGFlow server status.")


if __name__ == "__main__":
    main()