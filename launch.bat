@echo off
title OpenDisk Manager - Windows 11 Storage Systems Director
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
echo Launching OpenDisk Manager Desktop Application...

if exist "%~dp0node_modules\electron\dist\electron.exe" (
    start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0desktop-runner.cjs"
) else (
    npx electron "%~dp0desktop-runner.cjs"
)
exit
