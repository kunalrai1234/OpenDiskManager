# OpenDisk Manager — Partition Engine Comparative Analysis

**Document Version:** 1.0.0  
**Scope:** In-Depth Technical & Legal Evaluation of Existing Partition Engines vs. Custom Native Rust Engine  
**Target OS:** Windows 11 x64

---

## 1. Comparative Evaluation Matrix

The table below contrasts six candidate partitioning engines across 15 critical technical, architectural, and legal dimensions:

| Evaluation Criterion | Windows DiskPart | Windows SMAPI / PS | GNU Parted (libparted) | NTFS-3G (ntfsresize) | GParted Backend | Custom Rust Engine (OpenDisk Engine) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Execution Model** | CLI Executable (`diskpart.exe`) | WMI / CIM / PowerShell | Shared C Library (`.so` / `.dll`) | CLI Executable (`ntfsresize.exe`) | Daemon / C++ Subprocess | In-Process Pure Rust Library + IOCTL |
| **Windows 11 Native** | Yes (Built-in) | Yes (Built-in) | No (Heavy POSIX dependency) | Partial (MinGW port required) | No (Linux specific) | **100% Native Win32** |
| **License** | Proprietary (Microsoft) | Proprietary (Microsoft) | **GPLv3+** | **GPLv2+** | **GPLv2+** | **MIT / Apache-2.0 Dual** |
| **License Infection Risk** | None | None | **High (Viral copyleft)** | Medium (Isolated CLI only) | High | **Zero (Permissive)** |
| **GPT Primary & Backup** | Yes | Yes | Yes | N/A (Filesystem level) | Yes | **Yes (Full CRC32 math)** |
| **MBR & EBR Support** | Yes | Yes | Yes | N/A (Filesystem level) | Yes | **Yes (LBA & CHS)** |
| **Partition Movement** | **NO** | **NO** | Yes (via raw block copy)| N/A | Yes | **YES (Bidirectional Copier)** |
| **Online NTFS Extend** | Yes | Yes | No | No | No | **Yes (via FSCTL_EXTEND)** |
| **Online NTFS Shrink** | Yes | Yes | No | No | No | **Yes (via FSCTL_SHRINK)** |
| **Offline NTFS Shrink** | No | No | No | **Yes (Bypasses unmovables)** | Yes (Wraps ntfsresize) | **Optional via Worker CLI** |
| **FAT32 Resize** | Extend only | Extend only | Yes | No | Yes | **Yes (Offline BPB rewrite)** |
| **exFAT Resize** | Extend only | Extend only | Limited | No | Limited | **Yes (Sector math & bitmap)** |
| **ReFS Support** | Extend only | Extend only | No | No | No | **Extend only (Shrink blocked)**|
| **BitLocker Detection** | Indirect | Yes (WMI) | No | No | No | **Yes (Direct WMI & Status)** |
| **Memory / Footprint** | Low (~10 MB) | High (~120 MB PS) | Medium (~25 MB) | Low (~8 MB) | High (~150 MB GTK) | **Ultra-Low (<15 MB)** |

---

## 2. In-Depth Engine Profiles

### 2.1. Windows DiskPart (`diskpart.exe`)
- **Architecture**: A win32 console application acting as a command interpreter over Microsoft's Virtual Disk Service (VDS) and kernel storage IOCTLs.
- **Strengths**:
  - Pre-installed on every Windows machine; zero distribution overhead.
  - Native NTFS extension and shrinking without external drivers.
  - Automatically registers partition updates with `partmgr.sys` and updates mount points.
- **Fatal Weaknesses**:
  - **Inability to Move Partitions**: DiskPart cannot relocate the starting sector of a partition. It cannot expand a volume into preceding unallocated space.
  - **No FAT32/exFAT Shrinking**: Fails immediately if shrinking non-NTFS volumes.
  - **Index Instability**: Commands rely on transient indices (`select disk 0`, `select partition 2`). If a drive disconnects or shifts indices during multi-step execution, DiskPart risks executing destructive operations on the wrong drive.
  - **Licensing**: Closed source, proprietary Microsoft component.

