@echo off
chcp 65001 >nul
title 1DEX1 bots
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не найден. Скачай и установи его: https://nodejs.org  ^(кнопка LTS^)
  pause
  exit /b
)
if not exist node_modules (
  echo Первый запуск: устанавливаю нужные файлы, это займёт минуту...
  call npm install --no-audit --no-fund
)
node index.js
pause
