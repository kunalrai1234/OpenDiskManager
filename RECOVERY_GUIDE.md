# OpenDisk Manager — Emergency Recovery & Troubleshooting Guide

**Document**: `RECOVERY_GUIDE.md`  
**Target Platform**: Windows 11 x64  
**Scope**: Disaster Recovery, Interrupted Operations, Boot Triage, Filesystem Repair  
**Revision**: 1.0.0 (Phase 7 Production Readiness)

---

## 1. Safety Notice & Honest Recovery Principles

> [!WARNING]
> **NO AUTOMATIC ROLLBACK FOR RAW SECTOR COPIES**  
> While OpenDisk Manager implements comprehensive pre-flight validations, safe copy sequencing, and deferred GPT commits, **raw block-level sector relocation is an inherently destructive physical operation**.  
> If an unrecoverable hardware failure or power interruption occurs while sectors are being actively overwritten, **automatic software rollback cannot be guaranteed without an external backup**. Never perform partition restructuring without verifying an external system backup.

---

## 2. Triage for Interrupted Operations

### 2.1 Failure Matrix & Immediate Response

| Failure Scenario | Physical Disk State | Immediate Risk | Recovery Action |
| :--- | :--- | :---: | :--- |
| **Crash during Shrink** | Filesystem truncated before partition shrink | Low | Re-run shrink or run `chkdsk /f` to re-synchronize cluster bitmap. |
| **Crash during Extend** | Partition grown before filesystem expansion | Very Low | Run `Resize-Partition` or `FSCTL_EXTEND_VOLUME` to expand filesystem into allocated partition boundary. |
| **Crash at < 100% of Sector Copy** | Sectors partially copied; GPT entry points to **Original LBA** | Moderate | Partition table remains pointed to original unmodified source sectors. Do not format. Reboot into WinPE and inspect original volume. |
| **Crash during GPT Header Write** | Primary GPT corrupted, Backup GPT intact | Moderate | Firmware/Windows automatically loads Backup GPT at LBA 131,071. Run `diskpart` or TestDisk to sync headers. |
| **Power Loss during Overlapping Move** | Partial sectors overwritten in overlap zone | **Critical** | Cannot be rolled back automatically. Restore affected volume from external backup or invoke professional raw carving. |

---

## 3. Log Locations & Diagnostic Inspection

When troubleshooting an anomalous operation, consult the persistent audit logs located in the application root directory (`D:\Project\OpenDiskManager` or `%LOCALAPPDATA%\OpenDiskManager`):

1. **`desktop-runner.log`**:
   - Contains high-level IPC invocations, Node.js process events, and command-line execution parameters.
2. **`resize-audit.log`**:
   - Contains detailed JSON telemetry for every shrink and extend operation:
     ```json
     {
       "timestamp": "2026-11-07T22:30:15Z",
       "action": "SHRINK",
       "diskNumber": 0,
       "partitionNumber": 5,
       "originalSizeBytes": 110592000000,
       "targetSizeBytes": 105442000000,
       "status": "SUCCESS"
     }
     ```
3. **`movement-audit.log`**:
   - Contains LBA offset tracking, sector copy progress percentages, copy direction (`HEAD_TO_TAIL` vs. `TAIL_TO_HEAD`), and GPT commitment timestamps.
4. **`advanced-audit.log`**:
   - Records drive letter modifications, volume label updates, partition deletions, and split/merge transactions.

---

## 4. Boot Repair & System Recovery (WinPE / WinRE)

If a system partition or recovery partition alteration prevents Windows 11 from booting normally, follow these standardized Microsoft triage procedures:

### 4.1 Creating Windows Recovery Media
1. On a secondary working PC, download the **Windows 11 Media Creation Tool** or build an **OpenDisk WinPE USB** using the Windows Assessment and Deployment Kit (ADK).
2. Boot the target machine from the USB media in UEFI mode (disable Legacy CSM in BIOS).
3. Select **Repair your computer** -> **Troubleshoot** -> **Command Prompt**.

### 4.2 Repairing the EFI Bootloader & BCD Store
If the EFI System Partition (ESP) or BCD store becomes corrupted:

1. Identify the EFI partition drive letter using `diskpart`:
   ```cmd
   diskpart
   list disk
   select disk 0
   list partition
   select partition 1
   assign letter=S
   list volume
   exit
   ```
2. Re-create the UEFI boot files using `bcdboot`:
   ```cmd
   bcdboot C:\Windows /s S: /f UEFI
   ```
3. Re-scan and rebuild the BCD store:
   ```cmd
   bootrec /fixboot
   bootrec /rebuildbcd
   ```

### 4.3 Re-enabling Windows Recovery Environment (WinRE)
If an operation relocated or resized the WinRE recovery partition, re-register it with the Windows kernel:

1. Open an elevated Command Prompt or PowerShell terminal.
2. Verify WinRE status:
   ```cmd
   reagentc /info
   ```
3. If disabled, point `reagentc` to the valid recovery image path:
   ```cmd
   reagentc /disable
   reagentc /setreimage /path \\?\GLOBALROOT\device\harddisk0\partition4\Recovery\WindowsRE
   reagentc /enable
   ```

---

## 5. BitLocker Recovery Workflow

If BitLocker detects an unexpected partition configuration or PCR variance:

```
+-------------------------------------------------------------+
|                     BITLOCKER RECOVERY                      |
|                                                             |
| Enter the recovery key for this drive                       |
| Recovery Key ID: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX      |
| Use the number keys or function keys F1-F10 (use F10 for 0) |
+-------------------------------------------------------------+
```

1. Retrieve the **48-digit numerical recovery key** from:
   - Microsoft Account: [https://account.microsoft.com/devices/recoverykey](https://account.microsoft.com/devices/recoverykey)
   - Azure Active Directory (Work/School accounts)
   - Secure external USB or physical printout recorded during setup.
2. Enter the 48-digit key at the boot prompt.
3. Once booted into Windows 11, re-seal the TPM PCR measurements:
   ```powershell
   manage-bde -protectors -disable C:
   manage-bde -protectors -enable C:
   ```

---

## 6. Filesystem Integrity & Volume Dirty Bit Repair

When an operation is halted abruptly, the NTFS volume dirty bit is asserted to safeguard file structures.

### Running Chkdsk
To resolve cluster inconsistencies, run standard offline filesystem verification:
```cmd
chkdsk D: /f /r /x
```
- `/f`: Fixes detected errors on disk.
- `/r`: Locates bad sectors and recovers readable data.
- `/x`: Forces volume dismount prior to scanning.

---

## 7. Step-by-Step Backup Restoration Procedure

If an unrecoverable failure occurs during partition restructuring:

1. Boot into the Windows Recovery Environment (WinRE) or bootable backup restore media.
2. Connect the external storage drive hosting your system image or partition backup archive.
3. Select **System Image Recovery** or launch your backup client.
4. Select the most recent system image date recorded prior to partition restructuring.
5. Choose **Format and repartition disks** if restoring the entire physical layout, or select only the target corrupted partition to restore without overwriting adjacent healthy partitions.
6. Complete the restoration wizard and reboot.

