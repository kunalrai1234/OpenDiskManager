# OpenDisk Manager — Technical Research Document

**Author:** Senior Windows Storage Systems Engineering Group  
**Target:** Windows 11 x64 (Build 22000+)  
**Scope:** Deep Technical Investigation of Windows Storage Subsystems, Partitioning Geometry, Filesystems, I/O Controls, and Licensing

---

## 1. Windows Disk Management Architecture

Windows disk and volume management is split across a multi-tiered architecture spanning user-mode abstractions, COM services, Win32 subsystems, and kernel-mode storage stacks.

```
                      +---------------------------------------+
                      | User Mode Applications / UI / Tools   |
                      | (diskmgmt.msc, diskpart.exe, OpenDisk)|
                      +-------------------+-------------------+
                                          |
        +---------------------------------+---------------------------------+
        |                                 |                                 |
        v                                 v                                 v
+---------------+               +-------------------+              +----------------+
|  VDS Service  |               | WMI / CIM Storage |              | Direct Win32   |
| (vds.exe/COM) |               | (storagewmi.dll)  |              | Device Handles |
+-------+-------+               +---------+---------+              +-------+--------+
        |                                 |                                |
        +---------------------------------+--------------------------------+
                                          |
                      +-------------------v-------------------+
                      |      I/O Manager / Win32 Subsystem    |
                      |   (CreateFileW, DeviceIoControl)      |
                      +-------------------+-------------------+
                                          | System Calls
══════════════════════════════════════════╪═════════════════════════════════════════
Kernel Mode                               |
                      +-------------------v-------------------+
                      |  File System Driver (FSD) Stack       |
                      |  (ntfs.sys, fastfat.sys, refs.sys)    |
                      +-------------------+-------------------+
                                          |
                      +-------------------v-------------------+
                      |  File System Filter Stack             |
                      |  (fltmgr.sys, fvevol.sys - BitLocker) |
                      +-------------------+-------------------+
                                          |
                      +-------------------v-------------------+
                      |  Volume Manager Subsystem             |
                      |  (volmgr.sys [Basic], volmgrx [Dyn])  |
                      +-------------------+-------------------+
                                          |
                      +-------------------v-------------------+
                      |  Partition Manager (partmgr.sys)      |
                      +-------------------+-------------------+
                                          |
                      +-------------------v-------------------+
                      |  Disk Class Driver (disk.sys)         |
                      +-------------------+-------------------+
                                          |
                      +-------------------v-------------------+
                      |  Port / Miniport Drivers              |
                      |  (storport.sys, stornvme.sys, storahci|
                      +-------------------+-------------------+
                                          |
                      +-------------------v-------------------+
                      |  Hardware Bus (NVMe / SATA / USB / SAS)|
                      +---------------------------------------+
```

### Key Drivers in the Stack:
- **`disk.sys`**: Handles physical disk requests, queries geometry, manages SMART data, translates SCSI/NVMe commands.
- **`partmgr.sys`**: Inspects partition tables (MBR/GPT) upon device arrival, publishes partition device interfaces (`\Device\HarddiskX\PartitionY`), and enforces partition read/write protection.
- **`volmgr.sys`**: Basic disk volume manager; coordinates volume GUIDs, partition mounting, and extent mapping.
- **`volmgrx.sys`**: Dynamic disk volume manager; manages LDM (Logical Disk Manager) databases.
- **`fvevol.sys`**: BitLocker Full Volume Encryption filter driver; performs on-the-fly encryption/decryption between the filesystem driver and the volume manager.

### Direct Disk Access Restrictions:
Since Windows Vista and hardened under Windows 10/11, user-mode applications cannot freely write to `\\.\PhysicalDriveN` sectors that contain mounted filesystems. Any attempt to execute `WriteFile` across sector ranges mapped to an active partition fails with `ERROR_ACCESS_DENIED` (`STATUS_ACCESS_DENIED`) unless:
1. Every volume overlapping the target sectors is locked via `FSCTL_LOCK_VOLUME`.
2. Or the volume is explicitly dismounted via `FSCTL_DISMOUNT_VOLUME`.
3. Or the target sector range belongs entirely to unallocated space not tracked by `partmgr.sys`.

