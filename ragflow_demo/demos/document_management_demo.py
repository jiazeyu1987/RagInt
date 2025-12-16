#!/usr/bin/env python3
"""
RAGFlow Document Management API Demo
Demonstrates document upload, processing, and management operations.
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


def create_sample_documents():
    """Create sample documents for upload."""
    data_dir = Path(__file__).parent.parent / "data"
    data_dir.mkdir(exist_ok=True)

    # Create sample text file
    text_content = """
    Understanding Machine Learning

    Machine learning is a subset of artificial intelligence that focuses on the development of
    algorithms and statistical models that enable computer systems to improve their performance
    on a specific task through experience.

    Key Concepts:
    1. Supervised Learning: Learning from labeled training data
    2. Unsupervised Learning: Finding patterns in unlabeled data
    3. Reinforcement Learning: Learning through interaction with an environment

    Applications of machine learning include:
    - Image recognition
    - Natural language processing
    - Recommendation systems
    - Autonomous vehicles
    - Medical diagnosis
    """

    with open(data_dir / "ml_intro.txt", 'w', encoding='utf-8') as f:
        f.write(text_content)

    # Create sample markdown file
    md_content = """
    # Deep Learning Fundamentals

    ## Introduction
    Deep learning is a subset of machine learning that uses neural networks with multiple layers
    to progressively extract higher-level features from raw input.

    ## Neural Network Architecture
    - Input Layer: Receives the raw data
    - Hidden Layers: Process and transform the data
    - Output Layer: Produces the final prediction

    ## Popular Deep Learning Frameworks
    1. **TensorFlow**: Open-source library by Google
    2. **PyTorch**: Open-source library by Facebook
    3. **Keras**: High-level neural network API
    4. **MXNet**: Scalable deep learning framework

    ## Common Applications
    - Computer Vision
    - Natural Language Processing
    - Speech Recognition
    - Game Playing (AlphaGo)
    """

    with open(data_dir / "deep_learning.md", 'w', encoding='utf-8') as f:
        f.write(md_content)

    # Create sample JSON file with structured data
    json_content = {
        "title": "Python Best Practices",
        "version": "1.0",
        "author": "Python Community",
        "practices": [
            {
                "category": "Code Style",
                "items": [
                    "Use PEP 8 style guide",
                    "Write meaningful variable names",
                    "Keep functions short and focused"
                ]
            },
            {
                "category": "Performance",
                "items": [
                    "Use built-in functions when possible",
                    "Avoid unnecessary loops",
                    "Use generators for large datasets"
                ]
            },
            {
                "category": "Security",
                "items": [
                    "Never use eval() with untrusted input",
                    "Use parameterized queries for database access",
                    "Keep dependencies updated"
                ]
            }
        ]
    }

    with open(data_dir / "python_practices.json", 'w', encoding='utf-8') as f:
        json.dump(json_content, f, indent=2, ensure_ascii=False)

    return [
        data_dir / "ml_intro.txt",
        data_dir / "deep_learning.md",
        data_dir / "python_practices.json"
    ]


def upload_single_document_demo(ragflow_client, kb_id, file_path):
    """Upload a single document with metadata."""
    print(f"=== Upload Document Demo: {file_path.name} ===")

    try:
        metadata = {
            "category": "demo",
            "topic": "technology",
            "language": "en",
            "upload_source": "ragflow_demo",
            "description": f"Demo document: {file_path.stem}"
        }

        result = ragflow_client.upload_document(
            kb_id=kb_id,
            file_path=str(file_path),
            metadata=metadata,
            chunk_method="auto"  # Auto-detect chunking method
        )

        print(f"Upload successful!")
        print(f"  Document ID: {result.get('doc_id')}")
        print(f"  Filename: {result.get('filename')}")
        print(f"  Status: {result.get('status')}")
        print(f"  Chunks created: {result.get('chunk_count')}")
        print(f"  File size: {result.get('file_size')} bytes")
        print()

        return result.get('doc_id')

    except Exception as e:
        print(f"Error uploading document {file_path}: {str(e)}")
        return None


def upload_batch_documents_demo(ragflow_client, kb_id, file_paths):
    """Upload multiple documents in batch."""
    print("=== Batch Upload Demo ===")

    uploaded_docs = []

    for file_path in file_paths:
        doc_id = upload_single_document_demo(ragflow_client, kb_id, file_path)
        if doc_id:
            uploaded_docs.append(doc_id)

    print(f"Batch upload completed. {len(uploaded_docs)} documents uploaded successfully.")
    print()
    return uploaded_docs


def document_processing_status_demo(ragflow_client, doc_ids):
    """Check document processing status."""
    print("=== Document Processing Status Demo ===")

    for doc_id in doc_ids:
        try:
            status = ragflow_client.get_document_status(doc_id)

            print(f"Document ID: {doc_id}")
            print(f"  Status: {status.get('status')}")
            print(f"  Progress: {status.get('progress', 'N/A')}%")
            print(f"  Chunks processed: {status.get('processed_chunks', 0)}")
            print(f"  Total chunks: {status.get('total_chunks', 0)}")
            print(f"  Error message: {status.get('error', 'None')}")
            print()

        except Exception as e:
            print(f"Error checking status for document {doc_id}: {str(e)}")


def wait_for_processing_demo(ragflow_client, doc_ids, timeout=60):
    """Wait for document processing to complete."""
    print("=== Wait for Processing Demo ===")

    start_time = time.time()

    while time.time() - start_time < timeout:
        all_complete = True

        for doc_id in doc_ids:
            try:
                status = ragflow_client.get_document_status(doc_id)
                doc_status = status.get('status')

                if doc_status in ['processing', 'pending']:
                    all_complete = False
                    print(f"Document {doc_id} still processing... ({status.get('progress', 0)}%)")

                elif doc_status == 'error':
                    print(f"Document {doc_id} failed to process: {status.get('error')}")
                    all_complete = False

            except Exception as e:
                print(f"Error checking document {doc_id}: {str(e)}")
                all_complete = False

        if all_complete:
            print("All documents processed successfully!")
            break

        time.sleep(5)

    if time.time() - start_time >= timeout:
        print("Timeout reached while waiting for document processing.")


def document_list_demo(ragflow_client, kb_id):
    """List and filter documents."""
    print("=== Document List Demo ===")

    try:
        # List all documents
        all_docs = ragflow_client.list_documents(kb_id)
        print(f"Total documents in KB {kb_id}: {len(all_docs)}")

        # Show document details
        for doc in all_docs:
            print(f"\nDocument: {doc.get('filename')}")
            print(f"  ID: {doc.get('id')}")
            print(f"  Status: {doc.get('status')}")
            print(f"  Size: {doc.get('file_size')} bytes")
            print(f"  Chunks: {doc.get('chunk_count')}")
            print(f"  Created: {doc.get('created_at')}")
            print(f"  Metadata: {doc.get('metadata', {})}")

        # Filter by status
        print("\n--- Filtered Documents ---")
        processed_docs = ragflow_client.list_documents(kb_id, status="processed")
        print(f"Processed documents: {len(processed_docs)}")

        # Filter by metadata
        tech_docs = ragflow_client.list_documents(
            kb_id,
            metadata_filter={"category": "demo", "topic": "technology"}
        )
        print(f"Technology demo documents: {len(tech_docs)}")

    except Exception as e:
        print(f"Error listing documents: {str(e)}")


def document_retrieval_demo(ragflow_client, kb_id):
    """Retrieve specific documents and their chunks."""
    print("=== Document Retrieval Demo ===")

    try:
        documents = ragflow_client.list_documents(kb_id)

        for doc in documents[:2]:  # Show first 2 documents
            print(f"\nRetrieving details for: {doc.get('filename')}")

            # Get document details
            doc_details = ragflow_client.get_document(doc.get('id'))
            print(f"  Full metadata: {doc_details.get('metadata', {})}")
            print(f"  Processing details: {doc_details.get('processing_info', {})}")

            # Get document chunks
            chunks = ragflow_client.get_document_chunks(doc.get('id'))
            print(f"  Total chunks: {len(chunks)}")

            for i, chunk in enumerate(chunks[:3], 1):  # Show first 3 chunks
                print(f"    Chunk {i}:")
                print(f"      ID: {chunk.get('id')}")
                print(f"      Content: {chunk.get('content', '')[:100]}...")
                print(f"      Vector ID: {chunk.get('vector_id', 'N/A')}")

    except Exception as e:
        print(f"Error retrieving documents: {str(e)}")


def document_update_demo(ragflow_client, kb_id, doc_id):
    """Update document metadata."""
    print("=== Document Update Demo ===")

    try:
        # Update metadata
        new_metadata = {
            "category": "updated_demo",
            "topic": "machine learning",
            "language": "en",
            "version": "2.0",
            "last_updated": time.strftime("%Y-%m-%d %H:%M:%S")
        }

        updated_doc = ragflow_client.update_document(
            doc_id=doc_id,
            metadata=new_metadata
        )

        print(f"Document updated successfully!")
        print(f"  New metadata: {updated_doc.get('metadata', {})}")

    except Exception as e:
        print(f"Error updating document: {str(e)}")


def document_delete_demo(ragflow_client, doc_id):
    """Delete a document."""
    print("=== Document Delete Demo ===")

    try:
        result = ragflow_client.delete_document(doc_id)

        if result:
            print(f"Document {doc_id} deleted successfully!")
        else:
            print(f"Failed to delete document {doc_id}")

    except Exception as e:
        print(f"Error deleting document: {str(e)}")


def main():
    """Main function to run document management demos."""
    print("RAGFlow Document Management API Demo")
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

        # Get or create knowledge base
        kbs = client.list_datasets()
        demo_kb = None

        # Look for existing demo knowledge base
        for kb in kbs:
            if 'demo' in kb.get('name', '').lower():
                demo_kb = kb
                break

        if not demo_kb:
            # Create a new knowledge base for demo
            demo_kb = client.create_kb(
                kb_name="document_demo_kb",
                description="Knowledge base for document management demo"
            )

        kb_id = demo_kb.get('id')
        print(f"Using knowledge base: {demo_kb.get('name')} (ID: {kb_id})")
        print()

        # Create sample documents
        print("Creating sample documents...")
        sample_files = create_sample_documents()
        print(f"Created {len(sample_files)} sample documents")
        print()

        # Upload documents
        uploaded_doc_ids = upload_batch_documents_demo(client, kb_id, sample_files)

        if uploaded_doc_ids:
            # Check processing status
            document_processing_status_demo(client, uploaded_doc_ids)

            # Wait for processing
            wait_for_processing_demo(client, uploaded_doc_ids)

            # List documents
            document_list_demo(client, kb_id)

            # Retrieve document details
            document_retrieval_demo(client, kb_id)

            # Update a document
            if uploaded_doc_ids:
                document_update_demo(client, kb_id, uploaded_doc_ids[0])

        print("Document management demo completed!")

    except Exception as e:
        print(f"Error running document management demo: {str(e)}")
        print("Please check your configuration and RAGFlow server status.")


if __name__ == "__main__":
    main()