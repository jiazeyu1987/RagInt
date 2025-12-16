#!/usr/bin/env python3
"""
Demo utilities for RAGFlow demonstrations
Provides mock implementations when RAGFlow server is not available
"""

import json
import time
import random
from typing import Dict, Any, List, Optional


class MockRAGFlow:
    """Mock RAGFlow client for demonstration purposes"""

    def __init__(self, api_key: str, base_url: str, version: str = "v1"):
        self.api_key = api_key
        self.base_url = base_url
        self.version = version
        self.datasets = []

    def create_dataset(self, name: str, description: str = None) -> 'MockDataset':
        """Mock create dataset"""
        dataset_id = f"dataset_{len(self.datasets) + 1}"
        dataset = MockDataset(dataset_id, name, description, self)
        self.datasets.append(dataset)
        return dataset

    def list_datasets(self) -> List['MockDataset']:
        """Mock list datasets"""
        return self.datasets

    def get_dataset(self, dataset_id: str) -> 'MockDataset':
        """Mock get dataset"""
        for dataset in self.datasets:
            if dataset.id == dataset_id:
                return dataset
        return None

    def delete_dataset(self, dataset_id: str) -> bool:
        """Mock delete dataset"""
        self.datasets = [ds for ds in self.datasets if ds.id != dataset_id]
        return True

    # 为了向后兼容，保留 knowledge_base 方法
    def create_knowledge_base(self, name: str, description: str = None) -> 'MockDataset':
        """Mock create knowledge base (alias for create_dataset)"""
        return self.create_dataset(name, description)

    def list_knowledge_bases(self) -> List['MockDataset']:
        """Mock list knowledge bases (alias for list_datasets)"""
        return self.datasets

    def get_knowledge_base(self, knowledge_base_id: str) -> 'MockDataset':
        """Mock get knowledge base (alias for get_dataset)"""
        return self.get_dataset(knowledge_base_id)

    def delete_knowledge_base(self, knowledge_base_id: str) -> bool:
        """Mock delete knowledge base (alias for delete_dataset)"""
        return self.delete_dataset(knowledge_base_id)


class MockDataset:
    """Mock Dataset object"""

    def __init__(self, dataset_id: str, name: str, description: str, client):
        self.id = dataset_id
        self.name = name
        self.description = description or ""
        self.client = client
        self.documents = []

    def upload_document(self, file_path: str) -> 'MockDocument':
        """Mock upload document"""
        doc_id = f"doc_{len(self.documents) + 1}"
        doc = MockDocument(doc_id, file_path.split("/")[-1], self)
        self.documents.append(doc)
        return doc

    def list_documents(self) -> List['MockDocument']:
        """Mock list documents"""
        return self.documents

    def get_document(self, document_id: str) -> 'MockDocument':
        """Mock get document"""
        for doc in self.documents:
            if doc.id == document_id:
                return doc
        return None

    def delete_document(self, document_id: str) -> bool:
        """Mock delete document"""
        self.documents = [doc for doc in self.documents if doc.id != document_id]
        return True

    def query(self, question: str) -> 'MockQueryResponse':
        """Mock query knowledge base"""
        return MockQueryResponse(
            answer=f"This is a mock answer for: {question}",
            sources=[
                {"document_id": doc.id, "document_name": doc.name}
                for doc in self.documents[:3]
            ]
        )

    def search(self, query: str) -> List[Dict[str, Any]]:
        """Mock search documents"""
        results = []
        for doc in self.documents:
            results.append({
                "content": f"Mock content for {doc.name} related to: {query}",
                "source": doc.name,
                "score": random.uniform(0.7, 1.0)
            })
        return results

    def chat(self, message: str) -> str:
        """Mock chat with documents"""
        if not self.documents:
            return "No documents available. Please upload some documents first."
        return f"This is a mock response to: {message}. Based on {len(self.documents)} documents in this dataset."


class MockDocument:
    """Mock Document object"""

    def __init__(self, doc_id: str, name: str, dataset):
        self.id = doc_id
        self.name = name
        self.dataset = dataset
        self.status = "completed"

    def process(self) -> bool:
        """Mock process document"""
        return True


class MockQueryResponse:
    """Mock Query Response object"""

    def __init__(self, answer: str, sources: List[Dict[str, Any]]):
        self.answer = answer
        self.sources = sources


def get_ragflow_client(config: Dict[str, Any], use_mock: bool = False) -> Any:
    """Get RAGFlow client (real or mock)"""
    if use_mock:
        return MockRAGFlow(**config)

    try:
        # Try RAGFlow SDK
        from ragflow_sdk import RAGFlow
        return RAGFlow(**config)
    except ImportError:
        try:
            # Try older import patterns
            from ragflow import RAGFlow
            return RAGFlow(**config)
        except ImportError:
            try:
                import ragflow
                return ragflow.RAGFlow(**config)
            except ImportError:
                # Silent fallback to mock - no error messages
                return MockRAGFlow(**config)


def is_ragflow_available() -> bool:
    """Check if RAGFlow SDK is properly installed"""
    try:
        from ragflow_sdk import RAGFlow
        return True
    except ImportError:
        try:
            from ragflow import RAGFlow
            return True
        except ImportError:
            try:
                import ragflow
                return hasattr(ragflow, 'RAGFlow')
            except ImportError:
                return False


def print_demo_notice():
    """Print notice about demo mode"""
    if not is_ragflow_available():
        print("\n" + "="*60)
        print("[DEMO] Running in Demo Mode")
        print("="*60)
        print("Demonstrating RAGFlow API functionality with mock responses.")
        print()
        print("For real functionality:")
        print("pip install ragflow-sdk")
        print("="*60)
        print()