@echo off
setlocal enabledelayedexpansion
title NeverQ Launcher

cd /d "%~dp0"

echo ===================================================
echo           NeverQ Application Launcher              
echo ===================================================

:: Ensure backend dependencies
if not exist "backend\node_modules\" (
    echo [1/4] Installing backend dependencies...
    cd /d "%~dp0backend"
    call npm install
    cd /d "%~dp0"
)

:: Ensure frontend dependencies
if not exist "frontend\node_modules\" (
    echo [2/4] Installing frontend dependencies...
    cd /d "%~dp0frontend"
    call npm install
    cd /d "%~dp0"
)

:: Start Backend in a dedicated window
echo [3/4] Starting NeverQ Backend on port 4000...
start "NeverQ Backend API" cmd /c "cd /d "%~dp0backend" && npm run dev"

:: Fast-poll backend health probe
echo [*] Waiting for Backend to be online at http://localhost:4000/api/health ...
set RETRIES=0
:check_backend
set /a RETRIES+=1
curl.exe -s -f -o nul http://localhost:4000/api/health
if %ERRORLEVEL% equ 0 (
    echo [*] Backend is LIVE and healthy!
    goto start_frontend
)
if %RETRIES% geq 30 (
    echo [*] Backend took longer to report healthy; proceeding to start frontend...
    goto start_frontend
)
powershell -NoProfile -Command "Start-Sleep -Milliseconds 200"
goto check_backend

:start_frontend
:: Start Frontend and automatically open browser
echo [4/4] Starting NeverQ Frontend and opening in browser...
start "NeverQ Frontend UI" cmd /c "cd /d "%~dp0frontend" && npm run dev -- --open"

echo.
echo ===================================================
echo  NeverQ services are running:
echo  Backend:  http://localhost:4000 (Health: /api/health)
echo  Frontend: http://localhost:5173
echo ===================================================
echo.
