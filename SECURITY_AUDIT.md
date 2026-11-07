# OpenDisk Manager — Security Audit & Threat Model

**Document**: `SECURITY_AUDIT.md`  
**Product**: OpenDisk Manager (Windows 11 x64)  
**Security Level**: High-Integrity System Utility  
**Audit Standard**: Least Privilege, Zero Trust Process Boundaries, Defense-in-Depth  
**Date**: November 2026  

---

## 1. Security Architecture & Threat Model

OpenDisk Manager manages physical block storage, GUID Partition Tables (GPT), Master Boot Records (MBR), and Windows filesystems. Due to the high potential impact of storage alterations, the application adheres to a strict multi-layer defense-in-depth model.

```
+----------------------------------------------------------------+
|                     ELECTRON RENDERER UI                       |
|   (Context Isolated, Sandbox Enabled, Node Integration = false) |
+-------------------------------+--------------------------------+
                                |
               IPC Bridge (contextBridge, preload.cjs)
               - Strictly typed invoke channels
               - Argument schema validation
                                v
+----------------------------------------------------------------+
|                     MAIN PROCESS RUNNER                        |
|   (desktop-runner.cjs, Node.js runtime, privilege management)   |
+-------------------------------+--------------------------------+
                                |
               Spawn Process with Argument Arrays
               (No cmd.exe shell wrappers, no string concatenation)
                                v
+----------------------------------------------------------------+
|                POWERSHELL / WIN32 STORAGE ENGINE               |
|   (resize-engine.ps1, movement-engine.ps1, advanced-engine.ps1) |
|   - Revalidates partition offsets and disk state               |
|   - Enforces protected partition shields                       |
|   - Requires explicit -Confirm:$false elevation parameter      |
+----------------------------------------------------------------+
```

---

## 2. Process & Boundary Isolation

### 2.1 Renderer Process Hardening
- **Context Isolation**: `contextIsolation: true` is strictly enforced on the `BrowserWindow`.
- **Node Integration Disabled**: `nodeIntegration: false` prevents renderer-side scripts from accessing Node.js system APIs, `fs`, `child_process`, or arbitrary memory spaces.
- **Preload Whitelist**: All communications pass through a strictly defined `window.openDiskAPI` object in `preload.cjs`. No arbitrary IPC channels can be opened by the web view.

### 2.2 Shell Injection Prevention
- **No String Concatenation**: The backend never executes shell commands via string concatenation or `Invoke-Expression` (`iex`).
- **Parameterized Execution**: All child processes (`powershell.exe`) are spawned using discrete argument vectors:
  ```javascript
  const child = spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", scriptPath,
    "-Action", action,
    "-DiskNumber", String(diskNumber),
    "-PartitionNumber", String(partitionNumber),
    "-TargetSizeBytes", String(targetSizeBytes)
  ]);
  ```
- **Type Coercion & Sanitization**: Numeric inputs (`DiskNumber`, `PartitionNumber`, `TargetSizeBytes`, `TargetStartLba`) are verified as valid positive integers before invocation. Volume letters are restricted to single uppercase alphabetic characters (`[D-Z]`). Volume labels are validated against illegal Windows filesystem characters (`<>:"/\|?*`).

---

## 3. Privilege Boundaries & UAC Handling

### 3.1 Dual-Mode Operation
OpenDisk Manager implements a strict privilege separation model:
1. **Standard User Token (Non-Elevated)**:
   - Capable of executing 100% of read-only disk discovery, partition analysis, space planning, geometry verification, and health diagnostics.
   - Falls back gracefully from privileged CIM classes to user-accessible query mechanisms without crashing or displaying elevation errors.
2. **Elevated Token (Administrator UAC)**:
   - Mandatory for all destructive operations: partition resizing, block relocation, formatting, deletion, letter reassignment, splitting, and merging.
   - Any attempt to invoke destructive engines under a standard user token is halted at the preflight stage with an explicit elevation error.

### 3.2 Time-of-Check to Time-of-Use (TOCTOU) Mitigation
Between the initial space planning analysis and the actual physical execution, another operating system process or background service could theoretically alter disk geometry.
To defeat TOCTOU vulnerabilities:
- **Pre-Execution Offset Revalidation**: The execution engine verifies that the partition's starting byte offset on disk exactly matches the `expectedStartOffset` recorded during planning.
- **Immediate Abort**: If an offset discrepancy is detected, execution halts immediately with `Partition offset mismatch`, preventing out-of-order writes or overlapping block corruption.

---

## 4. Protected Partition Shields

To prevent catastrophic operating system destruction or rendering the host unbootable, OpenDisk Manager enforces non-bypassable protective shields in both client validation engines and native PowerShell backend scripts.

### 4.1 Shield Matrix

| Partition Type | Format Prohibited | Delete Prohibited | Live Resize Allowed | Live Move Allowed | Shield Rule |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **EFI System Partition (ESP)** | **YES** | **YES** | **NO** | **NO** | Boot critical; holds UEFI bootloader |
| **Microsoft Reserved (MSR)** | **YES** | **YES** | **NO** | **NO** | Required by Windows for GPT volume management |
| **Windows Boot (C:)** | **YES** | **YES** | **Extend Only** | **NO (WinPE Only)** | Active operating system kernel |
| **Windows Recovery (WinRE)** | **YES** | **YES** | **NO** | **NO (WinPE Staged)**| System recovery environment |
| **BitLocker Encrypted Data** | Confirmation | Confirmation | Guarded | Guarded | Guarded by TPM key safeguards |
| **Standard NTFS/FAT32 Data** | Allowed | Allowed | Allowed | Allowed | Standard data partition |

### 4.2 Explicit Destructive Safeguards
- **Random Confirmation Codes**: High-risk actions (Format, Delete, Split, Merge) require the user to explicitly type an operational confirmation code (e.g., `FORMAT-DATA`, `DELETE-PART-5`, or exact volume label) in the UI before the execute button unlocks.
- **Dry-Run Simulation**: All engines support `-Simulate` dry-run execution that verifies all locks, boundaries, and commands without writing to disk.

---

## 5. BitLocker & TPM Integrity

### 5.1 TPM Safeguards
Modifying partition boundaries or sector offsets on a drive protected by BitLocker can invalidate the TPM Platform Configuration Register (PCR) measurements (specifically PCR 7 and PCR 11), triggering BitLocker Recovery Mode on subsequent boot.

### 5.2 Mandatory BitLocker Policies
1. **Preflight Detection**: The engine scans volumes using `Get-BitLockerVolume` to determine protection status (`Locked`, `Unlocked`, `Off`).
2. **Suspension Requirement**: Live partition movements and splits require BitLocker protection to be suspended (`Suspend-BitLocker -MountPoint C: -RebootCount 1`) prior to physical sector reallocation, or decrypted.
3. **Recovery Key Certification**: The UI explicitly presents a warning prompting the user to confirm they possess their 48-digit BitLocker Recovery Key before staging operations.

---

## 6. Audit Logging & Forensic Trail

All structural alterations generate persistent, structured log entries with microsecond timestamps:
- `resize-audit.log`: Records disk number, partition number, old size, target size, operation status, and verification metrics.
- `movement-audit.log`: Records LBA source/destination bounds, copy direction, verified sector count, and GPT update status.
- `advanced-audit.log`: Records formatting parameters, deleted partition GUIDs, letter reassignments, and split/merge transactions.
- `desktop-runner.log`: Records all IPC invocations, child process exit codes, and standard error streams.

Logs are stored in the local application directory and cannot be overwritten by subsequent operations (append-only mode).

