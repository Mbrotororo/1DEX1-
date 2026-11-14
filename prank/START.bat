@echo off
REM ============================================================
REM  PRANK LAUNCHER - bezobidnyy fake-virus prank (tvoy PC)
REM  Svorachivaet vse okna (NE zakryvaet), otkryvaet strashilku.
REM ============================================================

REM 1) Minimize all open windows (reversible - NOT closed)
powershell -NoProfile -WindowStyle Hidden -Command "(New-Object -ComObject Shell.Application).MinimizeAll()" 2>nul

set "HTML=%~dp0scare.html"
set "URL=file:///%HTML:\=/%"

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if exist "%EDGE%" (
  start "" "%EDGE%" --start-fullscreen --new-window "%URL%"
) else if exist "%CHROME%" (
  start "" "%CHROME%" --start-fullscreen --new-window "%URL%"
) else (
  start "" "%URL%"
)
exit
