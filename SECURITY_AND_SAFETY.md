# OpenDisk Manager — Security, Safety & Invariant Specification

**Document Version:** 1.0.0  
**Classification:** Mission-Critical Storage Safety Standard  
**Target Environment:** Windows 11 x64  
**Core Invariant:** Zero Unintended Data Loss, Zero Unrecoverable Disk States

---

## 1. The Ten Golden Invariants of OpenDisk Manager

Every operation executed by OpenDisk Manager must satisfy the following architectural invariants before and during execution. A violation of any single invariant unconditionally halts the pipeline and rolls back pending actions.

```
+─────────────────────────────────────────────────────────────────────────────+
|                          THE TEN GOLDEN INVARIANTS                          |
+─────────────────────────────────────────────────────────────────────────────+
|  1. NEVER modify partition tables during initial development (Mock-Only).    |
|  2. NEVER execute destructive disk operations automatically or in the background.|
|  3. NEVER format, delete, or overwrite a partition without typed confirmation.|
|  4. NEVER assume two volumes share a physical disk without extent resolution.|
|  5. NEVER conflate free filesystem space with unallocated partition space.   |
|  6. NEVER attempt to resize unsupported filesystems (e.g. ReFS Shrink).      |
|  7. NEVER alter sector offsets on BitLocker drives without TPM warnings.    |
|  8. NEVER delete or alter GUIDs of EFI System (ESP) or MSR Partitions.      |
|  9. NEVER resize or move partitions without 1 MiB (2048 sector) alignment.  |
| 10. NEVER truncate partition boundaries before filesystem structures shrink. |
+─────────────────────────────────────────────────────────────────────────────+
```

---

## 2. Detailed Technical Safety Guardrails

### 2.1. Physical vs. Logical Separation (Invariant 4)
- **The Pitfall**: Assuming `C:` and `D:` are partitions on the same physical drive because they share sequential letters, or assuming a mounted volume corresponds to a single partition extent.
- **Enforcement Mechanism**:
  - The engine must issue `IOCTL_VOLUME_GET_VOLUME_DISK_EXTENTS` on every mounted volume handle.
  - The returned `VOLUME_DISK_EXTENTS` structure reports:
    - `NumberOfDiskExtents`: If $> 1$, the volume is spanned or striped across multiple physical disks.
    - `Extents[i].DiskNumber`: Identifies the exact physical drive index.
    - `Extents[i].StartingOffset`: Identifies the byte offset on that physical disk.
    - `Extents[i].ExtentLength`: Identifies the extent length.
  - **Rule**: If a volume has `NumberOfDiskExtents > 1` (Spanned, Mirrored, or RAID volume), OpenDisk Manager flags it as **Complex/Unsupported** and locks it against resizing and moving.

### 2.2. Filesystem Free Space vs. Unallocated Space (Invariant 5)
- **The Pitfall**: A user sees 200 GB "free space" on `C:` and attempts to create a new partition using that space, mistakenly assuming that filesystem free space is unallocated disk space.
- **Enforcement Mechanism**:
  - **Unallocated Space**: Defined strictly as raw disk LBAs not registered in any GPT or MBR partition entry ($[LBA_{start}, LBA_{end}]$ where no partition exists). Only unallocated space can be used to create partitions or extend adjacent volumes.
  - **Filesystem Free Space**: Clusters within a formatted partition that are currently marked as available in the filesystem's internal allocation bitmap (`$Bitmap` in NTFS).
  - **Safety Action**: The UI must visually distinguish between:
    - **Gray Hatching**: Physical unallocated space (usable for partition creation/extension).
    - **Light Blue / Green**: Free space within an existing volume (usable *only* by first shrinking the volume).

### 2.3. BitLocker & Cryptographic Guardrails (Invariant 7)
- **The Pitfall**: Moving a partition that is encrypted with BitLocker. Even if the data is copied with bit-for-bit fidelity, changing the starting LBA invalidates the Trusted Platform Module (TPM) Platform Configuration Registers (**PCR 7** and **PCR 11**). On reboot, the TPM refuses to release the Volume Master Key (VMK), locking the user out behind the BitLocker Recovery screen.
- **Enforcement Mechanism**:
  - Inspect BitLocker status via WMI `root\CIMv2\Security\MicrosoftVolumeEncryption` (`Win32_EncryptableVolume`).
  - Read `ProtectionStatus`:
    - `0` = Unprotected / Decrypted
    - `1` = Protected / Encrypted
    - `2` = Protection Suspended
  - If `ProtectionStatus == 1`:
    - Display a **High-Risk Cryptographic Warning Modal**.
    - Explicitly demand verification that the user possesses the **48-digit BitLocker Recovery Password**.
    - Recommend or automate invoking `Suspend-BitLocker -MountPoint "C:" -RebootCount 1` before performing offline reboot staging, allowing TPM PCRs to re-measure cleanly after partition relocation.

