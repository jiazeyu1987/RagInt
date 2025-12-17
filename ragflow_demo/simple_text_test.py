#!/usr/bin/env python3
"""
Simple test for text cleaning functionality without Unicode characters
"""

import sys
from pathlib import Path

# Add the ragflow_demo root to Python path
sys.path.append(str(Path(__file__).parent))

def test_basic_functionality():
    """Test basic text cleaning functionality"""
    print("=" * 50)
    print("Testing Basic Text Cleaning Functionality")
    print("=" * 50)

    try:
        # Test imports
        from text_cleaner import TTSTextCleaner, quick_clean_text
        from tts_buffer import TTSBuffer

        print("[OK] Modules imported successfully")

        # Test TTSTextCleaner
        print("\nTesting TTSTextCleaner:")
        print("-" * 30)

        cleaner = TTSTextCleaner(language='zh-CN', cleaning_level='standard')

        test_texts = [
            "这是一个**重要**的概念。",
            "智能体具备以下能力：`自主感知`、`决策`。",
            "请访问[RAGFlow官网](https://ragflow.io)了解更多。"
        ]

        for text in test_texts:
            cleaned = cleaner.clean_streaming_chunk(text, is_partial=False)
            print(f"Original: {text}")
            print(f"Cleaned:  {cleaned}")
            print()

        # Test TTSBuffer
        print("Testing TTSBuffer:")
        print("-" * 30)

        buffer = TTSBuffer(max_chunk_size=50, language='zh-CN')

        chunks = ["这是第一句话。", "这是第二句话！", "这是第三句话？"]
        for chunk in chunks:
            ready_chunks = buffer.add_cleaned_chunk(chunk)
            print(f"Added: '{chunk}' -> Ready: {ready_chunks}")

        final_chunks = buffer.finalize()
        print(f"Final chunks: {final_chunks}")

        print("\n[SUCCESS] Basic functionality test passed!")
        return True

    except Exception as e:
        print(f"[ERROR] Test failed: {str(e)}")
        return False

def test_chat_integration():
    """Test chat integration with text cleaning"""
    print("\n" + "=" * 50)
    print("Testing Chat Integration")
    print("=" * 50)

    try:
        # Test that chat_agent_chat.py can be imported and configured
        import chat_agent_chat

        # Test config loading
        config = chat_agent_chat.load_config()
        if config:
            print("[OK] Configuration loaded successfully")
            print(f"Text cleaning enabled: {config.get('text_cleaning', {}).get('enabled', False)}")
        else:
            print("[ERROR] Failed to load configuration")
            return False

        print("[SUCCESS] Chat integration test passed!")
        return True

    except Exception as e:
        print(f"[ERROR] Chat integration test failed: {str(e)}")
        return False

def main():
    """Run all simple tests"""
    print("RAGFlow Text Cleaning Simple Test Suite")
    print("=" * 60)

    tests = [
        ("Basic Functionality", test_basic_functionality),
        ("Chat Integration", test_chat_integration)
    ]

    results = []
    for test_name, test_func in tests:
        print(f"\nRunning {test_name} test...")
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"[ERROR] {test_name} failed: {str(e)}")
            results.append((test_name, False))

    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)

    passed = 0
    for test_name, result in results:
        status = "[PASS]" if result else "[FAIL]"
        print(f"{test_name}: {status}")
        if result:
            passed += 1

    print(f"\nResults: {passed}/{len(results)} tests passed")

    if passed == len(results):
        print("[SUCCESS] All tests passed! Text cleaning is ready.")
    else:
        print("[WARNING] Some tests failed.")

    return passed == len(results)

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)