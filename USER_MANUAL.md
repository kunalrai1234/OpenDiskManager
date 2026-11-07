# OpenDisk Manager — Comprehensive User Manual & Operations Handbook

**Product**: OpenDisk Manager  
**Version**: 1.0.0 Production Release  
**Platform**: Windows 11 x64  
**Audience**: System Administrators, Power Users, and PC Enthusiasts  

---

## 1. Application Architecture & Interface Overview

OpenDisk Manager provides a sleek, dark-themed control center designed specifically for modern Windows 11 storage topologies:

```
+------------------------------------------------------------------------------------------------+
| [LOGO] OpenDisk Manager  v1.0.0 RELEASE        [● REAL DISK DETECTION ACTIVE | NVMe Samsung]   |
+-------------------+----------------------------------------------------------------------------+
| NAVIGATION        | PHYSICAL DISK OVERVIEW                                                     |
| • Overview        | Model: Samsung 980 PRO 1TB  | Style: GPT  | Health: 99% Healthy (38°C)         |
| • Disk Management +----------------------------------------------------------------------------+
| • Space Planner   | GRAPHICAL PARTITION MAP                                                    |
| • Partition Mgr   | [ EFI 100MB ] [ MSR 16MB ] [ C: Windows 450GB ] [ D: Data 380GB ] [ GAP 10GB ] |
| • Storage Analyzer+----------------------------------------------------------------------------+
| • Operations (0)  | PARTITION INVENTORY & ACTION BUTTONS                                       |
| • System Logs     | # | Letter | Label      | Type | FileSystem | Total Size | Free  | Actions |
| • Settings        | 3 | C:     | Windows 11 | OS   | NTFS       | 450.0 GB   | 235GB | Resize  |
| • About           | 4 | D:     | Projects   | Data | NTFS       | 380.0 GB   | 168GB | Move... |
+-------------------+----------------------------------------------------------------------------+
```

---

## 2. Navigating Views & Key Capabilities

### 2.1 Disk Management Dashboard
- **Disk Selector**: Switch between attached physical drives (`PhysicalDrive0`, `PhysicalDrive1`, USB drives).
- **Graphical Partition Map**: Visually proportional representation of partitions.
  - **Blue**: Windows Operating System (`C:`)
  - **Teal / Slate**: Basic Data Partitions (`D:`, `E:`)
  - **Indigo**: Windows Recovery Environment (`WinRE`)
  - **Green Striped**: Unallocated Expandable Free Space
  - **Amber Shield**: EFI System Partition (`ESP`) and Microsoft Reserved (`MSR`)
- **Inspector Panel**: Click any partition to inspect sector boundaries, starting LBA, ending LBA, filesystem cluster size, serial numbers, and BitLocker state.

---

## 3. How-To: Core Partition Operations

### 3.1 Resizing or Extending a Partition (Online NTFS)
1. Select the desired partition from the table or graphical map.
2. Click the **"Resize"** button in the actions column.
3. The **Safe Resize Modal** opens:
   - The interactive slider automatically clamps within verified Windows storage boundaries:
     - Minimum: Limited by active used data and cluster allocation bitmaps.
     - Maximum: Current size plus immediate adjacent unallocated free space.
4. Enter the new size in GB or adjust the visual slider.
5. Review the **Pre-Flight Invariant Checklist**:
   - `[PASS]` 1 MiB boundary alignment verified.
   - `[PASS]` Sufficient cluster free space confirmed.
   - `[PASS]` Target unallocated space verified adjacent.
6. Click **"Apply Resize"** (or **"Dry-Run Simulation"** to inspect exact PowerShell commands first).

---

### 3.2 Moving a Partition (Sector Relocation)
When unallocated space is located to the right or left of a partition and you need to shift the partition:

1. Click **"Move"** on the target data partition.
2. In the **Partition Movement Modal**:
   - Set the displacement offset using the slider.
   - Review the calculated starting and ending LBA.
   - The engine automatically selects the collision-safe copy sequence:
     - **Rightward Move (`SHIFT_RIGHT`)**: Reverse copy (`TAIL_TO_HEAD`) prevents overwriting source sectors.
     - **Leftward Move (`SHIFT_LEFT`)**: Forward copy (`HEAD_TO_TAIL`).
3. Check the mandatory backup certification:
   - `[x] I certify that I have verified an external backup of this drive`.
4. Click **"Execute Sector Move"**.
5. Once block copying finishes, the engine recalculates the NTFS Volume Boot Record (VBR) and updates the Primary and Backup GPT headers.

---

### 3.3 Space Planning & Cross-Partition Transfers
When you want to transfer free space from Partition D: to Partition C:, but an intermediate partition (such as WinRE) stands in between:

1. Open the **"Space Planner"** tab in the sidebar.
2. Select **Source Partition** (e.g., `D: Data`).
3. Select **Target Partition** (e.g., `C: Windows 11`).
4. Enter the transfer amount (e.g., `25.0 GB`).
5. OpenDisk Manager compiles an **Operation Dependency Graph (DAG)**:
   ```mermaid
   graph LR
     A["Step 1: Shrink D: by 25 GB"] --> B["Step 2: Shift WinRE rightward"]
     B --> C["Step 3: Grow C: into liberated gap"]
   ```
6. If an offline reboot is required for system files, the engine prepares a staged `opendisk-winpe-task.json` payload.

---

### 3.4 Advanced Operations Center

Click **"Advanced Operations"** on any data partition to access the multi-tool modal:

1. **Format Volume**:
   - Format with **NTFS**, **exFAT**, or **FAT32** (enforcing 32 GiB Windows limit).
   - Configure Allocation Unit Sizes from 4096 bytes to 64 KiB.
   - Requires typing confirmation code: `FORMAT-<LETTER>`.
2. **Delete Partition**:
   - Frees partition physical sectors back to unallocated disk space.
   - Requires typing confirmation code: `DELETE-PART-<N>`.
3. **Assign / Remove Drive Letter**:
   - Change assigned mount letters with instant collision scanning across network drives, optical discs, and local volumes.
4. **Change Volume Label**:
   - Set friendly labels with automatic character sanitization (`<>:"/\|?*` filtered out).
5. **Split Partition**:
   - Divide one large partition into two separate volumes without data loss by shrinking the host volume and creating a new formatted partition in the vacated extent.
6. **Merge Partitions**:
   - Consolidate two adjacent contiguous partitions on the same disk with automatic data migration.

---

## 4. Storage Analyzer & Configuration Diagnostics

Navigate to **"Storage Analyzer"** in the sidebar to review:
- Physical device capacity distribution and free space percentages.
- Filesystem breakdown (NTFS vs. FAT32 vs. exFAT vs. ReFS).
- **Proactive Health & Configuration Diagnostics Scanner**:
  - Checks for 1 MiB sector misalignments that degrade SSD performance.
  - Detects duplicate drive letter collisions.
  - Flags fragmented unallocated space gaps.
  - Identifies legacy MBR disks exceeding 2 TiB capacity limits.

---

## 5. Operations Queue & Execution Verification

Every scheduled operation is staged in the **Operations Queue**:
- Re-order pending tasks.
- Inspect the visual before-and-after sector diff in the **Execution Diff Modal**.
- Discard staged operations with zero alteration to physical media.
- Commit all queued operations in a verified, atomic batch transaction.

