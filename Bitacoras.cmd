@echo off
setlocal
set "bitacoras_action=%~1"
if not defined bitacoras_action set "bitacoras_action=Start"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\bitacoras.ps1" -Action "%bitacoras_action%"
set "bitacoras_result=%ERRORLEVEL%"
if not "%bitacoras_result%"=="0" pause
exit /b %bitacoras_result%