---

## 2. Windows Storage Management API (SMAPI)

Introduced in Windows 8 / Server 2012, SMAPI replaces the deprecated Virtual Disk Service (VDS) for modern infrastructure. SMAPI is implemented as a WMI/CIM provider hosted in `root\Microsoft\Windows\Storage` via `storagewmi.dll`.

### Key CIM Classes:
- **`MSFT_Disk`**: Represents a physical storage device.
  - Methods: `Initialize`, `Clear`, `CreatePartition`, `ConvertStyle` (MBR $\leftrightarrow$ GPT).
  - Properties: `Number`, `Path`, `BusType`, `OperationalStatus`, `AllocatedSize`, `LogicalSectorSize`.
- **`MSFT_Partition`**: Represents a slice of a disk.
  - Methods: `Resize(Size)`, `DeleteObject`, `SetAttributes`, `Online`, `Offline`.
  - Properties: `DiskNumber`, `PartitionNumber`, `Offset` (Start LBA in bytes), `Size`, `GptType`, `IsBoot`, `IsSystem`.
- **`MSFT_Volume`**: Represents the formatted logical filesystem layered atop one or more partition extents.
  - Methods: `Format`, `Optimize`, `Repair`, `SetFileSystemLabel`.
  - Properties: `DriveLetter`, `FileSystem`, `FileSystemLabel`, `Size`, `SizeRemaining`.

### SMAPI Capabilities & Limits:
- **Pros**:
  - Automatically notifies `partmgr.sys` and the Windows Shell of changes.
  - Thread-safe and transactional within Microsoft's supported scope.
  - Exposes reliable shrink limits for NTFS partitions.
- **Cons & Critical Deficiencies**:
  - **No Partition Movement**: SMAPI has zero capability to alter a partition's starting offset (`Offset`). It can only expand or shrink the partition's tail (`Size`).
  - **COM/WMI Overhead**: Querying deep disk trees through WMI incurs noticeable latency (200–500 ms per query) compared to microsecond-level direct Win32 IOCTL calls.
  - **Non-Contiguous Limitations**: `MSFT_Partition.Resize` fails instantly if unallocated space does not immediately succeed the partition.

---

## 3. PowerShell Storage Module

The `Storage` module in PowerShell is built directly on top of SMAPI via CDXML (Cmdlets Definition XML) definitions.

### Key Cmdlets:
- `Get-Disk`: Retrieves `MSFT_Disk` instances.
- `Get-Partition`: Retrieves `MSFT_Partition` instances for a target disk.
- `Get-PartitionSupportedSize -DiskNumber X -PartitionNumber Y`:
  - Returns `SizeMin` and `SizeMax`.
  - `SizeMin` reflects the lowest byte offset to which an NTFS filesystem can be shrunk without defragmenting or moving locked system clusters.
  - `SizeMax` reflects the current partition size plus all contiguous unallocated bytes immediately following the partition.
- `Resize-Partition -DiskNumber X -PartitionNumber Y -Size Z`: Invokes `MSFT_Partition.Resize`.

### Evaluation for OpenDisk Manager:
- **Process Spawning Latency**: Calling `powershell.exe` or `pwsh.exe` out-of-process adds a process startup overhead of 400–1200 ms.
- **Parsing Brittleness**: Parsing stdout text or deserializing `ConvertTo-Json` streams is inefficient and susceptible to locale-specific decimal/string formatting errors.
- **Verdict**: PowerShell is unsuitable as the runtime execution path for OpenDisk Manager. However, calling the underlying CIM classes via Rust's WMI crate or using direct Win32 IOCTLs provides identical underlying capabilities with zero process overhead.

