#!/usr/bin/env python3
"""
Simple RAGFlow Chat Test
Basic streaming chat test with RAGFlow
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

def test_streaming_chat():
    """Test streaming chat functionality."""
    config = load_config()
    if not config:
        return

    try:
        # Import RAGFlow
        from ragflow_sdk import RAGFlow

        # Initialize client
        client = RAGFlow(
            api_key=config['api_key'],
            base_url=config.get('base_url', 'http://localhost:9380')
        )
        print("[OK] Connected to RAGFlow")

        # List datasets
        datasets = client.list_datasets()
        if not datasets:
            print("[ERROR] No datasets found. Please create a dataset first.")
            return

        print("\nAvailable datasets:")
        for i, dataset in enumerate(datasets, 1):
            # Handle both dict objects and Response objects
            if hasattr(dataset, 'json'):
                dataset_data = dataset.json()
            elif isinstance(dataset, dict):
                dataset_data = dataset
            else:
                dataset_data = {'name': str(dataset), 'id': str(dataset)}

            name = dataset_data.get('name', 'Unknown')
            dataset_id = dataset_data.get('id', 'Unknown')
            print(f"  {i}. {name} (ID: {dataset_id})")

        # Select dataset
        try:
            choice = int(input(f"\nSelect dataset (1-{len(datasets)}): ")) - 1
            if choice < 0 or choice >= len(datasets):
                print("[ERROR] Invalid selection")
                return
            selected_dataset = datasets[choice]
        except ValueError:
            print("[ERROR] Please enter a valid number")
            return

        # Extract dataset ID and name from response
        if hasattr(selected_dataset, 'json'):
            dataset_data = selected_dataset.json()
        elif isinstance(selected_dataset, dict):
            dataset_data = selected_dataset
        else:
            dataset_data = {'name': str(selected_dataset), 'id': str(selected_dataset)}

        dataset_id = dataset_data.get('id')
        dataset_name = dataset_data.get('name', 'Unknown')
        print(f"\n[OK] Selected dataset: {dataset_name}")

        # Create chat session
        chat = client.create_chat(
            dataset_ids=[dataset_id],
            name="RAGFlow Chat Test"
        )

        # Create conversation session
        session = chat.create_session("Chat Session")
        print("\n[OK] Chat session created!")

        # Interactive chat loop
        print("\n" + "="*50)
        print("RAGFlow Streaming Chat")
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
                response = session.ask(user_input, stream=True)

                # Handle streaming response
                if hasattr(response, '__iter__') and not isinstance(response, str):
                    # Streaming response
                    for chunk in response:
                        if chunk:
                            # Extract text from chunk if it's a dict
                            if isinstance(chunk, dict):
                                text = chunk.get('content', str(chunk))
                                print(text, end="", flush=True)
                            else:
                                print(chunk, end="", flush=True)
                    print()  # New line after streaming
                else:
                    # Non-streaming response
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
    test_streaming_chat()