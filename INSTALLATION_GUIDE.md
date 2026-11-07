# OpenDisk Manager — Windows 11 Installation & Deployment Guide

**Product**: OpenDisk Manager  
**Version**: 1.0.0 Production Release  
**Platform**: Windows 11 x64 / Windows 10 x64  
**Date**: November 2026  

---

## 1. System Requirements

| Specification | Minimum Requirement | Recommended Specification |
| :--- | :--- | :--- |
| **Operating System** | Windows 11 x64 (Build 22000+) or Windows 10 x64 (Build 19041+) | Windows 11 x64 (22H2/23H2/24H2) |
| **Architecture** | x86-64 (AMD64 / Intel 64) | x86-64 with AVX2 support |
| **Processor** | Dual-core 1.8 GHz or faster | Quad-core 2.5 GHz or faster |
| **System Memory** | 4 GB RAM | 8 GB+ RAM |
| **Free Storage Space**| 350 MB for installation & temporary buffers | 1 GB free space on OS volume |
| **Firmware Mode** | UEFI (Recommended) or Legacy BIOS (MBR) | UEFI Mode with Secure Boot enabled |
| **Execution Rights** | Standard User for read-only disk inspection | Administrator (UAC) for disk operations |

---

## 2. Distribution Packages

OpenDisk Manager is distributed in two official release packages:

### Option A: Standard Windows Installer (Recommended for Desktops)
- **Filename**: `OpenDiskManager-Setup-1.0.0.exe`
- **Features**:
  - Full NSIS interactive setup wizard.
  - Allows selecting custom installation destination.
  - Generates Desktop and Start Menu shortcuts.
  - Registers clean uninstaller in Windows "Installed Apps" / "Apps & Features".
  - Installs PowerShell storage script resources into isolated application directory.

### Option B: Portable Edition (Recommended for Rescue Sticks & WinPE)
- **Filename**: `OpenDiskManager-Portable-1.0.0.exe`
- **Features**:
  - Zero-installation standalone executable.
  - Leaves zero residual registry entries or file system artifacts on exit.
  - Self-extracts to user temporary directory and executes immediately.
  - Ideal for offline technician USB drives and Windows Recovery environments.

---

## 3. Step-by-Step Installation Instructions

### 3.1 Standard Setup Wizard
1. Download `OpenDiskManager-Setup-1.0.0.exe` from the official repository release page.
2. (Optional) Verify the SHA-256 checksum:
   ```powershell
   Get-FileHash .\OpenDiskManager-Setup-1.0.0.exe -Algorithm SHA256
   # Verify against: f920818da22ec36ee93af774861b16659fa14ead2752dade1e216e639f041e7b
   ```
3. Double-click `OpenDiskManager-Setup-1.0.0.exe` to launch the installer.
4. If Windows Defender SmartScreen displays **"Windows protected your PC"** (due to community self-signing):
   - Click **"More info"**.
   - Click **"Run anyway"**.
5. Follow the setup wizard prompts:
   - Accept the Apache License 2.0.
   - Choose destination folder (default: `C:\Program Files\OpenDisk Manager`).
   - Select shortcut preferences.
6. Click **Install**. Once finished, check **"Launch OpenDisk Manager"** and click **Finish**.

### 3.2 Silent & Automated Enterprise Deployment
Network administrators can deploy OpenDisk Manager across fleets silently via PowerShell or Microsoft Intune:

```cmd
:: Silent installation with default settings
OpenDiskManager-Setup-1.0.0.exe /S

:: Silent installation with custom directory
OpenDiskManager-Setup-1.0.0.exe /S /D=C:\CustomPath\OpenDiskManager
```

---

## 4. Privilege & UAC Execution Guidelines

OpenDisk Manager is designed with a **Least-Privilege Security Model**:

- **Standard Launch (Double-click)**:
  - Launches in read-only inspection mode (`requestedExecutionLevel="asInvoker"`).
  - You can safely inspect disks, review partition geometry, browse filesystem clusters, plan space transfers, and run storage diagnostics without prompting for UAC credentials.
- **Elevated Execution (Modifications)**:
  - When committing partition modifications (resize, move, format, delete, split, merge), Windows will present a standard UAC elevation prompt.
  - Alternatively, right-click the shortcut and select **"Run as administrator"** to start the application with write capabilities pre-granted.

---

## 5. Uninstallation Instructions

To remove OpenDisk Manager completely from your workstation:

### Method 1: Windows Settings
1. Open Windows **Settings** (`Win + I`).
2. Navigate to **Apps** -> **Installed apps** (or **Apps & features**).
3. Search for **OpenDisk Manager**.
4. Click the three dots (`...`) menu and select **Uninstall**.
5. Confirm removal when prompted.

### Method 2: Direct Uninstaller
1. Navigate to the installation directory (`C:\Program Files\OpenDisk Manager`).
2. Double-click `Uninstall OpenDisk Manager.exe`.
3. Confirm uninstallation. The wizard removes all binaries, shortcuts, and registry keys cleanly.

