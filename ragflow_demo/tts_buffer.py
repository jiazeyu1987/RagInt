#!/usr/bin/env python3
"""
TTS Buffer for Managing Cleaned Text Chunks
Handles accumulation of streaming text and semantic boundary detection
"""

import time
import re
from typing import List, Optional, Tuple
from collections import deque


class TTSBuffer:
    """
    Buffer for managing cleaned text chunks for TTS processing
    Accumulates text and identifies TTS-ready semantic units
    """

    def __init__(self, max_chunk_size: int = 200, language: str = 'zh-CN'):
        """
        Initialize TTS buffer

        Args:
            max_chunk_size: Maximum size of text chunks (characters)
            language: Target language for semantic processing
        """
        self.max_chunk_size = max_chunk_size
        self.language = language

        # Text accumulation
        self.accumulated_text = ""
        self.current_sentence = ""

        # Semantic chunks storage
        self.tts_chunks = []
        self.sentences = []

        # Timing and metadata
        self.start_time = time.time()
        self.chunk_count = 0

        # Semantic boundary patterns
        self._init_semantic_patterns()

        # Buffer for incomplete text
        self.incomplete_buffer = ""

    def _init_semantic_patterns(self):
        """Initialize patterns for semantic boundary detection"""
        if self.language == 'zh-CN':
            # Chinese sentence boundaries
            self.sentence_boundaries = ['。', '！', '？', '\n\n']
            self.clause_boundaries = ['，', '、', '；', '：', ' ', '\n']
            self.pause_boundaries = ['，', '、', '；', '：', '。', '！', '？', '\n']
        else:
            # English sentence boundaries
            self.sentence_boundaries = ['.', '!', '?', ';', ':', '\n\n']
            self.clause_boundaries = [',', ';', ':', ' ', '-']
            self.pause_boundaries = ['.', '!', '?', '\n']

        # Combine all boundaries
        self.all_boundaries = list(set(self.sentence_boundaries + self.clause_boundaries))

        # Patterns for special handling
        self.special_patterns = {
            # Abbreviations that shouldn't end sentences
            'abbreviations': re.compile(r'\b(?:etc|e\.g|i\.e|vs|Dr|Mr|Mrs|Ms)\b', re.IGNORECASE),

            # Numbers and dates
            'numbers': re.compile(r'\d+[\d,.]*\d*'),

            # Parentheses and quotes
            'parentheses': re.compile(r'[\(\)\[\]{}"\'「」『』《》]'),

            # Technical terms (might affect chunking)
            'technical': re.compile(r'\b[A-Z_]{2,}\b'),
        }

    def add_cleaned_chunk(self, text_chunk: str) -> List[str]:
        """
        Add cleaned text chunk and manage sentence boundaries

        Args:
            text_chunk: Cleaned text chunk from TTSTextCleaner

        Returns:
            List of TTS-ready chunks that are ready for processing
        """
        if not text_chunk.strip():
            return []

        # Add to accumulated text
        self.accumulated_text += text_chunk
        self.current_sentence += text_chunk

        # Check for TTS-ready chunks
        ready_chunks = []

        # Strategy 1: Check for sentence boundaries
        sentence_chunks = self._extract_sentence_chunks()
        ready_chunks.extend(sentence_chunks)

        # Strategy 2: Check if we've exceeded max chunk size
        if len(self.current_sentence) >= self.max_chunk_size:
            size_chunks = self._extract_size_chunks()
            ready_chunks.extend(size_chunks)

        # Strategy 3: Check for natural pauses
        if self._has_natural_pause(text_chunk):
            pause_chunks = self._extract_pause_chunks()
            ready_chunks.extend(pause_chunks)

        self.chunk_count += 1
        return ready_chunks

    def _extract_sentence_chunks(self) -> List[str]:
        """Extract complete sentences from current buffer"""
        chunks: List[str] = []

        while True:
            earliest_idx = None
            chosen_boundary = None
            for boundary in self.sentence_boundaries:
                idx = self.current_sentence.find(boundary)
                if idx >= 0 and (earliest_idx is None or idx < earliest_idx):
                    earliest_idx = idx
                    chosen_boundary = boundary

            if earliest_idx is None or chosen_boundary is None:
                break

            end = earliest_idx + len(chosen_boundary)
            sentence_part = self.current_sentence[:end]
            remainder = self.current_sentence[end:]

            if self._is_meaningful_chunk(sentence_part):
                chunk = sentence_part.strip()
                chunks.append(chunk)
                self.sentences.append(chunk)

            self.current_sentence = remainder.lstrip()

        return chunks

    def _extract_size_chunks(self) -> List[str]:
        """Extract chunks based on maximum size limit"""
        chunks = []

        if len(self.current_sentence) >= self.max_chunk_size:
            # Find the best place to split
            split_pos = self._find_best_split_position(self.current_sentence)

            if split_pos > 0:
                chunk = self.current_sentence[:split_pos].strip()
                if chunk:
                    chunks.append(chunk)
                    self.current_sentence = self.current_sentence[split_pos:].lstrip()

        return chunks

    def _extract_pause_chunks(self) -> List[str]:
        """Extract chunks at natural pause points"""
        chunks: List[str] = []

        earliest_idx = None
        chosen_boundary = None
        for boundary in self.pause_boundaries:
            idx = self.current_sentence.find(boundary)
            if idx >= 0 and (earliest_idx is None or idx < earliest_idx):
                earliest_idx = idx
                chosen_boundary = boundary

        if earliest_idx is None or chosen_boundary is None:
            return chunks

        end = earliest_idx + len(chosen_boundary)
        candidate = self.current_sentence[:end]
        remainder = self.current_sentence[end:]

        if len(candidate.strip()) >= 6 and self._is_meaningful_chunk(candidate):
            chunks.append(candidate.strip())
            self.current_sentence = remainder.lstrip()

        return chunks

    def _find_best_split_position(self, text: str) -> int:
        """Find the best position to split text without breaking words or phrases"""
        if len(text) <= self.max_chunk_size:
            return len(text)

        # Prefer clause boundaries near max_chunk_size (search backward first)
        start = min(len(text) - 1, self.max_chunk_size - 1)
        for i in range(start, max(0, start - 40), -1):
            if text[i] in self.clause_boundaries:
                return i + 1
        # If none found behind, allow small forward scan
        for i in range(self.max_chunk_size, min(len(text), self.max_chunk_size + 20)):
            if text[i - 1] in self.clause_boundaries:
                return i

        # Prefer spaces
        start = min(len(text) - 1, self.max_chunk_size - 1)
        for i in range(start, max(0, start - 40), -1):
            if text[i].isspace():
                return i + 1

        # Fallback: split at max_chunk_size
        return self.max_chunk_size

    def _is_meaningful_chunk(self, text: str) -> bool:
        """
        Check if text chunk is meaningful for TTS

        Args:
            text: Text chunk to check

        Returns:
            True if chunk is meaningful
        """
        # Minimum length check
        if len(text.strip()) < 3:
            return False

        # Avoid chunks that are just punctuation or whitespace
        if not re.search(r'[a-zA-Z\u4e00-\u9fff]', text):
            return False

        # Avoid single characters unless they're complete thoughts
        if len(text.strip()) == 1:
            char = text.strip()
            if char not in ['。', '！', '？', '.', '!', '?']:
                return False

        return True

    def _has_natural_pause(self, text: str) -> bool:
        """Check if text indicates a natural pause point"""
        pause_indicators = self.pause_boundaries + ['\n', '  ', '　　']

        for indicator in pause_indicators:
            if indicator in text:
                return True

        return False

    def get_tts_ready_chunks(self) -> List[str]:
        """
        Return complete semantic units ready for TTS

        Returns:
            List of TTS-ready text chunks
        """
        # Combine chunks from various strategies
        all_chunks = []

        # Add accumulated chunks
        all_chunks.extend(self.tts_chunks)

        # Add sentence chunks
        all_chunks.extend(self.sentences)

        # Add current sentence if it's substantial
        if len(self.current_sentence.strip()) > 10:
            # Check if it's likely complete
            if any(boundary in self.current_sentence for boundary in self.sentence_boundaries):
                all_chunks.append(self.current_sentence.strip())

        # Remove duplicates and clean up
        unique_chunks = []
        seen = set()
        for chunk in all_chunks:
            clean_chunk = chunk.strip()
            if clean_chunk and clean_chunk not in seen and self._is_meaningful_chunk(clean_chunk):
                seen.add(clean_chunk)
                unique_chunks.append(clean_chunk)

        return unique_chunks

    def get_complete_clean_text(self) -> str:
        """Get complete cleaned text"""
        return self.accumulated_text.strip()

    def get_current_sentence(self) -> str:
        """Get current incomplete sentence"""
        return self.current_sentence.strip()

    def finalize(self) -> List[str]:
        """
        Finalize the buffer and return any remaining chunks

        Returns:
            List of any remaining TTS-ready chunks
        """
        final_chunks = []

        # Add any remaining current sentence
        if self.current_sentence.strip():
            final_sentence = self.current_sentence.strip()
            if self._is_meaningful_chunk(final_sentence):
                final_chunks.append(final_sentence)

        return final_chunks

    def force_emit(self, min_chars: int = 10) -> List[str]:
        """
        Force emit current buffered sentence for low-latency TTS.

        This is useful when you want to start TTS as early as possible in streaming mode,
        even if there is no sentence boundary yet.
        """
        try:
            min_chars = int(min_chars)
        except Exception:
            min_chars = 10

        text = self.current_sentence.strip()
        if len(text) < max(3, min_chars):
            return []

        if not self._is_meaningful_chunk(text):
            return []

        split_pos = self._find_force_emit_position(text, min_chars=min_chars)
        if split_pos <= 0:
            return []

        chunk = text[:split_pos].strip()
        remainder = text[split_pos:].lstrip()

        if not self._is_meaningful_chunk(chunk):
            return []

        self.current_sentence = remainder
        return [chunk]

    def _find_force_emit_position(self, text: str, min_chars: int) -> int:
        target_min = max(3, int(min_chars))
        if len(text) <= target_min:
            return len(text)

        limit = min(len(text), self.max_chunk_size)

        for i in range(limit, target_min - 1, -1):
            if text[i - 1] in ['。', '！', '？', '.', '!', '?']:
                return i

        for i in range(limit, target_min - 1, -1):
            if text[i - 1] in ['，', '、', '；', '：', ',', ';', ':']:
                return i

        for i in range(limit, target_min - 1, -1):
            if text[i - 1].isspace():
                return i

        return min(len(text), self._find_best_split_position(text))

    def reset(self):
        """Reset buffer for new conversation"""
        self.accumulated_text = ""
        self.current_sentence = ""
        self.tts_chunks = []
        self.sentences = []
        self.start_time = time.time()
        self.chunk_count = 0
        self.incomplete_buffer = ""

    def get_buffer_status(self) -> dict:
        """Get current buffer status for debugging"""
        return {
            'accumulated_length': len(self.accumulated_text),
            'current_sentence_length': len(self.current_sentence),
            'tts_chunks_count': len(self.tts_chunks),
            'sentences_count': len(self.sentences),
            'chunk_count': self.chunk_count,
            'elapsed_time': time.time() - self.start_time,
            'current_sentence_preview': self.current_sentence[-50:] if self.current_sentence else "",
            'accumulated_preview': self.accumulated_text[-100:] if self.accumulated_text else ""
        }


