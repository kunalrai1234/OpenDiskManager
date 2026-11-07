# OpenDisk Manager

**Free & Open-Source Windows 11 Disk Partition & Storage Systems Director**  
**Target Platform:** Windows 11 x64 (Build 22000+)  
**Version:** 1.0.0 (Production Release)  
**License:** Apache License 2.0  

---

## 1. Overview & Vision

OpenDisk Manager is designed from the ground up as a modern, high-performance, open-source alternative to legacy Windows tools (`diskmgmt.msc`, `diskpart.exe`) and costly commercial partition utilities. It provides safe partition inspecting, shrinking, extending, moving, formatting, deleting, splitting, and merging—with zero telemetry, adware, or paywalls.

### Official v1.0.0 Production Binaries

| Package | Type | Size | Direct Download | SHA-256 Checksum |
| :--- | :--- | :---: | :---: | :--- |
| **Windows NSIS Setup** | Installer | 118.2 MB | [Download Setup (.exe)](https://github.com/kunalrai1234/OpenDiskManager/releases/download/v1.0.0/OpenDiskManager-Setup-1.0.0.exe) | `f920818da22ec36ee93af774861b16659fa14ead2752dade1e216e639f041e7b` |
| **Windows Portable** | Standalone | 106.6 MB | [Download Portable (.exe)](https://github.com/kunalrai1234/OpenDiskManager/releases/download/v1.0.0/OpenDiskManager-Portable-1.0.0.exe) | `13c79b12878d5670c274335099fdecba0ae4ec95cb585b74a995e9aad106a907` |
| **GitHub Release Archive** | ZIP Bundle | 225.0 MB | [Download Bundle (.zip)](https://github.com/kunalrai1234/OpenDiskManager/releases/download/v1.0.0/OpenDiskManager-v1.0.0-windows-x64.zip) | `7fca4786460e065beec24358b2e32e108ef2f184e4f083a2ba19584ef50bd817` |

---

## 2. Key Features

- **Real Hardware Detection Subsystem**:
  - Auto-detects NVMe, SATA, and USB drives via native Windows Storage APIs (`Get-Disk`, `Get-Partition`, `Get-Volume`).
  - Serial numbers, bus type, logical/physical sector sizes (512e vs. 4Kn), GPT/MBR partition schemes, and S.M.A.R.T. health verification.
- **Safe Partition Resize & Extend Controller**:
  - Live supported size boundaries (`SizeMin` and `SizeMax`).
  - Clamps resize requests strictly within safe data and adjacent space limits.
  - Interactive slider, numeric inputs, and **Simulation Dry-Run Mode**.
- **Partition Movement & Relocation Controller**:
  - Direction vector analysis (`SHIFT_RIGHT` vs. `SHIFT_LEFT`).
  - Automatic collision prevention via **Reverse Sector Copy (`TAIL_TO_HEAD`)**.
  - Strict 1 MiB sector alignment (`LBA % 2048 === 0`).
  - Offline WinPE task generator for active Windows boot partition.
- **Space Planner & DAG Compiler**:
  - Multi-partition space transfer planning (e.g., D: $\rightarrow$ C:).
  - Automatically identifies intermediate partitions and compiles an Operation Dependency Graph (DAG).
- **Advanced Operations Center**:
  - Format partitions (NTFS, exFAT, FAT32) with custom cluster allocation sizes.
  - Delete eligible data partitions with explicit confirmation codes.
  - Collision-free drive letter assignment and removal.
  - Volume label editing with illegal character sanitization.
  - Non-destructive partition split and contiguous partition merge.
- **Storage Diagnostics & Health Scanner**:
  - Proactively flags 1 MiB misalignments, duplicate drive letters, and fragmented unallocated gaps.
  - Detailed filesystem cluster geometry and slack space inspector.
- **Robust Disaster Recovery & Safety Invariants**:
  - **173 / 173 Automated Tests Passing (100% Pass Rate)** across 5 verification suites.
  - Non-bypassable shields for EFI System Partition (ESP), Microsoft Reserved (MSR), and Windows OS Boot (C:).

---

## 3. Quick Start & Execution

### Option 1: Run the Official Installer
1. Download [**`OpenDiskManager-Setup-1.0.0.exe`**](file:///D:/Project/OpenDiskManager/dist-release/OpenDiskManager-Setup-1.0.0.exe).
2. Follow the setup wizard to install to `C:\Program Files\OpenDisk Manager`.
3. Launch from the Desktop or Start Menu shortcut.

### Option 2: Run the Portable Edition
1. Download [**`OpenDiskManager-Portable-1.0.0.exe`**](file:///D:/Project/OpenDiskManager/dist-release/OpenDiskManager-Portable-1.0.0.exe).
2. Run directly from any folder or USB rescue stick (no installation required).

### Option 3: Launch from Source Code
```powershell
cd D:\Project\OpenDiskManager
npm install
npm run build
npm run desktop
```

### Running the Complete Automated Test Suites
```bash
# Phase 3 Layout Analysis & DAG Test Suite (40 tests)
node test/phase3_engine_test.js

# Phase 4 Safe Resize & Extend Engine Test Suite (33 tests)
node test/phase4_resize_engine_test.js

# Phase 5 Partition Movement Engine Test Suite (35 tests)
node test/phase5_movement_engine_test.js

# Phase 6 Advanced Partition Management Test Suite (46 tests)
node test/phase6_advanced_engine_test.js

# Phase 7 Safety, Recovery & Fault-Injection Test Suite (19 tests)
node test/phase7_safety_recovery_test.js
```

---

## 4. Documentation Catalog

- [**INSTALLATION_GUIDE.md**](file:///D:/Project/OpenDiskManager/INSTALLATION_GUIDE.md) — System requirements, installer options, silent deployment flags, and uninstallation.
- [**USER_MANUAL.md**](file:///D:/Project/OpenDiskManager/USER_MANUAL.md) — Comprehensive user handbook with diagrams and step-by-step guides for all operations.
- [**RELEASE_NOTES.md**](file:///D:/Project/OpenDiskManager/RELEASE_NOTES.md) — Official v1.0.0 release notes, changelog, and cryptographic checksums.
- [**FINAL_AUDIT.md**](file:///D:/Project/OpenDiskManager/FINAL_AUDIT.md) — Final quality, security, and packaging signoff report.
- [**TEST_REPORT.md**](file:///D:/Project/OpenDiskManager/TEST_REPORT.md) — 173-test verification report, virtual disk harness, and SHA-256 integrity proofs.
- [**SECURITY_AUDIT.md**](file:///D:/Project/OpenDiskManager/SECURITY_AUDIT.md) — Threat model, process boundaries, UAC elevation, and protected partition shields.
- [**RECOVERY_GUIDE.md**](file:///D:/Project/OpenDiskManager/RECOVERY_GUIDE.md) — Interrupted operation triage, WinPE / WinRE boot repair, and BitLocker recovery.
- [**KNOWN_LIMITATIONS.md**](file:///D:/Project/OpenDiskManager/KNOWN_LIMITATIONS.md) — Transparent technical boundaries (ReFS shrinking, FAT32 32 GiB limits, Dynamic Disks).
- [**LICENSE**](file:///D:/Project/OpenDiskManager/LICENSE) — Apache License Version 2.0.
- [**THIRD_PARTY_LICENSES.md**](file:///D:/Project/OpenDiskManager/THIRD_PARTY_LICENSES.md) — Attributions for Electron, Chromium, React, Lucide, Vite, and NSIS.

---

## 5. License

OpenDisk Manager is licensed under the [Apache License, Version 2.0](file:///D:/Project/OpenDiskManager/LICENSE).
