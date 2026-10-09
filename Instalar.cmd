@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\bitacoras.ps1" -Action Install
set "installer_result=%ERRORLEVEL%"
if not "%installer_result%"=="0" echo La instalacion no termino. Revisa el mensaje anterior.
pause
exit /b %installer_result%
