# OpenDisk Manager — Architecture Decision Records (ADRs) & Technology Justifications

**Document Version:** 1.0.0  
**Status:** Approved for Implementation  
**Standard:** MADR (Markdown Architecture Decision Records) Format  
**Scope:** Core Stack, Platform Interop, Engines, Security, and Licensing Compliance

---

## 1. Summary Matrix of Technology Decisions

| Decision Area | Selected Technology | Evaluated Alternatives | Key Justification | License |
| :--- | :--- | :--- | :--- | :--- |
| **Desktop Framework** | **Tauri v2** | Electron, Flutter, WinUI 3 / C#, Iced/Egui | Minimal footprint (~15 MB), low RAM (<60 MB), native WebView2, direct zero-overhead Rust FFI. | MIT / Apache-2.0 |
| **Backend Language** | **Rust (1.80+)** | Modern C++20, C# (.NET 9), Go | Memory safety, zero data races in concurrent I/O, no GC pauses during disk streaming, official Microsoft `windows-rs` bindings. | MIT / Apache-2.0 |
| **Disk Inspection** | **Hybrid Win32 IOCTL + WMI CIM** | PowerShell CLI, VDS COM, SetupAPI only | Sub-millisecond queries via IOCTL; high-level volume metadata via WMI; zero shell execution overhead. | Native OS APIs |
| **Partition Table Engine** | **Native Rust (`open-disk-engine`)** | `libparted` (GNU), DiskPart wrapper | Complete control over GPT primary/backup headers, CRC32 verification, 100% thread-safe, no GPL infection. | MIT / Apache-2.0 |
| **Offline Operations** | **WinPE / WinRE Companion Staging** | Native NT `autocheck`, Custom Kernel Driver | Safe user-mode Win32 execution from RAM disk, full driver/display support, no BSOD risk, compliant with Secure Boot & HVCI. | Microsoft WinPE ADK / OS |
| **Filesystem Resize** | **Native FSCTL + Isolated Helper** | Pure `ntfs-3g` in-process, DiskPart script | Native `FSCTL_SHRINK_VOLUME` for 95% of standard cases; decoupled out-of-process helper for advanced shrink. | Dual (Permissive core + Isolated process) |
| **Frontend Stack** | **React + TypeScript + Tailwind CSS** | Svelte 5, Vue 3, Plain HTML/JS | Mature ecosystem for rich visual canvas/SVG disk map components, strong typing aligned with Rust Serde models. | MIT |
| **Privilege Model** | **Embedded UAC Manifest + Token Adjust** | Sudo-for-Windows, Background Windows Service | Transparent UAC elevation at launch, direct access to `SeManageVolumePrivilege`, avoids complex IPC service vulnerabilities. | Native OS Security |

---

## 2. Architecture Decision Records (ADRs)

### ADR-001: Desktop Framework Selection

#### Context:
The desktop frontend must render high-density, interactive disk layout maps, respond to real-time sector copy streaming events, and run reliably across Windows 11 systems without installing large ancillary runtimes.

#### Decision:
Adopt **Tauri v2** (Rust core + Windows WebView2).

#### Evaluated Alternatives:
1. **Electron**:
   - *Pros*: Massive community, flexible web technologies.
   - *Cons*: Ships entire Chromium runtime; bloated installer size (>150 MB), idle memory consumption >250 MB; slower cold startup; IPC between Node.js and C++ native addons requires complex build toolchains (node-gyp).
2. **WinUI 3 / C# (.NET 9)**:
   - *Pros*: Native Windows controls and Fluent Design.
   - *Cons*: Heavy .NET runtime dependencies; native C interop via P/Invoke is verbose and lacks compile-time memory safety for raw buffer allocations; non-portable outside Windows.
3. **Pure Rust GUI (Iced / Egui)**:
   - *Pros*: Single compiled binary, pure Rust.
   - *Cons*: Immature UI component ecosystem for high-precision draggable canvas sliders, fractional percentage partition visualizers, and complex responsive data grids.

#### Justification & Trade-Offs:
Tauri v2 leverages the evergreen Microsoft Edge WebView2 control pre-installed on all Windows 11 installations. The resulting application binary is under 15 MB, consumes ~45 MB of RAM, and launches in under 400 ms. Tauri's type-safe IPC bridge allows direct invocation of Rust functions with zero serialization overhead for raw binary buffers.

---

### ADR-002: Backend Systems Programming Language

#### Context:
The backend must perform low-level hardware interactions: opening raw physical drive handles, allocating sector-aligned memory blocks, reading/writing gigabytes of disk sectors, calculating checksums, and interfacing with kernel I/O controls.

#### Decision:
Adopt **Rust (Edition 2021, Compiler 1.80+)**.

#### Evaluated Alternatives:
1. **Modern C++ (C++20)**:
   - *Pros*: Traditional standard for Windows storage utilities; comprehensive Win32 header access.
   - *Cons*: High susceptibility to buffer overflows, off-by-one errors in pointer arithmetic during raw block copying, memory leaks, and multithreading data races.