---

## 4. DiskPart Capabilities and Limitations

`diskpart.exe` is a command-line interpreter layered atop the legacy Virtual Disk Service (`vds.exe`) and IOCTL storage drivers.

### Capabilities:
- `select disk N`, `select partition M`, `select volume X`
- `shrink desired=SIZE minimum=SIZE`
- `extend size=SIZE [disk=N]`
- `create partition primary [size=N] [offset=N]`
- `delete partition override`
- `assign letter=X`, `remove letter=X`

### Critical Limitations:
1. **No Block/Partition Relocation**: DiskPart cannot move a partition. If a user has a 500 GB drive with `[Recovery (1 GB)] [Unallocated (100 GB)] [Windows C: (399 GB)]`, DiskPart cannot expand `C:` into the preceding 100 GB because the free space is at a lower LBA.
2. **FAT32 & exFAT Limitations**: DiskPart cannot shrink FAT32 or exFAT volumes; running `shrink` on a FAT32 volume returns: `The volume cannot be shrunk because the file system does not support it.`
3. **Fragile Numeric Indexing**: DiskPart operates on dynamic, non-persistent indices (`disk 0`, `partition 1`). If a transient USB device connects or drops during script execution, the indices shift, risking the accidental destruction of the wrong disk.
4. **Opaque Error Reporting**: Returns coarse exit codes and localized text strings without machine-readable telemetry or structured error offsets.

---

## 5. GPT and MBR Partition Structures

### 5.1. MBR (Master Boot Record) Layout

Located at physical Sector 0 (LBA 0):
- **Bytes 0–445**: Bootstrap Code.
- **Bytes 446–509**: Four 16-byte Primary Partition Table entries.
- **Bytes 510–511**: Boot Signature `0x55AA`.

```
MBR Partition Entry (16 Bytes):
Offset  Size  Description
0x00    1     Boot Indicator (0x80 = Active/Bootable, 0x00 = Inactive)
0x01    3     Starting CHS address (legacy)
0x04    1     Partition Type (e.g., 0x07 = NTFS/exFAT, 0x0B/0x0C = FAT32, 0x0F = Extended LBA)
0x05    3     Ending CHS address (legacy)
0x08    4     Starting LBA (uint32, little-endian)
0x0C    4     Total Sectors in Partition (uint32, little-endian)
```

**MBR Constraints**:
- 32-bit sector addressing restricts maximum disk capacity to $2^{32} \times 512 \text{ bytes} = 2.19 \text{ TB}$.
- Hard limit of 4 primary partitions. To support more, one primary partition must be marked as Extended (`0x05` or `0x0F`), housing a linked list of Extended Boot Records (EBRs). EBR linked lists are fragile; corrupting one pointer orphans all subsequent logical drives.

---

### 5.2. GPT (GUID Partition Table) Layout

GPT is mandated by UEFI and is the default on Windows 11.

```
LBA 0:       Protective MBR (Single partition type 0xEE spanning disk)
LBA 1:       Primary GPT Header (92 bytes + padding)
LBA 2–33:    Primary Partition Entries (128 entries x 128 bytes = 32 sectors)
LBA 34:      First Usable LBA for Data Partitions
...          Data Partitions (Aligned to 1 MiB / 2048-sector boundaries)
LBA N-33:    Last Usable LBA for Data Partitions
LBA N-32–N-1:Backup Partition Entries (Identical 128 entries)
LBA N:       Backup GPT Header (Mirror of Primary Header, points back to LBA 1)
```

