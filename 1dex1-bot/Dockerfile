FROM python:3.13-slim

# ffmpeg — склейка видео и звука для YouTube и VK
# (JS-движок deno для YouTube ставится из requirements.txt)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY bot ./bot

ENV PYTHONUNBUFFERED=1 \
    DATA_DIR=/app/data

CMD ["python", "-m", "bot"]