### 2.4. System Partition Integrity: ESP, MSR & WinRE (Invariant 8)
- **EFI System Partition (ESP)**:
  - UEFI NVRAM stores boot entries containing the ESP's `unique_partition_guid`.
  - **Enforcement**: OpenDisk Manager treats ESP as **Protected**. The user can expand the ESP if trailing space exists, but:
    - Deletion is hard-blocked.
    - Formatting is hard-blocked.
    - Partition Unique GUID modification is hard-blocked.
- **Microsoft Reserved Partition (MSR)**:
  - Required by Windows setup for partition tracking.
  - Deletion or formatting is hard-blocked.
- **Windows Recovery Environment (WinRE)**:
  - If WinRE must be resized or moved:
    1. Query `reagentc /info` to find the active recovery partition.
    2. Execute `reagentc /disable` to unstage `winre.wim`.
    3. Perform partition move/resize.
    4. Execute `reagentc /enable` to update the BCD recovery pointer to the new partition extent.

### 2.5. Filesystem Resize Sequencing (Invariant 10)
- **Extending a Volume**:
  1. `IOCTL_DISK_SET_DRIVE_LAYOUT_EX` expands the GPT partition entry boundary.
  2. `FSCTL_EXTEND_VOLUME` informs the filesystem driver to expand clusters into the newly created partition boundary.
- **Shrinking a Volume**:
  1. `FSCTL_SHRINK_VOLUME` moves clusters and truncates the filesystem structure.
  2. `IOCTL_DISK_SET_DRIVE_LAYOUT_EX` shrinks the GPT partition entry boundary to match the new filesystem size.
- **Enforcement**: The execution planner enforces this order via strict state machine transitions. Executing a shrink with inverted order is prevented at the type-system level.

---

## 3. Pre-Flight Verification Engine

Before committing any batch of operations to disk, the `PreFlightVerifier` executes an automated 7-step inspection checklist:

```
+─────────────────────────────────────────────────────────────────────────────+
|                     PRE-FLIGHT VERIFICATION PIPELINE                         |
+─────────────────────────────────────────────────────────────────────────────+
  Step 1: Partition Alignment Check
          Verify all new Start and End LBAs align to 1 MiB (2048 x 512B sectors).
          Verify 4Kn drives align to 4096-byte physical sector boundaries.

  Step 2: Partition Overlap Check
          Sort partition extents by Start LBA.
          Assert: Partition[i].EndLba < Partition[i+1].StartLba (Strict inequality).

  Step 3: Reserved Sector Encroachment Check
          Assert: Partition[0].StartLba >= 34 (GPT header + array protection).
          Assert: Partition[last].EndLba <= DiskTotalLba - 34 (Backup GPT protection).

  Step 4: Physical Disk Health Audit (SMART)
          Query SMART telemetry via IOCTL_STORAGE_PREDICT_FAILURE.
          Check Reallocated Sector Count and Current Pending Sector Count.
          If Pending Sectors > 0: ABORT. Moving sectors across failing blocks risks total loss.

  Step 5: Exclusive Volume Access Check
          Attempt FSCTL_LOCK_VOLUME on all affected volumes.
          If lock fails due to active open handles, attempt graceful dismount.
          If volume is C: (System), trigger WinPE offline handoff workflow.

  Step 6: Power & Battery Safeguard
          Query Windows Power Management API (GetSystemPowerStatus).
          If system is running on battery power with < 50% capacity:
          BLOCK operation until AC power is connected to prevent mid-write shutdown.

  Step 7: Checksum Pre-Calculation
          Compute SHA-256 / CRC32 of existing GPT headers and partition tables.
          Write pre-state snapshot to Write-Ahead Journal.
+─────────────────────────────────────────────────────────────────────────────+
```

