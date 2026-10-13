@echo off
setlocal
echo ===================================================
echo             Stopping NeverQ Services              
echo ===================================================

echo [*] Terminating processes on ports 4000 and 5173...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 4000,5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

echo [*] Done. All NeverQ services stopped.
