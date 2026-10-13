@echo off
setlocal
title NeverQ Launcher

cd /d "%~dp0"

echo ===================================================
echo           NeverQ Application Launcher
echo ===================================================

:: 1. Ensure backend dependencies
if not exist "backend\node_modules\" (
    echo [1/3] Installing backend dependencies...
    cd /d "%~dp0backend"
    call npm install
    cd /d "%~dp0"
)

:: 2. Ensure frontend dependencies
if not exist "frontend\node_modules\" (
    echo [2/3] Installing frontend dependencies...
    cd /d "%~dp0frontend"
    call npm install
    cd /d "%~dp0"
)

:: 3. Check / Start Backend on port 4000
echo [3/3] Checking Backend status on port 4000...
curl.exe -s -f -o nul http://localhost:4000/api/health
if %ERRORLEVEL% equ 0 (
    echo [*] Backend is already running and healthy!
) else (
    echo [*] Starting NeverQ Backend API on port 4000...
    start "NeverQ Backend API" cmd /k "cd /d "%~dp0backend" && npm run dev"
    echo [*] Waiting for Backend to be ready...
    set RETRIES=0
    :check_backend
    powershell -NoProfile -Command "Start-Sleep -Milliseconds 250"
    curl.exe -s -f -o nul http://localhost:4000/api/health
    if %ERRORLEVEL% equ 0 (
        echo [*] Backend is LIVE and healthy!
        goto backend_ready
    )
    set /a RETRIES+=1
    if %RETRIES% geq 35 (
        echo [*] Backend took longer to respond. Proceeding...
        goto backend_ready
    )
    goto check_backend
)

:backend_ready
:: 4. Auto-open browser directly to localhost:5173
echo [*] Opening browser to http://localhost:5173 ...
start http://localhost:5173

:: 5. Check if Frontend is already running
curl.exe -s -f -o nul http://localhost:5173
if %ERRORLEVEL% equ 0 (
    echo.
    echo ===================================================
    echo  NeverQ is already running and ready!
    echo  Backend:  http://localhost:4000 (Health: /api/health)
    echo  Frontend: http://localhost:5173
    echo ===================================================
    echo.
    echo Services are active in background. Press any key to close this launcher...
    pause >nul
    exit /b 0
)

:: 6. If Frontend is not running yet, start it in this terminal window
echo [*] Starting NeverQ Frontend in this terminal...
echo ===================================================
echo  Backend:  http://localhost:4000
echo  Frontend: http://localhost:5173
echo  Press Ctrl+C to stop frontend.
echo ===================================================
cd /d "%~dp0frontend"
call npm run dev
