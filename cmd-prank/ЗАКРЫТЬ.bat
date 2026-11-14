@echo off
REM Zakryvaet VSE okna cmd (vklyuchaya feykovye i eto okno - eto ok).
taskkill /F /IM cmd.exe /T >nul 2>&1