---

## 4. Write-Ahead Transaction Journal (WAL) & Crash Recovery

To protect against unexpected power outages, kernel crashes, or hardware disconnects during raw sector copying, OpenDisk Manager implements a persistent Write-Ahead Journal.

### 4.1. Journal File Specification
- **Path**: `%SystemDrive%\ProgramData\OpenDiskManager\journal.wal` (or USB recovery media root).
- **Structure**:
  - **Header**: Magic bytes `ODMJRNL1`, Journal UUID, Timestamp, Disk ID.
  - **Original State Payload**: Complete binary snapshot of LBA 0 (MBR), LBA 1–33 (Primary GPT), and Backup GPT.
  - **Intended Plan Payload**: JSON-serialized list of scheduled operations.
  - **Block Transfer Progress**:
    - `SourceLBA_Current`
    - `DestLBA_Current`
    - `TotalBlocksRemaining`
    - `RollingCRC32`
  - **Commit Flag**: `STATE_COMMITTED` byte set only after final GPT write and filesystem mount succeed.

### 4.2. Recovery Protocol on Application Launch
1. On startup, OpenDisk Manager checks for an active `journal.wal` file.
2. If `journal.wal` is present and does not have the `STATE_COMMITTED` flag:
   - The application enters **Disaster Recovery Mode**.
   - Normal UI is disabled.
   - The user is presented with the interrupted transaction details.
   - If an interrupted raw block move was in progress, the journal indicates the exact progress offset:
     - The engine can resume the copy from the last verified block offset.
     - Or restore the original GPT partition table from the journal snapshot to recover the source partition without data loss.

---

## 5. User Confirmation & Interaction Guardrails

To prevent accidental clicks or catastrophic human error:

### 5.1. The "Staged Plan" Model
No action in the GUI takes immediate effect on disk.
- When a user resizes or moves a partition, the change is queued as a **Pending Operation**.
- The UI displays an interactive "Pending Actions (N)" queue at the bottom of the window.
- The user can click **Undo** or **Reset All** to revert changes in memory.

### 5.2. Visual Layout Diff Modal
When the user clicks "Apply Changes", OpenDisk Manager generates a comprehensive visual diff modal:
- **Current Layout** vs. **Target Layout** rendered side-by-side.
- Exact numeric readouts:
  - Partition name, volume letter, filesystem.
  - Current size $\rightarrow$ Target size ($\Delta \text{ MiB/GiB}$).
  - Current start sector $\rightarrow$ Target start sector.
- Color-coded severity badges:
  - 🟢 **Green (Safe)**: Extending volume into unallocated space.
  - 🟡 **Yellow (Moderate)**: Shrinking volume; moving non-system partition.
  - 🔴 **Red (Destructive / Critical)**: Deleting partition; formatting volume; moving system/boot partition.

### 5.3. Typed Confirmation for Destructive Actions
For high-severity operations (deleting a partition, formatting a partition, or wiping a disk):
- Standard "OK / Cancel" buttons are disabled.
- The user must explicitly type the partition's volume label or the word **`CONFIRM`** into a verification text input box before the execution button is unlocked.

---

## 6. Development & Testing Safety Harness

During development and testing phases, OpenDisk Manager enforces strict software-enforced sandboxing to ensure developer and test machines are never damaged:

1. **Compile-Time Safety Flags**:
   - `#[cfg(feature = "mock-storage")]`: When active, the entire Win32 I/O subsystem is mocked in-memory. Synthetic disks, partitions, and filesystems are generated from JSON fixtures.
2. **Virtual Disk (VHDX) Loopback Target**:
   - The development harness creates and mounts dynamic `.vhdx` files via Windows `New-VHD` / `Mount-VHD`.
   - Real hardware handles (`\\.\PhysicalDrive0`) are strictly blocked in development builds by a hardcoded invariant check that matches physical drive serial numbers against virtual drive indicators (`VIRTUAL DISK`, `Hyper-V`).
3. **No Direct Writes to Physical Drive 0**:
   - An assertion in the low-level `open_physical_drive` function immediately panics if the target drive index is `0` unless an explicit environment variable `OPENDISK_ALLOW_PHYSICAL_DRIVE_ZERO=TRUE_I_HAVE_A_BACKUP` is declared.
