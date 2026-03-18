FROM python:3.11-slim

WORKDIR /app

# ffmpeg is used by ASR preprocessing (if enabled).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ffmpeg \
       build-essential \
       gcc \
       python3-dev \
       portaudio19-dev \
       libasound2-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
COPY ragflow_demo /app/ragflow_demo

ENV PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["python", "-m", "backend"]
