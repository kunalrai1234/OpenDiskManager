# KNOWN ISSUES & ARCHITECTURAL LIMITATIONS — OPENDISK MANAGER
**Application**: OpenDisk Manager  
**Version**: 1.0.0 Production Release  
**Platform**: Windows 11 x64  
**Date**: November 2026  
**Status**: DOCUMENTED & DISCLOSED (ALL DEFECTS MITIGATED)  

---

## 1. Overview

This document provides transparent technical disclosure of known limitations, system boundaries, and architectural constraints in OpenDisk Manager v1.0.0. These boundaries are intentional safety guardrails designed to prevent system corruption, rather than unhandled software defects.

---

## 2. Documented Technical Limitations

### 2.1 Live Online Relocation of Windows System Boot Partition (C:)
- **Behavior**: Attempting to move the Windows boot partition (C:) while Windows is running online is rejected by the engine.
- **Root Cause**: Windows locks kernel binaries (`ntoskrnl.exe`), paging files (`pagefile.sys`), and registry hives (`SYSTEM`, `SOFTWARE`) with exclusive file handles. Moving sectors beneath active kernel file systems causes immediate bugchecks (BSOD `CRITICAL_PROCESS_DIED` or `UNMOUNTABLE_BOOT_VOLUME`).
- **Engine Handling**: The space planner detects `isSystemBoot === true` and flags the operation as `REQUIRES_OFFLINE_OPERATION`. An offline task payload is staged to `opendisk-winpe-task.json` for execution inside a disposable Windows PE pre-boot environment.

### 2.2 ReFS (Resilient File System) Volume Shrinking
- **Behavior**: Shrinking ReFS volumes is prohibited and returns status `NOT_SUPPORTED`.
- **Root Cause**: Microsoft's ReFS architecture does not support the `FSCTL_SHRINK_VOLUME` control code as of Windows 11 Build 22000+. ReFS allocates metadata via B+ trees without contiguous sector truncation capability.
- **Engine Handling**: The validator checks `fsType === "ReFS"` and immediately halts before attempting command execution, informing the user that ReFS volumes cannot be shrunk.

### 2.3 MBR 2 TiB Capacity Ceiling
- **Behavior**: Disks initialized with Master Boot Record (MBR) cannot address partition offsets or sizes beyond 2.19 TB (2,199,023,255,552 bytes).
- **Root Cause**: MBR partition tables store starting sector addresses and sector counts as 32-bit unsigned integers. At 512 bytes per sector, $2^{32} \times 512 = 2.19\text{ TB}$.
- **Engine Handling**: The Storage Diagnostics engine flags any MBR disk exceeding 2 TiB with a warning badge, recommending GPT conversion.

### 2.4 BitLocker Encrypted Volume Relocation
- **Behavior**: Moving a BitLocker encrypted volume is locked until the user acknowledges backup and recovery key possession.
- **Root Cause**: Moving a BitLocker volume changes its physical LBA offset on the disk platter. The Trusted Platform Module (TPM) measures disk layout PCRs; shifting the partition without unsealing or providing recovery keys trips BitLocker recovery mode on the subsequent reboot.
- **Engine Handling**: The inspector displays a BitLocker warning banner and requires confirmation of the 48-digit recovery password prior to staging.

### 2.5 Dynamic Disks (Logical Disk Manager / LDM)
- **Behavior**: Dynamic disks are treated as read-only.
- **Root Cause**: Windows Storage APIs (`Storage` PowerShell module) deprecate LDM in favor of Storage Spaces and Basic GPT disks. Manipulating LDM private headers requires proprietary undocumented IOCTLs.
- **Engine Handling**: Dynamic disks are detected and labeled `DYNAMIC (READ-ONLY)` in the disk list, prohibiting destructive resize or movement actions.

---

## 3. Workaround & Mitigation Summary

| Issue / Boundary | User Impact | Recommended Mitigation |
|---|---|---|
| C: Drive Relocation | Cannot move C: while Windows is running | Use WinPE bootable media to execute staged `opendisk-winpe-task.json` |
| ReFS Shrinking | ReFS volume cannot be shrunk | Back up data, delete ReFS volume, recreate as NTFS, restore data |
| MBR 2 TiB Limit | Drive capacity above 2 TB unused | Convert disk from MBR to GPT via Windows `mbr2gpt.exe` |
| BitLocker Lockout | Potential BitLocker recovery prompt | Suspend BitLocker protection (`Suspend-BitLocker -MountPoint "C:"`) before moving |
| Dynamic Disks | Modifying dynamic partitions blocked | Convert dynamic disk to basic disk |

---

## 4. Disclosure Statement

OpenDisk Manager prioritizes data integrity over risky or undocumented workarounds. Operations that cannot be guaranteed 100% non-destructive are explicitly blocked with clear error messaging.
