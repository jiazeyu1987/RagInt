#!/usr/bin/env python3
"""
RAGFlow Streaming Chat Demo
Demonstrates real-time streaming chat functionality
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

        return {
            'api_key': api_key,
            'base_url': base_url
        }
    except Exception as e:
        print(f"ERROR loading config: {str(e)}")
        return None

def demonstrate_streaming():
    """Demonstrate streaming chat functionality."""
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

        # Create chat session
        print("\nCreating streaming chat session...")
        chat = client.create_chat(
            name=f"Streaming Demo {int(time.time())}",
            dataset_ids=[]  # Empty dataset for general chat
        )

        # Create conversation session
        session = chat.create_session("Streaming Demo Session")
        print("[OK] Streaming chat session created!")

        print("\n" + "="*60)
        print("RAGFlow Streaming Chat Demo")
        print("="*60)
        print("This demo shows real-time streaming responses.")
        print("Type your message and watch RAGFlow respond word by word!")
        print("Type 'quit' to exit.")
        print("="*60)

        while True:
            try:
                user_input = input("\nYou: ").strip()

                if user_input.lower() in ['quit', 'exit', 'q']:
                    print("\n[OK] Thanks for trying the streaming demo!")
                    break

                if not user_input:
                    continue

                print("\nRAGFlow (Streaming): ", end="", flush=True)

                # Send message with streaming enabled
                response = session.ask(user_input, stream=True)

                # Process streaming response
                start_time = time.time()
                char_count = 0
                chunk_count = 0

                for chunk in response:
                    if chunk:
                        chunk_count += 1
                        if isinstance(chunk, dict):
                            text = chunk.get('content', '')
                        else:
                            text = str(chunk)

                        # Print each character with small delay for demo effect
                        for char in text:
                            print(char, end="", flush=True)
                            char_count += 1
                            time.sleep(0.01)  # Small delay to show streaming effect

                end_time = time.time()
                duration = end_time - start_time

                print(f"\n\nStreaming Stats:")
                print(f"   Response time: {duration:.2f} seconds")
                print(f"   Total characters: {char_count}")
                print(f"   Streaming chunks: {chunk_count}")
                print(f"   Characters/second: {char_count/duration:.0f}")

            except KeyboardInterrupt:
                print("\n\n[OK] Streaming demo interrupted!")
                break
            except Exception as e:
                print(f"\n[ERROR] {str(e)}")

    except ImportError:
        print("[ERROR] RAGFlow SDK not installed. Please run: pip install ragflow-sdk")
    except Exception as e:
        print(f"[ERROR] {str(e)}")

def compare_streaming_vs_non_streaming():
    """Compare streaming vs non-streaming responses."""
    config = load_config()
    if not config:
        return

    try:
        from ragflow_sdk import RAGFlow

        client = RAGFlow(
            api_key=config['api_key'],
            base_url=config.get('base_url', 'http://127.0.0.1')
        )

        chat = client.create_chat(name="Comparison Test", dataset_ids=[])
        session = chat.create_session("Comparison Session")

        test_message = "Tell me about RAGFlow and its main features."

        print("\n" + "="*60)
        print("Streaming vs Non-Streaming Comparison")
        print("="*60)

        # Test non-streaming
        print("\n1. Non-Streaming Response:")
        start_time = time.time()
        response = session.ask(test_message, stream=False)

        # Handle the response (it might still be a generator)
        if hasattr(response, '__iter__') and not isinstance(response, str):
            full_text = ""
            for chunk in response:
                if isinstance(chunk, dict):
                    full_text += chunk.get('content', '')
                else:
                    full_text += str(chunk)
            response = full_text

        non_stream_time = time.time() - start_time
        print(f"   Time: {non_stream_time:.2f} seconds")
        print(f"   Length: {len(response)} characters")
        print(f"   Response: {response[:100]}...")

        # Test streaming
        print("\n2. Streaming Response:")
        start_time = time.time()
        response_stream = session.ask(test_message, stream=True)

        print("   (Streaming in real-time): ", end="", flush=True)
        full_response = ""
        for chunk in response_stream:
            if isinstance(chunk, dict):
                text = chunk.get('content', '')
            else:
                text = str(chunk)
            print(text, end="", flush=True)
            full_response += text

        stream_time = time.time() - start_time
        print(f"\n   Time: {stream_time:.2f} seconds")
        print(f"   Length: {len(full_response)} characters")

        print(f"\nComparison Results:")
        print(f"   Non-Streaming: {non_stream_time:.2f}s")
        print(f"   Streaming: {stream_time:.2f}s")
        print(f"   Difference: {abs(non_stream_time - stream_time):.2f}s")

    except Exception as e:
        print(f"Error in comparison: {str(e)}")

if __name__ == "__main__":
    print("RAGFlow Streaming Chat Demo")
    print("Choose an option:")
    print("1. Interactive Streaming Chat")
    print("2. Compare Streaming vs Non-Streaming")
    print("3. Both")

    choice = input("\nEnter choice (1-3): ").strip()

    if choice == "1":
        demonstrate_streaming()
    elif choice == "2":
        compare_streaming_vs_non_streaming()
    elif choice == "3":
        demonstrate_streaming()
        compare_streaming_vs_non_streaming()
    else:
        print("Invalid choice. Running interactive demo...")
        demonstrate_streaming()