# OpenDisk Manager — Known Limitations & Technical Constraints

**Document**: `KNOWN_LIMITATIONS.md`  
**Product**: OpenDisk Manager  
**Platform**: Windows 11 x64  
**Version**: 1.0.0 (Phase 7 Production Baseline)

---

## 1. Scope & Design Philosophy

OpenDisk Manager prioritizes **data preservation and system stability** over reckless feature parity. To prevent catastrophic data loss, dangerous operations that cannot be guaranteed 100% reliable on standard Windows 11 systems are intentionally restricted.

This document transparently lists all known technical boundaries and architectural constraints.

---

## 2. Structural & Filesystem Constraints

### 2.1 ReFS (Resilient File System) Cannot Be Shrunk
- **Constraint**: ReFS volumes can be formatted, deleted, and extended, but **cannot be shrunk**.
- **Technical Cause**: Microsoft designed ReFS with an allocate-on-write B+ tree metadata architecture and 64 KiB cluster allocation units. Unlike NTFS, ReFS does not implement `FSCTL_SHRINK_VOLUME` or block-relocation APIs. This is a fundamental limitation of the Windows ReFS filesystem driver.
- **Workaround**: To reduce the footprint of a ReFS volume, backup its files, delete the partition, recreate it with a smaller size, and restore data.

### 2.2 FAT32 Format Size Limitation
- **Constraint**: OpenDisk Manager restricts native FAT32 volume formatting to a maximum size of **32 GiB (32,768 MB)**.
- **Technical Cause**: Windows native storage APIs (`Format-Volume`, `diskpart`) enforce a legacy 32 GiB limit on FAT32 volume creation, despite FAT32 specification supporting larger volumes.
- **Workaround**: Use **exFAT** or **NTFS** for storage devices and partitions larger than 32 GiB.

### 2.3 ExFAT Non-Journaled Sensitivity
- **Constraint**: ExFAT partitions require heightened caution during resize and move operations.
- **Technical Cause**: ExFAT does not maintain an NTFS-style USN Change Journal or transaction log. An unexpected disconnection or power loss during filesystem resizing on exFAT has a higher likelihood of directory corruption than NTFS.

---

## 3. System & Boot Partition Boundaries

### 3.1 Prohibited Live Online Movement of Windows Boot (C:)
- **Constraint**: Active Windows 11 boot partition C: **cannot be shifted or moved while Windows is running**.
- **Technical Cause**: The Windows NT kernel (`ntoskrnl.exe`), paging files (`pagefile.sys`), crash dump filters, and registry hives maintain exclusive, un-dismountable physical sector locks. Moving sector ranges under an active operating system causes immediate `KERNEL_DATA_INPAGE_ERROR` Blue Screen of Death (BSOD) and filesystem corruption.
- **Supported Path**: Shifting or relocating C: must be staged via the **OpenDisk WinPE Companion Boot Environment** (`opendisk-winpe-task.json`), executing while Windows is completely offline.

### 3.2 Immutability of EFI System Partition (ESP) & MSR
- **Constraint**: The EFI System Partition (ESP) and Microsoft Reserved Partition (MSR) are shielded from formatting, deletion, shrinking, and live movement.
- **Technical Cause**: The ESP contains the UEFI firmware boot variables and boot manager (`\EFI\Microsoft\Boot\bootmgfw.efi`). Modifying or moving ESP offsets without updating NVRAM boot entries will render the PC unbootable.

---

## 4. Disk Topologies & Hardware Constraints

### 4.1 Dynamic Disks (LDM) Unsupported
- **Constraint**: Disks configured with Logical Disk Manager (LDM) Dynamic Disk structures are detected as **READ-ONLY**. Resizing, moving, and splitting dynamic volumes is blocked.
- **Technical Cause**: Microsoft has officially deprecated Dynamic Disks in favor of **Storage Spaces**. Dynamic disk metadata resides in a 1 MiB database at the physical end of the drive, which is incompatible with modern GPT partition layout tooling.
- **Recommendation**: Convert dynamic disks to basic disks before performing partition modifications.

### 4.2 Cross-Physical-Disk Operations Prohibited
- **Constraint**: Space cannot be transferred, merged, or shared between distinct physical disk drives (e.g., cannot transfer space from Disk 1 to Disk 0).
- **Technical Cause**: On basic physical disks, partitions are strictly contiguous physical sector extents bounded by hardware LBA addresses. A partition cannot physically span across separate hardware controllers.

### 4.3 In-Place MBR / GPT Conversion
- **Constraint**: In-place conversion between MBR (Master Boot Record) and GPT (GUID Partition Table) without data destruction is not handled directly by the frontend.
- **Recommended Tool**: Use Microsoft's official, cryptographically validated `mbr2gpt.exe` utility (`mbr2gpt /convert /allowFullOS`) to ensure BCD and UEFI firmware compliance.

### 4.4 Windows Storage Spaces Pools
- **Constraint**: Drives enrolled in a Windows Storage Spaces storage pool cannot be partitioned as standard physical disks.
- **Technical Cause**: Storage Spaces pools abstract physical drives into virtual pools; underlying drive geometry is controlled by the `VirtualDisk` storage subsystem.

