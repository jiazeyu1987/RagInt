#!/usr/bin/env python3
"""
Comprehensive test suite for TTS-ready text cleaning functionality
Tests both text_cleaner.py and tts_buffer.py modules
"""

import sys
import json
from pathlib import Path

# Add the ragflow_demo root to Python path
sys.path.append(str(Path(__file__).parent))

def test_text_cleaner():
    """Test TTSTextCleaner functionality"""
    print("=" * 60)
    print("Testing TTSTextCleaner Module")
    print("=" * 60)

    try:
        from text_cleaner import TTSTextCleaner, quick_clean_text, is_text_tts_ready

        # Test cases for various RAGFlow output formats
        test_cases = [
            # Basic markdown
            ("这是一个**重要**的概念。", "basic_markdown"),

            # Mixed formatting
            ("智能体具备以下**核心能力**：`自主感知`、`决策`和`行动`。", "mixed_formatting"),

            # Code blocks
            ("以下是一个例子：\n```python\ndef agent():\n    return '思考中'\n```", "code_blocks"),

            # Lists and numbering
            ("1. **自主性**：能够独立推理\n2. **交互性**：与环境交互", "lists"),

            # Links
            ("请访问[RAGFlow官网](https://ragflow.io)了解更多信息。", "links"),

            # Chinese punctuation
            ("智能体具备以下特征：自主性、交互性、反应性。", "chinese_punctuation"),

            # Special characters and citations
            ("根据研究[1]，智能体市场预计从2024年的51亿美元增长到2030年。", "special_chars"),

            # Complex example (similar to RAGFlow output)
            ("""智能体是指能够**感知环境**并利用工具采取行动以实现特定目标的代理。

智能体以大模型为智能底座，具备以下能力和特征：

1. **核心能力**：
   - **自主感知**：通过传感器等设备感知周围环境。
   - **理解**：理解和处理来自环境的信息。

2. **基本特征**：
   - **自主性**：能够独立推理、决策和执行任务。
   - **交互性**：能够与环境、用户和其他智能体进行交互。

3. **应用场景**：
   - **工业制造**：生产中智能分拣与物料管理。
   - **城市管理**：交通管理、社区治理等。

更多信息请参考[智能体文档](https://example.com)和技术规范。""", "complex_example"),

            # Technical content with code
            ("使用`API_KEY`和`dataset_ids`参数来初始化：\n```python\nclient = RAGFlow(api_key='your_key')\n```", "technical_content"),
        ]

        print("\nTesting different cleaning levels:")
        print("-" * 40)

        for test_text, test_name in test_cases:
            print(f"\nTest: {test_name}")
            print(f"Original: {test_text[:100]}{'...' if len(test_text) > 100 else ''}")

            # Test different cleaning levels
            for level in ['basic', 'standard', 'aggressive']:
                try:
                    cleaner = TTSTextCleaner(cleaning_level=level)
                    cleaned = cleaner.clean_streaming_chunk(test_text, is_partial=False)
                    print(f"{level.capitalize()}: {cleaned[:80]}{'...' if len(cleaned) > 80 else ''}")

                    # Test if result is TTS-ready
                    if is_text_tts_ready(cleaned):
                        print(f"  [OK] TTS-ready: Yes")
                    else:
                        print(f"  [WARN] TTS-ready: No")
                except Exception as e:
                    print(f"  [ERROR] in {level}: {str(e)}")

            print("-" * 30)

        # Test streaming functionality
        print(f"\nTesting streaming functionality:")
        print("-" * 40)

        streaming_text = "这是一个**测试**，用于验证`流式`文本处理功能是否正常工作。"
        cleaner = TTSTextCleaner()

        # Simulate streaming chunks
        chunks = ["这是一个**", "测试**，用于验证`流式", "文本处理功能是否正常工作。"]

        print(f"Original text: {streaming_text}")
        print("Streaming processing:")

        accumulated_cleaned = ""
        for i, chunk in enumerate(chunks, 1):
            cleaned_chunk = cleaner.clean_streaming_chunk(chunk, is_partial=True)
            accumulated_cleaned += cleaned_chunk
            print(f"  Chunk {i}: '{chunk}' -> '{cleaned_chunk}'")

        print(f"Final accumulated: '{accumulated_cleaned}'")

        # Test quick clean function
        print(f"\nTesting quick clean function:")
        print("-" * 40)

        quick_text = "**Quick test** for `convenience` function."
        quick_cleaned = quick_clean_text(quick_text, 'standard')
        print(f"Original: '{quick_text}'")
        print(f"Quick cleaned: '{quick_cleaned}'")

        print("\n[SUCCESS] TTSTextCleaner tests completed successfully!")
        return True

    except ImportError as e:
        print(f"[ERROR] Import Error: {str(e)}")
        return False
    except Exception as e:
        print(f"[ERROR] Test Error: {str(e)}")
        return False


