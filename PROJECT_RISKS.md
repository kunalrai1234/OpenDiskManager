# OpenDisk Manager — Risk Management & Threat Mitigation Standard

**Document Version:** 1.0.0  
**Classification:** Critical Risk Matrix & Failure Mode and Effects Analysis (FMEA)  
**Target Environment:** Windows 11 x64  
**Primary Objective:** Identify, Quantify, Prevent, and Mitigate Every Foreseeable Failure Mode

---

## 1. Risk Heat Map & Summary

| Risk ID | Failure Mode | Severity | Likelihood | Risk Score | Primary Mitigation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **R-01** | Windows Unbootable (`0xc000000e`) from Partition GUID/Offset Change | **Catastrophic** | High | **CRITICAL** | Strict Partition GUID preservation; automatic BCD validation. |
| **R-02** | BitLocker Lockout via TPM PCR 7/11 Hash Invalidation | **Catastrophic** | High | **CRITICAL** | Mandatory BitLocker detection, recovery key check, and pre-move TPM suspension. |
| **R-03** | Mid-Copy Power Failure / Hardware Disconnection | **Catastrophic** | Medium | **HIGH** | Write-Ahead Journal (WAL); directional copying; battery power interlock. |
| **R-04** | Filesystem Truncation before Shrink (Data Truncation) | **Catastrophic** | Low | **HIGH** | Strict two-phase state machine (Shrink FS first, truncate partition second). |
| **R-05** | Antivirus / EDR False Positive Blocking Raw Sector Writes | **High** | High | **HIGH** | Explicit UAC elevation; standard Win32 volume locking; clean code signing. |
| **R-06** | Windows Kernel Direct Write Block (`STATUS_ACCESS_DENIED`) | **High** | High | **HIGH** | Pre-flight `FSCTL_LOCK_VOLUME` and `FSCTL_DISMOUNT_VOLUME` enforcement. |
| **R-07** | ReFS Volume Destruction Attempt (Unsupported Shrink) | **Catastrophic** | Low | **MEDIUM** | Hard-coded engine block: ReFS shrink disabled at AST/planner level. |
| **R-08** | Dynamic Disk / Storage Spaces LDM Database Corruption | **Catastrophic** | Low | **MEDIUM** | Dynamic disk detection; immediate Read-Only lock. |
| **R-09** | GPL License Contamination in Core Tauri Distribution | **Medium** | Low | **LOW** | Isolated process boundary for GPL helper utilities (JSON via stdin/stdout). |
| **R-10** | SSD Controller TRIM / Garbage Collection Race Condition | **High** | Medium | **MEDIUM** | Defer `IOCTL_STORAGE_MANAGE_DATA_SET_ATTRIBUTES` until transaction completes. |

---

## 2. In-Depth Failure Mode and Effects Analysis (FMEA)

### Risk R-01: Windows Unbootable (`0xc000000e` / `0xc0000225`)
- **Root Cause**:
  - The Windows Boot Configuration Data (BCD) store and motherboard UEFI NVRAM identify the boot loader (`bootmgfw.efi`) and the Windows OS installation via the **Unique Partition GUID** (on GPT) or **Disk Signature + Sector Offset** (on MBR).
  - If a partitioning utility regenerates the Unique Partition GUID of the ESP or the Windows OS partition during a resize/move operation, or if the BCD device pointer becomes stale, the Windows Boot Manager fails to locate the operating system on the next boot.
- **Prevention Strategy**:
  1. The custom GPT engine must **strictly preserve the original 128-bit `unique_partition_guid`** for every existing partition entry. It must never generate a random UUID for an existing partition being resized or moved.
  2. For MBR disks, start offsets are registered in the BCD. If an MBR system partition is relocated, OpenDisk Manager must execute `bcdboot.exe X:\Windows /s S: /f ALL` (where `X:` is the Windows partition and `S:` is the system partition) to refresh the BCD device pointers before rebooting.
- **Recovery Procedure**:
  - Boot into Windows Recovery USB $\rightarrow$ Launch Command Prompt $\rightarrow$ Execute:
    ```cmd
    bootrec /rebuildbcd
    bcdboot C:\Windows /s S: /f UEFI
    ```

---

