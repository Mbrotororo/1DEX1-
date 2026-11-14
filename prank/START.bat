@echo off
REM ============================================================
REM  PRANK LAUNCHER - zapuskaet NATIVNUYU programmu (HTA),
REM  NE brauzer. Svorachivaet vse okna (obratimo) i otkryvaet
REM  strashilku so zvukom na ves ekran.
REM ============================================================

REM minimize all open windows (reversible - NOT closed)
powershell -NoProfile -WindowStyle Hidden -Command "(New-Object -ComObject Shell.Application).MinimizeAll()" 2>nul

REM launch native HTA app via Windows mshta (NOT a browser)
start "" "%~dp0scare.hta"
exit