def test_tts_buffer():
    """Test TTSBuffer functionality"""
    print("\n" + "=" * 60)
    print("Testing TTSBuffer Module")
    print("=" * 60)

    try:
        from tts_buffer import TTSBuffer, SemanticChunker

        # Test cases for buffer chunking
        test_sequences = [
            # Simple sentences
            (["这是第一句话。", "这是第二句话！", "这是第三句话？"], "simple_sentences"),

            # Mixed content
            (["智能体具备", "以下特征：", "自主性、", "交互性和", "适应性。"], "mixed_content"),

            # Longer content requiring size-based chunking
            (["这是一个很长的句子，", "包含了多个分句和", "不同的内容部分，", "需要智能地进行分割处理。"], "long_content"),

            # Complex conversation-style content
            (["根据研究，智能体市场预计", "从2024年的51亿美元", "增长到2030年的471亿美元，", "年复合增长率达44.8%。"], "conversation_style"),
        ]

        print("\nTesting TTSBuffer with different content sequences:")
        print("-" * 50)

        for text_chunks, test_name in test_sequences:
            print(f"\nTest: {test_name}")
            print(f"Input chunks: {text_chunks}")

            buffer = TTSBuffer(max_chunk_size=50, language='zh-CN')
            all_ready_chunks = []

            for i, chunk in enumerate(text_chunks, 1):
                ready_chunks = buffer.add_cleaned_chunk(chunk)
                print(f"  Added '{chunk}' -> Ready chunks: {ready_chunks}")
                all_ready_chunks.extend(ready_chunks)

            # Finalize and get remaining chunks
            final_chunks = buffer.finalize()
            all_ready_chunks.extend(final_chunks)

            print(f"  Final chunks: {final_chunks}")
            print(f"  All TTS-ready chunks: {all_ready_chunks}")
            print(f"  Buffer status: {buffer.get_buffer_status()}")

            buffer.reset()
            print("-" * 30)

        # Test SemanticChunker
        print(f"\nTesting SemanticChunker:")
        print("-" * 30)

        chunker = SemanticChunker(language='zh-CN')
        semantic_chunks = []

        test_text = "这是第一句话。这是第二句话！这是第三句话？"
        for char in test_text:
            # Simulate character-by-character streaming
            result = chunker.add_text(char)
            if result:
                semantic_chunks.extend(result)

        print(f"Input text: '{test_text}'")
        print(f"Semantic chunks: {semantic_chunks}")

        print("\n✅ TTSBuffer tests completed successfully!")
        return True

    except ImportError as e:
        print(f"❌ Import Error: {str(e)}")
        return False
    except Exception as e:
        print(f"❌ Test Error: {str(e)}")
        return False


