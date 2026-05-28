@echo off
:: ═══════════════════════════════════════════════════════════════════════════════
:: ResonantOS Installer for Windows — Batch Wrapper
:: Double-click this file to install ResonantOS.
:: Calls install.ps1 via PowerShell with execution policy bypass.
:: ═══════════════════════════════════════════════════════════════════════════════

echo ResonantOS Windows Installer
echo ==============================
echo.

:: Check if PowerShell is available
where powershell >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: PowerShell is not available on this system.
    echo PowerShell is required and should be installed by default on Windows 10/11.
    pause
    exit /b 1
)

:: Run the PowerShell installer from the same directory as this .bat file
powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"

:: Capture exit code
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% NEQ 0 (
    echo.
    echo Installation failed with error code %EXIT_CODE%.
)

pause
exit /b %EXIT_CODE%
