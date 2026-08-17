@echo off
REM CloudCLI dev mode: vite 5173 + server:dev 3001
REM Kills old processes on those ports first, then starts dev.

cd /d "%~dp0"

echo [1/2] Killing old processes on :3001 / :5173 ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
  echo   Killing PID %%a on :3001
  taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
  echo   Killing PID %%a on :5173
  taskkill /F /PID %%a >nul 2>&1
)

echo.
echo [2/2] Starting dev...
echo   Frontend (vite): http://localhost:5173  (HMR on)
echo   Backend        : http://localhost:3001  (tsx watch, auto-reload)
echo   Press Ctrl+C to stop both
echo.

call npm run dev 2>&1

echo.
echo ============================================
echo dev exited. Press any key to close window.
pause >nul
