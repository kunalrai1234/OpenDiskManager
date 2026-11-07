# BACKEND INTEGRATION REPORT — OPENDISK MANAGER
**Application**: OpenDisk Manager  
**Version**: 1.0.0 Production Release  
**Platform**: Windows 11 x64 Storage Subsystem  
**Date**: November 2026  
**Auditor**: Principal Systems Engineer & Windows Storage Architect  
**Status**: COMPLETE & VERIFIED (PASS)  

---

## 1. Executive Summary

This report documents the backend architecture, Inter-Process Communication (IPC) bridges, and Windows Storage subsystem integrations powering OpenDisk Manager v1.0.0.

The application architecture utilizes an asynchronous, secure Electron-to-PowerShell execution model. Direct shell string injection is strictly eliminated: every storage operation executes via structured argument arrays invoking official Windows Storage Management cmdlets (`MSFT_Disk`, `MSFT_Partition`, `MSFT_Volume`) and Win32 FSCTL interfaces.

Dual-mode script resolution enables seamless execution across local development and packaged NSIS / portable installations.

---

## 2. IPC & Process Architecture

```
┌────────────────────────────────────────────────────────┐
│             React 18 Frontend (Chromium)               │
│          App.jsx / Dashboard / Map / Tables            │
└───────────────────────────┬────────────────────────────┘
                            │ window.opendiskManager (Frozen IPC API)
                            ▼
┌────────────────────────────────────────────────────────┐
│                preload.cjs (Sandboxed)                 │
│         contextIsolation: true, nodeIntegration: false │
└───────────────────────────┬────────────────────────────┘
                            │ ipcRenderer.invoke(...)
                            ▼
┌────────────────────────────────────────────────────────┐
│             desktop-runner.cjs (Main Process)          │
│       resolveScriptPath(), Process Spawning & Logging  │
└───────┬──────────────┬──────────────┬──────────────┬───┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌──────────────┐┌──────────────┐┌──────────────┐┌──────────────┐
│detect-disks  ││resize-engine ││movement-eng  ││advanced-eng  │
│    .ps1      ││    .ps1      ││    .ps1      ││    .ps1      │
└───────┬──────┘└──────┬───────┘└──────┬───────┘└──────┬───────┘
        │              │               │               │
        └──────────────┴───────┬───────┴───────────────┘
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │        Windows 11 Storage Subsystem          │
        │   Get-Disk / Get-Partition / Get-Volume      │
        │   Resize-Partition / FSCTL_LOCK_VOLUME       │
        └──────────────────────────────────────────────┘
```

---

## 3. Communication Bridge Verification

### 3.1 Preload Security Contract (`preload.cjs`)
- **Isolation Policy**: `contextBridge.exposeInMainWorld('opendiskManager', {...})`
- **Exposed Endpoints**:
  1. `scanDisks()`: Invokes `detect-disks.ps1` and returns normalized JSON.
  2. `checkElevation()`: Queries Windows token privileges (`TokenElevationType`).
  3. `resizePartition(payload)`: Executes preflight validation and safe resize.
  4. `simulateResize(payload)`: Computes boundary diffs without modifying storage.
  5. `movePartition(payload)`: Executes or stages partition relocation.
  6. `simulateMove(payload)`: Compiles 6-phase atomic movement plan.
  7. `executeAdvanced(payload)`: Executes format, delete, split, merge, letter, or label operations.
  8. `detectConfigIssues()`: Runs full configuration and collision diagnostics.
  9. `readAuditLog(logType)`: Safely streams log file contents.
- **Verification**: Frontend has zero access to Node.js `fs`, `child_process`, or `shell` modules.

### 3.2 Dual-Mode Script Resolution (`desktop-runner.cjs`)
To ensure reliable script loading in both development and packaged production builds, the main runner implements `resolveScriptPath`:
```javascript
function resolveScriptPath(scriptName) {
  // Production packaged path: process.resourcesPath / scriptName
  if (process.resourcesPath) {
    const packagedPath = path.join(process.resourcesPath, scriptName);
    if (fs.existsSync(packagedPath)) return packagedPath;
  }
  // Development path: __dirname / scriptName
  const devPath = path.join(__dirname, scriptName);
  if (fs.existsSync(devPath)) return devPath;

  return null;
}
```
Verified that all 4 scripts (`detect-disks.ps1`, `resize-engine.ps1`, `movement-engine.ps1`, `advanced-engine.ps1`) resolve cleanly in both modes.

### 3.3 Safe PowerShell Process Execution
- Shell string concatenation is strictly prohibited.
- Spawning uses standard `child_process.spawn`:
  ```javascript
  const child = spawn("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", scriptPath,
    ...args
  ]);
  ```
- All parameters are passed as distinct positional elements in the argument vector, neutralizing argument injection vectors.

---

## 4. Backend Engine Verification

| Subsystem Script | Core Responsibilities | Windows API Cmdlets Used | Status |
|---|---|---|---|
| `detect-disks.ps1` | Enumerate physical drives, GPT/MBR styles, partitions, used/free extents, unallocated gaps | `Get-Disk`, `Get-Partition`, `Get-Volume`, `Get-PhysicalDisk` | **PASS** |
| `resize-engine.ps1` | Query supported resize limits, validate adjacency, enforce 1 MiB alignment, execute shrink/extend | `Get-PartitionSupportedSize`, `Resize-Partition` | **PASS** |
| `movement-engine.ps1` | Calculate directional vectors, reverse copy ordering, stage WinPE tasks, record WAL journal | `Get-Partition`, `FSCTL_LOCK_VOLUME`, `IOCTL_DISK_GET_DRIVE_LAYOUT_EX` | **PASS** |
| `advanced-engine.ps1` | Format volumes, delete partitions, assign/remove letters, update labels, split/merge partitions | `Format-Volume`, `Remove-Partition`, `Set-Partition`, `Set-Volume` | **PASS** |

---

## 5. Audit Logging & State Persistence

- **Log File Directory**: Configured via `getAppLogDir()` resolving to `%APPDATA%\OpenDiskManager\logs` in production, falling back to local workspace in dev.
- **Audit Logs Generated**:
  - `resize-audit.log`: Records operation ID, disk number, partition number, before/after bytes, delta, and verification metrics.
  - `movement-audit.log`: Records shift direction, start/end LBA vectors, sector counts, copy ordering, and SHA-256 validation.
  - `opendisk-winpe-task.json`: Staged offline task payload for WinPE kernel relocations.

---

## 6. Integration Verdict

**INTEGRATION STATUS: PASS (ROBUST, SECURE & VERIFIED)**