### 2.2. Windows Storage Management API (SMAPI) / PowerShell Storage
- **Architecture**: Modern CIM/WMI provider (`root\Microsoft\Windows\Storage`) exposed to user-mode applications via COM and PowerShell cmdlets (`Get-Partition`, `Resize-Partition`).
- **Strengths**:
  - Transactional and thread-safe within its supported scope.
  - Accurately reports minimum allowable shrink sizes (`Get-PartitionSupportedSize`) accounting for unmovable system files.
- **Fatal Weaknesses**:
  - Identical architectural limitation to DiskPart: Cannot alter the starting LBA of any partition.
  - Calling through PowerShell incurs massive startup latencies (600–1200 ms) and high memory overhead.
  - Direct WMI access via C++ or Rust requires verbose COM initialization and error handling.

### 2.3. GNU Parted (`libparted`)
- **Architecture**: The standard Linux partition table manipulation library, written in C.
- **Strengths**:
  - Mature codebase with decades of production testing across millions of Linux installations.
  - Comprehensive partition table editing (GPT, MBR, BSD disk labels).
- **Fatal Weaknesses**:
  - **POSIX Coupling**: Relies extensively on Linux block device paths (`/dev/sda`), Linux-specific `ioctl` calls (`BLKRRPART`, `BLKSSZGET`), and POSIX threading. Porting to Windows requires extensive emulation layers (e.g. Cygwin) that perform poorly on native Win32.
  - **Licensing Constraint (GPLv3+)**: `libparted` is licensed under GPLv3+. Linking `libparted` statically or dynamically into OpenDisk Manager would legally mandate releasing the entire application under GPLv3+, conflicting with the project's goal of a permissive MIT/Apache-2.0 core.

### 2.4. NTFS-3G / ntfsprogs (`ntfsresize`)
- **Architecture**: Standalone C utility originally developed under the Tuxera open-source initiative for Linux NTFS FUSE mounting.
- **Strengths**:
  - Highly sophisticated offline NTFS resizing engine.
  - Can shrink NTFS volumes **beyond the Windows "unmovable file" limit** by directly relocating `$MFT` clusters and updating cluster runlists in the Master File Table.
- **Weaknesses**:
  - Does not manage partition tables (must be combined with a partition table editor).
  - Designed for offline filesystems; running against an active, mounted Windows drive results in immediate filesystem corruption.
  - Licensed under **GPLv2+**.
- **Role in OpenDisk Manager**:
  - Selected as an **optional, decoupled helper binary** (`opendisk-ntfs-helper.exe`) invoked exclusively when a user needs to shrink an NTFS volume beyond the native Windows online shrink limit.

### 2.5. GParted Backend
- **Architecture**: C++ daemon (`gpartedbin`) controlling multiple external CLI tools (`parted`, `e2fsck`, `ntfsresize`, `fatresize`).
- **Strengths**:
  - Extremely battle-tested queuing, error handling, and visual feedback pipeline.
- **Fatal Weaknesses**:
  - Inherently tied to the Linux userspace ecosystem and GTK/GNOME desktop stack.
  - Not portable to Windows 11 without running inside a full Linux VM or WSL2 environment (which cannot directly lock host physical drives without specialized hypervisor pass-through).
  - Licensed under **GPLv2+**.

### 2.6. Custom Rust Engine (`open-disk-engine`)
- **Architecture**: Modular, memory-safe Rust library implementing direct Win32 IOCTL communication, raw GPT/MBR serialization, bidirectional block copying, and WinPE integration.
- **Strengths**:
  - **Native Windows 11 First**: Built directly against Windows storage APIs (`\\.\PhysicalDriveN`, `IOCTL_DISK_*`, `FSCTL_*`).
  - **Full Partition Relocation**: Custom bidirectional sector copier moves partitions left or right with 4 MiB aligned I/O, live SIMD CRC32 verification, and power-loss journaling.
  - **Zero Copyleft Contamination**: Licensed under **MIT / Apache-2.0**, allowing unrestricted open-source adoption and commercial distribution.
  - **Memory Safety**: Completely eliminates buffer overflows, dangling pointers, and data race bugs common to C/C++ storage tools.
  - **Integrated WinPE Handoff**: Native module for staging offline boot tasks to modify active system drives.

