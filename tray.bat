@echo off
REM CloudCLI tray launcher.
REM
REM Hands off to a VBScript wrapper because that is the only way to start
REM PowerShell with no console window at all. Launching pwsh directly from a
REM .bat leaves this cmd window on the taskbar for as long as the tray runs,
REM which is the exact thing the tray is meant to avoid.
REM
REM English only: the console decodes UTF-8 Chinese as Big5 and the mojibake
REM gets executed as commands.

cd /d "%~dp0"
start "" wscript.exe "%~dp0tray-launch.vbs"
exit
