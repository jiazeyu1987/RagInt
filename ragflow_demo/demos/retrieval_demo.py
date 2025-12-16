#!/usr/bin/env python3
"""
RAGFlow Retrieval API Demo
Demonstrates document retrieval and search functionality.
"""

import sys
import os
import json
import yaml
from pathlib import Path

# Add the ragflow_demo root to Python path
sys.path.append(str(Path(__file__).parent.parent))

# Import RAGFlow with graceful fallback
try:
    from ragflow import RAGFlow
except ImportError:
    RAGFlow = None


def load_config():
    """Load configuration from config file."""
    config_path = Path(__file__).parent.parent / "configs" / "config.json"

    if not config_path.exists():
        # Try YAML config
        config_path = config_path.with_suffix('.yaml')

    if not config_path.exists():
        raise FileNotFoundError("Configuration file not found. Please create config.json or config.yaml")

    with open(config_path, 'r', encoding='utf-8') as f:
        if config_path.suffix == '.json':
            return json.load(f)
        else:
            return yaml.safe_load(f)


def basic_retrieval_demo(ragflow_client, kb_id):
    """Basic document retrieval."""
    print("=== Basic Retrieval Demo ===")

    query = "What is RAGFlow?"

    try:
        # Try to use query_kb method or fall back to chat
        if hasattr(ragflow_client, 'query_kb'):
            results = ragflow_client.query_kb(
                kb_id=kb_id,
                query_text=query,
                top_k=5,
                similarity_threshold=0.0
            )

            print(f"Query: {query}")
            print(f"Found {len(results)} results:")
            print()

            for i, result in enumerate(results, 1):
                print(f"Result {i}:")
                print(f"  Score: {result.get('score', 'N/A')}")
                print(f"  Document: {result.get('doc_name', 'N/A')}")
                print(f"  Chunk ID: {result.get('chunk_id', 'N/A')}")
                print(f"  Content: {result.get('content', 'N/A')[:200]}...")
                print()
        else:
            # Use chat functionality for retrieval
            chat = ragflow_client.create_chat(dataset_ids=[kb_id] if kb_id else None)
            response = chat.send_message(query)

            print(f"Query: {query}")
            print(f"Response: {response}")
            print()

    except Exception as e:
        print(f"Error in basic retrieval: {str(e)}")


def similarity_threshold_demo(ragflow_client, kb_id):
    """Retrieval with similarity threshold."""
    print("=== Similarity Threshold Demo ===")

    query = "How to use RAGFlow?"
    thresholds = [0.0, 0.3, 0.5, 0.7]

    for threshold in thresholds:
        try:
            results = ragflow_client.query_kb(
                kb_id=kb_id,
                query_text=query,
                top_k=10,
                similarity_threshold=threshold
            )

            print(f"Threshold {threshold}: Found {len(results)} results")
            for result in results[:3]:  # Show top 3
                print(f"  Score: {result.get('score', 'N/A'):.3f}")
            print()

        except Exception as e:
            print(f"Error with threshold {threshold}: {str(e)}")


def top_k_demo(ragflow_client, kb_id):
    """Retrieval with different top_k values."""
    print("=== Top-K Retrieval Demo ===")

    query = "RAGFlow features"
    top_k_values = [1, 3, 5, 10]

    for k in top_k_values:
        try:
            results = ragflow_client.query_kb(
                kb_id=kb_id,
                query_text=query,
                top_k=k,
                similarity_threshold=0.1
            )

            print(f"Top-{k}: Retrieved {len(results)} results")
            for i, result in enumerate(results, 1):
                print(f"  {i}. Score: {result.get('score', 'N/A'):.3f} - {result.get('content', 'N/A')[:100]}...")
            print()

        except Exception as e:
            print(f"Error with top_k={k}: {str(e)}")


def rerank_demo(ragflow_client, kb_id):
    """Retrieval with and without reranking."""
    print("=== Reranking Demo ===")

    query = "RAGFlow API usage"

    try:
        # Without reranking
        print("Without reranking:")
        results_no_rerank = ragflow_client.query_kb(
            kb_id=kb_id,
            query_text=query,
            top_k=5,
            rerank=False
        )

        for i, result in enumerate(results_no_rerank, 1):
            print(f"  {i}. Score: {result.get('score', 'N/A'):.3f} - {result.get('content', 'N/A')[:80]}...")

        # With reranking
        print("\nWith reranking:")
        results_rerank = ragflow_client.query_kb(
            kb_id=kb_id,
            query_text=query,
            top_k=5,
            rerank=True
        )

        for i, result in enumerate(results_rerank, 1):
            print(f"  {i}. Score: {result.get('score', 'N/A'):.3f} - {result.get('content', 'N/A')[:80]}...")

        print()

    except Exception as e:
        print(f"Error in reranking demo: {str(e)}")


