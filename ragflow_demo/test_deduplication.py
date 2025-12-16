#!/usr/bin/env python3
"""
Test deduplication functionality
"""

from optimized_streaming_chat import ContentDeduplicator

def test_deduplication():
    """Test the deduplication logic"""
    deduplicator = ContentDeduplicator()

    # Simulate RAGFlow streaming chunks with overlapping content
    chunks = [
        "Hello!",
        "Hello! How are you?",
        "Hello! How are you today?",
        "Hello! How are you today? I'm here to help.",
        "Hello! How are you today? I'm here to help. What can I do for you?"
    ]

    print("Testing Content Deduplication:")
    print("=" * 40)

    for i, chunk in enumerate(chunks, 1):
        print(f"Chunk {i}: '{chunk}'")

        # Get unique content
        new_content = deduplicator.get_unique_content(chunk)

        if new_content:
            print(f"  New content: '{new_content}'")
        else:
            print("  No new content (duplicate)")

        # Update tracking
        deduplicator.update_tracking(chunk)
        print()

    print("Final output would be:")
    print("-" * 20)
    final_output = ""
    for chunk in chunks:
        new_content = deduplicator.get_unique_content(chunk)
        if new_content:
            final_output += new_content
    print(f"'{final_output}'")

if __name__ == "__main__":
    test_deduplication()