#### GPT Header Structure (92 bytes):
```rust
#[repr(C, packed)]
pub struct GptHeader {
    pub signature: [u8; 8],           // "EFI PART" (0x5452415020494645)
    pub revision: u32,                // 0x00010000 (Version 1.0)
    pub header_size: u32,             // 92 bytes
    pub header_crc32: u32,            // CRC32 of header with this field zeroed
    pub reserved: u32,                // Zero
    pub current_lba: u64,             // LBA 1 for primary, LBA N for backup
    pub backup_lba: u64,              // LBA N for primary, LBA 1 for backup
    pub first_usable_lba: u64,        // Typically LBA 34 (or 2048 for alignment)
    pub last_usable_lba: u64,         // Disk Size - 34 sectors
    pub disk_guid: [u8; 16],          // Unique Disk GUID
    pub partition_entry_lba: u64,     // LBA 2 for primary, LBA N-32 for backup
    pub number_of_entries: u32,       // Typically 128
    pub size_of_entry: u32,           // 128 bytes
    pub partition_array_crc32: u32,   // CRC32 over the entire partition array
}
```

#### GPT Partition Entry Structure (128 bytes):
```rust
#[repr(C, packed)]
pub struct GptEntry {
    pub partition_type_guid: [u8; 16], // e.g., Basic Data, ESP, MSR
    pub unique_partition_guid: [u8; 16],// Unique ID generated per partition
    pub starting_lba: u64,             // Start sector (inclusive)
    pub ending_lba: u64,               // End sector (inclusive)
    pub attributes: u64,               // Bitflags (Read-only, Hidden, System)
    pub partition_name: [u16; 36],     // UTF-16LE partition label (null-terminated)
}
```

**Key GPT Technical Invariants**:
- Dual CRC32 integrity check: Windows kernel verifies both `header_crc32` and `partition_array_crc32`. If the primary CRC fails, `partmgr.sys` falls back to the backup GPT at the disk's end. If both fail, the drive is treated as uninitialized / RAW.
- Any manual sector-level modification must update **both** primary and backup GPT tables and recalculate all four CRC32 checksums.

---

## 6. Filesystem Architecture: NTFS, FAT32, exFAT, ReFS

| Feature | NTFS | FAT32 | exFAT | ReFS |
| :--- | :--- | :--- | :--- | :--- |
| **Max Volume Size** | 8 PB (Windows 11) | 2 TB (32 GB Win format limit) | 128 PB | 35 PB |
| **Allocation Unit** | 512 B – 2 MiB (Default 4K) | 512 B – 64 KiB | 512 B – 32 MiB | 4 KiB or 64 KiB |
| **Online Extension** | Yes (`FSCTL_EXTEND_VOLUME`) | No (Requires remount/raw) | No (Unmounted only) | Yes (`FSCTL_EXTEND_VOLUME`) |
| **Online Shrinking** | Yes (`FSCTL_SHRINK_VOLUME`)| No (Unsupported by Win32)| No (Unsupported by Win32)| **NEVER Supported** |
| **Metadata Scheme** | Master File Table (`$MFT`) | File Allocation Table (FAT)| Allocation Bitmap | B+ Trees (Copy-on-Write)|
| **Journaling** | USN Journal + `$LogFile` | None | None | Metadata Transactional Log|

### Deep Dive into NTFS Shrinking Mechanics:
When shrinking an NTFS volume via `FSCTL_SHRINK_VOLUME`:
1. The filesystem driver (`ntfs.sys`) queries the cluster allocation bitmap (`$Bitmap`).
2. It locates the highest Logical Cluster Number (LCN) containing valid data.
3. If files reside above the target shrink boundary, `ntfs.sys` attempts to relocate them to free clusters lower down in the volume.
4. **The "Unmovable Files" Wall**: Certain system files cannot be relocated online by `ntfs.sys`:
   - Active Pagefile (`pagefile.sys`)
   - Hibernation file (`hiberfil.sys`)
   - Volume Shadow Copy (VSS) storage areas (`System Volume Information`)
   - The NTFS Master File Table (`$MFT`) zone itself
