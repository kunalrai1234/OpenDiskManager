/**
 * OpenDisk Manager - Advanced Partition Management Engine (Phase 6)
 * Target: Windows 11 x64 Native Storage Management
 * Pure client-side validation, preflight simulation, consequence explanations,
 * configuration diagnostics, and IPC bridge adapters.
 */

// -----------------------------------------------------------------------------
// Safety Shields & Identification
// -----------------------------------------------------------------------------

export function isProtectedPartition(partition) {
  if (!partition) return false;
  
  const cat = (partition.category || "").toUpperCase();
  const letter = (partition.volumeLetter || "").toUpperCase();
  const gptType = (partition.typeGuid || "").toLowerCase();
  const type = (partition.partitionType || "").toLowerCase();

  // 1. EFI System Partition
  if (cat === "EFI" || type === "system" || gptType === "c12a7328-f81f-11d2-ba4b-00a0c93ec93b") {
    return true;
  }

  // 2. Microsoft Reserved Partition (MSR)
  if (cat === "MSR" || type === "reserved" || gptType === "e3c9e316-0b5c-4db8-817d-f92df00215ae") {
    return true;
  }

  // 3. Windows Boot / Operating System Volume (C:)
  if (cat === "SYSTEM" || partition.isSystem || partition.isBoot || letter === "C" || letter === "C:") {
    return true;
  }

  return false;
}

export function isRecoveryPartition(partition) {
  if (!partition) return false;
  const cat = (partition.category || "").toUpperCase();
  const gptType = (partition.typeGuid || "").toLowerCase();
  const type = (partition.partitionType || "").toLowerCase();

  return (
    cat === "RECOVERY" ||
    type === "recovery" ||
    gptType === "de94bba4-06d1-4d40-a16a-bfd50179d6ac"
  );
}

// -----------------------------------------------------------------------------
// Available Drive Letters Calculation
// -----------------------------------------------------------------------------

export function getAssignedLettersFromTopology(disks = []) {
  const assigned = new Map();
  for (const disk of disks) {
    for (const part of (disk.partitions || [])) {
      if (part.volumeLetter) {
        const ltr = part.volumeLetter.replace(":", "").trim().toUpperCase();
        if (ltr) {
          assigned.set(ltr, {
            diskId: disk.id,
            partitionNumber: part.partitionNumber,
            label: part.label || "Unnamed"
          });
        }
      }
    }
  }
  return assigned;
}

export function getAvailableDriveLetters(disks = []) {
  const assigned = getAssignedLettersFromTopology(disks);
  const allLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const available = [];
  const inUse = [];

  for (const letter of allLetters) {
    if (assigned.has(letter)) {
      inUse.push({
        letter,
        ...assigned.get(letter)
      });
    } else {
      available.push(letter);
    }
  }

  return { available, inUse };
}

// -----------------------------------------------------------------------------
// 1. Format Volume Preflight Validation
// -----------------------------------------------------------------------------

