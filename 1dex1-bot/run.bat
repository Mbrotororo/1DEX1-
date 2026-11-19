@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .env (
    copy .env.example .env >nul
    echo Создал файл .env — открой его, впиши BOT_TOKEN и запусти run.bat ещё раз.
    notepad .env
    pause
    exit /b
)
if not exist .venv (
    echo Создаю виртуальное окружение...
    python -m venv .venv || (echo Нужен Python 3.11+ : https://www.python.org/downloads/ & pause & exit /b)
)
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt
echo Бот запускается... (закрой окно, чтобы остановить)
python -m bot
pause
