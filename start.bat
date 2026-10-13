@echo off
setlocal EnableExtensions EnableDelayedExpansion
title NeverQ Launcher

cd /d "%~dp0"
if errorlevel 1 (
    echo [ERROR] Could not access the project directory.
    pause
    exit /b 1
)

set "ROOT=%~dp0"
set "BACKEND_URL=http://localhost:4000/api/health"
set "FRONTEND_URL=http://localhost:5173/"
set "MAX_RETRIES=30"

echo.
echo ===================================================
echo                 NeverQ Launcher
echo ===================================================
echo.

:: 1. Check prerequisites
where node.exe >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found in PATH.
    echo Install Node.js LTS from https://nodejs.org/
    goto fatal_error
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm was not found in PATH.
    echo Reinstall Node.js LTS and ensure npm is in PATH.
    goto fatal_error
)

where curl.exe >nul 2>nul
if errorlevel 1 (
    echo [ERROR] curl.exe was not found in PATH.
    goto fatal_error
)

:: 2. Check project directories
if not exist "%ROOT%backend\package.json" (
    echo [ERROR] backend\package.json was not found.
    goto fatal_error
)

if not exist "%ROOT%frontend\package.json" (
    echo [ERROR] frontend\package.json was not found.
    goto fatal_error
)

:: 3. Install missing dependencies
if not exist "%ROOT%backend\node_modules\" (
    echo [1/4] Installing backend dependencies...
    pushd "%ROOT%backend"
    call npm install
    set "INSTALL_RESULT=!ERRORLEVEL!"
    popd

    if not "!INSTALL_RESULT!"=="0" (
        echo [ERROR] Backend dependency installation failed.
        goto fatal_error
    )
)

if not exist "%ROOT%frontend\node_modules\" (
    echo [2/4] Installing frontend dependencies...
    pushd "%ROOT%frontend"
    call npm install
    set "INSTALL_RESULT=!ERRORLEVEL!"
    popd

    if not "!INSTALL_RESULT!"=="0" (
        echo [ERROR] Frontend dependency installation failed.
        goto fatal_error
    )
)

:: 4. Check or start backend
echo.
echo [3/4] Checking backend health...

curl.exe --connect-timeout 2 --max-time 4 -s -f -o nul "%BACKEND_URL%" >nul 2>nul
if not errorlevel 1 (
    echo [OK] Backend is already healthy.
    goto check_frontend
)

echo [*] Starting backend in a separate terminal...
start "NeverQ Backend API" /D "%ROOT%backend" cmd.exe /k "npm run dev"

echo [*] Waiting for backend (up to approximately 60 seconds)...
set /a RETRIES=0

:poll_backend
timeout /t 2 /nobreak >nul
curl.exe --connect-timeout 2 --max-time 4 -s -f -o nul "%BACKEND_URL%" >nul 2>nul

if not errorlevel 1 (
    echo [OK] Backend is healthy.
    goto check_frontend
)

set /a RETRIES+=1
if !RETRIES! geq !MAX_RETRIES! goto backend_timeout
goto poll_backend

:backend_timeout
echo.
echo [ERROR] Backend did not become healthy in time.
echo Check the "NeverQ Backend API" terminal for errors.
echo The frontend will not be launched without a healthy backend.
echo.
goto fatal_error

:: 5. Check or start frontend
:check_frontend
echo.
echo [4/4] Checking frontend...

curl.exe --connect-timeout 2 --max-time 4 -s -f -o nul "%FRONTEND_URL%" >nul 2>nul
if not errorlevel 1 (
    echo [OK] Frontend is already responding.
    goto frontend_ready
)

echo [*] Starting frontend in a separate terminal...
start "NeverQ Frontend" /D "%ROOT%frontend" cmd.exe /k "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort"

echo [*] Waiting for frontend (up to approximately 60 seconds)...
set /a RETRIES=0

:poll_frontend
timeout /t 2 /nobreak >nul
curl.exe --connect-timeout 2 --max-time 4 -s -f -o nul "%FRONTEND_URL%" >nul 2>nul

if not errorlevel 1 (
    echo [OK] Frontend is responding.
    goto frontend_ready
)

set /a RETRIES+=1
if !RETRIES! geq !MAX_RETRIES! goto frontend_timeout
goto poll_frontend

:frontend_timeout
echo.
echo ===================================================
echo [ERROR] Frontend failed to start.
echo Browser will NOT be opened.
echo.
echo Check the "NeverQ Frontend" terminal for:
echo - Vite compilation errors
echo - Missing dependencies
echo - Port 5173 conflicts
echo - Invalid environment configuration
echo ===================================================
echo.
goto fatal_error

:: 6. Open browser only after frontend responds
:frontend_ready
echo.
echo [*] Opening NeverQ in your default browser...
start "" "%FRONTEND_URL%"

echo.
echo ===================================================
echo            NeverQ is running!
echo ===================================================
echo Backend : http://localhost:4000
echo Health  : %BACKEND_URL%
echo Frontend: %FRONTEND_URL%
echo.
echo Services run in separate terminal windows.
echo Press Ctrl+C in each service window to stop it.
echo No stop.bat is required.
echo ===================================================
echo.
pause
exit /b 0

:fatal_error
echo.
echo Launcher stopped because of an error.
echo Check the messages above before trying again.
echo.
pause
exit /b 1
