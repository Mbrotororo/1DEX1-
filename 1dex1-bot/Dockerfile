FROM python:3.13-slim

# ffmpeg — склейка видео/звука для YouTube и VK; nodejs — JS-движок, который нужен yt-dlp для YouTube
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg nodejs ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY bot ./bot

ENV PYTHONUNBUFFERED=1 \
    DATA_DIR=/app/data \
    YTDLP_JS_RUNTIME=node

CMD ["python", "-m", "bot"]
