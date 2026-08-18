' Starts tray.ps1 with no console window.
'
' The third argument of Run is the window style and the fourth is whether to
' wait: 0 means hidden, False means return immediately. This is what keeps the
' taskbar clear -- PowerShell's own -WindowStyle Hidden still flashes a console
' briefly on launch.

Dim shell, fso, scriptDir
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

shell.CurrentDirectory = scriptDir
shell.Run "pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File """ & scriptDir & "\tray.ps1""", 0, False