class SemanticChunker:
    """
    Advanced semantic chunker for more sophisticated text segmentation
    """

    def __init__(self, language: str = 'zh-CN'):
        self.language = language
        self.chunks = []
        self.current_chunk = ""

    def add_text(self, text: str) -> List[str]:
        """Add text and return completed semantic chunks"""
        self.current_chunk += text
        completed_chunks = []

        # Look for semantic boundaries
        boundaries = self._get_semantic_boundaries()

        for boundary in boundaries:
            if boundary in self.current_chunk:
                parts = self.current_chunk.split(boundary)

                for i in range(len(parts) - 1):
                    chunk = parts[i] + boundary
                    if self._is_semantically_complete(chunk):
                        completed_chunks.append(chunk.strip())
                        self.chunks.append(chunk.strip())

                self.current_chunk = parts[-1]

        return completed_chunks

    def _get_semantic_boundaries(self) -> List[str]:
        """Get semantic boundary markers for the language"""
        if self.language == 'zh-CN':
            return ['。', '！', '？', '\n\n', '；', '：', '，', '、']
        else:
            return ['.', '!', '?', '\n\n', ';', ':']

    def _is_semantically_complete(self, text: str) -> bool:
        """Check if text forms a complete semantic unit"""
        # Basic checks
        if len(text.strip()) < 5:
            return False

        # Check for semantic completeness indicators
        if self.language == 'zh-CN':
            complete_indicators = ['。', '！', '？']
        else:
            complete_indicators = ['.', '!', '?']

        # Normalize Chinese punctuation indicators (avoid encoding issues in source literals)
        if self.language == 'zh-CN':
            complete_indicators = ['\u3002', '\uff01', '\uff1f']
        else:
            complete_indicators = ['.', '!', '?']

        return any(indicator in text for indicator in complete_indicators)


if __name__ == "__main__":
    # Test the TTS buffer
    print("TTS Buffer Test:")
    print("=" * 50)

    buffer = TTSBuffer(max_chunk_size=50)

    test_chunks = [
        "这是一个测试。",
        "智能体是指能够",
        "感知环境并利用工具采取行动的",
        "代理。它们具备以下特征：",
        "1. 自主性",
        "2. 交互性",
        "3. 适应性"
    ]

    print("Processing streaming chunks:")
    for i, chunk in enumerate(test_chunks, 1):
        print(f"\nChunk {i}: '{chunk}'")
        ready_chunks = buffer.add_cleaned_chunk(chunk)
        if ready_chunks:
            print(f"TTS-ready: {ready_chunks}")

    print(f"\nFinal buffer status: {buffer.get_buffer_status()}")
    print(f"Final chunks: {buffer.get_tts_ready_chunks()}")

    final_chunks = buffer.finalize()
    if final_chunks:
        print(f"Remaining chunks: {final_chunks}")