5. The presence of an unmovable file near the end of a volume prevents shrinking beyond that cluster, even if 90% of the volume is empty! To overcome this, the application must instruct the user to disable hibernation/pagefile, flush VSS snapshots, or run the operation offline in WinPE.

### The ReFS Shrink Invariant:
ReFS uses an allocate-on-write (copy-on-write) B+ tree architecture designed for enterprise resiliency and virtualization. ReFS has **no mechanism to compact or defragment its B+ tree extents towards lower LBAs**. Consequently, Microsoft has never implemented `FSCTL_SHRINK_VOLUME` for ReFS. **Attempting to shrink a ReFS volume is architecturally impossible and will result in catastrophic data destruction.** OpenDisk Manager must hard-block shrink actions on ReFS.

---

## 7. Basic versus Dynamic Disks

### Basic Disks:
- Use standard partition tables (MBR or GPT).
- Each partition corresponds directly to a contiguous range of sectors on one physical disk.
- Fully supported by all versions of Windows, UEFI firmware, and standard recovery tools.

### Dynamic Disks & LDM (Logical Disk Manager):
- Introduced in Windows 2000 to enable software RAID, spanning, and striping.
- The standard MBR/GPT partition table is replaced by a single placeholder partition, while the real partition map is managed in a proprietary 1 MB database located at the very end of the physical disk.
- **Deprecation**: Dynamic Disks were officially deprecated in Windows 10 (Build 1803) and Windows Server 2012 in favor of **Storage Spaces** (`StoragePool` / `VirtualDisk`).
- **Hazard**: Modifying the MBR/GPT header on a dynamic disk corrupts the LDM database, rendering all volumes on the disk permanently inaccessible.
- **Safety Directive**: OpenDisk Manager must detect dynamic disks (`IOCTL_VOLUME_IS_DYNAMIC` or `MSFT_Disk.PartitionStyle == Dynamic`) and lock them in **Read-Only / Unsupported** mode.

---

## 8. EFI System Partition (ESP) and MSR Partitions

### 8.1. EFI System Partition (ESP)
- **GUID**: `c12a7328-f81f-11d2-ba4b-00a0c93ec93b`
- **Format**: FAT32 (Mandated by UEFI Specification §13.3).
- **Default Size**: 100 MB on 512-byte sector drives; 260 MB on 4Kn native sector drives.
- **Contents**: UEFI bootloader (`\EFI\Microsoft\Boot\bootmgfw.efi`), Boot Configuration Data (`BCD`), hardware vendor diagnostics.
- **Boot Dependency**:
  - The motherboard UEFI NVRAM stores boot entries pointing to a specific device path containing the ESP's **Unique Partition GUID**.
  - If an operation alters the ESP's Unique GUID, the motherboard will fail to locate the bootloader and drop to UEFI Shell or display `No bootable device found`.
  - **Rule**: OpenDisk Manager may relocate or resize the ESP sectors, but it must **strictly preserve the original `unique_partition_guid`**.

### 8.2. Microsoft Reserved Partition (MSR)
- **GUID**: `e3c9e310-0b4f-4b4e-b8d3-7727ac411c58`
- **Format**: RAW (No filesystem structures).
- **Default Size**: 16 MB on Windows 10/11 (was 128 MB on Windows 7/8).
- **Role**: Microsoft reserved space for partition realignment, LDM conversion, and BitLocker temporary metadata. It has no drive letter and cannot be formatted.
- **Rule**: MSR must never be deleted, formatted, or compressed. It can only be relocated as a raw sector block if adjacent partitions need repositioning.

---

## 9. Recovery Partitions and BitLocker

