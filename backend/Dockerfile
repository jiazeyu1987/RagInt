FROM python:3.11-slim

WORKDIR /app

# ffmpeg is used by ASR preprocessing (if enabled).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
COPY ragflow_demo /app/ragflow_demo
COPY fuasr_demo /app/fuasr_demo
COPY tts_demo /app/tts_demo

ENV PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["python", "-m", "backend"]

