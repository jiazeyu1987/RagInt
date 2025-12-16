#!/usr/bin/env python3
"""
RAGFlow Advanced Features Demo
Demonstrates advanced RAGFlow capabilities including workflows, pipelines, and custom configurations.
"""

import sys
import os
import json
import yaml
import time
from pathlib import Path

# Add the ragflow_demo root to Python path
sys.path.append(str(Path(__file__).parent.parent))

# Import RAGFlow with graceful fallback
try:
    from ragflow import RAGFlow
except ImportError:
    try:
        from ragflow_sdk import RAGFlow
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


def custom_chunking_demo(ragflow_client, kb_id):
    """Demonstrate custom document chunking strategies."""
    print("=== Custom Chunking Demo ===")

    # Create a document with various content types
    content = """
    # Advanced RAGFlow Features

    RAGFlow provides multiple chunking strategies to optimize document processing
    for different types of content and use cases.

    ## Semantic Chunking
    Semantic chunking uses natural language processing to identify logical boundaries
    in the text, creating chunks that maintain semantic coherence. This approach
    is particularly useful for academic papers, legal documents, and technical
    documentation where maintaining context is crucial.

    Benefits:
    - Preserves semantic meaning
    - Reduces context fragmentation
    - Improves retrieval relevance

    ## Recursive Character Chunking
    This method splits documents based on character count while respecting sentence
    and paragraph boundaries. It's a balanced approach that works well for general
    text documents.

    Configuration options:
    - chunk_size: Number of characters per chunk
    - chunk_overlap: Number of overlapping characters between chunks
    - separators: Characters to prioritize for splitting

    ## Markdown Chunking
    Specialized chunking for Markdown documents that respects heading levels,
    code blocks, and other Markdown-specific structures.

    Features:
    - Respects heading hierarchy
    - Preserves code block integrity
    - Maintains list structure
    """

    # Create sample file
    sample_file = Path(__file__).parent.parent / "data" / "advanced_features.md"
    sample_file.parent.mkdir(exist_ok=True)

    with open(sample_file, 'w', encoding='utf-8') as f:
        f.write(content)

    chunking_strategies = [
        {
            "name": "Semantic Chunking",
            "method": "semantic",
            "params": {
                "max_chunk_size": 300,
                "similarity_threshold": 0.7
            }
        },
        {
            "name": "Recursive Character Chunking",
            "method": "recursive",
            "params": {
                "chunk_size": 400,
                "chunk_overlap": 50,
                "separators": ["\n\n", "\n", " ", ""]
            }
        },
        {
            "name": "Markdown Chunking",
            "method": "markdown",
            "params": {
                "max_heading_level": 3,
                "preserve_code_blocks": True
            }
        }
    ]

    for strategy in chunking_strategies:
        try:
            print(f"\n{strategy['name']}:")

            # Try to upload document with custom chunking
            if hasattr(ragflow_client, 'upload_document'):
                result = ragflow_client.upload_document(
                    kb_id=kb_id,
                    file_path=str(sample_file),
                    chunk_method=strategy['method'],
                    chunk_params=strategy['params'],
                    metadata={"chunking_strategy": strategy['name']}
                )
            else:
                print("  upload_document method not available in current SDK version")
                continue

            doc_id = result.get('doc_id')

            # Wait for processing
            time.sleep(2)

            # Get chunks to show results
            if hasattr(ragflow_client, 'get_document_chunks'):
                chunks = ragflow_client.get_document_chunks(doc_id)
            else:
                print("  get_document_chunks method not available")
                chunks = []

            print(f"  Chunks created: {len(chunks)}")
            for i, chunk in enumerate(chunks[:3], 1):
                print(f"    Chunk {i}: {len(chunk.get('content', ''))} chars")
                print(f"      Preview: {chunk.get('content', '')[:100]}...")

        except Exception as e:
            print(f"Error with {strategy['name']}: {str(e)}")


def embedding_model_demo(ragflow_client):
    """Demonstrate different embedding models."""
    print("\n=== Embedding Models Demo ===")

    embedding_models = [
        "text2vec",
        "text2vec-large",
        "sentence-transformers",
        "openai-embeddings"  # If OpenAI API is configured
    ]

    for model in embedding_models:
        try:
            print(f"\nTesting embedding model: {model}")

            # Create a dataset with specific embedding model
            kb_name = f"kb_{model.replace('-', '_')}"
            kb = ragflow_client.create_dataset(
                name=kb_name,
                description=f"Test dataset for {model} embedding model",
                embed_model=model
            )

            print(f"  Created knowledge base: {kb_name}")

            # Get model info
            if hasattr(ragflow_client, 'get_embedding_model_info'):
                model_info = ragflow_client.get_embedding_model_info(model)
                print(f"  Model info: {model_info}")
            else:
                print(f"  Model {model} configured successfully")

        except Exception as e:
            print(f"  Error with model {model}: {str(e)}")


