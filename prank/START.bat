@echo off
REM ============================================================
REM  PRANK LAUNCHER - bezobidnyy fake-virus prank (tvoy PC)
REM  Svorachivaet vse okna, otkryvaet strashilku na ves ekran
REM  so zvukom. Pervye 60 sek zakryt nelzya (krome sekretnoy
REM  kombinacii vladelca: Ctrl+Shift+Q, i Alt+F4).
REM ============================================================

REM 1) Minimize all open windows (reversible - NOT closed)
powershell -NoProfile -WindowStyle Hidden -Command "(New-Object -ComObject Shell.Application).MinimizeAll()" 2>nul

set "HTML=%~dp0scare.html"
set "URL=file:///%HTML:\=/%"
set "FLAGS=--kiosk --autoplay-policy=no-user-gesture-required --user-data-dir=%TEMP%\prankprofile"

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if exist "%EDGE%" (
  start "" "%EDGE%" %FLAGS% "%URL%"
) else if exist "%CHROME%" (
  start "" "%CHROME%" %FLAGS% "%URL%"
) else (
  start "" "%URL%"
)
exit
