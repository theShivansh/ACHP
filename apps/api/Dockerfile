# Build context = apps/api/  (Dockerfile lives here, so Railway uses this dir as context)
FROM python:3.12-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# requirements.txt is RIGHT HERE in apps/api/
COPY requirements.txt .

RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Download spacy + NLTK models
RUN python -m spacy download en_core_web_sm && \
    python -c "import nltk; nltk.download('vader_lexicon'); nltk.download('punkt'); nltk.download('stopwords')"

# Copy the entire app
COPY . .

# Runtime directories
RUN mkdir -p data/kb/faiss data/kb/text logs

# Non-root user
RUN useradd -m -u 1000 achp && chown -R achp:achp /app
USER achp

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "1", \
     "--log-level", "info"]
