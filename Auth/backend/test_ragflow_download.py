import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from ragflow_sdk import RAGFlow
import json

api_key = 'ragflow-lmBmCb-T_yV1D8gaV65ThoTLPLWsAr4zKUh72XKFFBs'
base_url = 'http://127.0.0.1:9380'

client = RAGFlow(api_key=api_key, base_url=base_url)

print("Listing datasets...")
datasets = client.list_datasets()
print(f"Found {len(datasets)} datasets")

for dataset in datasets:
    if hasattr(dataset, 'name') and dataset.name == '展厅':
        print(f"\nDataset: {dataset.name}")
        print(f"Dataset ID: {dataset.id if hasattr(dataset, 'id') else 'N/A'}")
        print(f"Dataset attributes: {[a for a in dir(dataset) if not a.startswith('_')]}")

        docs = dataset.list_documents()
        print(f"Documents count: {len(docs)}")

        if docs:
            doc = docs[0]
            print(f"\nFirst document:")
            print(f"  ID: {doc.id if hasattr(doc, 'id') else 'N/A'}")
            print(f"  Name: {doc.name if hasattr(doc, 'name') else 'N/A'}")
            print(f"  Type: {type(doc)}")

            print(f"\nDocument attributes:")
            for attr in dir(doc):
                if not attr.startswith('_'):
                    try:
                        val = getattr(doc, attr)
                        if not callable(val):
                            print(f"    {attr}: {val}")
                    except Exception as e:
                        print(f"    {attr}: <error: {e}>")

            print(f"\nDocument methods:")
            for attr in dir(doc):
                if not attr.startswith('_'):
                    try:
                        val = getattr(doc, attr)
                        if callable(val):
                            print(f"    {attr}()")
                    except:
                        pass

            # Try download method
            if hasattr(doc, 'download'):
                print("\nTrying download() method...")
                try:
                    result = doc.download()
                    print(f"  Result type: {type(result)}")
                    print(f"  Result: {result}")
                except Exception as e:
                    print(f"  Error: {e}")

            if hasattr(doc, 'retrieve'):
                print("\nTrying retrieve() method...")
                try:
                    result = doc.retrieve()
                    print(f"  Result type: {type(result)}")
                    print(f"  Result: {result}")
                except Exception as e:
                    print(f"  Error: {e}")

        break
