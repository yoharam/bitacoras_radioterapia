@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\bitacoras.ps1" -Action Update
set "update_result=%ERRORLEVEL%"
if not "%update_result%"=="0" echo La actualizacion no termino. Revisa el mensaje anterior.
pause
exit /b %update_result%