2. **C# (.NET 9 AOT)**:
   - *Pros*: High development velocity, native WMI integration.
   - *Cons*: Garbage collection pauses can stutter low-level asynchronous block transfers; unmanaged memory pinning (`fixed`, `Marshal`) adds cognitive overhead without Rust's compile-time ownership guarantees.

#### Justification & Trade-Offs:
In partition management, a single off-by-one pointer arithmetic error can overwrite a Master File Table or partition header, destroying terabytes of user data. Rust’s affine type system, ownership semantics, and borrow checker guarantee memory safety at compile time. Official Microsoft support via the `windows-rs` crate provides idiomatic, high-performance Win32 API bindings.

---

### ADR-003: Disk & Storage Inspection Strategy

#### Context:
The application requires comprehensive telemetry: physical disk paths, bus types (NVMe/SATA/USB), logical/physical sector sizes, partition tables (MBR/GPT), filesystem types, volume labels, cluster sizes, free space, and BitLocker encryption status.

#### Decision:
Implement a **Two-Tier Inspection Pipeline**:
- **Tier 1 (High Performance)**: Direct Win32 IOCTL calls (`IOCTL_DISK_GET_DRIVE_LAYOUT_EX`, `IOCTL_STORAGE_QUERY_PROPERTY`, `GetDiskFreeSpaceExW`).
- **Tier 2 (High-Level Metadata)**: WMI CIM Storage queries (`root\Microsoft\Windows\Storage` and `root\CIMv2\Security\MicrosoftVolumeEncryption`) for BitLocker and operational statuses.

#### Evaluated Alternatives:
1. **PowerShell CLI Invocation (`Get-Disk | ConvertTo-Json`)**:
   - *Rejected*: Incurs 600–1200 ms process startup latency per invocation; fragile string parsing; blocked by restrictive enterprise Execution Policies.
2. **Virtual Disk Service (VDS) COM Interfaces**:
   - *Rejected*: Deprecated by Microsoft since Windows 8; prone to COM deadlocks; complex C++ interface definitions that are difficult to bind cleanly in Rust.

#### Justification & Trade-Offs:
Win32 IOCTL queries execute in under 2 milliseconds, providing instantaneous UI refreshes during drive insertions or partition changes. WMI CIM is utilized exclusively for metadata queries that lack standard IOCTL equivalents (e.g., querying BitLocker TPM sealing states).

---

### ADR-004: Partition Table & Low-Level Disk Manipulation Engine

#### Context:
The engine must parse, validate, create, modify, and write GPT and MBR partition tables directly to raw disk handles, including recalculating CRC32 integrity hashes.

#### Decision:
Develop a **Native Pure-Rust Partition Engine (`open-disk-engine`)** adhering to the UEFI 2.10 and MBR specifications.

#### Evaluated Alternatives:
1. **Wrapping `libparted` (GNU Parted)**:
   - *Rejected*: `libparted` is heavily coupled to POSIX syscalls (`ioctl`, `/dev/sdX`), lacks native Windows support, and is licensed under GPLv3+, which imposes viral copyleft restrictions.
2. **Scripting `diskpart.exe`**:
   - *Rejected*: DiskPart cannot move partitions, cannot shrink FAT32/exFAT, uses non-persistent disk numbers, and provides zero real-time progress feedback.

#### Justification & Trade-Offs:
The GPT specification is deterministic and well-documented:
- LBA 0: Protective MBR (512 bytes).
- LBA 1: Primary Header (92 bytes, CRC32).
- LBA 2–33: 128 Partition Entries (128 bytes each, CRC32).
- Disk End: Mirror Backup GPT.
Building a dedicated, pure-Rust parser and serializer takes fewer than 1,200 lines of verified code, avoids third-party C vulnerabilities, guarantees 100% Windows compatibility, and remains permissively licensed (MIT/Apache-2.0).

---

### ADR-005: Offline Operations Architecture for Active System Disk (C:)

#### Context:
When the Windows OS is running, the system partition (`C:`) cannot be unmounted or shifted in place because core kernel files, pagefiles, and registry hives are locked.

#### Decision:
Deploy an **Automated Windows PE (WinPE) / WinRE Staging Companion**.

#### Evaluated Alternatives:
1. **Native NT `BootExecute` Driver (`autocheck`)**:
   - *Rejected*: Runs before the Win32 subsystem during boot. Any unhandled exception or memory fault causes an instant Blue Screen of Death (`BSOD`), resulting in an unbootable system that requires external recovery media. Windows 11 Driver Signature Enforcement and HVCI also block loading custom native binaries without enterprise WHQL signing.
2. **Live Shadow Copy Shifting (In-Place VSS)**:
   - *Rejected*: VSS creates point-in-time read snapshots; it cannot redirect live dirty kernel writes away from physical sectors being relocated underneath the filesystem.