def advanced_retrieval_demo(ragflow_client, kb_id):
    """Advanced retrieval with custom configuration."""
    print("=== Advanced Retrieval Demo ===")

    queries = [
        "What are the main features of RAGFlow?",
        "How to create a knowledge base?",
        "Document processing methods",
        "Vector database integration"
    ]

    retrieval_config = {
        "kb_id": kb_id,
        "similarity_threshold": 0.3,
        "rerank": True,
        "highlight": True,
        "include_metadata": True
    }

    for query in queries:
        try:
            results = ragflow_client.query_kb(
                kb_id=kb_id,
                query_text=query,
                top_k=3,
                retrieval_config=retrieval_config
            )

            print(f"Query: {query}")
            print(f"Results:")

            for i, result in enumerate(results, 1):
                print(f"  {i}. Score: {result.get('score', 'N/A'):.3f}")
                print(f"     Document: {result.get('doc_name', 'N/A')}")
                print(f"     Content: {result.get('content', 'N/A')[:150]}...")

                # Show metadata if available
                metadata = result.get('metadata', {})
                if metadata:
                    print(f"     Metadata: {metadata}")

            print()

        except Exception as e:
            print(f"Error in advanced retrieval: {str(e)}")


def hybrid_search_demo(ragflow_client, kb_id):
    """Hybrid search combining multiple retrieval methods."""
    print("=== Hybrid Search Demo ===")

    query = "RAGFlow installation and setup"

    try:
        # Keyword search
        print("Keyword search:")
        keyword_results = ragflow_client.search_kb(
            kb_id=kb_id,
            query_text=query,
            search_type="keyword",
            top_k=3
        )

        for i, result in enumerate(keyword_results, 1):
            print(f"  {i}. {result.get('content', 'N/A')[:100]}...")

        # Semantic search
        print("\nSemantic search:")
        semantic_results = ragflow_client.search_kb(
            kb_id=kb_id,
            query_text=query,
            search_type="semantic",
            top_k=3
        )

        for i, result in enumerate(semantic_results, 1):
            print(f"  {i}. Score: {result.get('score', 'N/A'):.3f} - {result.get('content', 'N/A')[:100]}...")

        # Hybrid search (if supported)
        print("\nHybrid search:")
        hybrid_results = ragflow_client.search_kb(
            kb_id=kb_id,
            query_text=query,
            search_type="hybrid",
            top_k=3,
            weights={"keyword": 0.3, "semantic": 0.7}
        )

        for i, result in enumerate(hybrid_results, 1):
            print(f"  {i}. Score: {result.get('score', 'N/A'):.3f} - {result.get('content', 'N/A')[:100]}...")

        print()

    except Exception as e:
        print(f"Error in hybrid search: {str(e)}")


def batch_retrieval_demo(ragflow_client, kb_id):
    """Batch retrieval for multiple queries."""
    print("=== Batch Retrieval Demo ===")

    queries = [
        "What is RAGFlow?",
        "Features of RAGFlow",
        "How to upload documents",
        "Vector database support"
    ]

    try:
        batch_results = ragflow_client.batch_query(
            kb_id=kb_id,
            queries=queries,
            top_k=2,
            similarity_threshold=0.2
        )

        for i, (query, results) in enumerate(zip(queries, batch_results), 1):
            print(f"Query {i}: {query}")
            print(f"Results ({len(results)} found):")

            for j, result in enumerate(results, 1):
                print(f"  {j}. Score: {result.get('score', 'N/A'):.3f}")
                print(f"     {result.get('content', 'N/A')[:120]}...")

            print()

    except Exception as e:
        print(f"Error in batch retrieval: {str(e)}")


