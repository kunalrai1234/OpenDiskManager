# OpenDisk Manager — Development Roadmap & Implementation Plan

**Document Version:** 1.0.0  
**Target Delivery Window:** 6 Phases across 24 Weeks  
**Primary Platform:** Windows 11 x64  
**Development Methodology:** Invariant-Driven Development (IDD) & Sandbox-First Verification

---

## 1. Roadmap Overview & Timeline

```
+─────────────────────────────────────────────────────────────────────────────+
|                         DEVELOPMENT TIMELINE                                |
+─────────────────────────────────────────────────────────────────────────────+
| Phase 0: Research, Architecture & Safety Engineering [COMPLETED]             |
|          Weeks 1–2                                                          |
| Phase 1: Read-Only Storage Topology Inspector & Desktop UI                   |
|          Weeks 3–6                                                          |
| Phase 2: Native Online Operations (Create, Delete, Format, Extend, Shrink)   |
|          Weeks 7–10                                                         |
| Phase 3: Raw Sector Block Mover Engine (Non-System Partition Relocation)    |
|          Weeks 11–14                                                        |
| Phase 4: Advanced Filesystem Engines (FAT32, exFAT, WinRE Integration)      |
|          Weeks 15–18                                                        |
| Phase 5: WinPE Offline Staging Companion (System Partition Operations)      |
|          Weeks 19–21                                                        |
| Phase 6: Fuzzing, Security Hardening, Packaging & Public Release            |
|          Weeks 22–24                                                        |
+─────────────────────────────────────────────────────────────────────────────+
```

---

## 2. Phase-by-Phase Detailed Specifications

### Phase 0: Research, Architecture & Safety Engineering (Current Phase)
- **Status**: Complete
- **Deliverables**:
  - `PROJECT_ARCHITECTURE.md`: High-level system structure, Tauri/Rust architecture, IPC model.
  - `TECHNICAL_RESEARCH.md`: Detailed analysis of all 14 mandatory Windows storage topics.
  - `TECHNOLOGY_DECISIONS.md`: ADRs for framework, language, engines, and licensing.
  - `PARTITION_ENGINE_COMPARISON.md`: Comparative matrix of existing engines vs custom Rust engine.
  - `SECURITY_AND_SAFETY.md`: Invariants, pre-flight verification, and journaling rules.
  - `DEVELOPMENT_ROADMAP.md`: Phase breakdown, milestones, and testing gates.
  - `PROJECT_RISKS.md`: Comprehensive risk taxonomy and mitigation strategies.
- **Exit Gate**: Complete sign-off on architectural feasibility and identification of technical blockers before writing any implementation code.

---

### Phase 1: Read-Only Storage Topology Inspector & Desktop UI
- **Timeline**: Weeks 3–6 (4 Weeks)
- **Objective**: Deliver a 100% read-only desktop application that inspects and visualizes physical drives, partitions, volumes, and free space without any capability to write to disks.
- **Key Deliverables**:
  1. **Tauri v2 Workspace Setup**:
     - Embedded administrator manifest (`requireAdministrator`).
     - Rust backend with `windows-rs`, `wmi`, and `serde`.
     - Frontend with React 18, TypeScript, Tailwind CSS, and Lucide icons.
  2. **Rust Inspection Module**:
     - `PhysicalDrive` enumerator using `SetupAPI` and `CreateFileW`.
     - Partition table parser for GPT (Primary & Backup) and MBR.
     - Extent mapper (`IOCTL_VOLUME_GET_VOLUME_DISK_EXTENTS`) matching drive letters to physical disks.
     - BitLocker detector via WMI `Win32_EncryptableVolume`.
     - SMART health inspector via `IOCTL_STORAGE_PREDICT_FAILURE`.
  3. **Frontend UI Components**:
     - Proportional, interactive partition bar with zoom and hover tooltips.
     - Color-coded partition types (ESP, MSR, Basic Data, Recovery, Unallocated).
     - Storage summary sidebar (Bus Type, Sector Size, GPT/MBR, Health, BitLocker).
     - Pending operations panel (staged UI-only queue).
