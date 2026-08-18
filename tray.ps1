# CloudCLI system tray controller.
#
# Runs the server as a detached, windowless process and exposes it through a
# notification-area icon, so the taskbar is not occupied by a console window.
#
# Design notes:
#   * The server writes to a log FILE and is started with no window of its own.
#     "Show Log" opens a separate tailing window; closing that window cannot
#     stop the server, because the server was never its child.
#   * The server is started detached from this script too, but Exit stops it
#     deliberately so no orphan keeps port 3001 occupied.
#
# All output is English on purpose: this file is launched from a .bat, and the
# Windows console decodes UTF-8 Chinese as Big5, producing mojibake.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$AppRoot    = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerPort = 3001
$ServerUrl  = "http://localhost:$ServerPort"
$EntryPoint = Join-Path $AppRoot 'dist-server\server\index.js'
$LogDir     = Join-Path $AppRoot 'logs'
$LogFile    = Join-Path $LogDir 'server.log'
$IconPng    = Join-Path $AppRoot 'public\logo-64.png'

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

# --- Server process management --------------------------------------------

function Get-ListenerPid {
    $line = netstat -ano | Select-String ":$ServerPort\s" | Select-String 'LISTENING' | Select-Object -First 1
    if (-not $line) { return $null }
    $parts = ($line.ToString().Trim() -split '\s+')
    return [int]$parts[-1]
}

function Test-ServerRunning { return $null -ne (Get-ListenerPid) }

function Start-Server {
    if (Test-ServerRunning) { return $true }

    # Truncate rather than append so the log reflects this run only.
    "=== CloudCLI server started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" |
        Out-File -FilePath $LogFile -Encoding utf8

    # cmd.exe redirects both streams into the log; /d skips AutoRun scripts,
    # which some tools set and which would otherwise run first.
    $arguments = '/d /c node "{0}" >> "{1}" 2>&1' -f $EntryPoint, $LogFile

    Start-Process -FilePath $env:ComSpec `
                  -ArgumentList $arguments `
                  -WorkingDirectory $AppRoot `
                  -WindowStyle Hidden | Out-Null

    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 250
        if (Test-ServerRunning) { return $true }
    }
    return $false
}

function Stop-Server {
    $serverPid = Get-ListenerPid
    if ($serverPid) {
        taskkill /F /PID $serverPid /T 2>&1 | Out-Null
        Start-Sleep -Milliseconds 400
    }
}

# --- Log window ------------------------------------------------------------
# Tracked separately from the server: this window is disposable.

$script:LogWindow = $null

function Test-LogWindowOpen {
    return ($null -ne $script:LogWindow) -and (-not $script:LogWindow.HasExited)
}

function Show-LogWindow {
    if (Test-LogWindowOpen) {
        return
    }
    $tailCommand = 'Get-Content -LiteralPath "{0}" -Tail 200 -Wait' -f $LogFile
    $script:LogWindow = Start-Process -FilePath 'pwsh' `
        -ArgumentList '-NoLogo', '-NoProfile', '-NoExit', '-Command', $tailCommand `
        -PassThru
}

function Hide-LogWindow {
    if (Test-LogWindowOpen) {
        $script:LogWindow.Kill()
    }
    $script:LogWindow = $null
}

# --- Tray icon -------------------------------------------------------------

function Get-TrayIcon {
    if (Test-Path $IconPng) {
        try {
            $bitmap = [System.Drawing.Bitmap]::FromFile($IconPng)
            $handle = $bitmap.GetHicon()
            return [System.Drawing.Icon]::FromHandle($handle)
        } catch {
            # Fall through to the generic application icon.
        }
    }
    return [System.Drawing.SystemIcons]::Application
}

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = Get-TrayIcon
$notifyIcon.Visible = $true

function Update-TrayState {
    if (Test-ServerRunning) {
        $notifyIcon.Text = "CloudCLI - running on $ServerUrl"
    } else {
        $notifyIcon.Text = 'CloudCLI - stopped'
    }
}

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$openItem = $menu.Items.Add('Open in Browser')
$openItem.add_Click({ Start-Process $ServerUrl })

$logItem = $menu.Items.Add('Show Log')
$logItem.add_Click({
    if (Test-LogWindowOpen) { Hide-LogWindow } else { Show-LogWindow }
})

$restartItem = $menu.Items.Add('Restart Server')
$restartItem.add_Click({
    $notifyIcon.Text = 'CloudCLI - restarting...'
    Stop-Server
    if (Start-Server) {
        $notifyIcon.ShowBalloonTip(3000, 'CloudCLI', 'Server restarted.', [System.Windows.Forms.ToolTipIcon]::Info)
    } else {
        $notifyIcon.ShowBalloonTip(5000, 'CloudCLI', 'Server failed to start. Check the log.', [System.Windows.Forms.ToolTipIcon]::Error)
    }
    Update-TrayState
})

$menu.Items.Add('-') | Out-Null

$exitItem = $menu.Items.Add('Exit (stops server)')
$exitItem.add_Click({
    Hide-LogWindow
    Stop-Server
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

# Keep the log item's label in step with the window it toggles.
$menu.add_Opening({
    $logItem.Text = if (Test-LogWindowOpen) { 'Hide Log' } else { 'Show Log' }
    Update-TrayState
})

$notifyIcon.ContextMenuStrip = $menu

# Left click opens the app; that is the whole point of the icon.
$notifyIcon.add_MouseClick({
    param($sender, $eventArgs)
    if ($eventArgs.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
        Start-Process $ServerUrl
    }
})

# --- Startup ---------------------------------------------------------------

if (Start-Server) {
    $notifyIcon.ShowBalloonTip(3000, 'CloudCLI', "Server running on $ServerUrl", [System.Windows.Forms.ToolTipIcon]::Info)
} else {
    $notifyIcon.ShowBalloonTip(5000, 'CloudCLI', 'Server failed to start. Check the log.', [System.Windows.Forms.ToolTipIcon]::Error)
}
Update-TrayState

# Reflect the server dying on its own, so the tooltip cannot claim it is up.
$poll = New-Object System.Windows.Forms.Timer
$poll.Interval = 5000
$poll.add_Tick({ Update-TrayState })
$poll.Start()

[System.Windows.Forms.Application]::Run()