def query_knowledge_base_demo(knowledge_base):
    """Basic knowledge base query demonstration."""
    print("=== Basic Knowledge Base Query Demo ===")

    queries = [
        "What is RAGFlow?",
        "How to upload documents?",
        "What are the main features?"
    ]

    for query in queries:
        try:
            response = knowledge_base.query(query)
            print(f"Query: {query}")
            print(f"Answer: {response.answer}")
            print(f"Sources ({len(response.sources)} found):")
            for i, source in enumerate(response.sources, 1):
                print(f"  {i}. Document: {source.get('document_name', 'N/A')}")
                print(f"     Document ID: {source.get('document_id', 'N/A')}")
            print()

        except Exception as e:
            print(f"Error querying knowledge base: {str(e)}")


def query_with_different_parameters_demo(knowledge_base):
    """Query with different parameters and approaches."""
    print("=== Query Parameters Demo ===")

    query = "Explain the main purpose of RAGFlow"

    # Simple query
    print("Simple query:")
    try:
        response = knowledge_base.query(query)
        print(f"Answer: {response.answer[:100]}...")
        print(f"Sources: {len(response.sources)} documents")
    except Exception as e:
        print(f"Error: {str(e)}")

    print()

    # More specific query
    print("More specific query:")
    specific_query = "What are the technical requirements for running RAGFlow?"
    try:
        response = knowledge_base.query(specific_query)
        print(f"Query: {specific_query}")
        print(f"Answer: {response.answer[:100]}...")
        print(f"Sources: {len(response.sources)} documents")
    except Exception as e:
        print(f"Error: {str(e)}")

    print()


def query_results_demo(knowledge_base):
    """Demonstrate different types of query results."""
    print("=== Query Results Analysis Demo ===")

    queries = [
        "Installation guide",
        "API documentation",
        "Configuration settings",
        "Best practices"
    ]

    for query in queries:
        try:
            response = knowledge_base.query(query)
            print(f"Query: {query}")
            print(f"Answer length: {len(response.answer)} characters")
            print(f"Number of sources: {len(response.sources)}")

            if response.sources:
                print("Source documents:")
                for source in response.sources:
                    print(f"  - {source.get('document_name', 'Unknown document')}")

            print("-" * 50)

        except Exception as e:
            print(f"Error in query: {str(e)}")

    print()


def main():
    """Main function to run retrieval demos."""
    print("RAGFlow Retrieval API Demo")
    print("=" * 50)

    try:
        # Load configuration
        config = load_config()
        ragflow_config = config.get('ragflow', {})

        # Initialize RAGFlow client with fallback to demo utils
        from demo_utils import get_ragflow_client
        client = get_ragflow_client(ragflow_config)

        print("Connected to RAGFlow successfully!")
        print()

        # Get or create dataset for demo
        if hasattr(client, 'list_datasets'):
            datasets = client.list_datasets()
        else:
            datasets = []

        if not datasets:
            # Create a demo dataset with sample content
            kb = client.create_dataset(
                name="retrieval_demo_dataset",
                description="Demo dataset for retrieval testing"
            )
            print(f"Created demo dataset: {kb.get('name')}")
        else:
            kb = datasets[0]
            print(f"Using existing dataset: {kb.get('name')}")

            # Create and upload a sample document
            sample_file_path = Path(__file__).parent.parent / "data" / "retrieval_sample.txt"
            sample_file_path.parent.mkdir(exist_ok=True)

            with open(sample_file_path, 'w', encoding='utf-8') as f:
                f.write("""
# RAGFlow Retrieval Sample

This document contains information about RAGFlow retrieval capabilities.

## Features
- Semantic search
- Vector similarity
- Document chunking
- Fast retrieval

## Usage
You can query this knowledge base to test retrieval functionality.

## Best Practices
- Use clear, specific questions
- Check the sources provided
- Verify the answers against the original documents
""")

            # Try to upload document
            if hasattr(kb, 'upload_document'):
                document = kb.upload_document(str(sample_file_path))
                document.process()
                print(f"Uploaded sample document: {document.name}")
            else:
                print("Document upload not available in current SDK version")

        kb_id = kb.get('id')
        print(f"Using dataset: {kb.get('name')} (ID: {kb_id})")
        print()

        # Run retrieval demos
        basic_retrieval_demo(client, kb_id)
        similarity_threshold_demo(client, kb_id)

    except Exception as e:
        print(f"Error running retrieval demo: {str(e)}")
        print("Please check your configuration and RAGFlow server status.")


if __name__ == "__main__":
    main()