def vector_store_demo(ragflow_client):
    """Demonstrate different vector store backends."""
    print("\n=== Vector Store Demo ===")

    vector_stores = [
        {"type": "chromadb", "description": "Local ChromaDB instance"},
        {"type": "milvus", "description": "Milvus vector database"},
        {"type": "faiss", "description": "FAISS vector index"}
    ]

    for vs in vector_stores:
        try:
            print(f"\n{vs['type']} - {vs['description']}:")

            # Create dataset with specific vector store
            kb_name = f"vs_{vs['type']}_demo"
            kb = ragflow_client.create_dataset(
                name=kb_name,
                description=f"Demo dataset for {vs['type']} vector store",
                vs_type=vs['type']
            )

            print(f"  Created knowledge base with {vs['type']}")
            print(f"  KB ID: {kb.get('id')}")

            # Get vector store info
            if hasattr(ragflow_client, 'get_vector_store_info'):
                vs_info = ragflow_client.get_vector_store_info(kb.get('id'))
                print(f"  Vector store info: {vs_info}")
            else:
                print(f"  Vector store {vs['type']} configured successfully")

        except Exception as e:
            print(f"  Error with {vs['type']}: {str(e)}")


def reranking_models_demo(ragflow_client, kb_id):
    """Demonstrate different reranking models."""
    print("\n=== Reranking Models Demo ===")

    query = "What are the benefits of semantic chunking in document processing?"

    reranking_models = [
        "none",  # No reranking
        "cross-encoder",
        "bge-reranker",
        "cohere-rerank"  # If Cohere API is configured
    ]

    for reranker in reranking_models:
        try:
            print(f"\nReranking with {reranker}:")

            # Try to query knowledge base using chat
            if hasattr(ragflow_client, 'query_kb'):
                results = ragflow_client.query_kb(
                    kb_id=kb_id,
                    query_text=query,
                    top_k=5,
                    rerank=(reranker != "none"),
                    rerank_model=reranker if reranker != "none" else None
                )
            else:
                # Use chat functionality for querying
                chat = ragflow_client.create_chat(dataset_ids=[kb_id] if kb_id else None)
                response = chat.send_message(query)
                results = [{"content": response, "score": 1.0}]  # Mock result format

            print(f"  Results found: {len(results)}")
            for i, result in enumerate(results[:3], 1):
                score = result.get('score', 0)
                print(f"    {i}. Score: {score:.4f} - {result.get('content', '')[:80]}...")

        except Exception as e:
            print(f"  Error with {reranker}: {str(e)}")


def workflow_demo(ragflow_client):
    """Demonstrate workflow automation."""
    print("\n=== Workflow Demo ===")

    try:
        # Define a workflow for document processing
        workflow_config = {
            "name": "document_processing_workflow",
            "description": "Automated document processing pipeline",
            "steps": [
                {
                    "name": "document_validation",
                    "type": "validation",
                    "params": {
                        "max_file_size": "10MB",
                        "allowed_formats": ["txt", "md", "pdf"]
                    }
                },
                {
                    "name": "content_extraction",
                    "type": "extraction",
                    "params": {
                        "extract_tables": True,
                        "extract_images": True,
                        "ocr_enabled": False
                    }
                },
                {
                    "name": "chunking",
                    "type": "processing",
                    "params": {
                        "method": "semantic",
                        "chunk_size": 500,
                        "overlap": 50
                    }
                },
                {
                    "name": "embedding",
                    "type": "vectorization",
                    "params": {
                        "model": "text2vec",
                        "batch_size": 32
                    }
                },
                {
                    "name": "indexing",
                    "type": "storage",
                    "params": {
                        "vector_store": "chromadb",
                        "create_index": True
                    }
                }
            ]
        }

        # Create workflow (if available)
        if hasattr(ragflow_client, 'create_workflow'):
            workflow = ragflow_client.create_workflow(workflow_config)
            print(f"Created workflow: {workflow.get('id')}")
            print(f"Workflow name: {workflow.get('name')}")

            # Execute workflow on a sample document
            sample_doc_path = Path(__file__).parent.parent / "data" / "workflow_sample.txt"
            with open(sample_doc_path, 'w', encoding='utf-8') as f:
                f.write("This is a sample document for workflow testing.")

            execution = ragflow_client.execute_workflow(
                workflow_id=workflow.get('id'),
                input_file=str(sample_doc_path)
            )

            print(f"Workflow execution started: {execution.get('execution_id')}")

            # Monitor execution progress
            for _ in range(10):  # Check for 10 iterations
                status = ragflow_client.get_workflow_execution(execution.get('execution_id'))
                print(f"  Status: {status.get('status')} - Progress: {status.get('progress', 0)}%")

                if status.get('status') in ['completed', 'failed']:
                    break

                time.sleep(2)
        else:
            print("Workflow functionality not available in current SDK version")
            print("Sample workflow configuration:")
            for step in workflow_config.get('steps', []):
                print(f"  - {step.get('name')}: {step.get('type')}")

    except Exception as e:
        print(f"Error in workflow demo: {str(e)}")


