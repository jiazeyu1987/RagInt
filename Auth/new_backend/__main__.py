import uvicorn
import logging

if __name__ == "__main__":
    from main import app

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[logging.StreamHandler()]
    )

    print("\n" + "=" * 50)
    print("Auth Backend (FastAPI + AuthX) starting...")
    print(f"URL: http://localhost:8001")
    print(f"Health: http://localhost:8001/health")
    print(f"Docs: http://localhost:8001/docs")
    print("=" * 50 + "\n")

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info",
    )
