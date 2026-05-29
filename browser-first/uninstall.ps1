#Requires -Version 5.1
# ═══════════════════════════════════════════════════════════════════════════════
# ResonantOS Uninstaller for Windows
# - Stops and removes the scheduled task
# - Removes native messaging host registry entries
# - Optionally removes ResonantOS_User directory
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File uninstall.ps1
#   powershell -ExecutionPolicy Bypass -File uninstall.ps1 -RemoveUserData
# ═══════════════════════════════════════════════════════════════════════════════

param(
    [switch]$RemoveUserData,   # Also delete $env:USERPROFILE\ResonantOS_User
    [switch]$RemoveRepo,       # Also delete $env:USERPROFILE\resonantos-vnext
    [switch]$Force             # Skip confirmation prompts
)

$ErrorActionPreference = "SilentlyContinue"

# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-Step { param($msg) Write-Host "`n▶ $msg" -ForegroundColor Blue }
function Write-Ok   { param($msg) Write-Host "✔ $msg" -ForegroundColor Green }
function Write-Info { param($msg) Write-Host "ℹ $msg" -ForegroundColor Cyan }
function Write-Warn { param($msg) Write-Host "⚠ $msg" -ForegroundColor Yellow }
function Write-Err  { param($msg) Write-Host "✖ $msg" -ForegroundColor Red }

function Confirm-Action {
    param([string]$prompt)
    if ($Force) { return $true }
    $answer = Read-Host "$prompt (Y/N)"
    return $answer -match "^[Yy]"
}

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Red
Write-Host "║     ResonantOS Uninstaller for Windows        ║" -ForegroundColor Red
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Red
Write-Host ""

if (-not $Force) {
    $confirm = Read-Host "This will remove the ResonantOS Bridge. Continue? (Y/N)"
    if ($confirm -notmatch "^[Yy]") {
        Write-Info "Uninstall cancelled."
        exit 0
    }
}

$TASK_NAME  = "ResonantOS Bridge"
$USER_DIR   = Join-Path $env:USERPROFILE "ResonantOS_User"
$REPO_DIR   = Join-Path $env:USERPROFILE "resonantos-vnext"
$BRIDGE_PORT = 47773

$summary = @()

# ── Step 1: Stop and remove scheduled task ────────────────────────────────────
Write-Step "Removing scheduled task"

$task = Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue
if ($task) {
    # Stop if running
    $taskInfo = Get-ScheduledTaskInfo -TaskName $TASK_NAME -ErrorAction SilentlyContinue
    if ($taskInfo -and $taskInfo.LastTaskResult -eq 267009) {
        # 267009 = SCHED_S_TASK_RUNNING
        Stop-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue
        Write-Ok "Stopped task '$TASK_NAME'"
    }

    Unregister-ScheduledTask -TaskName $TASK_NAME -Confirm:$false -ErrorAction SilentlyContinue
    Write-Ok "Removed scheduled task '$TASK_NAME'"
    $summary += "✔ Scheduled task removed"
} else {
    Write-Info "Scheduled task '$TASK_NAME' not found — skipping"
    $summary += "ℹ Scheduled task not found (already removed or not installed)"
}

# ── Step 2: Kill any running bridge node process ──────────────────────────────
Write-Step "Stopping any running bridge processes"

# Check if something is listening on the bridge port
try {
    $connections = netstat -ano 2>$null | Select-String ":$BRIDGE_PORT "
    foreach ($conn in $connections) {
        if ($conn -match "\s+(\d+)\s*$") {
            $pid = [int]$Matches[1]
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Info "Killing process $pid ($($proc.Name)) on port $BRIDGE_PORT"
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                Write-Ok "Stopped bridge process (PID $pid)"
                $summary += "✔ Bridge process stopped"
            }
        }
    }
} catch {
    Write-Info "Could not check for running bridge processes"
}

# Also kill any remaining node processes running bridge-daemon.mjs
Get-Process -Name "node" -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine
        if ($cmdLine -like "*bridge-daemon.mjs*") {
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
            Write-Ok "Stopped bridge process (PID $($_.Id))"
        }
    } catch {}
}

# ── Step 3: Remove native messaging host registry entries ─────────────────────
Write-Step "Removing native messaging host registry entries"

$registryPaths = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.resonantos.bridge",
    "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.resonantos.bridge",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.resonantos.bridge",
    # Also check machine-level (in case installed with admin, though we don't do that)
    "HKLM:\Software\Google\Chrome\NativeMessagingHosts\com.resonantos.bridge",
    "HKLM:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.resonantos.bridge",
    "HKLM:\Software\Microsoft\Edge\NativeMessagingHosts\com.resonantos.bridge"
)

