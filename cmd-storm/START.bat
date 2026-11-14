@echo off
REM ============================================================
REM  CMD STORM - polnoekrannaya simulyaciya 100 okon cmd,
REM  volnami poyavlyayutsya/ischezayut 5 minut, muzyka sloyami.
REM  Nativnaya programma (HTA), ne brauzer. Vyhod: Esc / Alt+F4.
REM ============================================================
powershell -NoProfile -WindowStyle Hidden -Command "(New-Object -ComObject Shell.Application).MinimizeAll()" 2>nul
start "" "%~dp0cmd-storm.hta"
exit