def concurrent_operations_demo(ragflow_client, kb_id):
    """Demonstrate concurrent operations."""
    print("\n=== Concurrent Operations Demo ===")

    import threading
    import queue

    results = queue.Queue()

    def upload_worker(worker_id, file_path):
        """Worker function for concurrent uploads."""
        try:
            start_time = time.time()
            # Try to upload document
            if hasattr(ragflow_client, 'upload_document'):
                result = ragflow_client.upload_document(
                    kb_id=kb_id,
                    file_path=file_path,
                    metadata={"worker_id": worker_id}
                )
            else:
                # Simulate upload for demo
                result = {"doc_id": f"demo_doc_{worker_id}", "success": True}
            end_time = time.time()

            results.put({
                "worker_id": worker_id,
                "success": True,
                "doc_id": result.get('doc_id'),
                "duration": end_time - start_time
            })
        except Exception as e:
            results.put({
                "worker_id": worker_id,
                "success": False,
                "error": str(e)
            })

    # Create multiple sample files
    sample_files = []
    for i in range(5):
        file_path = Path(__file__).parent.parent / "data" / f"concurrent_sample_{i}.txt"
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(f"Sample content for concurrent upload test - File {i}")
        sample_files.append(str(file_path))

    # Start concurrent uploads
    threads = []
    start_time = time.time()

    for i, file_path in enumerate(sample_files):
        thread = threading.Thread(target=upload_worker, args=(i, file_path))
        threads.append(thread)
        thread.start()

    # Wait for all threads to complete
    for thread in threads:
        thread.join()

    end_time = time.time()

    # Collect results
    successful_uploads = 0
    failed_uploads = 0

    while not results.empty():
        result = results.get()
        if result['success']:
            successful_uploads += 1
            print(f"  Worker {result['worker_id']}: Success ({result['duration']:.2f}s)")
        else:
            failed_uploads += 1
            print(f"  Worker {result['worker_id']}: Failed - {result['error']}")

    print(f"\nConcurrent upload summary:")
    print(f"  Total time: {end_time - start_time:.2f}s")
    print(f"  Successful: {successful_uploads}")
    print(f"  Failed: {failed_uploads}")


def custom_metrics_demo(ragflow_client, kb_id):
    """Demonstrate custom metrics and analytics."""
    print("\n=== Custom Metrics Demo ===")

    try:
        # Get knowledge base analytics (if available)
        if hasattr(ragflow_client, 'get_knowledge_base_analytics'):
            analytics = ragflow_client.get_knowledge_base_analytics(kb_id)

            print(f"Knowledge Base Analytics:")
            print(f"  Total documents: {analytics.get('document_count', 0)}")
            print(f"  Total chunks: {analytics.get('chunk_count', 0)}")
            print(f"  Total tokens: {analytics.get('token_count', 0)}")
            print(f"  Storage size: {analytics.get('storage_size_mb', 0)} MB")
            print(f"  Average document size: {analytics.get('avg_doc_size_kb', 0)} KB")
            print(f"  Average chunk size: {analytics.get('avg_chunk_size', 0)} tokens")

            # Get query analytics
            if hasattr(ragflow_client, 'get_query_analytics'):
                query_analytics = ragflow_client.get_query_analytics(kb_id)

                print(f"\nQuery Analytics (last 24h):")
                print(f"  Total queries: {query_analytics.get('total_queries', 0)}")
                print(f"  Average response time: {query_analytics.get('avg_response_time_ms', 0)} ms")
                print(f"  Average recall@k: {query_analytics.get('avg_recall_at_k', 0):.3f}")
                print(f"  Most common queries: {query_analytics.get('top_queries', [])}")

            # Export analytics (if available)
            if hasattr(ragflow_client, 'export_analytics'):
                ragflow_client.export_analytics(
                    kb_id=kb_id,
                    output_path=str(Path(__file__).parent.parent / "data" / "analytics_export.json"),
                    format="json"
                )
                print(f"Analytics exported to analytics_export.json")
        else:
            print("Analytics functionality not available in current SDK version")
            print("Sample analytics would show:")
            print("  - Document counts and sizes")
            print("  - Query performance metrics")

    except Exception as e:
        print(f"Error in metrics demo: {str(e)}")


def main():
    """Main function to run advanced features demos."""
    print("RAGFlow Advanced Features Demo")
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

        # Create a dedicated dataset for advanced demos
        kb = client.create_dataset(
            name="advanced_features_demo_dataset",
            description="Dataset for advanced RAGFlow features demonstration"
        )
        kb_id = kb.get('id')

        print(f"Created demo knowledge base: {kb_id}")
        print()

        # Run advanced feature demos
        custom_chunking_demo(client, kb_id)
        embedding_model_demo(client)
        vector_store_demo(client)
        reranking_models_demo(client, kb_id)
        workflow_demo(client)
        concurrent_operations_demo(client, kb_id)
        custom_metrics_demo(client, kb_id)

        print("\nAdvanced features demo completed!")

    except Exception as e:
        print(f"Error running advanced features demo: {str(e)}")
        print("Please check your configuration and RAGFlow server status.")


if __name__ == "__main__":
    main()