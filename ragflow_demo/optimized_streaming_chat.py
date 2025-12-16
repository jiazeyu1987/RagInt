#!/usr/bin/env python3
"""
Optimized RAGFlow Streaming Chat
Direct streaming chat with content-only output and deduplication
"""

import sys
import json
from pathlib import Path

# Add the ragflow_demo root to Python path
sys.path.append(str(Path(__file__).parent))


def load_config():
    """Load configuration from ragflow_config.json file silently"""
    config_path = Path(__file__).parent / "ragflow_config.json"

    if not config_path.exists():
        print("ERROR: ragflow_config.json not found")
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

def create_chat_session(client, dataset_id=None):
    """Create chat session with dataset"""
    import time

    try:
        chat = client.create_chat(
            name=f"Optimized Streaming Chat {int(time.time())}",
            dataset_ids=[dataset_id] if dataset_id else []
        )

        session = chat.create_session("Optimized Chat Session")
        return chat, session
    except Exception as e:
        print(f"ERROR creating chat session: {str(e)}")
        return None, None

def process_streaming_response(session, message):
    """Process streaming response with intelligent deduplication"""
    try:
        response = session.ask(message, stream=True)

        # Collect chunks and show only the final complete response
        # RAGFlow tends to send incremental updates where each chunk is more complete
        last_complete_content = ""

        for chunk in response:
            if chunk:
                # Extract content from Message object or dict
                content = ''

                # Try different ways to get content
                if hasattr(chunk, 'content'):
                    content = chunk.content
                elif hasattr(chunk, 'get'):
                    content = chunk.get('content', '')
                elif isinstance(chunk, dict):
                    content = chunk.get('content', '')
                else:
                    # Convert to string and try to extract content
                    chunk_str = str(chunk)
                    if 'content' in chunk_str:
                        # Try to parse the dict from string
                        try:
                            chunk_dict = eval(chunk_str)
                            content = chunk_dict.get('content', '')
                        except:
                            content = chunk_str
                    else:
                        content = chunk_str

                # Only update if this chunk is longer and more complete
                if len(content) > len(last_complete_content):
                    # Calculate what's new
                    if content.startswith(last_complete_content):
                        new_part = content[len(last_complete_content):]
                        print(new_part, end="", flush=True)
                    else:
                        # Content structure changed, print everything
                        print(content, end="", flush=True)

                    last_complete_content = content

        print()  # New line after complete response

    except Exception as e:
        print(f"\nERROR: {str(e)}")

def main():
    """Main streaming chat function"""
    # Load configuration
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

        # Create chat session (using empty dataset for general chat)
        chat, session = create_chat_session(client)
        if not chat or not session:
            return

        print("RAGFlow Streaming Chat Ready")
        print("Type your message and press Enter. Type 'quit' to exit.")
        print("-" * 50)

        # Main chat loop
        while True:
            try:
                user_input = input("\nYou: ").strip()

                if user_input.lower() in ['quit', 'exit', 'q']:
                    break

                if not user_input:
                    continue

                print("RAGFlow: ", end="", flush=True)
                process_streaming_response(session, user_input)

            except KeyboardInterrupt:
                break
            except EOFError:
                break

    except ImportError:
        print("ERROR: RAGFlow SDK not installed. Please run: pip install ragflow-sdk")
    except Exception as e:
        print(f"ERROR: {str(e)}")

if __name__ == "__main__":
    main()