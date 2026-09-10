# navigraph-extractor HTTP service (FastAPI + OpenCV, headless).
FROM python:3.11-slim

# opencv-python-headless still needs a couple of shared libs at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN pip install --no-cache-dir ".[service]"

EXPOSE 8000
CMD ["uvicorn", "navigraph_extractor.service.app:app", "--host", "0.0.0.0", "--port", "8000"]
