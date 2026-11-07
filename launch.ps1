# OpenDisk Manager Desktop Launcher
Set-Location -Path $PSScriptRoot
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Write-Host "Launching OpenDisk Manager (Windows 11 Storage Systems Director)..." -ForegroundColor Cyan

$localElectron = Join-Path $PSScriptRoot "node_modules\electron\dist\electron.exe"
if (Test-Path $localElectron) {
    Start-Process -FilePath $localElectron -ArgumentList "$PSScriptRoot\desktop-runner.cjs"
} else {
    Start-Process -FilePath "npx.cmd" -ArgumentList "electron `"$PSScriptRoot\desktop-runner.cjs`""
}