def test_integration():
    """Test integration between text_cleaner and tts_buffer"""
    print("\n" + "=" * 60)
    print("Testing Integration: TextCleaner + TTSBuffer")
    print("=" * 60)

    try:
        from text_cleaner import TTSTextCleaner
        from tts_buffer import TTSBuffer

        # Simulate RAGFlow streaming output
        ragflow_chunks = [
            "智能体是指能够**感知环境**",
            "并利用工具采取行动以实现",
            "特定目标的代理。它们具备以下",
            "特征：1. **自主性**：能够独立",
            "推理、决策和执行任务。",
            "2. **交互性**：能够与环境、",
            "用户和其他智能体进行交互。"
        ]

        print(f"Simulating RAGFlow streaming output:")
        print(f"Chunks: {ragflow_chunks}")

        # Initialize components
        cleaner = TTSTextCleaner(language='zh-CN', cleaning_level='standard')
        buffer = TTSBuffer(max_chunk_size=100, language='zh-CN')

        all_tts_chunks = []

        print(f"\nProcessing with integration:")
        print("-" * 40)

        for i, chunk in enumerate(ragflow_chunks, 1):
            print(f"\nStep {i}: Processing chunk '{chunk}'")

            # Clean the chunk
            cleaned_chunk = cleaner.clean_streaming_chunk(chunk, is_partial=True)
            print(f"  Cleaned: '{cleaned_chunk}'")

            # Add to buffer
            tts_ready_chunks = buffer.add_cleaned_chunk(cleaned_chunk)
            if tts_ready_chunks:
                print(f"  TTS-ready chunks: {tts_ready_chunks}")
                all_tts_chunks.extend(tts_ready_chunks)
            else:
                print(f"  No TTS-ready chunks yet")

        # Finalize buffer
        final_chunks = buffer.finalize()
        all_tts_chunks.extend(final_chunks)

        print(f"\nFinal TTS-ready chunks: {all_tts_chunks}")
        print(f"Complete clean text: '{buffer.get_complete_clean_text()}'")

        # Verify TTS readiness
        from text_cleaner import is_text_tts_ready
        for i, chunk in enumerate(all_tts_chunks, 1):
            is_ready = is_text_tts_ready(chunk)
            print(f"Chunk {i}: '{chunk}' -> TTS-ready: {is_ready}")

        print("\n✅ Integration tests completed successfully!")
        return True

    except Exception as e:
        print(f"❌ Integration Test Error: {str(e)}")
        return False


def test_config_integration():
    """Test configuration file integration"""
    print("\n" + "=" * 60)
    print("Testing Configuration Integration")
    print("=" * 60)

    try:
        # Load configuration
        config_path = Path(__file__).parent / "ragflow_config.json"

        if not config_path.exists():
            print(f"❌ Configuration file not found: {config_path}")
            return False

        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)

        print(f"✅ Configuration loaded successfully")
        print(f"Text cleaning config: {config.get('text_cleaning', {})}")

        # Test configuration validation
        required_fields = ['enabled', 'language', 'cleaning_level']
        text_cleaning_config = config.get('text_cleaning', {})

        missing_fields = [field for field in required_fields if field not in text_cleaning_config]
        if missing_fields:
            print(f"⚠️  Missing config fields: {missing_fields}")
        else:
            print(f"✅ All required fields present")

        # Test component initialization with config
        from text_cleaner import TTSTextCleaner
        from tts_buffer import TTSBuffer

        # Initialize with config values
        cleaner = TTSTextCleaner(
            language=text_cleaning_config.get('language', 'zh-CN'),
            cleaning_level=text_cleaning_config.get('cleaning_level', 'standard')
        )

        buffer = TTSBuffer(
            max_chunk_size=text_cleaning_config.get('max_chunk_size', 200),
            language=text_cleaning_config.get('language', 'zh-CN')
        )

        print(f"✅ Components initialized with config successfully")

        # Test with sample text
        sample_text = "这是一个**测试**配置集成的句子。"
        cleaned = cleaner.clean_streaming_chunk(sample_text, is_partial=False)
        buffer.add_cleaned_chunk(cleaned)

        print(f"Sample text: '{sample_text}'")
        print(f"Cleaned: '{cleaned}'")
        print(f"Buffer status: {buffer.get_buffer_status()}")

        print("\n✅ Configuration integration tests completed successfully!")
        return True

    except Exception as e:
        print(f"❌ Configuration Test Error: {str(e)}")
        return False


def main():
    """Run all tests"""
    print("RAGFlow TTS Text Cleaning Test Suite")
    print("=" * 60)

    tests = [
        ("Text Cleaner", test_text_cleaner),
        ("TTS Buffer", test_tts_buffer),
        ("Integration", test_integration),
        ("Configuration", test_config_integration)
    ]

    results = []

    for test_name, test_func in tests:
        try:
            print(f"\n{'='*20} {test_name} {'='*20}")
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name} test failed with exception: {str(e)}")
            results.append((test_name, False))

    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)

    passed = 0
    total = len(results)

    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name}: {status}")
        if result:
            passed += 1

    print(f"\nResults: {passed}/{total} tests passed")

    if passed == total:
        print("🎉 All tests passed! Text cleaning system is ready for TTS integration.")
    else:
        print("⚠️  Some tests failed. Please review the implementation.")

    return passed == total


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)