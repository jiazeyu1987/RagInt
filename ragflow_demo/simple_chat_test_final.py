#!/usr/bin/env python3
"""
Simple RAGFlow Chat Test - Final Version
Basic test to verify chat functionality works with existing datasets
"""

import sys
import json
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

        return {
            'api_key': api_key,
            'base_url': base_url
        }
    except Exception as e:
        print(f"ERROR loading config: {str(e)}")
        return None

def main():
    """Simple test to verify chat methods work."""
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

        # Test basic functionality
        print("\n=== RAGFlow Chat Method Test ===")

        # Test 1: List available methods
        print("\n1. Checking available methods:")
        ragflow_methods = [method for method in dir(client) if not method.startswith('_')]
        chat_methods = [m for m in ragflow_methods if 'chat' in m.lower()]
        print(f"   Chat-related methods: {chat_methods}")

        # Test 2: List datasets
        print("\n2. Listing datasets:")
        try:
            datasets = client.list_datasets()
            print(f"   Found {len(datasets)} datasets")
            for i, dataset in enumerate(datasets[:3], 1):  # Show first 3
                print(f"   {i}. {type(dataset)} - {str(dataset)[:100]}...")
        except Exception as e:
            print(f"   Error listing datasets: {str(e)}")

        # Test 3: Try to create chat without dataset (should work)
        print("\n3. Creating chat session:")
        try:
            import time
            chat = client.create_chat(
                name=f"Test Chat {int(time.time())}",
                dataset_ids=[]  # Empty list
            )
            print("   [OK] Chat created successfully")

            # Test 4: Create session
            print("\n4. Creating conversation session:")
            session = chat.create_session("Test Session")
            print("   [OK] Session created successfully")

            # Test 5: Try to ask a simple question
            print("\n5. Testing ask method (non-streaming):")
            response = session.ask("Hello, this is a test message.")
            print(f"   Response type: {type(response)}")
            if isinstance(response, str):
                print(f"   Response: {response[:100]}...")
            else:
                print(f"   Response: {str(response)[:100]}...")

            # Test 6: Try streaming
            print("\n6. Testing ask method (streaming):")
            response_stream = session.ask("Hello, this is a streaming test.", stream=True)
            print(f"   Streaming response type: {type(response_stream)}")

            if hasattr(response_stream, '__iter__'):
                print("   Streaming chunks:")
                chunk_count = 0
                full_response = ""
                for i, chunk in enumerate(response_stream):
                    chunk_count += 1
                    if isinstance(chunk, dict):
                        content = chunk.get('content', str(chunk))
                        print(f"     Chunk {i+1}: {content[:50]}...")
                        full_response += content
                    else:
                        print(f"     Chunk {i+1}: {str(chunk)[:50]}...")
                        full_response += str(chunk)

                print(f"   Total chunks: {chunk_count}")
                print(f"   Full response: {full_response[:100]}...")
            else:
                print(f"   Non-streaming response: {str(response_stream)[:100]}...")

        except Exception as e:
            print(f"   Error with chat functionality: {str(e)}")

        print("\n=== Test Complete ===")
        print("If you see chat session and session creation working,")
        print("the chat functionality is ready. You may need to add documents")
        print("to datasets or use datasets you have permission to access.")

    except ImportError:
        print("[ERROR] RAGFlow SDK not installed. Please run: pip install ragflow-sdk")
    except Exception as e:
        print(f"[ERROR] {str(e)}")

if __name__ == "__main__":
    main()