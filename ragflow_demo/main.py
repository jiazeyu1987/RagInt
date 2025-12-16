#!/usr/bin/env python3
"""
RAGFlow Demo Runner
Main script to run all RAGFlow API demonstrations.
"""

import sys
import os
import argparse
import json
import yaml
from pathlib import Path

# Add the ragflow_demo root to Python path
sys.path.append(str(Path(__file__).parent))

from demos import chat_demo, knowledge_base_demo, retrieval_demo
from demos import document_management_demo, advanced_features_demo


def load_config():
    """Load configuration from config file."""
    config_path = Path(__file__).parent / "configs" / "config.json"

    if not config_path.exists():
        # Try YAML config
        config_path = config_path.with_suffix('.yaml')

    if not config_path.exists():
        print("[ERROR] Configuration file not found!")
        print("Please create one of the following:")
        print("  - configs/config.json")
        print("  - configs/config.yaml")
        print()
        print("Example JSON configuration:")
        print("""
{
  "ragflow": {
    "api_key": "YOUR_RAGFLOW_API_KEY_HERE",
    "base_url": "http://localhost:9380"
  }
}
        """)
        return None

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            if config_path.suffix == '.json':
                return json.load(f)
            else:
                return yaml.safe_load(f)
    except Exception as e:
        print(f"[ERROR] Could not load config file: {str(e)}")
        return None


def check_configuration():
    """Check if configuration is properly set up."""
    config = load_config()
    if config is None:
        return False

    ragflow_config = config.get('ragflow', {})

    # Always show that config is loaded
    print("[OK] Configuration loaded successfully")

    # Check if API key is set to a real value
    api_key = ragflow_config.get('api_key', '')
    if not api_key or api_key in ['your_api_key_here', 'YOUR_RAGFLOW_API_KEY_HERE', 'test_api_key_for_demo']:
        print("[INFO] Using demo mode - API key not configured")
        print("  To use real RAGFlow functionality, edit 'configs/config.json' and set your actual API key")
    else:
        base_url = ragflow_config.get('base_url', 'http://localhost:9380')
        print(f"[INFO] Using RAGFlow server: {base_url}")

    return True


def check_dependencies():
    """Check if required dependencies are installed."""
    required_packages = [
        'pyyaml',
        'requests'
    ]

    missing_required = []

    for package in required_packages:
        try:
            __import__(package)
        except ImportError:
            missing_required.append(package)

    if missing_required:
        print("[INFO] Optional dependencies missing (some features may not work):")
        print(f"   - {', '.join(missing_required)}")
        print("\nInstall with:")
        print(f"  pip install {' '.join(missing_required)}")
        print("  # Or install all requirements:")
        print("  pip install -r requirements.txt")
        print("\nContinuing with demo mode...")
        return True  # Allow running anyway

    print("[OK] Required dependencies available")
    return True


def run_demo(demo_name, demo_function):
    """Run a specific demo function."""
    print(f"\n{'='*60}")
    print(f"Running {demo_name}")
    print('='*60)

    try:
        demo_function()
        print(f"\n[OK] {demo_name} completed successfully!")
        return True
    except Exception as e:
        print(f"\n[ERROR] Error in {demo_name}: {str(e)}")
        return False


def main():
    """Main function."""
    parser = argparse.ArgumentParser(
        description="RAGFlow API Demo Runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Available demos:
  chat                 Chat API demonstrations
  kb                   Knowledge base management
  retrieval            Document retrieval and search
  docs                 Document upload and management
  advanced             Advanced features and workflows
  all                  Run all demos

Examples:
  python main.py --demo chat
  python main.py --demo all
  python main.py --check-config
        """
    )

    parser.add_argument(
        '--demo', '-d',
        choices=['chat', 'kb', 'retrieval', 'docs', 'advanced', 'all'],
        default='all',
        help='Demo to run (default: all)'
    )

    parser.add_argument(
        '--check-config', '-c',
        action='store_true',
        help='Check configuration and dependencies only'
    )

    parser.add_argument(
        '--list', '-l',
        action='store_true',
        help='List available demos'
    )

    args = parser.parse_args()

    print("RAGFlow API Demo Suite")
    print("=" * 50)

    if args.list:
        print("\nAvailable demos:")
        demos = {
            'chat': 'Chat API - Conversational AI demonstrations',
            'kb': 'Knowledge Base - KB management operations',
            'retrieval': 'Retrieval - Document search and retrieval',
            'docs': 'Documents - Document upload and processing',
            'advanced': 'Advanced - Workflows, chunking, and analytics'
        }

        for name, description in demos.items():
            print(f"  {name:<10} - {description}")
        return

    # Check configuration and dependencies
    print("Checking setup...")
    config_ok = check_configuration()
    deps_ok = check_dependencies()

    if args.check_config:
        if config_ok and deps_ok:
            print("\n[OK] All checks passed! Ready to run demos.")
        else:
            print("\n[INFO] Some optional features may not be available.")
        return

    if not config_ok:
        print("\n[ERROR] Configuration file not found.")
        print("Please create configs/config.json with your RAGFlow settings.")
        return

    print()

    # Define available demos
    demos = {
        'chat': ('Chat API Demo', chat_demo.main),
        'kb': ('Knowledge Base Demo', knowledge_base_demo.main),
        'retrieval': ('Retrieval Demo', retrieval_demo.main),
        'docs': ('Document Management Demo', document_management_demo.main),
        'advanced': ('Advanced Features Demo', advanced_features_demo.main)
    }

    # Run specified demo(s)
    if args.demo == 'all':
        print("\nRunning all demos...")
        results = {}

        for demo_key, (demo_name, demo_func) in demos.items():
            results[demo_key] = run_demo(demo_name, demo_func)

        # Summary
        print(f"\n{'='*60}")
        print("Demo Run Summary")
        print('='*60)

        successful = sum(results.values())
        total = len(results)

        for demo_key, success in results.items():
            status = "[OK] Success" if success else "[ERROR] Failed"
            print(f"{demos[demo_key][0]:<30} - {status}")

        print(f"\nOverall: {successful}/{total} demos completed successfully")

    else:
        # Run specific demo
        if args.demo in demos:
            demo_name, demo_func = demos[args.demo]
            run_demo(demo_name, demo_func)
        else:
            print(f"Unknown demo: {args.demo}")
            print("Use --list to see available demos.")


if __name__ == "__main__":
    main()