@echo off
REM Allow port 5173 (Vite dev server) inbound, so Tailscale / LAN can reach it
REM Requires admin. Double-click → UAC prompt.

NET SESSION >nul 2>&1
if %errorLevel% NEQ 0 (
    echo Requesting admin privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo Adding inbound firewall rule for TCP 5173...
netsh advfirewall firewall add rule name="CloudCLI Vite Dev 5173" dir=in action=allow protocol=TCP localport=5173 profile=any
echo.
echo Done. Test from phone: http://100.124.249.37:5173/
pause
