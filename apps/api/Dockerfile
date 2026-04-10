FROM python:3.12-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Download models at build time (cached by HuggingFace)
RUN python -m spacy download en_core_web_sm && \
    python -c "import nltk; nltk.download('vader_lexicon'); nltk.download('punkt'); nltk.download('stopwords')"

# Copy app source
COPY . .

# Runtime directories
RUN mkdir -p data/kb/faiss data/kb/text logs

# HuggingFace Spaces runs as non-root user 1000
RUN useradd -m -u 1000 achp && chown -R achp:achp /app
USER achp

# HuggingFace Spaces requires port 7860
EXPOSE 7860

CMD ["python", "-m", "uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "7860", \
     "--workers", "1", \
     "--log-level", "info"]
