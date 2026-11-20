@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
rem Запуск бота 1DEX1 на Windows.
rem   run.bat            - обычный запуск
rem   run.bat --forever  - перезапускать бота через 5 секунд после падения, 24/7
rem   либо set AUTORESTART=1 перед запуском - то же самое

if /i "%~1"=="--forever" set "AUTORESTART=1"

where python >nul 2>&1
if errorlevel 1 (
    echo Не найден Python. Установи Python 3.11+ с https://www.python.org/downloads/
    echo При установке отметь галочку "Add python.exe to PATH".
    pause
    exit /b 1
)
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)"
if errorlevel 1 (
    echo Нужен Python 3.11 или новее. Обнови Python: https://www.python.org/downloads/
    pause
    exit /b 1
)

if not exist .env (
    copy .env.example .env >nul
    echo Создал файл .env - открой его, впиши BOT_TOKEN и запусти run.bat ещё раз.
    notepad .env
    pause
    exit /b 1
)

rem Виртуальное окружение: создаём, если его нет или оно сломано
set "VENV_OK=1"
if not exist .venv\Scripts\activate.bat set "VENV_OK=0"
if "%VENV_OK%"=="1" (
    .venv\Scripts\python.exe -c "import sys" >nul 2>&1
    if errorlevel 1 set "VENV_OK=0"
)
if "%VENV_OK%"=="0" (
    if exist .venv (
        echo Виртуальное окружение .venv повреждено - пересоздаю...
        rmdir /s /q .venv
    ) else (
        echo Создаю виртуальное окружение...
    )
    python -m venv .venv
    if errorlevel 1 (
        echo Не получилось создать .venv. Переустанови Python 3.11+ и попробуй снова.
        pause
        exit /b 1
    )
)
call .venv\Scripts\activate.bat

echo Устанавливаю зависимости...
python -m pip install -q -r requirements.txt
if errorlevel 1 (
    echo Не удалось установить зависимости. Проверь интернет и запусти run.bat ещё раз.
    pause
    exit /b 1
)
rem Свежий yt-dlp - исправления для TikTok/YouTube приходят в обновлениях
python -m pip install -q -U "yt-dlp[default]"
if errorlevel 1 echo Не удалось обновить yt-dlp - работаю с текущей версией.

:run
echo Бот запускается... Закрой окно или нажми Ctrl+C, чтобы остановить.
python -m bot
if errorlevel 78 if not errorlevel 79 (
    echo Ошибка в настройках .env - перезапуск не поможет. Исправь и запусти снова.
    pause
    exit /b 78
)
if errorlevel 1 (
    if "%AUTORESTART%"=="1" (
        echo Бот упал. Перезапуск через 5 секунд... Ctrl+C - остановить.
        timeout /t 5 /nobreak >nul
        goto run
    )
)
pause
