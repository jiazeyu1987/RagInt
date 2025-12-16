#!/usr/bin/env python3
"""
RAGFlow Streaming Chat Test
Interactive chat client with streaming support for RAGFlow
"""

import sys
import json
import argparse
from pathlib import Path

# Add the ragflow_demo root to Python path
sys.path.append(str(Path(__file__).parent))

# Import RAGFlow with graceful fallback
try:
    from ragflow_sdk import RAGFlow
except ImportError:
    try:
        from ragflow import RAGFlow
    except ImportError:
        print("ERROR: RAGFlow SDK not installed. Please run: pip install ragflow-sdk")
        sys.exit(1)


def load_config(config_path=None):
    """Load configuration from ragflow_config.json file."""
    if config_path is None:
        config_path = Path(__file__).parent / "ragflow_config.json"

    if not config_path.exists():
        print(f"ERROR: Configuration file not found at {config_path}")
        print("Please create a ragflow_config.json file with your RAGFlow settings")
        sys.exit(1)

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)

        api_key = config.get('api_key', '')
        base_url = config.get('base_url', 'http://127.0.0.1')

        if not api_key or api_key in ['YOUR_RAGFLOW_API_KEY_HERE', 'your_api_key_here']:
            print("ERROR: RAGFlow API key not configured in ragflow_config.json")
            sys.exit(1)

        # Return config in the expected format
        return {
            'api_key': api_key,
            'base_url': base_url
        }
    except Exception as e:
        print(f"ERROR: Could not load config file: {str(e)}")
        sys.exit(1)


def list_datasets(client):
    """List available datasets and let user choose one."""
    try:
        datasets = client.list_datasets()
        if not datasets:
            print("No datasets found. You need to create a dataset first.")
            return None

        print("\nAvailable datasets:")
        for i, dataset in enumerate(datasets, 1):
            print(f"  {i}. {dataset.get('name', 'Unknown')} (ID: {dataset.get('id', 'Unknown')})")

        while True:
            try:
                choice = input(f"\nSelect dataset (1-{len(datasets)}) or press Enter for first: ").strip()
                if not choice:
                    return datasets[0].get('id')

                choice_idx = int(choice) - 1
                if 0 <= choice_idx < len(datasets):
                    return datasets[choice_idx].get('id')
                else:
                    print(f"Please enter a number between 1 and {len(datasets)}")
            except ValueError:
                print("Please enter a valid number")

    except Exception as e:
        print(f"Error listing datasets: {str(e)}")
        return None


def create_chat_session(client, dataset_id, session_name=None):
    """Create a chat session."""
    try:
        if session_name is None:
            session_name = f"interactive_chat_{int(time.time())}"

        chat = client.create_chat(
            dataset_ids=[dataset_id] if dataset_id else None,
            name=session_name
        )
        return chat
    except Exception as e:
        print(f"Error creating chat session: {str(e)}")
        return None


def stream_chat(chat, session, message):
    """Send message and stream response."""
    try:
        print("\nRAGFlow: ", end="", flush=True)

        # Send message using session.ask with streaming enabled
        response = session.ask(message, stream=True)

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

        return response

    except Exception as e:
        print(f"\nERROR: {str(e)}")
        return None


def interactive_chat(client, dataset_id):
    """Run interactive chat session."""
    import time

    print("\n" + "="*60)
    print("RAGFlow Interactive Chat")
    print("="*60)
    print("Commands:")
    print("  /quit  - Exit chat")
    print("  /help  - Show this help")
    print("  /new   - Start new chat session")
    print("  /clear - Clear conversation history")
    print("="*60)

    # Create chat session
    chat = create_chat_session(client, dataset_id)
    if not chat:
        return

    # Create conversation session
    session = chat.create_session("Interactive Chat")
    print("\n[OK] Chat session started! Type your message below.\n")

    while True:
        try:
            # Get user input
            user_input = input("\nYou: ").strip()

            # Handle commands
            if user_input.lower() == '/quit':
                print("\n[OK] Goodbye!")
                break
            elif user_input.lower() == '/help':
                print("\nCommands:")
                print("  /quit  - Exit chat")
                print("  /help  - Show this help")
                print("  /new   - Start new chat session")
                print("  /clear - Clear conversation history")
                continue
            elif user_input.lower() == '/new':
                chat = create_chat_session(client, dataset_id)
                if chat:
                    session = chat.create_session("New Chat Session")
                    print("\n[OK] New chat session started!")
                continue
            elif user_input.lower() == '/clear':
                session = chat.create_session("Cleared Session")
                print("\n[OK] Conversation cleared!")
                continue
            elif not user_input:
                continue

            # Send message and stream response
            stream_chat(chat, session, user_input)

        except KeyboardInterrupt:
            print("\n\n[OK] Goodbye!")
            break
        except EOFError:
            print("\n\n[OK] Goodbye!")
            break


def main():
    """Main function."""
    parser = argparse.ArgumentParser(
        description="RAGFlow Interactive Chat Client",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python test_chat.py                    # Interactive mode with dataset selection
  python test_chat.py --config custom.json  # Use custom config file
  python test_chat.py --dataset-id abc123  # Use specific dataset
        """
    )

    parser.add_argument(
        '--config', '-c',
        help='Path to configuration file (default: ragflow_config.json)'
    )

    parser.add_argument(
        '--dataset-id', '-d',
        help='Dataset ID to use for chat (if not provided, will show selection)'
    )

    parser.add_argument(
        '--list-datasets', '-l',
        action='store_true',
        help='List available datasets and exit'
    )

    args = parser.parse_args()

    # Load configuration
    config = load_config(args.config)

    # Initialize RAGFlow client
    try:
        client = RAGFlow(
            api_key=config['api_key'],
            base_url=config.get('base_url', 'http://localhost:9380')
        )
        print(f"[OK] Connected to RAGFlow at {config.get('base_url', 'http://localhost:9380')}")
    except Exception as e:
        print(f"[ERROR] Failed to connect to RAGFlow: {str(e)}")
        sys.exit(1)

    # List datasets if requested
    if args.list_datasets:
        list_datasets(client)
        return

    # Get dataset ID
    dataset_id = args.dataset_id
    if not dataset_id:
        dataset_id = list_datasets(client)
        if not dataset_id:
            print("❌ No datasets available. Please create a dataset first.")
            sys.exit(1)

    # Start interactive chat
    interactive_chat(client, dataset_id)


if __name__ == "__main__":
    # Import time for timestamp
    import time
    main()