### 9.1. Windows Recovery Environment (WinRE)
- **GUID**: `de194273-0d2f-483d-883a-b64f37e4f714`
- **GPT Attributes**: `0x8000000000000001` (System / Platform Required + No Drive Letter).
- **Filesystem**: NTFS containing `\Recovery\WindowsRE\winre.wim`.
- **System Integration**:
  - Registered with the Windows OS via `reagentc.exe`.
  - Stored in the BCD as an auxiliary recovery sequence.
  - Windows Updates frequently expand WinRE (e.g., security patches against BitLocker bypasses). If WinRE has insufficient free space (<250 MB free), Windows Updates fail with error `0x80070643`.
  - **Relocation Requirement**: Before moving WinRE, the application should call `reagentc /disable` to unhook the live WIM, execute the sector move, update the partition table, and execute `reagentc /enable` to re-register the new sector extent with the OS.

### 9.2. BitLocker Drive Encryption
- **Filter Driver**: `fvevol.sys` intercepts all I/O to the volume.
- **Metadata Structure**: Encrypted volumes contain Full Volume Encryption (FVE) metadata headers at the volume start and backup headers at the volume tail.
- **Interaction with Partition Operations**:
  - **Online Extend**: Unlocked BitLocker volumes can be extended online using native Windows APIs (`FSCTL_EXTEND_VOLUME`); `fvevol.sys` dynamically extends its cryptographic boundaries.
  - **Online Shrink**: Native Windows APIs can shrink unlocked BitLocker volumes.
  - **Raw Sector Moving**:
    - **CRITICAL DANGER**: If a partition is encrypted with BitLocker, moving its sectors at the raw disk level will alter the partition's physical LBA offsets.
    - UEFI Secure Boot and the TPM (Trusted Platform Module) measure the disk partition table and BCD configuration into **PCR 7** (Secure Boot State) and **PCR 11/12** (BCD State).
    - If the partition start LBA changes, the TPM detects an untrusted boot environment modification and **refuses to release the BitLocker Volume Master Key (VMK)** on the next boot!
    - The user is immediately greeted with the blue **BitLocker Recovery Screen** demanding the 48-digit recovery password.
  - **Safety Invariant**: OpenDisk Manager must query BitLocker status. If active, it must:
    1. Warn the user that partition relocation will trigger BitLocker Recovery.
    2. Verify the user has their 48-digit Recovery Key backed up.
    3. Or invoke `Suspend-BitLocker -MountPoint "C:" -RebootCount 1` to temporarily suspend TPM sealing across the partition operation.

---

## 10. Online versus Offline Partition Operations

```
+-------------------------------------------------------------------------+
|                        Operational Matrix                               |
+-------------------------------------------------------------------------+
| Operation             | Non-System Volume (D:)    | System Volume (C:)  |
+-----------------------+---------------------------+---------------------+
| Extend (Trailing Free)| Online (Win32 FSCTL)      | Online (Win32 FSCTL)|
| Shrink (Within Limit) | Online (Win32 FSCTL)      | Online (Win32 FSCTL)|
| Shrink (Beyond Limit) | Offline (Lock Volume)     | Offline (WinPE Boot)|
| Move Partition Start  | Offline (Lock/Dismount)   | Offline (WinPE Boot)|
| Format / Delete       | Online (Lock Volume)      | BLOCKED             |
+-------------------------------------------------------------------------+
```

### Why System Volume (C:) Cannot Be Moved Online:
1. `C:\Windows\System32\ntoskrnl.exe`, the pagefile, registry hives (`SYSTEM`, `SOFTWARE`), and filesystem drivers are open with permanent kernel locks.
2. `FSCTL_LOCK_VOLUME` and `FSCTL_DISMOUNT_VOLUME` will return `ERROR_ACCESS_DENIED` (`0x00000005`) on the system volume.
3. Reading from LBA $X$ and writing to LBA $Y$ while the live OS writes dirty cache pages to LBA $X$ causes instant filesystem torn writes and kernel panics (`CRITICAL_PROCESS_DIED`).

