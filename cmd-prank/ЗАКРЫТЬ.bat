@echo off
REM Zakryvaet VSE okna cmd i ostanavlivaet muzyku prikola.
REM (zakroet i eto okno, i lyubye drugie cmd - eto normalno)
taskkill /F /IM powershell.exe >nul 2>&1
taskkill /F /IM wscript.exe   >nul 2>&1
taskkill /F /IM cmd.exe /T    >nul 2>&1
