#Requires -Version 5.1
# ===============================================================================
# ResonantOS Installer for Windows
# PowerShell 5.1+ (built into Windows 10/11)
# No admin/elevated privileges required - uses HKCU, user dirs, Task Scheduler
# Idempotent - safe to run multiple times
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File install.ps1
#   - or via install.bat double-click -
# ===============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# -- Colors & Helpers -----------------------------------------------------------
function Write-Banner {
    Write-Host ""
    Write-Host "+==============================================+" -ForegroundColor Cyan
    Write-Host "|     ResonantOS Installer for Windows          |" -ForegroundColor Cyan
    Write-Host "+==============================================+" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step   { param($msg) Write-Host "`n> $msg" -ForegroundColor Blue }
function Write-Ok     { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Info   { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warn   { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err    { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }

# -- Constants ------------------------------------------------------------------
$REPO_URL    = "https://github.com/ResonantOS/resonantos-vnext.git"
$BRANCH      = "main"
$REPO_DIR    = Join-Path $env:USERPROFILE "resonantos-vnext"
$USER_DIR    = Join-Path $env:USERPROFILE "ResonantOS_User"
$BRIDGE_PORT = 47773
$TASK_NAME   = "ResonantOS Bridge"

# -- Step 1: Banner -------------------------------------------------------------
Write-Banner
Write-Info "Windows 10 21H2+ / Windows 11 supported"
Write-Info "No administrator privileges required"
Write-Host ""

# -- Step 2: Check / Install Node.js -------------------------------------------
Write-Step "Checking Node.js (>= 18 required)"

$nodeOk = $false
try {
    $nodeVersion = & node --version 2>$null
    if ($nodeVersion -match "v(\d+)") {
        $major = [int]$Matches[1]
        if ($major -ge 18) {
            Write-Ok "Node.js $nodeVersion found"
            $nodeOk = $true
        } else {
            Write-Warn "Node.js $nodeVersion is too old (need >= 18)"
        }
    }
} catch {
    Write-Warn "Node.js not found"
}

if (-not $nodeOk) {
    Write-Info "Attempting to install Node.js via winget..."
    $wingetOk = $false
    try {
        $null = Get-Command winget -ErrorAction Stop
        $wingetOk = $true
    } catch {}

    if ($wingetOk) {
        Write-Info "Running: winget install OpenJS.NodeJS.LTS"
        try {
            winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
            # Refresh PATH
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                        [System.Environment]::GetEnvironmentVariable("Path","User")
            $nodeVersion = & node --version 2>$null
            Write-Ok "Node.js $nodeVersion installed"
            $nodeOk = $true
        } catch {
            Write-Err "winget install failed: $_"
        }
    } else {
        Write-Warn "winget not available"
    }

    if (-not $nodeOk) {
        Write-Err "Node.js could not be installed automatically."
        Write-Host ""
        Write-Host "  Please install Node.js manually:" -ForegroundColor Yellow
        Write-Host "  https://nodejs.org/en/download/" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  After installing Node.js, re-run this installer." -ForegroundColor Yellow
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# -- Step 3: Check / Install Git ------------------------------------------------
Write-Step "Checking Git"

$gitOk = $false
try {
    $gitVersion = & git --version 2>$null
    Write-Ok "$gitVersion"
    $gitOk = $true
} catch {
    Write-Warn "Git not found"
}

if (-not $gitOk) {
    Write-Info "Attempting to install Git via winget..."
    $wingetOk = $false
    try {
        $null = Get-Command winget -ErrorAction Stop
        $wingetOk = $true
    } catch {}

    if ($wingetOk) {
        try {
            winget install --id Git.Git --accept-source-agreements --accept-package-agreements
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                        [System.Environment]::GetEnvironmentVariable("Path","User")
            $gitVersion = & git --version 2>$null
            Write-Ok "$gitVersion installed"
            $gitOk = $true
        } catch {
            Write-Err "winget install failed: $_"
        }
    }

    if (-not $gitOk) {
        Write-Err "Git could not be installed automatically."
        Write-Host ""
        Write-Host "  Please install Git manually:" -ForegroundColor Yellow
        Write-Host "  https://git-scm.com/download/win" -ForegroundColor Cyan
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# -- Step 4: Clone or update repo -----------------------------------------------
Write-Step "Setting up ResonantOS repository"

if (-not (Test-Path $REPO_DIR)) {
    Write-Info "Cloning repository to $REPO_DIR ..."
    & git clone --branch $BRANCH --single-branch $REPO_URL $REPO_DIR
    if ($LASTEXITCODE -ne 0) {
        Write-Err "git clone failed. Check your internet connection."
        exit 1
    }
    Write-Ok "Repository cloned"
} else {
    Write-Info "Repository already exists - pulling latest changes..."
    Push-Location $REPO_DIR
    try {
        & git pull
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "git pull failed (may be offline - continuing with local copy)"
        } else {
            Write-Ok "Repository updated"
        }
    } finally {
        Pop-Location
    }
}

# Install npm dependencies for the bridge
$hostDir = Join-Path $REPO_DIR "browser-first\host"
$pkgJson = Join-Path $REPO_DIR "browser-first\package.json"
if (Test-Path $pkgJson) {
    Write-Step "Installing npm dependencies"
    Push-Location (Join-Path $REPO_DIR "browser-first")
    try {
        & npm install --omit=dev --no-fund --no-audit 2>&1
        Write-Ok "npm dependencies installed"
    } catch {
        Write-Warn "npm install encountered issues: $_"
    } finally {
        Pop-Location
    }
}

# -- Step 5: Create directory structure -----------------------------------------
Write-Step "Creating ResonantOS user directory structure"

$dirs = @(
    "$USER_DIR\Secrets",
    "$USER_DIR\Memory\AI_MEMORY\wiki",
    "$USER_DIR\Memory\INTAKE\browser",
    "$USER_DIR\Memory\REVIEW\requests",
    "$USER_DIR\Memory\REVIEW\artifacts",
    "$USER_DIR\BrowserFirst\Profiles",
    "$USER_DIR\BrowserFirst\Goals",
    "$USER_DIR\BrowserFirst\Delegations",
    "$USER_DIR\Logs"
)

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Ok "Created: $dir"
    } else {
        Write-Info "Exists:  $dir"
    }
}

# -- Step 6: Create provider-secrets.json template ------------------------------
Write-Step "Checking provider secrets template"

$secretsFile = "$USER_DIR\Secrets\provider-secrets.json"
if (-not (Test-Path $secretsFile)) {
    $secretsTemplate = @{
        "shared-openai"    = ""
        "shared-minimax"   = ""
        "shared-anthropic" = ""
        "shared-groq"      = ""
        "shared-deepseek"  = ""
        "shared-xai"       = ""
    } | ConvertTo-Json -Depth 2
    $secretsTemplate | Out-File -FilePath $secretsFile -Encoding UTF8
    Write-Ok "Created provider-secrets.json template"
    Write-Info "Edit $secretsFile to add your API keys"
} else {
    Write-Info "provider-secrets.json already exists - not overwritten"
}

# -- Step 7: Install bridge as Windows Task Scheduler task ----------------------
Write-Step "Registering ResonantOS Bridge as a scheduled task"

$bridgeDaemon = Join-Path $REPO_DIR "browser-first\host\run-browser-first.mjs"
$bridgeArgs   = "--bridge-only"
$workingDir   = Join-Path $REPO_DIR "browser-first\host"

# Find node.exe path
$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodePath) {
    Write-Err "node.exe not found in PATH - cannot register scheduled task"
    exit 1
}

# Remove existing task if present (for idempotent re-runs)
$existingTask = Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Info "Removing existing scheduled task for re-registration..."
    Unregister-ScheduledTask -TaskName $TASK_NAME -Confirm:$false
}

try {
    $action   = New-ScheduledTaskAction `
                    -Execute $nodePath `
                    -Argument "`"$bridgeDaemon`" $bridgeArgs" `
                    -WorkingDirectory $workingDir

    $trigger  = New-ScheduledTaskTrigger -AtLogOn

    $settings = New-ScheduledTaskSettingsSet `
                    -AllowStartIfOnBatteries `
                    -DontStopIfGoingOnBatteries `
                    -RestartCount 3 `
                    -RestartInterval (New-TimeSpan -Minutes 1) `
                    -ExecutionTimeLimit (New-TimeSpan -Hours 0)  # No timeout - run forever

    $principal = New-ScheduledTaskPrincipal `
                    -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
                    -LogonType Interactive `
                    -RunLevel Limited  # No elevated privileges

    Register-ScheduledTask `
        -TaskName   $TASK_NAME `
        -Action     $action `
        -Trigger    $trigger `
        -Settings   $settings `
        -Principal  $principal `
        -Description "ResonantOS AI bridge server - auto-starts on login" | Out-Null

    Write-Ok "Scheduled task '$TASK_NAME' registered (starts at logon)"
} catch {
    Write-Err "Failed to register scheduled task: $_"
    Write-Info "You can start the bridge manually: node `"$bridgeDaemon`""
}

# Start the task immediately
Write-Step "Starting ResonantOS Bridge now"
try {
    Start-ScheduledTask -TaskName $TASK_NAME
    Write-Ok "Bridge task started"
} catch {
    Write-Warn "Could not start task immediately: $_"
    Write-Info "It will start automatically on next login"
}

# Wait a moment and verify
Write-Info "Waiting for bridge to come online (port $BRIDGE_PORT)..."
$bridgeOk = $false
$attempts  = 0
$maxTries  = 10

while (-not $bridgeOk -and $attempts -lt $maxTries) {
    Start-Sleep -Seconds 2
    $attempts++
    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:$BRIDGE_PORT/status" `
                        -TimeoutSec 3 -ErrorAction Stop
        Write-Ok "Bridge is online! Status: $($response | ConvertTo-Json -Compress)"
        $bridgeOk = $true
    } catch {
        Write-Info "Attempt $attempts/$maxTries - waiting..."
    }
}

if (-not $bridgeOk) {
    Write-Warn "Bridge not responding yet on port $BRIDGE_PORT"
    Write-Info "It may take a moment after first install. Check with:"
    Write-Info "  Invoke-RestMethod http://127.0.0.1:$BRIDGE_PORT/status"
}

# -- Step 8: Install native messaging host --------------------------------------
Write-Step "Installing native messaging host"

$nativeScript = Join-Path $REPO_DIR "browser-first\native-messaging\install-native-host.ps1"
if (Test-Path $nativeScript) {
    try {
        & powershell -ExecutionPolicy Bypass -File $nativeScript
        Write-Ok "Native messaging host registered"
    } catch {
        Write-Warn "Native messaging install failed: $_"
        Write-Info "Run manually: $nativeScript"
    }
} else {
    Write-Warn "Native messaging install script not found - skipping"
    Write-Info "Run browser-first\native-messaging\install-native-host.ps1 separately"
}

# -- Step 9: Detect browsers ----------------------------------------------------
Write-Step "Detecting installed browsers"

$chromePath = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
$bravePath  = "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe"
$edgePath   = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"

$detectedBrowser = $null
$detectedPath    = $null

if (Test-Path $chromePath) {
    Write-Ok "Google Chrome found at: $chromePath"
    if (-not $detectedBrowser) { $detectedBrowser = "chrome"; $detectedPath = $chromePath }
} else {
    Write-Info "Chrome not found"
}

if (Test-Path $bravePath) {
    Write-Ok "Brave Browser found at: $bravePath"
    if (-not $detectedBrowser) { $detectedBrowser = "brave"; $detectedPath = $bravePath }
} else {
    Write-Info "Brave not found"
}

if (Test-Path $edgePath) {
    Write-Ok "Microsoft Edge found at: $edgePath"
    if (-not $detectedBrowser) { $detectedBrowser = "edge"; $detectedPath = $edgePath }
} else {
    Write-Info "Edge not found"
}

if (-not $detectedBrowser) {
    Write-Warn "No supported browser found (Chrome, Brave, or Edge)"
    Write-Info "Install Chrome: https://chrome.google.com"
    Write-Info "Install Brave:  https://brave.com/download/"
}

# -- Step 10: Final instructions ------------------------------------------------
Write-Host ""
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host " ResonantOS Installation Complete!" -ForegroundColor Green
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " Repository:   $REPO_DIR" -ForegroundColor White
Write-Host " User data:    $USER_DIR" -ForegroundColor White
Write-Host " Bridge port:  http://127.0.0.1:$BRIDGE_PORT" -ForegroundColor White
Write-Host " Secrets file: $USER_DIR\Secrets\provider-secrets.json" -ForegroundColor White
Write-Host ""
Write-Host " Next steps:" -ForegroundColor Yellow
Write-Host "  1. Add your API keys to:" -ForegroundColor White
Write-Host "     $USER_DIR\Secrets\provider-secrets.json" -ForegroundColor Cyan
Write-Host ""
Write-Host "  2. Load the extension in your browser:" -ForegroundColor White
Write-Host "     - Chrome/Brave: chrome://extensions -> Enable Developer mode" -ForegroundColor Cyan
Write-Host "     - Click 'Load unpacked'" -ForegroundColor Cyan
Write-Host "     - Select: $REPO_DIR\browser-first\resonantos-side-panel-extension" -ForegroundColor Cyan
Write-Host ""
Write-Host "  3. Or launch with extension pre-loaded (Windows launcher):" -ForegroundColor White
Write-Host "     $REPO_DIR\browser-first\host\run-browser-first.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "  4. Verify the bridge is running:" -ForegroundColor White
Write-Host "     Invoke-RestMethod http://127.0.0.1:$BRIDGE_PORT/status" -ForegroundColor Cyan
Write-Host ""
Write-Host "  5. To uninstall:" -ForegroundColor White
Write-Host "     $REPO_DIR\browser-first\uninstall.ps1" -ForegroundColor Cyan
Write-Host ""

# -- Step 11: Offer to launch browser ------------------------------------------
if ($detectedBrowser) {
    Write-Host "===========================================================" -ForegroundColor Cyan
    $launch = Read-Host "Launch $detectedBrowser with ResonantOS extension now? (Y/N)"
    if ($launch -match "^[Yy]") {
        $launchScript = Join-Path $REPO_DIR "browser-first\host\run-browser-first.ps1"
        if (Test-Path $launchScript) {
            Write-Info "Launching via run-browser-first.ps1 ..."
            & powershell -ExecutionPolicy Bypass -File $launchScript
        } else {
            # Fallback: direct launch with extension
            $extDir = Join-Path $REPO_DIR "browser-first\resonantos-side-panel-extension"
            $profileDir = "$USER_DIR\BrowserFirst\Profiles\$detectedBrowser"
            New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
            Write-Info "Launching $detectedBrowser..."
            Start-Process $detectedPath -ArgumentList `
                "--load-extension=`"$extDir`"",
                "--user-data-dir=`"$profileDir`""
        }
    } else {
        Write-Info "Skipping browser launch."
    }
}

Write-Host ""
Write-Host " ResonantOS is ready. *" -ForegroundColor Green
Write-Host ""