### The Two Offline Execution Architectures:
1. **Native NT BootExecute Application**:
   - Registered under `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\BootExecute`.
   - Runs before Win32 subsystem initialization directly against `ntdll.dll`.
   - **Severe Drawbacks**: No GUI (only blue text screen), no network, zero access to Win32 APIs, debugging requires kernel serial cables, and any bug causes an unrecoverable Boot Loop / BSOD. Modern Windows 11 HVCI and Driver Signature Enforcement make signing and loading boot-time drivers exceptionally hazardous.
2. **Windows PE (WinPE) / WinRE Ramdisk Environment (Selected Architecture)**:
   - Boots into a minimal Windows environment running entirely out of a RAM disk (`X:`).
   - Full Win32 user-mode APIs are active (`kernel32.dll`, `user32.dll`, GUI support).
   - The primary physical disk (`C:`) is completely idle and unmounted.
   - All volumes on the target disk can be locked, dismounted, shifted, and verified safely with full error handling.

---

## 11. Partition Movement Implementation Options

Moving a partition involves shifting an entire filesystem extent from $[LBA_{src}, LBA_{src} + N]$ to $[LBA_{dst}, LBA_{dst} + N]$.

### 11.1. Directional Copy Logic (Preventing Overwrite Corruption)

When a partition is moved by a distance smaller than its length, the source and destination regions overlap:

```
Case A: Moving Right (LBA_dst > LBA_src)
Source:      [======== OVERLAP ========]------
Destination: ------[======== OVERLAP ========]
Strategy:    Must copy BACKWARD (from End LBA down to Start LBA).
             If copied forward, writes to Destination destroy unread Source blocks!

Case B: Moving Left (LBA_dst < LBA_src)
Source:      ------[======== OVERLAP ========]
Destination: [======== OVERLAP ========]------
Strategy:    Must copy FORWARD (from Start LBA up to End LBA).
             If copied backward, writes to Destination destroy unread Source blocks!
```

### 11.2. High-Performance Sector I/O Pipeline
- **Handle Acquisition**: Open `\\.\PhysicalDriveN` with:
  ```rust
  let handle = CreateFileW(
      wide_path.as_ptr(),
      GENERIC_READ | GENERIC_WRITE,
      FILE_SHARE_READ | FILE_SHARE_WRITE,
      null_mut(),
      OPEN_EXISTING,
      FILE_FLAG_NO_BUFFERING | FILE_FLAG_WRITE_THROUGH,
      null_mut(),
  );
  ```
- **Alignment Constraints**: With `FILE_FLAG_NO_BUFFERING`, all read/write buffers, memory pointers, and disk offsets **must be integer multiples of the disk's physical sector size** (typically 4096 bytes).
- **Buffer Size**: 4 MiB to 16 MiB chunk size balances NVMe throughput saturation with RAM usage.
- **Integrity Verification**: Calculate rolling xxHash64 or CRC32 checksums of each block during reading and verify immediately after writing.

### 11.3. Filesystem Header Patching (Post-Move)
- **NTFS Volume Boot Record ($VBR$)**:
  - Located at Sector 0 of the partition.
  - Contains BPB (BIOS Parameter Block). Offset `0x1C` contains `Hidden Sectors` (the 32-bit LBA offset where the partition begins).
  - While modern `ntfs.sys` relies on `partmgr.sys` rather than Hidden Sectors, legacy bootloaders and utilities expect this field to match the partition's starting LBA.
  - The backup boot sector (stored at the very last sector of the NTFS volume) must also be preserved.

---

## 12. Filesystem Resize Implementation Options

Resizing consists of two independent operations that must be executed in strict sequence:
1. Resizing the filesystem structures (clusters, bitmaps, inodes).
2. Resizing the partition container entry in the GPT/MBR table.

```
Operation 1: EXTENDING A VOLUME
Step 1: Grow Partition Table Entry (GPT/MBR) -> Increases container boundary.
Step 2: Send FSCTL_EXTEND_VOLUME -> Filesystem driver expands allocation bitmap into new space.

Operation 2: SHRINKING A VOLUME
Step 1: Send FSCTL_SHRINK_VOLUME -> Filesystem driver truncates allocation bitmap and frees clusters.
Step 2: Shrink Partition Table Entry (GPT/MBR) -> Decreases container boundary to match.
```

