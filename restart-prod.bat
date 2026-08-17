@echo off
REM CloudCLI prod restart: kill old :3001 + start new prod server.

cd /d "%~dp0"

echo [1/2] Killing old server on :3001 ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
  echo   Killing PID %%a
  taskkill /F /PID %%a >nul 2>&1
)

echo.
echo [2/2] Starting prod server...
echo   Port 3001 - Press Ctrl+C to stop.
echo.

call npm run server 2>&1

echo.
echo ============================================
echo Server exited. Press any key to close window.
pause >nul