$removedAny = $false
foreach ($regPath in $registryPaths) {
    if (Test-Path $regPath) {
        Remove-Item -Path $regPath -Recurse -Force -ErrorAction SilentlyContinue
        Write-Ok "Removed: $regPath"
        $removedAny = $true
    }
}

if ($removedAny) {
    $summary += "✔ Native messaging registry entries removed"
} else {
    Write-Info "No native messaging registry entries found"
    $summary += "ℹ Native messaging entries not found (already removed or not installed)"
}

# Also remove the native messaging manifest JSON files if they exist
$nativeDir = Join-Path $REPO_DIR "browser-first\native-messaging"
$manifestFile = Join-Path $nativeDir "com.resonantos.bridge.json"
if (Test-Path $manifestFile) {
    Remove-Item -Path $manifestFile -Force -ErrorAction SilentlyContinue
    Write-Ok "Removed native messaging manifest: $manifestFile"
}

# ── Step 4: Remove temp/PID files ─────────────────────────────────────────────
Write-Step "Cleaning up temp files"

$tempFiles = @(
    "$env:TEMP\resonantos-bridge.pid",
    "$env:TEMP\resonantos-bridge-*"
)

foreach ($pattern in $tempFiles) {
    Get-Item -Path $pattern -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-Item -Path $_.FullName -Force -ErrorAction SilentlyContinue
        Write-Ok "Removed: $($_.FullName)"
    }
}

# ── Step 5: Optionally remove user data directory ─────────────────────────────
if (-not $RemoveUserData) {
    Write-Step "User data directory"
    Write-Info "User data preserved at: $USER_DIR"
    Write-Info "Contains: Secrets, Memory, BrowserFirst Profiles, Logs"
    Write-Host ""

    if (Test-Path $USER_DIR) {
        if (Confirm-Action "Remove user data directory ($USER_DIR)?") {
            $RemoveUserData = $true
        } else {
            Write-Info "Keeping user data. Delete manually if needed: $USER_DIR"
            $summary += "ℹ User data preserved: $USER_DIR"
        }
    }
}

if ($RemoveUserData -and (Test-Path $USER_DIR)) {
    Write-Step "Removing user data directory"
    Remove-Item -Path $USER_DIR -Recurse -Force -ErrorAction SilentlyContinue
    if (-not (Test-Path $USER_DIR)) {
        Write-Ok "Removed: $USER_DIR"
        $summary += "✔ User data directory removed"
    } else {
        Write-Warn "Could not fully remove: $USER_DIR (files may be in use)"
        $summary += "⚠ User data directory partially removed"
    }
}

# ── Step 6: Optionally remove repository ──────────────────────────────────────
if (-not $RemoveRepo) {
    Write-Step "Repository directory"
    Write-Info "Repository preserved at: $REPO_DIR"
    Write-Host ""

    if (Test-Path $REPO_DIR) {
        if (Confirm-Action "Remove repository directory ($REPO_DIR)?") {
            $RemoveRepo = $true
        } else {
            Write-Info "Keeping repository."
            $summary += "ℹ Repository preserved: $REPO_DIR"
        }
    }
}

if ($RemoveRepo -and (Test-Path $REPO_DIR)) {
    Write-Step "Removing repository"
    Remove-Item -Path $REPO_DIR -Recurse -Force -ErrorAction SilentlyContinue
    if (-not (Test-Path $REPO_DIR)) {
        Write-Ok "Removed: $REPO_DIR"
        $summary += "✔ Repository removed"
    } else {
        Write-Warn "Could not fully remove: $REPO_DIR (git locks or files in use)"
        Write-Info "Close any editors/terminals using the repo and retry, or delete manually"
        $summary += "⚠ Repository partially removed — delete manually if needed"
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " Uninstall Summary" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
foreach ($line in $summary) {
    if ($line -like "✔*") {
        Write-Host " $line" -ForegroundColor Green
    } elseif ($line -like "⚠*") {
        Write-Host " $line" -ForegroundColor Yellow
    } else {
        Write-Host " $line" -ForegroundColor Cyan
    }
}
Write-Host ""
Write-Host " ResonantOS has been removed." -ForegroundColor Green
Write-Host " To reinstall, run install.bat or install.ps1" -ForegroundColor Cyan
Write-Host ""
