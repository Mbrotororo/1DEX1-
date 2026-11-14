@echo off
REM ============================================================
REM  "Create a virus" prank - otkryvaet 15 okon cmd s feykovym
REM  vzlomom. NE forkbomb: strogo COUNT okon, kazhdoe zakroetsya
REM  samo cherez ~45 sek. Zakryt vse srazu -> ZAKRYT.bat
REM  Odin fayl, nichego ryadom ne nuzhno.
REM ============================================================
if "%~1"=="worker" goto :worker

REM ---- glavnoe okno ----
REM muzyka (track.mp3) skrytno v fone
if exist "%~dp0_music.vbs" start "" wscript //nologo "%~dp0_music.vbs"

REM otkryvaet COUNT okon kaskadom
REM 100 - mnogo okon na ves ekran. Na slabom PC mozhet chut lagnut
REM poka otkryvayutsya (~10 sek), no komp perezhivet i zakroetsya.
REM NE stav 300+ : komp mozhet zavisnut namertvo.
set COUNT=100
for /L %%i in (1,1,%COUNT%) do (
  start "" "%~f0" worker
  REM ~100 ms pauza (ping na nerabochiy test-IP), chtob okna shli volnoy
  ping -n 1 -w 100 192.0.2.1 >nul
)
exit

REM ---- rabochee okno (feykovyy vzlom) ----
:worker
title C:\WINDOWS\system32\cmd.exe
color 0a
mode con: cols=74 lines=22
echo Microsoft Windows [Version 10.0.22631.4169]
echo (c) Microsoft Corporation. All rights reserved.
echo.
echo C:\Users\admin^> init_breach.exe --target 127.0.0.1 --force
echo.
set /a i=0
:loop
echo  [%RANDOM%] ACCESS GRANTED :: node %RANDOM%.%RANDOM%.%RANDOM% port %RANDOM%
echo  decrypting block 0x%RANDOM%%RANDOM% ............ OK
echo  injecting payload %i% / 120   [ %RANDOM% bytes ]
set /a i+=1
if %i% LSS 120 goto loop
echo.
echo  ============================================
echo        SYSTEM COMPROMISED - ACCESS GRANTED
echo  ============================================
echo.
echo  (eto prank. okno zakroetsya samo cherez 5 minut)
timeout /t 300 >nul
exit
