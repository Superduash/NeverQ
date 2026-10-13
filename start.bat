@echo off
setlocal enabledelayedexpansion
title NeverQ Launcher

:: 1. Always execute from the project root directory
cd /d "%~dp0"

echo ===================================================
echo               NeverQ Launcher
echo ===================================================

:: 2. Check prerequisites (Node.js, npm, curl)
where node >nul 2>nul
if !ERRORLEVEL! neq 0 (
    echo [ERROR] Node.js was not found in your system PATH.
    echo Please install Node.js (v18 or higher) from https://nodejs.org/ and try again.
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if !ERRORLEVEL! neq 0 (
    echo [ERROR] npm was not found in your system PATH.
    echo Please ensure npm is installed and added to your system PATH.
    echo.
    pause
    exit /b 1
)

where curl.exe >nul 2>nul
if !ERRORLEVEL! neq 0 (
    echo [ERROR] curl.exe was not found in your system PATH.
    echo curl is required to monitor service health.
    echo.
    pause
    exit /b 1
)

:: 3. Install dependencies only if node_modules are missing
if not exist "%~dp0backend\node_modules\" (
    echo [*] Backend dependencies not found. Installing...
    cd /d "%~dp0backend"
    call npm install
    if !ERRORLEVEL! neq 0 (
        echo.
        echo [ERROR] Backend npm install failed.
        cd /d "%~dp0"
        pause
        exit /b 1
    )
    cd /d "%~dp0"
)

if not exist "%~dp0frontend\node_modules\" (
    echo [*] Frontend dependencies not found. Installing...
    cd /d "%~dp0frontend"
    call npm install
    if !ERRORLEVEL! neq 0 (
        echo.
        echo [ERROR] Frontend npm install failed.
        cd /d "%~dp0"
        pause
        exit /b 1
    )
    cd /d "%~dp0"
)

:: 4. Check Backend health status
echo [*] Checking Backend status at http://localhost:4000/api/health...
curl.exe -s -f -o nul "http://localhost:4000/api/health"
if !ERRORLEVEL! equ 0 (
    echo [*] Backend is already running and healthy.
    goto check_frontend
)

:: Backend not running; launch in a separate persistent CMD window
echo [*] Starting NeverQ Backend API on port 4000...
start "NeverQ Backend API" /d "%~dp0backend" cmd /k npm run dev

echo [*] Waiting for Backend to become healthy...
set /a BACKEND_RETRIES=0
set /a MAX_BACKEND_RETRIES=30

:poll_backend
ping -n 2 127.0.0.1 >nul
curl.exe -s -f -o nul "http://localhost:4000/api/health"
if !ERRORLEVEL! equ 0 (
    echo [*] Backend is healthy and responding.
    goto check_frontend
)
set /a BACKEND_RETRIES+=1
if !BACKEND_RETRIES! geq !MAX_BACKEND_RETRIES! goto backend_timeout
goto poll_backend

:backend_timeout
echo.
echo [WARNING] Backend did not respond at http://localhost:4000/api/health within !MAX_BACKEND_RETRIES! seconds.
echo           Please check the "NeverQ Backend API" window for startup logs or errors.
echo           Proceeding to check frontend...
echo.
goto check_frontend

:: 5. Check Frontend status
:check_frontend
echo [*] Checking Frontend status at http://localhost:5173/...
curl.exe -s -f -o nul "http://localhost:5173/"
if !ERRORLEVEL! equ 0 (
    echo [*] Frontend is already running and responding.
    goto frontend_ready
)

:: Frontend not running; launch in a separate persistent CMD window
echo [*] Starting NeverQ Frontend on port 5173...
start "NeverQ Frontend" /d "%~dp0frontend" cmd /k npm run dev -- --host 127.0.0.1 --port 5173 --strictPort

echo [*] Waiting for Frontend to become ready...
set /a FRONTEND_RETRIES=0
set /a MAX_FRONTEND_RETRIES=30

:poll_frontend
ping -n 2 127.0.0.1 >nul
curl.exe -s -f -o nul "http://localhost:5173/"
if !ERRORLEVEL! equ 0 (
    echo [*] Frontend is ready and responding.
    goto frontend_ready
)
set /a FRONTEND_RETRIES+=1
if !FRONTEND_RETRIES! geq !MAX_FRONTEND_RETRIES! goto frontend_timeout
goto poll_frontend

:frontend_timeout
echo.
echo ===================================================
echo [ERROR] Frontend failed to respond at http://localhost:5173/
echo         within !MAX_FRONTEND_RETRIES! seconds.
echo.
echo         Please check the "NeverQ Frontend" terminal window
echo         for compilation errors, port conflicts, or startup logs.
echo         The browser will NOT be opened.
echo ===================================================
echo.
pause
exit /b 1

:frontend_ready
echo [*] Opening default browser to http://localhost:5173/ ...
start "" "http://localhost:5173/"

echo.
echo ===================================================
echo               NeverQ is up and running!
echo ===================================================
echo   Backend API : http://localhost:4000
echo   Health Check: http://localhost:4000/api/health
echo   Frontend App: http://localhost:5173/
echo ===================================================
echo   To stop the services:
echo   - Close the respective backend and frontend terminal windows,
echo     or press Ctrl+C inside each window.
echo ===================================================
echo.
pause
exit /b 0