### Risk R-02: BitLocker TPM PCR Lockout
- **Root Cause**:
  - Modern Windows 11 systems bind BitLocker cryptographic volume encryption keys to the motherboard's Trusted Platform Module (TPM 2.0).
  - The TPM measures the integrity of the platform hardware, UEFI configuration, partition tables, and BCD into Platform Configuration Registers:
    - **PCR 7**: Secure Boot state and certificate validation.
    - **PCR 11 / PCR 12**: BCD configuration and partition start offsets.
  - If an application alters the partition layout, start LBA, or BCD, the PCR hashes change. The TPM detects an untrusted boot environment and refuses to unseal the Volume Master Key (VMK).
  - The user is greeted by the blue **BitLocker Recovery Screen** demanding a 48-digit numerical password. If the user does not possess this key, **all data on the drive is permanently lost**.
- **Prevention Strategy**:
  1. **Detection**: Query WMI `root\CIMv2\Security\MicrosoftVolumeEncryption` on all attached volumes.
  2. **Interlock**: If any volume has BitLocker enabled, display a blocking cryptographic warning modal.
  3. **Verification**: Require the user to verify they have access to their 48-digit Recovery Key (e.g., from their Microsoft Account).
  4. **Suspension**: For offline moves or BCD-altering operations, invoke:
     ```powershell
     Suspend-BitLocker -MountPoint "C:" -RebootCount 1
     ```
     This instructs BitLocker to temporarily decrypt the VMK with an unsealed key across the single reboot cycle, allowing TPM PCRs to re-measure cleanly into the new partition geometry without triggering a recovery prompt.

---

### Risk R-03: Mid-Copy Power Failure or Hardware Disconnection
- **Root Cause**:
  - Relocating a 100 GB partition requires copying 100 GB of raw sectors across the physical disk. On an NVMe drive, this takes 1–3 minutes; on a mechanical HDD, it can take 30–60 minutes.
  - If power is lost, the battery dies, or the user unplugs an external drive while a block move is 50% complete, the disk is left with two half-complete, corrupt partition images overlapping on the platters/flash.
- **Prevention Strategy**:
  1. **Power Interlock**: Query `GetSystemPowerStatus`. If running on laptop battery with $<50\%$ charge, refuse to start the operation until connected to AC power.
  2. **Directional Copying**:
     - Moving right: Copy backward (End $\rightarrow$ Start).
     - Moving left: Copy forward (Start $\rightarrow$ End).
     - This ensures that if the operation halts prematurely, the uncopied remainder of the source data remains completely intact and unoverwritten.
  3. **Write-Ahead Journal (WAL)**:
     - Record the transaction plan, sector offsets, and progress checkpoints to non-volatile storage (`journal.wal`) before initiating the copy.
- **Recovery Procedure**:
  - On the next launch, OpenDisk Manager detects the incomplete `journal.wal` entry.
  - The journal reveals the exact block offset where the copy stopped.
  - The engine can resume the copy from the checkpoint or rewrite the original partition table boundaries from the journal snapshot to restore the source volume cleanly.

---

### Risk R-04: Inverted Filesystem Resize Sequencing
- **Root Cause**:
  - A partition is a container; a filesystem is the data structure inside the container.
  - If an engine attempts to shrink a partition by shrinking the partition table entry in the GPT header *before* shrinking the filesystem via `FSCTL_SHRINK_VOLUME`:
    - The container boundary shrinks immediately.
    - The filesystem driver still believes the volume spans the original cluster count.
    - Any attempt to mount the volume causes `chkdsk` to detect that cluster pointers exceed the physical partition length, marking the volume as RAW or corrupted.
- **Prevention Strategy**:
  - The execution state machine strictly enforces atomic sequencing:
    - **Extend Sequence**: [1] Expand Partition Table $\rightarrow$ [2] Expand Filesystem.
    - **Shrink Sequence**: [1] Shrink Filesystem $\rightarrow$ [2] Shrink Partition Table.
  - Inverted operations cannot be compiled due to typestate pattern enforcement in the Rust planner.

---

### Risk R-05: Antivirus / EDR False Positives Blocking Raw Sector Writes
- **Root Cause**:
  - Modern Endpoint Detection and Response (EDR) agents and Antivirus software monitor user-mode processes attempting to open raw disk handles (`\\.\PhysicalDriveN`) with write permissions, interpreting this behavior as ransomware or wiper malware (e.g. HermeticWiper).
  - The EDR may terminate OpenDisk Manager mid-copy or silently drop write packets.
