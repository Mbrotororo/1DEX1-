FROM python:3.13-slim

# ffmpeg — склейка видео и звука для YouTube и VK
# (JS-движок deno для YouTube ставится из requirements.txt — колёса есть для amd64 и arm64)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY bot ./bot

# База и файлы бота лежат в /app/data (в docker-compose.yml это папка ./data).
# Cookies для yt-dlp: положи файл в ./data/cookies.txt и пропиши в .env
#   YTDLP_COOKIES=/app/data/cookies.txt
ENV PYTHONUNBUFFERED=1 \
    DATA_DIR=/app/data

CMD ["python", "-m", "bot"]
