#!/usr/bin/env python3
"""
RAGFlow Chat-based Streaming Tool
Optimized chat using RAGFlow's Chat API with dataset integration
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
        dataset_name = config.get('dataset_name', '')
        conversation_name = config.get('default_conversation_name', '知识库问答')

        # Load text cleaning configuration
        text_cleaning = config.get('text_cleaning', {
            'enabled': False,
            'show_cleaned_output': False,
            'language': 'zh-CN',
            'cleaning_level': 'standard',
            'tts_buffer_enabled': True,
            'semantic_chunking': True
        })

        if not api_key or api_key in ['YOUR_RAGFLOW_API_KEY_HERE', 'your_api_key_here']:
            print("ERROR: Please set your RAGFlow API key in ragflow_config.json")
            return None

        return {
            'api_key': api_key,
            'base_url': base_url,
            'dataset_name': dataset_name,
            'conversation_name': conversation_name,
            'text_cleaning': text_cleaning
        }
    except Exception as e:
        print(f"ERROR loading config: {str(e)}")
        return None


def find_dataset_by_name(client, dataset_name):
    """Find dataset by name"""
    if not dataset_name:
        return None

    try:
        datasets = client.list_datasets()
        for dataset in datasets:
            # Handle different dataset object types
            if hasattr(dataset, 'name'):
                if dataset.name == dataset_name:
                    return dataset.id if hasattr(dataset, 'id') else dataset
            elif isinstance(dataset, dict):
                if dataset.get('name') == dataset_name:
                    return dataset.get('id') or dataset
            else:
                # String representation
                if dataset_name in str(dataset):
                    return dataset
    except Exception as e:
        print(f"WARNING: Could not search datasets: {str(e)}")

    return None


def find_chat_by_name(client, chat_name):
    """Find existing chat by name"""
    try:
        chats = client.list_chats()
        for chat in chats:
            # Handle different chat object types
            if hasattr(chat, 'name'):
                if chat.name == chat_name:
                    return chat
            elif isinstance(chat, dict):
                if chat.get('name') == chat_name:
                    return chat
            else:
                # String representation or other format
                if chat_name in str(chat):
                    return chat
    except Exception as e:
        print(f"WARNING: Could not search chats: {str(e)}")

    return None


def create_chat_session(client, chat_name, dataset_id=None):
    """Get existing chat session or create new one using Chat API"""
    import time

    try:
        # First, try to find existing chat by name
        chat = find_chat_by_name(client, chat_name)

        if chat:
            # Use existing chat silently
            pass
        else:
            # If not found, create new chat
            chat = client.create_chat(
                name=chat_name,
                dataset_ids=[dataset_id] if dataset_id else []
            )

        # Create session
        session = chat.create_session("Chat Session")
        return chat, session
    except Exception as e:
        print(f"ERROR creating chat session: {str(e)}")
        return None, None


def process_streaming_response(session, message, config=None):
    """Enhanced streaming response with TTS-ready text cleaning"""
    try:
        response = session.ask(message, stream=True)

        # Initialize text cleaning components
        enable_cleaning = config.get('text_cleaning', {}).get('enabled', False) if config else False
        show_cleaned = config.get('text_cleaning', {}).get('show_cleaned_output', False) if config else False
        cleaning_level = config.get('text_cleaning', {}).get('cleaning_level', 'standard') if config else 'standard'
        language = config.get('text_cleaning', {}).get('language', 'zh-CN') if config else 'zh-CN'
        tts_buffer_enabled = config.get('text_cleaning', {}).get('tts_buffer_enabled', True) if config else True

        # Import text cleaning modules only when enabled
        text_cleaner = None
        tts_buffer = None

        if enable_cleaning:
            try:
                from text_cleaner import TTSTextCleaner
                from tts_buffer import TTSBuffer

                text_cleaner = TTSTextCleaner(language=language, cleaning_level=cleaning_level)
                tts_buffer = TTSBuffer(language=language) if tts_buffer_enabled else None
            except ImportError as e:
                print(f"WARNING: Text cleaning modules not available: {str(e)}")
                enable_cleaning = False

        last_complete_content = ""

        for chunk in response:
            if chunk:
                # Extract content from Message object, suppressing errors
                content = ''

                try:
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
                            try:
                                chunk_dict = eval(chunk_str)
                                content = chunk_dict.get('content', '')
                            except:
                                # If eval fails, try to extract content with regex
                                import re
                                match = re.search(r"'content':\s*'([^']*)'", chunk_str)
                                if match:
                                    content = match.group(1)
                                else:
                                    content = chunk_str
                        else:
                            content = chunk_str

                    # Only update if this chunk is longer and more complete
                    if len(content) > len(last_complete_content):
                        new_part = content[len(last_complete_content):]

                        if text_cleaner and enable_cleaning:
                            # Clean the new content for TTS
                            cleaned_chunk = text_cleaner.clean_streaming_chunk(new_part, is_partial=True)

                            # Add to TTS buffer if enabled
                            if tts_buffer:
                                tts_ready_chunks = tts_buffer.add_cleaned_chunk(cleaned_chunk)
                                # TTS chunks are ready for future TTS integration
                                # For now, we just store them

                            # Choose display text based on configuration
                            display_text = cleaned_chunk if show_cleaned else new_part
                        else:
                            display_text = new_part

                        # Print to console (maintaining existing behavior)
                        print(display_text, end="", flush=True)
                        last_complete_content = content

                except Exception as chunk_error:
                    # Suppress individual chunk errors to avoid noise in output
                    continue

        print()  # New line after complete response

        # Return TTS-ready text for future integration
        if text_cleaner and tts_buffer:
            # Finalize buffer and get remaining chunks
            final_chunks = tts_buffer.finalize()
            complete_clean_text = tts_buffer.get_complete_clean_text()

            # Return comprehensive TTS data
            return {
                'complete_clean_text': complete_clean_text,
                'tts_chunks': tts_buffer.get_tts_ready_chunks() + final_chunks,
                'buffer_status': tts_buffer.get_buffer_status(),
                'cleaner_status': text_cleaner.get_buffer_status()
            }

        return None

    except Exception as e:
        # Suppress RAGFlow internal errors that don't affect functionality
        if 'chunk_id' not in str(e) and 'internal' not in str(e).lower():
            print(f"\nERROR: {str(e)}")
        return None


def main():
    """Main chat function using Chat API"""
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

        # Find dataset if specified
        dataset_id = None
        dataset_info = ""
        if config.get('dataset_name'):
            dataset_id = find_dataset_by_name(client, config['dataset_name'])
            if dataset_id:
                dataset_info = f" (using dataset: {config['dataset_name']})"
            else:
                dataset_info = f" (dataset '{config['dataset_name']}' not found, using general chat)"

        # Create chat session using configured conversation name
        conversation_name = config.get('conversation_name', '知识库问答')
        chat, session = create_chat_session(client, conversation_name, dataset_id)
        if not chat or not session:
            return

        print(f"RAGFlow Chat Ready{dataset_info}")
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
                tts_data = process_streaming_response(session, user_input, config)

                # TTS data is available for future integration
                if tts_data and config.get('text_cleaning', {}).get('enabled', False):
                    # TTS-ready text is now available in tts_data
                    # This can be used for future TTS integration
                    pass

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