> **CRITICAL ARCHITECTURAL WARNING**: If the order is reversed during a shrink operation (shrinking the partition table before shrinking the filesystem), the partition boundary cuts off the tail of the filesystem while `$Bitmap` still believes those clusters are valid, causing immediate, catastrophic filesystem corruption!

---

## 13. Open-Source Partition Management Engines & Licenses

| Engine | Primary Language | Native OS | License | Suitability for OpenDisk Manager |
| :--- | :--- | :--- | :--- | :--- |
| **libparted (GNU)** | C | Linux / POSIX | **GPLv3+** | **Poor**: Deep POSIX assumptions (`ioctl`, `/dev/sdX`). Incompatible with MSVC. GPLv3 creates viral copyleft constraints on distribution. |
| **NTFS-3G / ntfsresize** | C | Linux (FUSE) | **GPLv2+** | **Medium/Auxiliary**: Excellent at offline NTFS shrinking bypassing Windows unmovable files. Can be ported as a standalone CLI worker process. |
| **FatResize / libfat** | C | Linux | **GPLv3** | **Poor**: Tightly coupled to GNU Parted and Linux block layer. |
| **TestDisk / PhotoRec** | C | Cross-platform | **GPLv2+** | **Reference Only**: Good for partition recovery logic, but lacks volume resizing engines. |
| **`gpt` (Rust Crate)** | Rust | Cross-platform | **MIT / Apache-2.0** | **Excellent**: Pure Rust implementation of GPT reading/writing with full CRC32 support and GUID handling. |
| **`windows-rs` (Microsoft)**| Rust | Windows | **MIT / Apache-2.0** | **Excellent**: Official Microsoft Rust bindings providing direct access to all Win32 Storage IOCTLs. |

### Licensing Analysis & Compliance Architecture:
- To keep OpenDisk Manager cleanly licensed under permissive open-source terms (**MIT / Apache 2.0**), the core Tauri application and Rust engine must not link dynamically or statically with any GPL-licensed code.
- If GPL utilities (such as `ntfsresize`) are utilized to handle advanced offline shrinking, they must be compiled as completely independent, standalone helper binaries (e.g. `opendisk-ntfs-helper.exe`).
- Under established open-source legal precedent, communicating with an independent worker process over anonymous pipes (stdin/stdout) via JSON IPC does not constitute a derivative work, preserving the MIT/Apache-2.0 licensing of the primary OpenDisk Manager application.

---

## 14. Compatibility of Available Engines with Windows 11

### Windows 11 System Constraints:
1. **Mandatory Secure Boot & UEFI**: Windows 11 cannot boot from MBR disks. The OS drive is guaranteed to be GPT.
2. **Virtualization-Based Security (VBS) & HVCI**: Windows 11 enforces Hypervisor-Enforced Code Integrity by default. Kernel drivers without expensive Microsoft WHQL attestation signatures are unconditionally blocked. Therefore, any solution relying on custom kernel drivers (`.sys`) for partition manipulation is unviable for an open-source project.
3. **Storage Sector Geometries (512e vs 4Kn)**: Modern NVMe SSDs frequently utilize 4096-byte native sectors (4Kn) rather than 512-byte emulation (512e). All sector math, alignment logic, and I/O buffers must query `IOCTL_STORAGE_QUERY_PROPERTY` with `StorageAccessAlignmentProperty` and enforce sector size dynamically rather than hardcoding `512`.
4. **Volume Snapshot Service (VSS)**: Windows 11 creates automatic system restore points and VSS snapshots before updates. VSS stores differential copy-on-write blocks at the volume tail. Volume shrink operations will fail unless VSS allocations are factored in or purged.
