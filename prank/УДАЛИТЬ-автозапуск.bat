@echo off
chcp 65001 >nul
title PRANK - udalenie avtozapuska
echo.
echo  Ubirayu avtozapusk prikola...
echo.

REM 1) ubiraem iz avtozagruzki
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v PrankUsbWatcher /f >nul 2>&1

REM 2) ostanavlivaem storozha (vse wscript - akkuratno, zakroet tolko skripty)
taskkill /F /IM wscript.exe >nul 2>&1

REM 3) udalyaem postoyannuyu papku
set "DST=%LOCALAPPDATA%\PrankFakeVirus"
if exist "%DST%" rmdir /S /Q "%DST%"

echo  Gotovo. Avtozapusk polnostyu ubran.
echo  Fleshku mozhno pereimenovat obratno (ubrat metku PRANK).
echo.
pause
