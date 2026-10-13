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

:: 3. Check if Backend is already running
echo [3/3] Checking Backend on port 4000...
curl.exe -s -f -o nul http://localhost:4000/api/health
if %ERRORLEVEL% equ 0 goto backend_running

:: Backend is not running, start it in a separate window
echo [*] Starting NeverQ Backend API on port 4000...
start "NeverQ Backend API" cmd /k "cd /d "%~dp0backend" && npm run dev"
echo [*] Waiting for Backend to be ready...

set RETRIES=0
:poll_backend
powershell -NoProfile -Command "Start-Sleep -Milliseconds 250"
curl.exe -s -f -o nul http://localhost:4000/api/health
if %ERRORLEVEL% equ 0 goto backend_ready

set /a RETRIES+=1
if %RETRIES% geq 35 goto backend_timeout
goto poll_backend

:backend_timeout
echo [*] Backend took longer to respond. Proceeding anyway...
goto launch_frontend

:backend_running
echo [*] Backend is already running and healthy.
goto launch_frontend

:backend_ready
echo [*] Backend is LIVE and healthy.

:launch_frontend
:: 4. Auto-open browser directly to localhost:5173
echo [*] Opening browser to http://localhost:5173 ...
start http://localhost:5173

:: 5. Check if Frontend is already running
curl.exe -s -f -o nul http://localhost:5173
if %ERRORLEVEL% equ 0 goto frontend_already_running

:: 6. If Frontend not running, run it in this terminal
echo [*] Starting NeverQ Frontend in this terminal...
echo ===================================================
echo  Backend:  http://localhost:4000 (Health: /api/health)
echo  Frontend: http://localhost:5173
echo  Press Ctrl+C to stop frontend.
echo ===================================================
cd /d "%~dp0frontend"
call npm run dev
exit /b 0

:frontend_already_running
echo.
echo ===================================================
echo  NeverQ is already running!
echo  Backend:  http://localhost:4000 (Health: /api/health)
echo  Frontend: http://localhost:5173
echo ===================================================
echo.
echo Services are active in the background. Press any key to exit launcher...
pause >nul
exit /b 0
