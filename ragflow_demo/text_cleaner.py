#!/usr/bin/env python3
"""
TTS-Ready Text Cleaner for RAGFlow Streaming Responses
Optimized for real-time text cleaning to prepare for TTS integration
"""

import re
from typing import Optional, List


class TTSTextCleaner:
    """
    Real-time text cleaner optimized for TTS integration
    Handles streaming text cleaning while preserving semantic meaning
    """

    def __init__(self, language='zh-CN', cleaning_level='standard'):
        """
        Initialize TTS text cleaner

        Args:
            language: Target language (default: zh-CN for Chinese)
            cleaning_level: Cleaning intensity ('basic', 'standard', 'aggressive')
        """
        self.language = language
        self.cleaning_level = cleaning_level

        # Pre-compiled regex patterns for performance
        self._init_markdown_patterns()
        self._init_punctuation_mappings()
        self._init_special_char_patterns()

        # Streaming context tracking
        self.buffer = ""
        self.incomplete_tags = []

    def _init_markdown_patterns(self):
        """Initialize pre-compiled regex patterns for markdown cleaning"""
        self.markdown_patterns = {
            # Bold text: **text** or __text__
            'bold': [
                re.compile(r'\*\*(.*?)\*\*'),
                re.compile(r'__(.*?)__')
            ],

            # Italic text: *text* or _text_
            'italic': [
                re.compile(r'\*(.*?)\*'),
                re.compile(r'_(.*?)_')
            ],

            # Inline code: `code`
            'code_inline': re.compile(r'`([^`]+)`'),

            # Code blocks: ```language ... ```
            'code_block': re.compile(r'```[\w]*\n.*?\n```', re.DOTALL),

            # Links: [text](url)
            'links': re.compile(r'\[([^\]]+)\]\([^\)]+\)'),

            # Headers: # ## ###
            'headers': re.compile(r'^#{1,6}\s+', re.MULTILINE),

            # Lists: 1. item, - item, * item
            'lists': [
                re.compile(r'^\s*\d+\.\s+', re.MULTILINE),  # Numbered lists
                re.compile(r'^\s*[-*+]\s+', re.MULTILINE)   # Bullet lists
            ],

            # Blockquotes: > text
            'blockquote': re.compile(r'^>\s+', re.MULTILINE),

            # Horizontal rules: --- or ***
            'hr': re.compile(r'^[-*_]{3,}\s*$', re.MULTILINE),

            # Tables: |col1|col2|
            'tables': re.compile(r'\|.*?\|', re.MULTILINE)
        }

    def _init_punctuation_mappings(self):
        """Initialize Chinese punctuation to TTS-friendly mappings"""
        self.punctuation_mappings = {
            # Full-width to half-width
            '：': ':',  # Colon
            '，': ',',  # Comma
            '。': '.',  # Period
            '！': '!',  # Exclamation mark
            '？': '?',  # Question mark
            '；': ';',  # Semicolon
            '（': '(',  # Left parenthesis
            '）': ')',  # Right parenthesis
            '【': '[',  # Left square bracket
            '】': ']',  # Right square bracket
            '"': '"',   # Left double quote
            '"': '"',   # Right double quote
            ''': "'",   # Left single quote
            ''': "'",   # Right single quote
            '《': '<',  # Left angle bracket (book title)
            '》': '>',  # Right angle bracket (book title)
        }

        # Additional Chinese-specific patterns
        self.chinese_patterns = {
            # Multiple spaces to single space
            'multiple_spaces': re.compile(r'[　\s]{2,}'),

            # Mixed punctuation cleanup
            'mixed_punctuation': re.compile(r'([,.!?;:])\s*([,.!?;:])'),

            # Number patterns in Chinese context
            'chinese_numbers': re.compile(r'[一二三四五六七八九十百千万亿]+'),
        }

    def _init_special_char_patterns(self):
        """Initialize patterns for special character cleaning"""
        self.special_patterns = {
            # Emojis and unicode symbols
            'emojis': re.compile(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF]'),

            # Citation references
            'citations': re.compile(r'\[\d+\]|\[source\]|\[来源\]'),

            # HTML/XML tags
            'html_tags': re.compile(r'<[^>]+>'),

            # Control characters
            'control_chars': re.compile(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'),

            # Technical notations that might confuse TTS
            'technical_refs': re.compile(r'\b[A-Z_]{2,}\b'),  # ALL_CAPS identifiers
        }

    def clean_streaming_chunk(self, chunk_text: str, is_partial: bool = True) -> str:
        """
        Clean a text chunk in real-time, handling partial text gracefully

        Args:
            chunk_text: The text chunk to clean
            is_partial: Whether this is a partial streaming chunk

        Returns:
            Cleaned text ready for TTS
        """
        if not chunk_text:
            return ""

        # Add to buffer for context
        if is_partial:
            self.buffer += chunk_text
            text_to_clean = self.buffer
        else:
            self.buffer = chunk_text
            text_to_clean = chunk_text

        # Apply cleaning based on cleaning level
        if self.cleaning_level == 'basic':
            cleaned = self._basic_cleaning(text_to_clean)
        elif self.cleaning_level == 'standard':
            cleaned = self._standard_cleaning(text_to_clean)
        else:  # aggressive
            cleaned = self._aggressive_cleaning(text_to_clean)

        # If this is a partial chunk, only return new cleaned content
        if is_partial:
            # Find what's new in this chunk
            new_cleaned = self._extract_new_content(cleaned, chunk_text)
            return new_cleaned
        else:
            self.buffer = ""
            return cleaned

    def _basic_cleaning(self, text: str) -> str:
        """Basic level cleaning - removes most problematic formatting"""
        cleaned = text

        # Remove bold/italic markers
        for pattern in self.markdown_patterns['bold']:
            cleaned = pattern.sub(r'\1', cleaned)
        for pattern in self.markdown_patterns['italic']:
            cleaned = pattern.sub(r'\1', cleaned)

        # Remove inline code markers but keep code content
        cleaned = self.markdown_patterns['code_inline'].sub(r'\1', cleaned)

        # Remove simple lists and headers
        for pattern in self.markdown_patterns['lists']:
            cleaned = pattern.sub('', cleaned)
        cleaned = self.markdown_patterns['headers'].sub('', cleaned)

        # Normalize Chinese punctuation
        cleaned = self._normalize_chinese_punctuation(cleaned)

        return cleaned

    def _standard_cleaning(self, text: str) -> str:
        """Standard level cleaning - comprehensive format removal"""
        cleaned = self._basic_cleaning(text)

        # Remove code blocks (replace with placeholder)
        cleaned = self.markdown_patterns['code_block'].sub('[代码内容]', cleaned)

        # Remove links but keep text
        cleaned = self.markdown_patterns['links'].sub(r'\1', cleaned)

        # Remove blockquotes and horizontal rules
        cleaned = self.markdown_patterns['blockquote'].sub('', cleaned)
        cleaned = self.markdown_patterns['hr'].sub('', cleaned)

        # Handle tables (remove table formatting)
        cleaned = self.markdown_patterns['tables'].sub(lambda m: ' '.join(m.group(0).split('|')), cleaned)

        # Remove citations
        cleaned = self.special_patterns['citations'].sub('', cleaned)

        # Remove control characters
        cleaned = self.special_patterns['control_chars'].sub('', cleaned)

        # Clean up multiple spaces
        cleaned = self.chinese_patterns['multiple_spaces'].sub(' ', cleaned)

        return cleaned.strip()

    def _aggressive_cleaning(self, text: str) -> str:
        """Aggressive level cleaning - removes all formatting issues"""
        cleaned = self._standard_cleaning(text)

        # Remove emojis and unicode symbols
        cleaned = self.special_patterns['emojis'].sub('', cleaned)

        # Remove HTML/XML tags
        cleaned = self.special_patterns['html_tags'].sub('', cleaned)

        # Remove or replace technical references
        if self.language == 'zh-CN':
            # For Chinese, keep technical terms but format them properly
            cleaned = self.special_patterns['technical_refs'].sub(
                lambda m: ' ' + m.group(0).lower() + ' ', cleaned
            )
        else:
            cleaned = self.special_patterns['technical_refs'].sub('', cleaned)

        # Remove any remaining special characters
        cleaned = re.sub(r'[^\w\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef.,!?;:()[\]{}"-]', ' ', cleaned)

        # Final cleanup of multiple spaces
        cleaned = re.sub(r'\s+', ' ', cleaned)

        return cleaned.strip()

    def _normalize_chinese_punctuation(self, text: str) -> str:
        """Convert Chinese punctuation to TTS-friendly format"""
        # Map Chinese punctuation to standard equivalents
        for chinese_char, standard_char in self.punctuation_mappings.items():
            text = text.replace(chinese_char, standard_char)

        # Clean up mixed punctuation
        text = self.chinese_patterns['mixed_punctuation'].sub(r'\1', text)

        # Add spaces after Chinese punctuation for better TTS flow
        text = re.sub(r'([,.!?;:])', r'\1 ', text)

        return text

    def _extract_new_content(self, cleaned_full: str, original_chunk: str) -> str:
        """
        Extract only the new cleaned content from a streaming chunk

        Args:
            cleaned_full: Full cleaned text including buffer
            original_chunk: Original streaming chunk

        Returns:
            New cleaned content that should be output now
        """
        if not hasattr(self, 'last_cleaned_length'):
            self.last_cleaned_length = 0

        # Calculate new cleaned content
        if len(cleaned_full) > self.last_cleaned_length:
            new_content = cleaned_full[self.last_cleaned_length:]
            self.last_cleaned_length = len(cleaned_full)
            return new_content

        return ""

    def reset_buffer(self):
        """Reset the internal buffer for new conversation"""
        self.buffer = ""
        if hasattr(self, 'last_cleaned_length'):
            self.last_cleaned_length = 0
        self.incomplete_tags = []

    def get_buffer_status(self) -> dict:
        """Get current buffer status for debugging"""
        return {
            'buffer_length': len(self.buffer),
            'last_cleaned_length': getattr(self, 'last_cleaned_length', 0),
            'incomplete_tags_count': len(self.incomplete_tags),
            'buffer_preview': self.buffer[-50:] if self.buffer else ""
        }


# Convenience functions for quick usage
def quick_clean_text(text: str, level: str = 'standard') -> str:
    """
    Quick text cleaning function for one-off cleaning

    Args:
        text: Text to clean
        level: Cleaning level ('basic', 'standard', 'aggressive')

    Returns:
        Cleaned text
    """
    cleaner = TTSTextCleaner(cleaning_level=level)
    return cleaner.clean_streaming_chunk(text, is_partial=False)


def is_text_tts_ready(text: str) -> bool:
    """
    Check if text is ready for TTS (no problematic formatting)

    Args:
        text: Text to check

    Returns:
        True if text is TTS-ready
    """
    # Quick check for common problematic patterns
    problematic_patterns = [
        r'\*\*.*?\*\*',  # Bold markdown
        r'```.*?```',    # Code blocks
        r'\[.*?\]\(.*?\)',  # Links
        r'[\u1F600-\u1F64F]',  # Emojis
        r'<[^>]+>',      # HTML tags
    ]

    for pattern in problematic_patterns:
        if re.search(pattern, text, re.DOTALL):
            return False

    return True


if __name__ == "__main__":
    # Test examples
    test_texts = [
        "这是一个**重要**的概念，需要`特别注意`。",
        "1. 第一点：**核心功能**\n2. 第二点：主要特性",
        "请访问[RAGFlow官网](https://ragflow.io)了解更多。",
        "智能体具备以下能力：\n```python\ndef agent_think():\n    return '思考中'\n```"
    ]

    print("TTS Text Cleaning Test:")
    print("=" * 50)

    for i, text in enumerate(test_texts, 1):
        print(f"\nTest {i}:")
        print(f"Original: {text}")

        for level in ['basic', 'standard', 'aggressive']:
            cleaned = quick_clean_text(text, level)
            print(f"{level.capitalize()}: {cleaned}")

        print(f"TTS-Ready: {is_text_tts_ready(text)}")
        print("-" * 30)