#### Justification & Trade-Offs:
Windows Recovery Environment (`winre.wim`) is pre-installed on virtually all Windows 11 systems. By staging an automated task script and invoking a one-time boot sequence via the standard Windows BCD API (`bcdedit /bootsequence`), OpenDisk Manager boots into a safe, RAM-disk-hosted Win32 environment. In WinPE:
- Target drive `C:` is completely idle and unmounted.
- Full Win32 file/disk I/O APIs and graphics subsystems are available.
- Operations run with 100% exclusive access, zero file locks, and robust error recovery.

---

### ADR-006: Filesystem Resizing Strategy

#### Context:
OpenDisk Manager must resize NTFS, FAT32, and exFAT filesystems without corrupting cluster allocations or file record segments.

#### Decision:
Adopt a **Dual-Track Resizing Strategy**:
- **Track 1 (Online Native)**: For NTFS and ReFS extensions, and NTFS shrinking within standard boundaries, invoke Windows kernel controls (`FSCTL_EXTEND_VOLUME`, `FSCTL_SHRINK_VOLUME`).
- **Track 2 (Offline Standalone Helper)**: For advanced NTFS shrinking (bypassing unmovable files) or FAT32/exFAT operations, utilize an isolated, out-of-process helper utility.

#### Evaluated Alternatives:
1. **Re-implementing NTFS Engine in Rust from Scratch**:
   - *Rejected*: NTFS is an extraordinarily complex, proprietary, partially undocumented filesystem with compressed files, sparse files, reparse points, and transactional logging. Re-implementing an in-kernel NTFS defragmenter and resize engine introduces intolerable data loss risks.

#### Justification & Trade-Offs:
Native Windows `FSCTL` calls are battle-tested across hundreds of millions of machines. Relying on `ntfs.sys` to relocate clusters online guarantees that USN journals, transactional metadata, and security descriptors remain valid.

---

### ADR-007: Frontend Presentation Framework

#### Context:
The GUI requires responsive layout components, visual representation of disk extents, dynamic color-coded partition bars, and intuitive dialogs.

#### Decision:
Adopt **React 18 + TypeScript + Tailwind CSS + Lucide Icons + Radix UI Primitives**.

#### Evaluated Alternatives:
1. **Vanilla JavaScript / HTML5**:
   - *Rejected*: Lack of reactive state management makes synchronizing pending operations, multi-disk views, and undo/redo stacks error-prone.
2. **Svelte 5**:
   - *Evaluated Favorably*: Highly performant, but React has significantly wider availability of pre-built, accessible slider and canvas data-visualization components.

#### Justification & Trade-Offs:
React 18 paired with TypeScript provides complete compile-time contract verification with Rust Serde models (via tools like `ts-rs`), ensuring frontend state never deviates from backend representations.

---

### ADR-008: Process Privilege & Elevation Model

#### Context:
Disk partitioning and raw I/O strictly require Windows Administrator elevation (`SeManageVolumePrivilege`, `SeBackupPrivilege`).

#### Decision:
Embed an **Application Manifest Mandating UAC Elevation** (`requestedExecutionLevel="requireAdministrator"`).

#### Evaluated Alternatives:
1. **Split Architecture (Standard User GUI + Background Windows Service)**:
   - *Rejected*: A persistent Windows service running as `NT AUTHORITY\SYSTEM` listening on named pipes creates a significant local privilege escalation (LPE) attack surface.
2. **On-Demand Elevation (Spawning elevated worker on action)**:
   - *Rejected*: Disk inspection itself requires administrator privileges to open `\\.\PhysicalDriveN` handles; delaying elevation would prevent the UI from reading physical drive geometry on startup.

#### Justification & Trade-Offs:
Users expect partition managers (such as Disk Management or Rufus) to request UAC elevation immediately upon launch. Operating entirely within an elevated context eliminates IPC authentication vulnerabilities and streamlines the architecture.

---

### ADR-009: Licensing Compliance & Isolation Strategy

#### Context:
OpenDisk Manager is committed to being 100% free and open-source under a permissive license (MIT / Apache-2.0) while evaluating third-party partition utilities that are licensed under GPLv2 or GPLv3.

#### Decision:
Enforce **Strict Process-Boundary Isolation**:
- The core OpenDisk Manager application, Tauri wrapper, Rust backend, and UI will be licensed under **MIT / Apache-2.0 dual license**.
- No GPL-licensed source code or static/dynamic libraries will be linked into the primary binary.
- Any GPL-derived helper tools (e.g., `ntfsresize`) will be distributed as standalone executable binaries communicating strictly over standard pipes (JSON via stdin/stdout).

#### Justification & Legal Precedent:
Under Free Software Foundation (FSF) GPL guidelines and copyright law, invoking a completely separate program via process invocation (`std::process::Command`) across a well-defined public interface does not make the invoking program a derivative work. This protects the permissive licensing of OpenDisk Manager while maximizing utility for end users.
