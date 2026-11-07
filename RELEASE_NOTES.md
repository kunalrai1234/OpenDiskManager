# OpenDisk Manager — Release Notes (v1.0.0 Production Release)

**Product**: OpenDisk Manager  
**Release Tag**: `v1.0.0`  
**Target Platform**: Windows 11 x64 (Build 22000+)  
**Release Date**: November 2026  
**License**: Apache License 2.0 (Open-Source)  

---

## 1. Executive Summary

We are proud to announce the official **v1.0.0 Production Release** of **OpenDisk Manager**, a modern, free, and open-source Windows 11 disk partition management application designed to replace legacy tools and commercial paywalled utilities.

Built with a high-performance stack comprising React 18, Vite, Electron, and native Windows PowerShell/Win32 Storage subsystems, OpenDisk Manager brings institutional-grade partition manipulation to everyday PC users and system administrators without telemetry, adware, or subscription paywalls.

---

## 2. Key Highlights & Architectural Milestones

### 🛡️ Verified Safety & Zero Host Risk
- **173 / 173 Automated Tests Passing (100% Pass Rate)** across 5 test suites.
- Built-in protective shields for boot-critical extents: **EFI System Partition (ESP)**, **Microsoft Reserved (MSR)**, and active **Windows OS (C:)**.
- Zero destructive testing on host hardware: fully certified using an isolated 64 MiB `SyntheticVirtualDisk` sector harness.

### 📐 Safe Partition Resizing & Extending
- Probes real Windows supported size boundaries (`Get-PartitionSupportedSize`) to calculate safe minimum and maximum sizes in real time.
- Clamps resize requests strictly within physical sector limits and active filesystem cluster footprints.
- Includes a **Dry-Run Simulation Mode** that previews exact sector geometry before execution.

### 🔄 Partition Movement & Overlap-Safe Copying
- Relocates supported data partitions into contiguous unallocated space to clear room for system drives.
- Automatically computes directional copy ordering: uses **Reverse Sector Copy (`TAIL_TO_HEAD`)** during rightward movement to eliminate overlapping block corruption.
- Snaps all partition boundaries to strict 1 MiB alignment boundaries (`LBA % 2048 === 0`).

### 🗺️ Space Planner & Dependency Graph (DAG)
- Transfer space between non-adjacent partitions (e.g., from D: to C:).
- Automatically detects intermediate partitions (e.g., WinRE) and compiles a multi-phase **Directed Acyclic Graph (DAG)** of sequential operations.

### 🧰 Advanced Operations Center
- **Format Partitions**: NTFS, exFAT, and FAT32 (with Windows 32 GiB limits enforced) with custom cluster allocations (4KB–64KB).
- **Delete Partitions**: Safely unmounts and deletes eligible data partitions, returning extents to unallocated space.
- **Drive Letter Manager**: Collision-free letter assignment scanning optical drives, network shares, and local storage.
- **Volume Label Sanitizer**: Updates volume names while filtering illegal characters (`<>:"/\|?*`).
- **Split & Merge**: Divides partitions without data loss and consolidates contiguous volumes on the same physical drive.

### 🔍 Storage Diagnostics & Health Scanner
- Scans disks for 1 MiB partition misalignments, duplicate drive letters, fragmented free space, and MBR > 2 TiB anomalies.
- Inspects filesystem cluster geometries, slack space overhead, and feature flags (BitLocker, Compression, Dirty Bit).

---

## 3. Official Release Artifacts & Cryptographic Checksums

All official release binaries have been compiled, verified, and packaged:

| Distribution Package | Filename | Size | SHA-256 Checksum |
| :--- | :--- | :---: | :--- |
| **Windows NSIS Installer** | `OpenDiskManager-Setup-1.0.0.exe` | ~118.2 MB | `f920818da22ec36ee93af774861b16659fa14ead2752dade1e216e639f041e7b` |
| **Standalone Portable** | `OpenDiskManager-Portable-1.0.0.exe` | ~106.6 MB | `13c79b12878d5670c274335099fdecba0ae4ec95cb585b74a995e9aad106a907` |
| **GitHub Release Archive**| `OpenDiskManager-v1.0.0-windows-x64.zip` | ~224.8 MB | Includes installer, portable exe, docs & licenses |

Verification command:
```powershell
Get-FileHash -Path .\dist-release\OpenDiskManager-Setup-1.0.0.exe -Algorithm SHA256
```

---

## 4. Verification & Quality Standards

- **No Mock Data in Production**: Default application profile queries live Windows hardware via `detect-disks.ps1`.
- **No Hardcoded Developer Paths**: All paths are dynamically resolved via `__dirname` and `process.resourcesPath`.
- **No Silent Destructive Actions**: High-risk operations (format, delete, move) mandate explicit user confirmation codes.
- **Least-Privilege Separation**: Read-only discovery runs under standard user credentials; elevation is required only for storage writes.

