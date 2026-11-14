@echo off
chcp 65001 >nul
title PRANK - ustanovka avtozapuska
echo.
echo  Stavlyu avtozapusk prikola pri vstavke fleshki s metkoy PRANK...
echo.

set "SRC=%~dp0"
set "DST=%LOCALAPPDATA%\PrankFakeVirus"

REM 1) kopiruem fayly prikola v postoyannuyu papku
if not exist "%DST%" mkdir "%DST%"
copy /Y "%SRC%scare.hta"             "%DST%\" >nul
copy /Y "%SRC%scare.html"            "%DST%\" >nul
copy /Y "%SRC%track.mp3"             "%DST%\" >nul
copy /Y "%SRC%START.bat"             "%DST%\" >nul
copy /Y "%SRC%autorun-watcher.vbs"   "%DST%\" >nul

REM 2) dobavlyaem storozha v avtozagruzku (zapusk pri vhode v Windows, skrytno)
set "RUNVBS=wscript.exe //B //Nologo ""%DST%\autorun-watcher.vbs"""
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v PrankUsbWatcher /t REG_SZ /d "%RUNVBS%" /f >nul

REM 3) zapuskaem storozha pryamo seychas
start "" wscript.exe //B //Nologo "%DST%\autorun-watcher.vbs"

echo  Gotovo!
echo.
echo  Teper: nazovi svoyu fleshku  PRANK  (Pravyy klik po disku -> Pereimenovat).
echo  Kak tolko vstavish etu fleshku v ETOT komp - prikol zapustitsya sam.
echo.
echo  Rabotaet TOLKO na etom kompyutere. Na chuzhih - net.
echo  Ubrat avtozapusk:  zapusti  UDALIT-avtozapusk.bat
echo.
pause