- **Safety Enforcement**:
  - Zero disk-write APIs compiled into this phase.
  - Read-only file handle flags (`GENERIC_READ`, `FILE_SHARE_READ | FILE_SHARE_WRITE`).
- **Phase 1 Exit Criteria**:
  - Application correctly scans and renders complex multi-disk topologies (NVMe + SATA SSD + USB flash drive) across test systems in under 200 ms.
  - 100% accuracy in identifying ESP, MSR, WinRE, and BitLocker partitions.

---

### Phase 2: Native Online Operations
- **Timeline**: Weeks 7–10 (4 Weeks)
- **Objective**: Implement standard partition operations supported natively by the Windows Storage API on non-system drives.
- **Key Deliverables**:
  1. **Operation Planner & DAG Scheduler**:
     - Invariant validation engine (1 MiB alignment, overlap detection, immutable partition guards).
     - Visual "Before vs After" execution preview modal.
     - Typed confirmation dialogs for destructive actions.
  2. **Native Win32 Operation Modules**:
     - **Create Partition**: Calculate aligned LBA range, write partition entry via `IOCTL_DISK_SET_DRIVE_LAYOUT_EX`, notify shell via `IOCTL_DISK_UPDATE_PROPERTIES`.
     - **Delete Partition**: Clear partition table entry, flush volume handles.
     - **Format Volume**: Win32 `FormatEx` wrapper supporting NTFS, FAT32, exFAT with custom cluster sizes and labels.
     - **Online NTFS Extend**: Grow partition table entry, call `FSCTL_EXTEND_VOLUME`.
     - **Online NTFS Shrink**: Call `FSCTL_SHRINK_VOLUME` to safe limit, shrink partition table entry.
  3. **Virtual VHDX Testing Harness**:
     - Automated test suite creating, mounting, partitioning, and verifying virtual disks without touching physical hardware.
- **Safety Enforcement**:
  - Operations on Physical Drive 0 (System Disk) are blocked in this phase.
  - Operations fail immediately if `FSCTL_LOCK_VOLUME` cannot be acquired.
- **Phase 2 Exit Criteria**:
  - 500+ automated VHDX partition creation, deletion, format, extend, and shrink cycles complete with zero data corruption.
  - Windows Disk Management (`diskmgmt.msc`) recognizes all modifications without errors or warnings.

---

### Phase 3: Raw Sector Block Mover Engine
- **Timeline**: Weeks 11–14 (4 Weeks)
- **Objective**: Implement the custom low-level sector copier to enable moving partitions on non-system disks (relocating start LBA left or right).
- **Key Deliverables**:
  1. **Directional Block Copier**:
     - Backward copier for right-shifts ($LBA_{dst} > LBA_{src}$).
     - Forward copier for left-shifts ($LBA_{dst} < LBA_{src}$).
     - Aligned 4 MiB non-buffered asynchronous I/O (`FILE_FLAG_NO_BUFFERING | FILE_FLAG_WRITE_THROUGH`).
     - Real-time SIMD-accelerated xxHash64 / CRC32 verification per block.
  2. **Filesystem Header Fixer**:
     - Patching NTFS Volume Boot Record ($VBR$) hidden sectors offset.
     - Backup boot sector preservation.
  3. **GPT Synchronization Engine**:
     - Rewriting Primary GPT Header and Partition Entries at LBA 1–33.
     - Rewriting Backup GPT Header and Partition Entries at disk end.
     - Recalculating all 4 CRC32 integrity hashes.
  4. **Write-Ahead Journal (WAL)**:
     - Binary journaling of pre-move state, block progress, and post-move commit.
     - Automatic recovery handler for interrupted operations.
- **Safety Enforcement**:
  - Moving volumes with active BitLocker is blocked unless suspended.
  - Minimum power threshold (system on AC power) enforced.
- **Phase 3 Exit Criteria**:
  - Relocating 50 GB partition left and right across overlapping boundaries completes successfully on secondary NVMe/SATA SSDs.
  - Checksum verification confirms bit-for-bit file integrity post-move (`chkdsk /f` reports clean volume).
  - Simulated process kill during block copy successfully triggers journal recovery.

