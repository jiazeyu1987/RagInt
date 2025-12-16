#!/usr/bin/env python3
"""
RAGFlow Chat Test with Own Dataset Creation
Create and use your own dataset for testing
"""

import sys
import json
import time
from pathlib import Path

# Add the ragflow_demo root to Python path
sys.path.append(str(Path(__file__).parent))

def load_config():
    """Load configuration from ragflow_config.json file."""
    config_path = Path(__file__).parent / "ragflow_config.json"

    if not config_path.exists():
        print("ERROR: ragflow_config.json not found in ragflow_demo directory")
        return None

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)

        api_key = config.get('api_key', '')
        base_url = config.get('base_url', 'http://127.0.0.1')

        if not api_key or api_key in ['YOUR_RAGFLOW_API_KEY_HERE', 'your_api_key_here']:
            print("ERROR: Please set your RAGFlow API key in ragflow_config.json")
            return None

        # Return config in the expected format
        return {
            'api_key': api_key,
            'base_url': base_url
        }
    except Exception as e:
        print(f"ERROR loading config: {str(e)}")
        return None

def test_chat_with_own_dataset():
    """Test streaming chat with own dataset creation."""
    config = load_config()
    if not config:
        return

    try:
        # Import RAGFlow
        from ragflow_sdk import RAGFlow

        # Initialize client
        client = RAGFlow(
            api_key=config['api_key'],
            base_url=config.get('base_url', 'http://127.0.0.1')
        )
        print("[OK] Connected to RAGFlow")

        # Create a test dataset
        print("\nCreating test dataset...")
        try:
            # Create a simple 1x1 pixel PNG as base64 for avatar
            import base64
            # 1x1 transparent PNG
            png_data = base64.b64decode(b'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
            avatar_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

            dataset = client.create_dataset(
                name="Chat Test Dataset",
                avatar=avatar_b64  # Valid base64 avatar
            )
            dataset_id = dataset.get('id')
            print(f"[OK] Created dataset: {dataset.get('name')} (ID: {dataset_id})")
        except Exception as e:
            print(f"[ERROR] Could not create dataset: {str(e)}")
            return

        # Upload a simple test document
        print("\nUploading test document...")
        test_content = """
# RAGFlow Test Document

This is a test document for RAGFlow chat functionality.

## About RAGFlow
RAGFlow is a powerful retrieval-augmented generation framework that allows you to build sophisticated question-answering systems.

## Key Features
- Knowledge base management
- Document processing and chunking
- Vector similarity search
- LLM integration
- RESTful API

## Usage
You can use RAGFlow to:
1. Create knowledge bases
2. Upload and process documents
3. Query your knowledge bases
4. Build conversational AI applications

This document serves as sample content for testing the chat functionality.
"""

        try:
            # Create a temporary file
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False, encoding='utf-8') as f:
                f.write(test_content)
                temp_file = f.name

            # Upload document to dataset
            document = dataset.upload_document(temp_file)
            print(f"[OK] Uploaded test document: {document.get('name', 'Unknown')}")

            # Wait a bit for processing
            print("Processing document...")
            time.sleep(3)

        except Exception as e:
            print(f"[WARNING] Could not upload document: {str(e)}")
            print("Continuing with empty dataset...")

        # Create chat session
        print("\nCreating chat session...")
        try:
            chat = client.create_chat(
                dataset_ids=[dataset_id],
                name="Test Chat Session"
            )

            # Create conversation session
            session = chat.create_session("Test Conversation")
            print("[OK] Chat session created!")

        except Exception as e:
            print(f"[ERROR] Could not create chat session: {str(e)}")
            return

        # Interactive chat loop
        print("\n" + "="*50)
        print("RAGFlow Chat Test with Own Dataset")
        print("Type 'quit' to exit")
        print("="*50)

        while True:
            try:
                user_input = input("\nYou: ").strip()

                if user_input.lower() in ['quit', 'exit', 'q']:
                    print("\n[OK] Goodbye!")
                    break

                if not user_input:
                    continue

                print("\nRAGFlow: ", end="", flush=True)

                # Send message and get response
                response = session.ask(user_input)
                print(response)

            except KeyboardInterrupt:
                print("\n\n[OK] Goodbye!")
                break
            except Exception as e:
                print(f"\n[ERROR] {str(e)}")
                continue

    except ImportError:
        print("[ERROR] RAGFlow SDK not installed. Please run: pip install ragflow-sdk")
    except Exception as e:
        print(f"[ERROR] {str(e)}")

if __name__ == "__main__":
    test_chat_with_own_dataset()