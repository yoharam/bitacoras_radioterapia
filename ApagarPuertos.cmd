@echo off
setlocal
where node.exe >nul 2>nul
if errorlevel 1 (
    echo No se encontro Node.js. Ejecuta Instalar.cmd primero.
    pause
    exit /b 1
)
node.exe "%~dp0scripts\stop.mjs"
set "bitacoras_result=%ERRORLEVEL%"
if /I not "%~1"=="--no-pause" pause
exit /b %bitacoras_result%