- **Prevention Strategy**:
  1. The application binary must be digitally signed with a valid Authenticode Code Signing Certificate.
  2. Follow sanctioned Windows storage patterns:
     - Always acquire explicit volume locks (`FSCTL_LOCK_VOLUME`) before issuing writes.
     - Never bypass the volume manager without dismounting.
  3. Provide comprehensive documentation and submit clean false-positive whitelisting requests to Microsoft Defender Security Intelligence.

---

### Risk R-06: Windows Kernel Direct Write Block (`STATUS_ACCESS_DENIED`)
- **Root Cause**:
  - Windows Vista and Windows 11 kernel drivers (`partmgr.sys`, `volmgr.sys`) reject user-mode `WriteFile` calls targeting sectors covered by mounted filesystems, even if the calling process is elevated as Administrator.
- **Prevention Strategy**:
  - OpenDisk Manager must systematically enumerate all volumes mapped to the target partition extents and execute:
    1. `FSCTL_LOCK_VOLUME`
    2. `FSCTL_DISMOUNT_VOLUME`
  - If any background process (e.g., an antivirus scanner, search indexer, or open file handle) holds the volume open, `FSCTL_LOCK_VOLUME` fails.
  - The engine must detect the locking process using the Windows Restart Manager API (`RmGetList`) and offer to close the blocking application gracefully rather than failing mysteriously.

---

### Risk R-07: ReFS Volume Destruction Attempt
- **Root Cause**:
  - ReFS (Resilient File System) does not support online or offline shrinking due to its B+ tree allocate-on-write cluster architecture.
  - Forcing a partition shrink on a ReFS volume truncates the B+ tree leaf nodes, permanently destroying the filesystem.
- **Prevention Strategy**:
  - The inspection engine queries the filesystem name string (`GetVolumeInformationW`).
  - If `FileSystemName == "ReFS"`:
    - The **Shrink** button is completely disabled in the UI.
    - A tooltip explains: `ReFS filesystems do not support shrinking under any circumstances.`
    - Any plan containing a ReFS shrink operation is rejected by the pre-flight validator.

---

### Risk R-08: Dynamic Disk / Storage Spaces LDM Database Corruption
- **Root Cause**:
  - Dynamic Disks use Logical Disk Manager (LDM) metadata stored in a proprietary 1 MB private database at the end of the physical drive.
  - Storage Spaces pools physical disks into virtual disks managed by `spaceport.sys`.
  - Writing standard GPT/MBR partition entries across an LDM database corrupts the volume pointers for every partition on that drive.
- **Prevention Strategy**:
  - The inspection engine queries `IOCTL_VOLUME_IS_DYNAMIC` and checks for Storage Spaces subsystems (`MSFT_StoragePool`).
  - If detected, the disk is flagged as **Dynamic / Storage Space** and locked in **Strict Read-Only Mode**.
  - All partition creation, deletion, resizing, and moving tools are disabled for that disk.

---

### Risk R-09: GPL License Contamination
- **Root Cause**:
  - Third-party utilities such as `libparted` (GPLv3) and `ntfsresize` (GPLv2) carry copyleft licenses.
  - Linking them directly into OpenDisk Manager would legally compromise the project's permissive MIT/Apache-2.0 open-source status.
- **Prevention Strategy**:
  - Enforce an architectural air-gap:
    - Zero GPL code is compiled into `opendisk-manager.exe` or linked via C static/dynamic libraries.
    - Auxiliary tools are compiled as completely standalone worker executables (`opendisk-helper.exe`).
    - Communication between the core application and helper binaries occurs exclusively over anonymous pipes using public JSON schemas via stdin/stdout.

---

### Risk R-10: SSD Controller TRIM / Garbage Collection Interference
- **Root Cause**:
  - When partitions are deleted or resized, applications often send `IOCTL_STORAGE_MANAGE_DATA_SET_ATTRIBUTES` with `DeviceDsmAction_Trim` to inform the SSD controller that sectors are free.
  - If a TRIM command is dispatched prematurely while a raw sector move is underway, the SSD controller may zero out sectors currently being copied or read.
- **Prevention Strategy**:
  - OpenDisk Manager defers all TRIM / deallocate commands until the entire transaction has been fully committed, the GPT partition tables updated, and all volume locks released.