export function validateFormat(partition, disk, options = {}) {
  const {
    fileSystem = "NTFS",
    label = "",
    clusterSize = 4096,
    quickFormat = true
  } = options;

  if (!partition || !disk) {
    return {
      canExecute: false,
      status: "INVALID_TARGET",
      error: "No partition or disk specified."
    };
  }

  if (partition.category === "UNALLOCATED") {
    return {
      canExecute: false,
      status: "UNALLOCATED_TARGET",
      error: "Cannot format unallocated space. Create a partition first."
    };
  }

  // SHIELD: Protected Partitions
  if (isProtectedPartition(partition)) {
    return {
      canExecute: false,
      status: "PROTECTED_PARTITION_BLOCKED",
      error: `FORMAT REJECTED: Partition #${partition.partitionNumber} is a protected Windows System, EFI, MSR, or Boot volume. Formatting will destroy the operating system.`
    };
  }

  // Recovery partition shield
  if (isRecoveryPartition(partition)) {
    return {
      canExecute: false,
      status: "RECOVERY_PARTITION_BLOCKED",
      error: `FORMAT BLOCKED: Partition #${partition.partitionNumber} is the Windows Recovery Environment (WinRE) partition.`
    };
  }

  const fsUpper = fileSystem.toUpperCase();
  const validFs = ["NTFS", "FAT32", "EXFAT", "REFS"];
  if (!validFs.includes(fsUpper)) {
    return {
      canExecute: false,
      status: "UNSUPPORTED_FS",
      error: `Unsupported target filesystem: ${fileSystem}. Supported: NTFS, FAT32, exFAT, ReFS.`
    };
  }

  // FAT32 32 GB Windows native limit
  const sizeBytes = partition.sizeBytes || 0;
  if (fsUpper === "FAT32" && sizeBytes > 34359738368) {
    return {
      canExecute: false,
      status: "FAT32_SIZE_EXCEEDED",
      error: `FAT32 is restricted to volumes <= 32 GB under Windows. Current volume is ${(sizeBytes / 1e9).toFixed(1)} GB. Select NTFS or exFAT instead.`
    };
  }

  // Label validation
  const cleanLabel = (label || "").trim();
  const maxLabelLen = fsUpper === "NTFS" ? 32 : 11;
  if (cleanLabel.length > maxLabelLen) {
    return {
      canExecute: false,
      status: "LABEL_TOO_LONG",
      error: `${fsUpper} volume label cannot exceed ${maxLabelLen} characters.`
    };
  }
  if (/[<>:"/\\|?*]/.test(cleanLabel)) {
    return {
      canExecute: false,
      status: "ILLEGAL_LABEL_CHARS",
      error: 'Volume label contains illegal characters (< > : " / \\ | ? *).'
    };
  }

  const letter = (partition.volumeLetter || "").replace(":", "").trim().toUpperCase();
  const expectedConfirmationCode = letter ? `FORMAT_${letter}` : `FORMAT_DISK${disk.id}_PART${partition.partitionNumber}`;

  return {
    canExecute: true,
    status: "PREFLIGHT_PASS",
    diskId: disk.id,
    partitionNumber: partition.partitionNumber,
    driveLetter: letter || null,
    currentSizeGb: parseFloat((sizeBytes / 1e9).toFixed(2)),
    targetFileSystem: fsUpper,
    targetLabel: cleanLabel || "Volume",
    clusterSize,
    quickFormat,
    expectedConfirmationCode,
    consequences: [
      "ALL EXISTING DATA ON THIS VOLUME WILL BE PERMANENTLY ERASED.",
      "Any open files, locks, and handles will be forcefully severed.",
      "System restore points and Volume Shadow Copies on this drive will be deleted.",
      `The volume structure will be reinitialized from scratch with ${fsUpper}.`
    ]
  };
}

// -----------------------------------------------------------------------------
// 2. Delete Partition Preflight Validation
// -----------------------------------------------------------------------------

export function validateDelete(partition, disk) {
  if (!partition || !disk) {
    return {
      canExecute: false,
      status: "INVALID_TARGET",
      error: "No partition or disk specified."
    };
  }

  if (partition.category === "UNALLOCATED") {
    return {
      canExecute: false,
      status: "UNALLOCATED_TARGET",
      error: "Space is already unallocated."
    };
  }

  // SHIELD: Protected Partitions
  if (isProtectedPartition(partition)) {
    return {
      canExecute: false,
      status: "PROTECTED_PARTITION_BLOCKED",
      error: `DELETION BLOCKED: Partition #${partition.partitionNumber} is an active Windows Boot, System, EFI, or MSR partition. Deleting this will render the host computer unbootable.`
    };
  }

  const isRecovery = isRecoveryPartition(partition);
  const sizeBytes = partition.sizeBytes || 0;
  const sizeGb = parseFloat((sizeBytes / 1e9).toFixed(2));
  const expectedConfirmationCode = `DELETE_DISK${disk.id}_PART${partition.partitionNumber}`;

  const consequences = [
    `The partition entry will be permanently deleted from the ${disk.partitionStyle || "GPT"} partition table.`,
    `The entire ${sizeGb} GB physical extent will immediately revert to RAW UNALLOCATED space.`,
    "All stored documents, programs, databases, and filesystem data will be destroyed.",
    isRecovery 
      ? "HIGH RISK: Deleting this recovery partition removes Windows Recovery Environment (WinRE) automatic boot repair capabilities."
      : "Any drive letters mounted to this partition will be unmounted."
  ];

  return {
    canExecute: true,
    status: "PREFLIGHT_PASS",
    diskId: disk.id,
    partitionNumber: partition.partitionNumber,
    driveLetter: (partition.volumeLetter || "").replace(":", "").trim().toUpperCase() || null,
    partitionOffset: partition.startLba * 512,
    sizeGb,
    isRecoveryPartition: isRecovery,
    expectedConfirmationCode,
    consequences
  };
}

// -----------------------------------------------------------------------------
// 3. Assign or Change Drive Letter Preflight Validation
// -----------------------------------------------------------------------------

export function validateDriveLetter(partition, disk, allDisks = [], newLetter = "") {
  if (!partition || !disk) {
    return { canExecute: false, status: "INVALID_TARGET", error: "Missing partition or disk." };
  }

  const cleanLetter = (newLetter || "").trim().toUpperCase().replace(":", "");
  if (!cleanLetter || cleanLetter.length !== 1 || !/[A-Z]/.test(cleanLetter)) {
    return { canExecute: false, status: "INVALID_LETTER", error: "Drive letter must be a single character between A and Z." };
  }

  const currentLetter = (partition.volumeLetter || "").trim().toUpperCase().replace(":", "");

  // Protected: Cannot alter C:
  if (currentLetter === "C" || partition.isBoot || isProtectedPartition(partition)) {
    return { canExecute: false, status: "BOOT_PARTITION_LOCKED", error: "Cannot change drive letter of Windows OS boot partition (C:)." };
  }

  if (cleanLetter === "C") {
    return { canExecute: false, status: "RESERVED_LETTER", error: "Drive letter 'C' is reserved for Windows System boot volume." };
  }

  if (cleanLetter === currentLetter) {
    return { canExecute: false, status: "IDENTICAL_LETTER", error: `Volume is already assigned drive letter ${cleanLetter}:.` };
  }

  // Conflict check
  const assigned = getAssignedLettersFromTopology(allDisks);
  if (assigned.has(cleanLetter)) {
    const occupant = assigned.get(cleanLetter);
    return {
      canExecute: false,
      status: "LETTER_COLLISION",
      error: `Drive letter '${cleanLetter}:' is already in use by Disk ${occupant.diskId} Partition #${occupant.partitionNumber} (${occupant.label}).`
    };
  }

  return {
    canExecute: true,
    status: "PREFLIGHT_PASS",
    diskId: disk.id,
    partitionNumber: partition.partitionNumber,
    currentLetter: currentLetter || null,
    targetLetter: cleanLetter,
    consequences: [
      `Volume access path will be updated to ${cleanLetter}:\\.`,
      "Any desktop shortcuts or applications referencing the previous drive letter may require updating."
    ]
  };
}

// -----------------------------------------------------------------------------
// 4. Remove Drive Letter Preflight Validation
// -----------------------------------------------------------------------------

export function validateRemoveDriveLetter(partition, disk) {
  if (!partition || !disk) {
    return { canExecute: false, status: "INVALID_TARGET", error: "Missing partition or disk." };
  }

  const currentLetter = (partition.volumeLetter || "").trim().toUpperCase().replace(":", "");
  if (!currentLetter) {
    return { canExecute: false, status: "NO_LETTER", error: "Partition does not currently have an assigned drive letter." };
  }

  if (currentLetter === "C" || partition.isBoot || isProtectedPartition(partition)) {
    return { canExecute: false, status: "BOOT_PARTITION_LOCKED", error: "Cannot remove drive letter from Windows OS boot partition (C:)." };
  }

  return {
    canExecute: true,
    status: "PREFLIGHT_PASS",
    diskId: disk.id,
    partitionNumber: partition.partitionNumber,
    removedLetter: currentLetter,
    consequences: [
      `Drive letter ${currentLetter}: will be unmounted from Windows Explorer.`,
      "Underlying partition data remains completely intact and unaffected.",
      "The volume can be remounted or assigned a new letter at any time."
    ]
  };
}

// -----------------------------------------------------------------------------
// 5. Volume Label Preflight Validation
// -----------------------------------------------------------------------------

export function validateVolumeLabel(partition, disk, newLabel = "") {
  if (!partition || !disk) {
    return { canExecute: false, status: "INVALID_TARGET", error: "Missing partition or disk." };
  }

  if (isProtectedPartition(partition) && partition.category !== "SYSTEM") {
    return { canExecute: false, status: "PROTECTED_PARTITION", error: "Cannot change label of EFI or MSR system partitions." };
  }

  const cleanLabel = (newLabel || "").trim();
  const fs = (partition.fsType || "NTFS").toUpperCase();
  const maxLen = (fs === "FAT32" || fs === "EXFAT") ? 11 : 32;

  if (cleanLabel.length > maxLen) {
    return { canExecute: false, status: "LABEL_TOO_LONG", error: `${fs} volume label cannot exceed ${maxLen} characters.` };
  }

  if (/[<>:"/\\|?*]/.test(cleanLabel)) {
    return { canExecute: false, status: "ILLEGAL_CHARACTERS", error: 'Volume label contains illegal characters (< > : " / \\ | ? *).' };
  }

  return {
    canExecute: true,
    status: "PREFLIGHT_PASS",
    diskId: disk.id,
    partitionNumber: partition.partitionNumber,
    currentLabel: partition.label || "",
    newLabel: cleanLabel,
    consequences: [
      `Friendly volume name in Windows Explorer will update to "${cleanLabel || "Local Disk"}".`
    ]
  };
}

// -----------------------------------------------------------------------------
// 6. Split Partition Preflight Validation
// -----------------------------------------------------------------------------

export function validateSplit(partition, disk, splitSizeGb, options = {}, allDisks = []) {
  if (!partition || !disk) {
    return { canExecute: false, status: "INVALID_TARGET", error: "Missing partition or disk." };
  }

  if (isProtectedPartition(partition)) {
    return { canExecute: false, status: "PROTECTED_PARTITION", error: "Cannot split EFI System or Microsoft Reserved partitions." };
  }

  const fs = (partition.fsType || "RAW").toUpperCase();
  if (fs === "RAW" || fs === "UNKNOWN") {
    return {
      canExecute: false,
      status: "UNSUPPORTED_FS",
      error: "Cannot split an unformatted or RAW partition. Format the volume first."
    };
  }

  const splitGbNum = parseFloat(splitSizeGb);
  if (isNaN(splitGbNum) || splitGbNum <= 0) {
    return { canExecute: false, status: "INVALID_SIZE", error: "Split size must be greater than 0 GB." };
  }

  const currentSizeBytes = partition.sizeBytes || 0;
  const currentSizeGb = currentSizeBytes / 1e9;
  const usedBytes = partition.usedBytes || 0;
  const freeBytes = Math.max(0, currentSizeBytes - usedBytes);

  // Leave minimum 10% safety buffer or 2 GB on original partition
  const minRetainBytes = Math.max(usedBytes + 2e9, currentSizeBytes * 0.2);
  const maxSafeSplitBytes = Math.max(0, currentSizeBytes - minRetainBytes);
  const maxSafeSplitGb = parseFloat((maxSafeSplitBytes / 1e9).toFixed(2));

  const splitSizeBytes = Math.floor(splitGbNum * 1e9);

  if (splitSizeBytes > maxSafeSplitBytes) {
    return {
      canExecute: false,
      status: "SPLIT_SIZE_EXCEEDS_FREE_SPACE",
      error: `Requested split size (${splitGbNum} GB) exceeds maximum safe shrinkable space (${maxSafeSplitGb} GB). Ensure sufficient free filesystem space remains.`,
      maxSafeSplitGb
    };
  }

  const retainedSizeBytes = currentSizeBytes - splitSizeBytes;
  const retainedSizeGb = parseFloat((retainedSizeBytes / 1e9).toFixed(2));

  // Check target drive letter if provided
  const targetLetter = (options.targetDriveLetter || "").trim().toUpperCase().replace(":", "");
  if (targetLetter) {
    const assigned = getAssignedLettersFromTopology(allDisks);
    if (assigned.has(targetLetter)) {
      return {
        canExecute: false,
        status: "LETTER_COLLISION",
        error: `Target drive letter '${targetLetter}:' is already in use.`
      };
    }
  }

  const newFs = (options.fileSystem || "NTFS").toUpperCase();
  const newLabel = (options.label || "New_Volume").trim();
  const expectedConfirmationCode = `SPLIT_DISK${disk.id}_PART${partition.partitionNumber}`;

  return {
    canExecute: true,
    status: "PREFLIGHT_PASS",
    diskId: disk.id,
    partitionNumber: partition.partitionNumber,
    currentSizeGb: parseFloat(currentSizeGb.toFixed(2)),
    retainedSizeGb,
    newPartitionSizeGb: splitGbNum,
    newFileSystem: newFs,
    newLabel,
    newDriveLetter: targetLetter || null,
    expectedConfirmationCode,
    steps: [
      `Step 1: Shrink Partition #${partition.partitionNumber} from ${currentSizeGb.toFixed(1)} GB to ${retainedSizeGb} GB (leaving ${splitGbNum} GB trailing unallocated space).`,
      `Step 2: Create a new basic data partition in the freed ${splitGbNum} GB extent.`,
      `Step 3: Format the new partition with ${newFs} (Label: "${newLabel}").`,
      targetLetter ? `Step 4: Mount volume and assign drive letter ${targetLetter}:.` : "Step 4: Leave volume unmounted until configured."
    ],
    consequences: [
      "Original partition files remain intact within the retained boundary.",
      "A new, clean, separate partition will be created immediately to the right."
    ]
  };
}

// -----------------------------------------------------------------------------
// 7. Merge Partitions Preflight Validation
// -----------------------------------------------------------------------------

export function validateMerge(targetPart, sourcePart, disk, preserveData = true) {
  if (!targetPart || !sourcePart || !disk) {
    return { canExecute: false, status: "INVALID_TARGET", error: "Missing target partition, source partition, or disk." };
  }

  if (targetPart.id === sourcePart.id || targetPart.partitionNumber === sourcePart.partitionNumber) {
    return { canExecute: false, status: "IDENTICAL_PARTITIONS", error: "Cannot merge a partition into itself." };
  }

  // SHIELD: Protected Partitions Prohibition
  if (isProtectedPartition(targetPart) || isProtectedPartition(sourcePart)) {
    return {
      canExecute: false,
      status: "PROTECTED_PARTITION",
      error: "MERGE REJECTED: Neither target nor source partition can be an EFI System, MSR, Boot, or Windows OS volume."
    };
  }

  if (isRecoveryPartition(targetPart) || isRecoveryPartition(sourcePart)) {
    return {
      canExecute: false,
      status: "RECOVERY_PARTITION",
      error: "MERGE REJECTED: Recovery partitions cannot be merged with data partitions."
    };
  }

  // Strict Physical Adjacency Check (Tolerance: 2048 sectors / 1 MiB)
  const targetEndLba = targetPart.endLba;
  const targetStartLba = targetPart.startLba;
  const sourceStartLba = sourcePart.startLba;
  const sourceEndLba = sourcePart.endLba;

  let isAdjacent = false;
  let direction = ""; // "TARGET_BEFORE_SOURCE" or "SOURCE_BEFORE_TARGET"

  if (Math.abs((targetEndLba + 1) - sourceStartLba) <= 2048) {
    isAdjacent = true;
    direction = "TARGET_BEFORE_SOURCE";
  } else if (Math.abs((sourceEndLba + 1) - targetStartLba) <= 2048) {
    isAdjacent = true;
    direction = "SOURCE_BEFORE_TARGET";
  }

  if (!isAdjacent) {
    return {
      canExecute: false,
      status: "NOT_ADJACENT",
      error: `MERGE REJECTED: Partitions are not physically contiguous on Disk ${disk.id}. Target (#${targetPart.partitionNumber}) and Source (#${sourcePart.partitionNumber}) have intervening partitions or gaps.`
    };
  }

  // Windows NTFS Forward Extension Invariant:
  // Native NTFS extension only extends to the right into trailing unallocated space.
  if (direction === "SOURCE_BEFORE_TARGET") {
    return {
      canExecute: false,
      status: "REVERSE_MERGE_REQUIRES_RELOCATION",
      error: `DIRECTION LIMITATION: Target Partition #${targetPart.partitionNumber} is positioned AFTER Source Partition #${sourcePart.partitionNumber}. Native NTFS extension only supports expanding forward to the right. Invert the selection (set Partition #${sourcePart.partitionNumber} as Target) or stage a relocation.`
    };
  }

  // Target capacity check if preserving data
  const targetSizeBytes = targetPart.sizeBytes || 0;
  const targetUsedBytes = targetPart.usedBytes || 0;
  const targetFreeBytes = Math.max(0, targetSizeBytes - targetUsedBytes);
  const sourceUsedBytes = sourcePart.usedBytes || 0;

  if (preserveData && sourceUsedBytes > targetFreeBytes) {
    return {
      canExecute: false,
      status: "INSUFFICIENT_TARGET_SPACE",
      error: `INSUFFICIENT SPACE: Target Partition has ${(targetFreeBytes / 1e9).toFixed(1)} GB free space, but Source Partition contains ${(sourceUsedBytes / 1e9).toFixed(1)} GB of data.`
    };
  }

  const mergedSizeBytes = targetSizeBytes + (sourcePart.sizeBytes || 0);
  const mergedSizeGb = parseFloat((mergedSizeBytes / 1e9).toFixed(2));
  const expectedConfirmationCode = `MERGE_P${targetPart.partitionNumber}_WITH_P${sourcePart.partitionNumber}`;

  return {
    canExecute: true,
    status: "PREFLIGHT_PASS",
    diskId: disk.id,
    targetPartitionNumber: targetPart.partitionNumber,
    sourcePartitionNumber: sourcePart.partitionNumber,
    direction,
    mergedSizeGb,
    preserveData,
    expectedConfirmationCode,
    steps: [
      preserveData 
        ? `Step 1: Consolidate files from Source to Target (${targetPart.volumeLetter || "Target"}:\\Merged_Data_from_${sourcePart.volumeLetter || "Source"}\\).`
        : "Step 1: Verify user confirmation of data deletion on source.",
      `Step 2: Unmount and delete Source Partition #${sourcePart.partitionNumber} (${((sourcePart.sizeBytes || 0) / 1e9).toFixed(1)} GB), creating contiguous unallocated space.`,
      `Step 3: Extend Target Partition #${targetPart.partitionNumber} into the freed space to ${mergedSizeGb} GB total capacity.`
    ],
    consequences: [
      `Source Partition #${sourcePart.partitionNumber} will be PERMANENTLY DELETED.`,
      `Target Partition #${targetPart.partitionNumber} will grow to ${mergedSizeGb} GB.`,
      preserveData ? "Source files will be cataloged inside the target folder." : "Any data on source will be deleted."
    ]
  };
}

// -----------------------------------------------------------------------------
// 8. Storage Diagnostics & Configuration Issue Scanner
// -----------------------------------------------------------------------------

export function detectStorageConfigurationIssues(disks = []) {
  const issues = [];
  const warnings = [];
  const seenLetters = new Map();

  for (const disk of disks) {
    // 1. MBR > 2 TiB check
    if (disk.partitionStyle === "MBR" && disk.totalSizeBytes > 2.199e12) {
      issues.push({
        severity: "ERROR",
        code: "MBR_OVER_2TB_LIMIT",
        diskId: disk.id,
        message: `Disk ${disk.id} is MBR but capacity (${(disk.totalSizeBytes / 1e12).toFixed(2)} TB) exceeds the 2.0 TiB MBR limit. Storage beyond 2 TiB is unusable.`
      });
    }

    let unallocatedGaps = 0;
    let hasEsp = false;

    for (const part of (disk.partitions || [])) {
      // 2. 1 MiB alignment check
      if (part.category !== "UNALLOCATED") {
        const isAligned = (part.startLba % 2048) === 0;
        if (!isAligned) {
          warnings.push({
            severity: "WARNING",
            code: "PARTITION_NOT_1MIB_ALIGNED",
            diskId: disk.id,
            partitionNumber: part.partitionNumber,
            message: `Disk ${disk.id} Partition #${part.partitionNumber} starts at LBA ${part.startLba.toLocaleString()} (not 1 MiB aligned). May cause write amplification on SSDs.`
          });
        }
      }

      // 3. Duplicate drive letter detection
      if (part.volumeLetter) {
        const ltr = part.volumeLetter.replace(":", "").trim().toUpperCase();
        if (seenLetters.has(ltr)) {
          const prev = seenLetters.get(ltr);
          issues.push({
            severity: "CRITICAL",
            code: "DUPLICATE_DRIVE_LETTER",
            driveLetter: ltr,
            diskId: disk.id,
            partitionNumber: part.partitionNumber,
            firstSeen: `Disk ${prev.diskId} Partition #${prev.partitionNumber}`,
            message: `Drive Letter Collision '${ltr}:': Assigned to both Disk ${disk.id} Part #${part.partitionNumber} and Disk ${prev.diskId} Part #${prev.partitionNumber}!`
          });
        } else {
          seenLetters.set(ltr, { diskId: disk.id, partitionNumber: part.partitionNumber });
        }
      }

      if (part.category === "UNALLOCATED" && (part.sizeBytes || 0) > 1e8) {
        unallocatedGaps++;
      }

      if (part.category === "EFI" || (part.typeGuid || "").toLowerCase() === "c12a7328-f81f-11d2-ba4b-00a0c93ec93b") {
        hasEsp = true;
      }
    }

    // 4. Fragmented unallocated space
    if (unallocatedGaps >= 2) {
      warnings.push({
        severity: "INFO",
        code: "FRAGMENTED_UNALLOCATED_SPACE",
        diskId: disk.id,
        gapCount: unallocatedGaps,
        message: `Disk ${disk.id} contains ${unallocatedGaps} non-contiguous unallocated physical gaps. Space cannot be merged into a single volume without moving intervening partitions.`
      });
    }

    // 5. GPT missing ESP
    if (disk.partitionStyle === "GPT" && !hasEsp) {
      warnings.push({
        severity: "WARNING",
        code: "GPT_MISSING_ESP",
        diskId: disk.id,
        message: `Disk ${disk.id} is a GPT disk without an EFI System Partition (ESP). If this is the boot drive, UEFI system boot will fail.`
      });
    }
  }

  return {
    status: issues.length === 0 ? "HEALTHY" : "ISSUES_DETECTED",
    totalIssuesCount: issues.length,
    totalWarningsCount: warnings.length,
    issues,
    warnings
  };
}

// -----------------------------------------------------------------------------
// 9. Filesystem Analysis & Cluster Geometry
// -----------------------------------------------------------------------------

export function analyzeFileSystemDetails(partition) {
  if (!partition) return null;

  const clusterSize = partition.clusterSize || 4096;
  const sizeBytes = partition.sizeBytes || 0;
  const usedBytes = partition.usedBytes || 0;
  const freeBytes = Math.max(0, sizeBytes - usedBytes);

  const totalClusters = Math.floor(sizeBytes / clusterSize);
  const usedClusters = Math.floor(usedBytes / clusterSize);
  const freeClusters = Math.max(0, totalClusters - usedClusters);

  const fs = (partition.fsType || "RAW").toUpperCase();

  return {
    fileSystem: fs,
    label: partition.label || "Unnamed",
    volumeLetter: partition.volumeLetter || null,
    clusterSize,
    totalClusters,
    usedClusters,
    freeClusters,
    sizeBytes,
    usedBytes,
    freeBytes,
    usedPercent: sizeBytes > 0 ? Math.round((usedBytes / sizeBytes) * 100) : 0,
    supportsCompression: fs === "NTFS",
    supportsEncryption: fs === "NTFS",
    supportsSparseFiles: fs === "NTFS" || fs === "REFS",
    supportsReparsePoints: fs === "NTFS" || fs === "REFS",
    supportsHardLinks: fs === "NTFS",
    isBitLocker: !!partition.isBitLocker,
    bitLockerStatus: partition.bitLockerStatus || "Unencrypted"
  };
}

// -----------------------------------------------------------------------------
// IPC Bridge Adapters
// -----------------------------------------------------------------------------

export async function executeFormat(params) {
  if (typeof window !== "undefined" && window.openDiskBridge?.executeFormat) {
    return await window.openDiskBridge.executeFormat(params);
  }
  return { success: false, error: "Native desktop bridge unavailable." };
}

export async function executeDelete(params) {
  if (typeof window !== "undefined" && window.openDiskBridge?.executeDelete) {
    return await window.openDiskBridge.executeDelete(params);
  }
  return { success: false, error: "Native desktop bridge unavailable." };
}

export async function setDriveLetter(params) {
  if (typeof window !== "undefined" && window.openDiskBridge?.setDriveLetter) {
    return await window.openDiskBridge.setDriveLetter(params);
  }
  return { success: false, error: "Native desktop bridge unavailable." };
}

export async function removeDriveLetter(params) {
  if (typeof window !== "undefined" && window.openDiskBridge?.removeDriveLetter) {
    return await window.openDiskBridge.removeDriveLetter(params);
  }
  return { success: false, error: "Native desktop bridge unavailable." };
}

export async function setVolumeLabel(params) {
  if (typeof window !== "undefined" && window.openDiskBridge?.setVolumeLabel) {
    return await window.openDiskBridge.setVolumeLabel(params);
  }
  return { success: false, error: "Native desktop bridge unavailable." };
}

export async function planSplitPartition(params) {
  if (typeof window !== "undefined" && window.openDiskBridge?.planSplitPartition) {
    return await window.openDiskBridge.planSplitPartition(params);
  }
  return { success: false, error: "Native desktop bridge unavailable." };
}

export async function executeSplitPartition(params) {
  if (typeof window !== "undefined" && window.openDiskBridge?.executeSplitPartition) {
    return await window.openDiskBridge.executeSplitPartition(params);
  }
  return { success: false, error: "Native desktop bridge unavailable." };
}

export async function planMergePartitions(params) {
  if (typeof window !== "undefined" && window.openDiskBridge?.planMergePartitions) {
    return await window.openDiskBridge.planMergePartitions(params);
  }
  return { success: false, error: "Native desktop bridge unavailable." };
}

export async function executeMergePartitions(params) {
  if (typeof window !== "undefined" && window.openDiskBridge?.executeMergePartitions) {
    return await window.openDiskBridge.executeMergePartitions(params);
  }
  return { success: false, error: "Native desktop bridge unavailable." };
}

export async function inspectFileSystem(params) {
  if (typeof window !== "undefined" && window.openDiskBridge?.inspectFileSystem) {
    return await window.openDiskBridge.inspectFileSystem(params);
  }
  return { success: false, error: "Native desktop bridge unavailable." };
}

export async function detectConfigIssues() {
  if (typeof window !== "undefined" && window.openDiskBridge?.detectConfigIssues) {
    return await window.openDiskBridge.detectConfigIssues();
  }
  return { success: false, error: "Native desktop bridge unavailable." };
}

export async function getAvailableDriveLettersLive() {
  if (typeof window !== "undefined" && window.openDiskBridge?.getAvailableDriveLetters) {
    return await window.openDiskBridge.getAvailableDriveLetters();
  }
  return { success: false, error: "Native desktop bridge unavailable." };
}

export async function getAdvancedAuditLogs() {
  if (typeof window !== "undefined" && window.openDiskBridge?.getAdvancedAuditLogs) {
    return await window.openDiskBridge.getAdvancedAuditLogs();
  }
  return [];
}