---

## 3. Detailed Feature Comparison by Filesystem

| Operation | Native Win32 / SMAPI | ntfsresize / fatresize | Custom Rust Engine (Planned) |
| :--- | :--- | :--- | :--- |
| **NTFS Extend** | Online via `FSCTL_EXTEND_VOLUME` | Offline only | Direct `FSCTL_EXTEND_VOLUME` call |
| **NTFS Shrink (Standard)**| Online via `FSCTL_SHRINK_VOLUME` | Offline only | Direct `FSCTL_SHRINK_VOLUME` call |
| **NTFS Shrink (Aggressive)**| Fails on unmovable files | Moves `$MFT` and relocates unmovables | Delegated to isolated `ntfsresize` worker |
| **FAT32 Extend** | Supported only via disk recreate | Direct BPB update | Direct BPB update + FAT table expansion |
| **FAT32 Shrink** | **Unsupported** | Shrinks clusters & truncates | Direct FAT cluster truncation (offline) |
| **exFAT Extend** | Unmounted volume only | Limited support | Allocation bitmap expansion |
| **exFAT Shrink** | **Unsupported** | Unsupported | Boundary truncation + bitmap update |
| **ReFS Extend** | Online via `FSCTL_EXTEND_VOLUME` | Unsupported | Direct `FSCTL_EXTEND_VOLUME` call |
| **ReFS Shrink** | **Physically Impossible** | Unsupported | **Strictly Blocked / Disallowed** |

---

## 4. Final Architectural Engine Selection

OpenDisk Manager adopts a **Hybrid Two-Tier Engine Strategy**:

```
+------------------------------------------------------------------------+
|                      OpenDisk Manager Core Engine                      |
|                  (Pure Rust, MIT / Apache-2.0 Dual)                    |
|                                                                        |
|  [Inspection Subsystem]                                                |
|   - SetupAPI + Win32 IOCTL + WMI CIM Storage                           |
|                                                                        |
|  [Standard Online Operations]                                          |
|   - GPT/MBR Partition Table Creation, Deletion, Alignment              |
|   - Online NTFS & ReFS Extension (FSCTL_EXTEND_VOLUME)                 |
|   - Online NTFS Shrinking (FSCTL_SHRINK_VOLUME)                        |
|                                                                        |
|  [Raw Sector Relocation Subsystem]                                     |
|   - Directional Sector Copier (Overlapping buffer protection)          |
|   - 4 MiB Aligned Non-Buffered Asynchronous I/O                        |
|   - VBR Hidden Sectors and GPT CRC32 Recalculation                     |
+-----------------------------------+------------------------------------+
                                    |
          Isolated Process IPC (JSON over stdin / stdout)
                                    |
+-----------------------------------v------------------------------------+
|               Auxiliary Offline Helper (Optional CLI)                 |
|                  (MinGW Ported, GPLv2 / GPLv3)                         |
|                                                                        |
|  [Aggressive NTFS Defragmentation & Shrink Engine]                     |
|   - Relocates pinned $MFT clusters beyond Windows native limit         |
|   - Runs strictly on unmounted volumes or during WinPE boot            |
+------------------------------------------------------------------------+
```

### Justification Summary:
1. **Safety**: Native Windows FSCTLs are used whenever possible to guarantee filesystem integrity.
2. **Capability**: The custom Rust engine solves the fundamental limitation of Windows tools by enabling partition movement.
3. **Legal Integrity**: Decoupling the optional GPL helper via standard process execution keeps the core application 100% permissively licensed under MIT/Apache-2.0.
