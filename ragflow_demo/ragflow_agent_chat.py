#!/usr/bin/env python3
"""
RAGFlow Agent-based Streaming Tool
Optimized chat using RAGFlow's Agent API with task-oriented conversation
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

        if not api_key or api_key in ['YOUR_RAGFLOW_API_KEY_HERE', 'your_api_key_here']:
            print("ERROR: Please set your RAGFlow API key in ragflow_config.json")
            return None

        return {
            'api_key': api_key,
            'base_url': base_url,
            'dataset_name': dataset_name
        }
    except Exception as e:
        print(f"ERROR loading config: {str(e)}")
        return None


def find_dataset_by_name(client, dataset_name):
    """Find dataset by name for agent"""
    if not dataset_name:
        return None

    try:
        datasets = client.list_datasets()
        for dataset in datasets:
            if hasattr(dataset, 'name'):
                if dataset.name == dataset_name:
                    return dataset.id if hasattr(dataset, 'id') else dataset
            elif isinstance(dataset, dict):
                if dataset.get('name') == dataset_name:
                    return dataset.get('id') or dataset
            else:
                if dataset_name in str(dataset):
                    return dataset
    except Exception as e:
        print(f"WARNING: Could not search datasets: {str(e)}")

    return None


def create_agent(client, dataset_id=None):
    """Create RAGFlow agent with dataset integration"""
    import time

    try:
        # Try to create agent using different possible methods
        agent_config = {
            'name': f'Agent {int(time.time())}',
            'description': 'AI Assistant for document-based Q&A and general conversation'
        }

        # Method 1: create_agent with dataset_ids
        if hasattr(client, 'create_agent'):
            try:
                if dataset_id:
                    agent = client.create_agent(
                        name=agent_config['name'],
                        description=agent_config['description'],
                        dataset_ids=[dataset_id]
                    )
                else:
                    agent = client.create_agent(
                        name=agent_config['name'],
                        description=agent_config['description']
                    )
                return agent
            except Exception as e:
                print(f"create_agent method failed: {str(e)}")

        # Method 2: Alternative agent creation pattern
        if hasattr(client, 'agent'):
            try:
                agent = client.agent.create(agent_config)
                return agent
            except Exception as e:
                print(f"agent.create method failed: {str(e)}")

        # Method 3: Fallback to chat-based approach but mark as agent mode
        print("WARNING: Agent API not available, falling back to chat mode with agent-like behavior")
        return None

    except Exception as e:
        print(f"ERROR creating agent: {str(e)}")
        return None


def process_agent_streaming_response(agent_or_session, message, is_agent=True):
    """Process streaming response from agent with intelligent deduplication"""
    try:
        if is_agent and hasattr(agent_or_session, 'chat'):
            # Agent chat method
            response = agent_or_session.chat(message, stream=True)
        elif hasattr(agent_or_session, 'ask'):
            # Fallback to session ask method
            response = agent_or_session.ask(message, stream=True)
        else:
            # Try agent_chat method if available
            response = agent_or_session.agent_chat(message, stream=True)

        last_complete_content = ""

        for chunk in response:
            if chunk:
                # Extract content from various chunk types, suppressing errors
                content = ''

                try:
                    if hasattr(chunk, 'content'):
                        content = chunk.content
                    elif hasattr(chunk, 'text'):
                        content = chunk.text
                    elif hasattr(chunk, 'get'):
                        content = chunk.get('content', chunk.get('text', ''))
                    elif isinstance(chunk, dict):
                        content = chunk.get('content', chunk.get('text', str(chunk)))
                    else:
                        content = str(chunk)

                    # Only update if this chunk is longer and more complete
                    if len(content) > len(last_complete_content):
                        if content.startswith(last_complete_content):
                            new_part = content[len(last_complete_content):]
                            print(new_part, end="", flush=True)
                        else:
                            print(content, end="", flush=True)

                        last_complete_content = content

                except Exception as chunk_error:
                    # Suppress individual chunk errors to avoid noise in output
                    continue

        print()  # New line after complete response

    except Exception as e:
        # Suppress RAGFlow internal errors that don't affect functionality
        if 'chunk_id' not in str(e) and 'internal' not in str(e).lower():
            print(f"\nERROR: {str(e)}")


def main():
    """Main agent function using Agent API"""
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
                dataset_info = f" (dataset '{config['dataset_name']}' not found, using general knowledge)"

        # Create agent
        agent = create_agent(client, dataset_id)
        fallback_session = None

        if not agent:
            # Fallback to chat mode with agent-like behavior
            print("WARNING: Using chat mode as fallback")
            try:
                import time
                chat = client.create_chat(
                    name=f"Agent Chat {int(time.time())}",
                    dataset_ids=[dataset_id] if dataset_id else []
                )
                fallback_session = chat.create_session("Agent Fallback Session")
            except Exception as e:
                print(f"ERROR creating fallback chat session: {str(e)}")
                return

        print(f"RAGFlow Agent Ready{dataset_info}")
        print("Type your message and press Enter. Type 'quit' to exit.")
        print("Agent mode: Task-oriented conversation with enhanced capabilities")
        print("-" * 50)

        # Main chat loop
        while True:
            try:
                user_input = input("\nYou: ").strip()

                if user_input.lower() in ['quit', 'exit', 'q']:
                    break

                if not user_input:
                    continue

                print("Agent: ", end="", flush=True)

                if agent:
                    process_agent_streaming_response(agent, user_input, is_agent=True)
                elif fallback_session:
                    process_agent_streaming_response(fallback_session, user_input, is_agent=False)

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