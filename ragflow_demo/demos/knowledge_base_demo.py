#!/usr/bin/env python3
"""
RAGFlow Knowledge Base API Demo
Demonstrates knowledge base management operations.
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
    from ragflow_sdk import RAGFlow
except ImportError:
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


def create_knowledge_base_demo(ragflow_client, kb_config):
    """Create a new knowledge base (dataset)."""
    print("=== Create Knowledge Base Demo ===")

    kb_name = "demo_knowledge_base"
    description = "A demo knowledge base for RAGFlow API testing"

    try:
        # Try dataset methods first
        if hasattr(ragflow_client, 'create_dataset'):
            dataset = ragflow_client.create_dataset(
                name=kb_name,
                description=description
            )
            print(f"Dataset created successfully!")
            print(f"Dataset ID: {dataset.get('id')}")
            print(f"Dataset Name: {dataset.get('name')}")
            print(f"Description: {dataset.get('description')}")
            print()
            return dataset
        # Fall back to knowledge base methods
        elif hasattr(ragflow_client, 'create_knowledge_base'):
            kb = ragflow_client.create_knowledge_base(
                name=kb_name,
                description=description
            )
            print(f"Knowledge base created successfully!")
            print(f"Knowledge Base ID: {kb.id}")
            print(f"Knowledge Base Name: {kb.name}")
            print(f"Description: {kb.description}")
            print()
            return kb
        else:
            print("No create method found available")
            return None

    except Exception as e:
        print(f"Error creating knowledge base: {str(e)}")
        return None


def list_knowledge_bases_demo(ragflow_client):
    """List all knowledge bases (datasets)."""
    print("=== List Knowledge Bases Demo ===")

    try:
        # Try dataset methods first
        if hasattr(ragflow_client, 'list_datasets'):
            datasets = ragflow_client.list_datasets()
            print(f"Found {len(datasets)} datasets:")
            for dataset in datasets:
                print(f"  - ID: {dataset.get('id')}")
                print(f"    Name: {dataset.get('name')}")
                print(f"    Description: {dataset.get('description', 'N/A')}")
                print()
        # Fall back to knowledge base methods
        elif hasattr(ragflow_client, 'list_knowledge_bases'):
            kbs = ragflow_client.list_knowledge_bases()
            print(f"Found {len(kbs)} knowledge bases:")
            for kb in kbs:
                print(f"  - ID: {kb.id}")
                print(f"    Name: {kb.name}")
                print(f"    Description: {kb.description}")
                print()
        else:
            print("No list method found available")

    except Exception as e:
        print(f"Error listing knowledge bases: {str(e)}")


def get_knowledge_base_demo(ragflow_client, kb_id):
    """Get knowledge base details."""
    print("=== Get Knowledge Base Demo ===")

    try:
        kb = ragflow_client.get_knowledge_base(kb_id)

        print(f"Knowledge Base Details:")
        print(f"  ID: {kb.get('id')}")
        print(f"  Name: {kb.get('name')}")
        print(f"  Description: {kb.get('description')}")
        print(f"  Vector Store Type: {kb.get('vs_type')}")
        print(f"  Embedding Model: {kb.get('embed_model')}")
        print(f"  Document Count: {kb.get('doc_count')}")
        print(f"  Status: {kb.get('status')}")
        print(f"  Created: {kb.get('created_at')}")
        print(f"  Updated: {kb.get('updated_at')}")
        print()

    except Exception as e:
        print(f"Error getting knowledge base: {str(e)}")


def update_knowledge_base_demo(ragflow_client, kb_id):
    """Update knowledge base information."""
    print("=== Update Knowledge Base Demo ===")

    try:
        # Update with new description
        updated_kb = ragflow_client.update_knowledge_base(
            kb_id=kb_id,
            description="Updated knowledge base description",
            embed_model="text2vec-large"  # Try to update embedding model
        )

        print(f"Knowledge base updated successfully!")
        print(f"New Description: {updated_kb.get('description')}")
        print(f"New Embed Model: {updated_kb.get('embed_model')}")
        print()

    except Exception as e:
        print(f"Error updating knowledge base: {str(e)}")


def delete_knowledge_base_demo(ragflow_client, kb_id):
    """Delete a knowledge base."""
    print("=== Delete Knowledge Base Demo ===")

    try:
        result = ragflow_client.delete_knowledge_base(kb_id)

        if result:
            print(f"Knowledge base {kb_id} deleted successfully!")
        else:
            print(f"Failed to delete knowledge base {kb_id}")
        print()

    except Exception as e:
        print(f"Error deleting knowledge base: {str(e)}")


def upload_document_demo(ragflow_client, knowledge_base):
    """Upload documents to knowledge base."""
    print("=== Upload Document Demo ===")

    # Create a sample document for upload
    sample_text = """
    # Sample Document for RAGFlow Demo

    This is a sample document to demonstrate the document upload functionality in RAGFlow.

    ## Introduction
    RAGFlow is a powerful retrieval-augmented generation framework that allows you to build
    sophisticated question-answering systems.

    ## Features
    - Knowledge base management
    - Document processing and chunking
    - Vector similarity search
    - LLM integration
    - RESTful API

    ## Usage
    You can use RAGFlow to:
    1. Create knowledge bases
    2. Upload and process documents
    3. Query your knowledge bases
    4. Build conversational AI applications

    ## Conclusion
    RAGFlow provides a comprehensive solution for building RAG-based applications.
    """

    # Create sample file
    sample_file_path = Path(__file__).parent.parent / "data" / "sample_document.md"
    sample_file_path.parent.mkdir(exist_ok=True)

    with open(sample_file_path, 'w', encoding='utf-8') as f:
        f.write(sample_text)

    try:
        # Upload document through knowledge base object using official API
        document = knowledge_base.upload_document(
            file_path=str(sample_file_path)
        )

        print(f"Document uploaded successfully!")
        print(f"Document ID: {document.id}")
        print(f"Filename: {document.name}")
        print(f"Status: {document.status}")

        # Process the document
        document.process()
        print("Document processing completed!")

        print()

    except Exception as e:
        print(f"Error uploading document: {str(e)}")


def list_documents_demo(ragflow_client, kb_id):
    """List documents in a knowledge base."""
    print("=== List Documents Demo ===")

    try:
        documents = ragflow_client.list_documents(kb_id)

        print(f"Found {len(documents)} documents in knowledge base {kb_id}:")
        for doc in documents:
            print(f"  - Document ID: {doc.get('id')}")
            print(f"    Filename: {doc.get('filename')}")
            print(f"    Title: {doc.get('metadata', {}).get('title', 'N/A')}")
            print(f"    Status: {doc.get('status')}")
            print(f"    Chunk Count: {doc.get('chunk_count', 0)}")
            print(f"    Uploaded: {doc.get('created_at')}")
            print()

    except Exception as e:
        print(f"Error listing documents: {str(e)}")


def main():
    """Main function to run knowledge base demos."""
    print("RAGFlow Knowledge Base API Demo")
    print("=" * 50)

    try:
        # Load configuration
        config = load_config()
        ragflow_config = config.get('ragflow', {})
        kb_config = config.get('knowledge_base', {})

        # Initialize RAGFlow client
        from demo_utils import get_ragflow_client

        # Use configuration directly (no hardcoded values)
        client = get_ragflow_client(ragflow_config)

        print("Connected to RAGFlow successfully!")
        print()

        # Run demos
        # 1. List existing knowledge bases
        list_knowledge_bases_demo(client)

        # 2. Create a new knowledge base
        kb = create_knowledge_base_demo(client, kb_config)

        if kb:
            # 3. Upload a document
            upload_document_demo(client, kb)

    except Exception as e:
        print(f"Error running knowledge base demo: {str(e)}")
        print("Please check your configuration and RAGFlow server status.")


if __name__ == "__main__":
    main()