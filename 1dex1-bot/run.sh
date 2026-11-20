#!/usr/bin/env bash
# Запуск бота 1DEX1 на Linux / macOS / Termux (proot Debian).
#   ./run.sh            — обычный запуск
#   ./run.sh --forever  — перезапускать бота через 5 секунд после падения (24/7)
#   AUTORESTART=1 ./run.sh — то же самое через переменную окружения
set -euo pipefail
cd "$(dirname "$0")"

FOREVER="${AUTORESTART:-0}"
for arg in "$@"; do
  case "$arg" in
    --forever) FOREVER=1 ;;
    *) echo "Неизвестный параметр: $arg (есть только --forever)" >&2; exit 2 ;;
  esac
done

# Нужен Python 3.11+
if ! command -v python3 >/dev/null 2>&1; then
  echo "Не найден python3. Установи Python 3.11 или новее (apt install python3 python3-venv)." >&2
  exit 1
fi
if ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'; then
  echo "Нужен Python 3.11 или новее, а установлен $(python3 -V 2>&1). Обнови Python." >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Создал .env — впиши туда BOT_TOKEN и запусти ./run.sh ещё раз."
  exit 1
fi

# Виртуальное окружение: создаём, если его нет или оно сломано (например, после обновления Python)
if [ ! -f .venv/bin/activate ] || ! .venv/bin/python -c 'import sys' >/dev/null 2>&1; then
  if [ -d .venv ]; then
    echo "Виртуальное окружение .venv повреждено — пересоздаю..."
    rm -rf .venv
  else
    echo "Создаю виртуальное окружение .venv..."
  fi
  if ! python3 -m venv .venv; then
    echo "Не получилось создать .venv. Установи модуль venv (apt install python3-venv) и попробуй снова." >&2
    rm -rf .venv
    exit 1
  fi
fi
# shellcheck disable=SC1091
. .venv/bin/activate

echo "Устанавливаю зависимости..."
python -m pip install -q -r requirements.txt
# Свежий yt-dlp — сайты часто меняются, исправления для TikTok/YouTube приходят в обновлениях
python -m pip install -q -U "yt-dlp[default]" || echo "Не удалось обновить yt-dlp — работаю с текущей версией."

if [ "$FOREVER" != "1" ]; then
  exec python -m bot
fi

# Режим 24/7: перезапуск после падения. Ctrl+C останавливает всё.
trap 'echo; echo "Остановлено (Ctrl+C)."; exit 130' INT TERM
while true; do
  code=0
  python -m bot || code=$?
  if [ "$code" -eq 0 ]; then
    echo "Бот завершился штатно."
    exit 0
  fi
  if [ "$code" -eq 130 ] || [ "$code" -eq 143 ]; then
    echo "Остановлено."
    exit "$code"
  fi
  if [ "$code" -eq 78 ]; then
    echo "Ошибка в настройках (.env) — перезапуск не поможет. Исправь и запусти снова."
    exit "$code"
  fi
  echo "Бот упал (код $code). Перезапуск через 5 секунд... (Ctrl+C — остановить)"
  sleep 5
done