---

### Phase 4: Advanced Filesystem Engines & OS Integration
- **Timeline**: Weeks 15–18 (4 Weeks)
- **Objective**: Add support for resizing FAT32 and exFAT volumes, integrate WinRE partition management, and implement out-of-process helper bridging.
- **Key Deliverables**:
  1. **FAT32 / exFAT Offline Engine**:
     - FAT32 BIOS Parameter Block (BPB) updater: recalculating total sectors, sectors per FAT, and root cluster pointers.
     - Cluster truncation and moving logic for offline FAT32 shrinking.
     - exFAT allocation bitmap and boot checksum recalculator.
  2. **Windows Recovery (WinRE) Integration**:
     - Automated `reagentc /disable` $\rightarrow$ Relocate WinRE $\rightarrow$ `reagentc /enable` pipeline.
     - WinRE expansion tool to resolve Windows Update installation failures (KB5034441).
  3. **Auxiliary Offline Helper Architecture**:
     - Decoupled worker process (`opendisk-helper.exe`) communicating via JSON IPC.
     - Ability to invoke aggressive NTFS defragmentation/shrink routines for pinned `$MFT` files.
- **Phase 4 Exit Criteria**:
  - FAT32 and exFAT partitions reliably resized and verified across Windows and Linux test mounts.
  - WinRE partition successfully relocated and extended while maintaining full OS recovery registration (`reagentc /info` verifies `Enabled`).

---

### Phase 5: WinPE Offline Staging Companion
- **Timeline**: Weeks 19–21 (3 Weeks)
- **Objective**: Enable moving and shrinking the active system partition (`C:`) by staging an autonomous reboot into Windows Recovery Environment (WinPE/WinRE).
- **Key Deliverables**:
  1. **WinPE Boot Stager**:
     - Injects standalone OpenDisk execution worker into the WinRE scratch space or creates a temporary bootable WinPE WIM.
     - Uses standard Windows BCD API (`bcdedit /bootsequence`) to configure a one-time reboot into WinPE.
  2. **Headless Execution Worker**:
     - Minimal Win32 console application executing staged task instructions (`opendisk-task.json`).
     - Performs exclusive raw sector moves on the unmounted system drive.
     - Updates BCD boot device pointers if partition GUIDs or starting offsets changed.
     - Automatically logs results and triggers system reboot back into Windows 11.
  3. **BitLocker Pre-Boot Coordination**:
     - Automates `Suspend-BitLocker` with a 1-reboot threshold before WinPE handoff, preventing TPM PCR lockout.
- **Phase 5 Exit Criteria**:
  - User can shrink `C:`, move `C:` to the right, and expand the ESP or Recovery partition from within the main GUI.
  - System reboots into WinPE, executes operations with live on-screen progress, reboots into Windows 11, and boots to the desktop with zero errors.

---

### Phase 6: Hardening, Fuzzing, Packaging & Release
- **Timeline**: Weeks 22–24 (3 Weeks)
- **Objective**: Conduct extensive stress testing, security audits, installer packaging, and open-source documentation.
- **Key Deliverables**:
  1. **Automated Fuzzing & Stress Testing**:
     - Chaos testing on virtual disks: injecting random I/O faults, sudden reboots, and simulated bad blocks during partition moves.
     - GPT parser fuzzing with `cargo-fuzz` / libFuzzer to guarantee robustness against malformed partition tables.
  2. **Installer & Packaging**:
     - WiX Toolset / Inno Setup installer packaging the signed Tauri binary.
     - Microsoft Windows App SDK and WebView2 runtime verification.
     - Portable `.zip` release supporting USB flash drive execution.
  3. **Documentation & Open-Source Release**:
     - Full technical documentation, developer setup guide, and architectural diagrams.
     - MIT / Apache-2.0 open-source repository release on GitHub.
- **Phase 6 Exit Criteria**:
  - Zero critical bugs or regressions across all test matrices.
  - Clean S.M.A.R.T. and filesystem health verification across 1,000+ stress-test cycles.
  - Final 1.0.0 General Availability (GA) release.
