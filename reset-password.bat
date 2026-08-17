@echo off
REM Reset the CloudCLI login password.
REM The new password is typed into this window and hashed locally.
REM Keep this file in English only - Chinese characters break under Big5 cmd.

cd /d "%~dp0"

echo ============================================
echo   CloudCLI - Reset Password
echo ============================================
echo.

node reset-password.cjs

echo.
echo Press any key to close this window...
pause >nul
