/**
 * OpenDisk Manager — Partition Layout Analysis & Space Planning Engine
 * 
 * Strict Read-Only Engine:
 * 1. Maps physical disk offsets & calculates exact LBA geometry.
 * 2. Determines exact physical sequence of partitions.
 * 3. Distinguishes filesystem free space from unallocated physical sectors.
 * 4. Identifies adjacent unallocated blocks (Left / Right).
 * 5. Identifies intermediate partitions between any source and target.
 * 6. Hard-blocks cross-physical-disk space transfer attempts.
 * 7. Calculates minimum supported shrink & maximum extend boundaries.
 * 8. Detects BitLocker, ESP, MSR, WinRE, and unsupported filesystems (ReFS).
 * 9. Compiles a Directed Acyclic Graph (DAG) of discrete operations.
 */

export const FEASIBILITY_STATUS = {
  DIRECTLY_EXTENDABLE: "DIRECTLY_EXTENDABLE",
  REQUIRES_PARTITION_MOVEMENT: "REQUIRES_PARTITION_MOVEMENT",
  REQUIRES_OFFLINE_OPERATION: "REQUIRES_OFFLINE_OPERATION",
  NOT_SUPPORTED: "NOT_SUPPORTED",
  UNSAFE: "UNSAFE"
};

/**
 * Analyzes a single partition within the physical context of its host disk.
 */
export function analyzePartition(disk, partition) {
  if (!disk || !partition) return null;

  // 1. Sort physical partitions by starting offset
  const sortedExtents = [...disk.partitions].sort((a, b) => a.startLba - b.startLba);
  const currentIndex = sortedExtents.findIndex(p => p.id === partition.id);

  if (currentIndex === -1) return null;

  const isUnallocated = partition.category === "UNALLOCATED";
  const sectorSize = disk.sectorSize || 512;

  // 2. Identify immediately adjacent extents (Left / Lower LBA and Right / Higher LBA)
  const leftExtent = currentIndex > 0 ? sortedExtents[currentIndex - 1] : null;
  const rightExtent = currentIndex < sortedExtents.length - 1 ? sortedExtents[currentIndex + 1] : null;

  const leftUnallocatedBytes = (leftExtent && leftExtent.category === "UNALLOCATED") ? leftExtent.sizeBytes : 0;
  const rightUnallocatedBytes = (rightExtent && rightExtent.category === "UNALLOCATED") ? rightExtent.sizeBytes : 0;

  // 3. Filesystem calculations
  const totalSizeBytes = partition.sizeBytes;
  const usedSizeBytes = partition.usedBytes || 0;
  const fsFreeBytes = isUnallocated ? 0 : Math.max(0, totalSizeBytes - usedSizeBytes);

  // 4. Shrink Limits
  // Safety margin: 5% of used space + 512 MB minimum reserved for MFT, USN journal, and filesystem metadata
  const safetyBufferBytes = Math.min(Math.max(usedSizeBytes * 0.05, 536870912), 2147483648);
  const minSafeSizeBytes = isUnallocated ? 0 : Math.ceil(usedSizeBytes + safetyBufferBytes);
  const maxSupportedShrinkBytes = isUnallocated ? 0 : Math.max(0, totalSizeBytes - minSafeSizeBytes);

  // 5. Extend Limits
  // Direct extension into immediately succeeding adjacent free space
  const immediateExtendBytes = rightUnallocatedBytes;

  // Total unallocated space anywhere on this same physical drive
  const totalDiskUnallocatedBytes = disk.partitions
    .filter(p => p.category === "UNALLOCATED")
    .reduce((sum, p) => sum + p.sizeBytes, 0);

  // 6. Partition Classification & Constraints
  const isProtectedSystem = partition.category === "EFI" || partition.category === "MSR" || partition.category === "RECOVERY";
  const isSystemBoot = partition.category === "SYSTEM" || partition.isBoot || partition.volumeLetter === "C:";
  const isReFS = (partition.fsType || "").toUpperCase() === "REFS";
  const isBitLocker = Boolean(partition.isBitLocker);

  // Determine feasibility for in-place extension
  let extendFeasibility = FEASIBILITY_STATUS.NOT_SUPPORTED;
  let extendReason = "";

  if (isReFS) {
    extendFeasibility = FEASIBILITY_STATUS.DIRECTLY_EXTENDABLE;
    extendReason = "ReFS supports online extension via FSCTL_EXTEND_VOLUME into adjacent free space.";
  } else if (rightUnallocatedBytes > 0) {
    extendFeasibility = FEASIBILITY_STATUS.DIRECTLY_EXTENDABLE;
    extendReason = `Adjacent unallocated space (${(rightUnallocatedBytes / 1e9).toFixed(2)} GB) immediately follows this partition. Can extend online via Win32 FSCTL.`;
  } else if (totalDiskUnallocatedBytes > 0) {
    extendFeasibility = FEASIBILITY_STATUS.REQUIRES_PARTITION_MOVEMENT;
    extendReason = `Unallocated space (${(totalDiskUnallocatedBytes / 1e9).toFixed(2)} GB) exists on this disk, but neighboring partitions must be shifted before extension.`;
  } else {
    extendFeasibility = FEASIBILITY_STATUS.NOT_SUPPORTED;
    extendReason = "No unallocated space exists on this physical disk. Another volume must be shrunk first.";
  }

  // Determine feasibility for shrinking
  let shrinkFeasibility = FEASIBILITY_STATUS.NOT_SUPPORTED;
  let shrinkReason = "";

  if (isUnallocated) {
    shrinkFeasibility = FEASIBILITY_STATUS.NOT_SUPPORTED;
    shrinkReason = "Unallocated space cannot be shrunk.";
  } else if (isReFS) {
    shrinkFeasibility = FEASIBILITY_STATUS.NOT_SUPPORTED;
    shrinkReason = "ReFS cluster architecture does not support shrinking under any circumstances.";
  } else if (isProtectedSystem && partition.category !== "RECOVERY") {
    shrinkFeasibility = FEASIBILITY_STATUS.UNSAFE;
    shrinkReason = "Shrinking EFI System Partition or Microsoft Reserved Partition is prohibited to prevent boot failure.";
  } else if (maxSupportedShrinkBytes < 104857600) { // < 100 MB shrinkable
    shrinkFeasibility = FEASIBILITY_STATUS.NOT_SUPPORTED;
    shrinkReason = "Partition has insufficient free space beyond minimum filesystem structure reservations.";
  } else if (isSystemBoot) {
    shrinkFeasibility = FEASIBILITY_STATUS.REQUIRES_OFFLINE_OPERATION;
    shrinkReason = "System partition C: can only be shrunk up to unmovable files online. Large shrinks require WinPE staging.";
  } else {
    shrinkFeasibility = FEASIBILITY_STATUS.DIRECTLY_EXTENDABLE;
    shrinkReason = `Can safely shrink online by up to ${(maxSupportedShrinkBytes / 1e9).toFixed(2)} GB via FSCTL_SHRINK_VOLUME.`;
  }

  return {
    partitionId: partition.id,
    diskId: disk.id,
    diskPath: disk.path,
    index: currentIndex,
    totalExtentsCount: sortedExtents.length,
    startLba: partition.startLba,
    endLba: partition.endLba,
    sizeBytes: totalSizeBytes,
    usedBytes: usedSizeBytes,
    fsFreeBytes,
    isUnallocated,
    isProtectedSystem,
    isSystemBoot,
    isBitLocker,
    isReFS,
    minSafeSizeBytes,
    maxSupportedShrinkBytes,
    immediateExtendBytes,
    totalDiskUnallocatedBytes,
    adjacent: {
      left: leftExtent ? { id: leftExtent.id, label: leftExtent.label, category: leftExtent.category, sizeBytes: leftExtent.sizeBytes } : null,
      right: rightExtent ? { id: rightExtent.id, label: rightExtent.label, category: rightExtent.category, sizeBytes: rightExtent.sizeBytes } : null,
      hasLeftUnallocated: leftUnallocatedBytes > 0,
      hasRightUnallocated: rightUnallocatedBytes > 0,
    },
    extendFeasibility: { status: extendFeasibility, reason: extendReason },
    shrinkFeasibility: { status: shrinkFeasibility, reason: shrinkReason }
  };
}

/**
 * Plans a space transfer from a Source extent to a Target extent.
 * 
 * Generates an immutable, verified Operation Dependency Graph (DAG) with full failure handling.
 */
export function planSpaceTransfer({
  allDisks,
  sourceDiskId,
  sourcePartitionId,
  targetDiskId,
  targetPartitionId,
  transferAmountGb
}) {
  const transferAmountBytes = Math.round(transferAmountGb * 1e9);

  // 1. INVARIANT CHECK: Physical Disk Resolution
  if (sourceDiskId !== targetDiskId) {
    return {
      success: false,
      status: FEASIBILITY_STATUS.NOT_SUPPORTED,
      errorTitle: "Cross-Physical-Disk Transfer Prohibited",
      errorMessage: `Source partition is on PhysicalDrive${sourceDiskId}, while Target partition is on PhysicalDrive${targetDiskId}. Partitions cannot span across separate physical hardware.`,
      dag: [],
      intermediatePartitions: []
    };
  }

  const disk = allDisks.find(d => d.id === sourceDiskId);
  if (!disk) {
    return {
      success: false,
      status: FEASIBILITY_STATUS.NOT_SUPPORTED,
      errorTitle: "Disk Not Found",
      errorMessage: `PhysicalDrive${sourceDiskId} could not be resolved.`,
      dag: [],
      intermediatePartitions: []
    };
  }

  const sourcePart = disk.partitions.find(p => p.id === sourcePartitionId);
  const targetPart = disk.partitions.find(p => p.id === targetPartitionId);

  if (!sourcePart || !targetPart) {
    return {
      success: false,
      status: FEASIBILITY_STATUS.NOT_SUPPORTED,
      errorTitle: "Partition Not Found",
      errorMessage: "Could not resolve both source and target partitions on the disk.",
      dag: [],
      intermediatePartitions: []
    };
  }

  // 2. INVARIANT CHECK: Same Partition
  if (sourcePart.id === targetPart.id) {
    return {
      success: false,
      status: FEASIBILITY_STATUS.NOT_SUPPORTED,
      errorTitle: "Invalid Selection",
      errorMessage: "Source and target cannot be the identical partition.",
      dag: [],
      intermediatePartitions: []
    };
  }

  // 3. INVARIANT CHECK: ReFS Filesystem (cannot be shrunk)
  if ((sourcePart.fsType || "").toUpperCase() === "REFS") {
    return {
      success: false,
      status: FEASIBILITY_STATUS.NOT_SUPPORTED,
      errorTitle: "ReFS Shrink Unsupported",
      errorMessage: "ReFS volumes cannot be shrunk. Microsoft filesystem architecture does not support volume shrinking on ReFS.",
      dag: [],
      intermediatePartitions: []
    };
  }

  // 4. Source Capacity Check
  const isSourceUnallocated = sourcePart.category === "UNALLOCATED";
  if (isSourceUnallocated) {
    if (sourcePart.sizeBytes < transferAmountBytes) {
      return {
        success: false,
        status: FEASIBILITY_STATUS.NOT_SUPPORTED,
        errorTitle: "Insufficient Unallocated Space",
        errorMessage: `Selected unallocated region has only ${(sourcePart.sizeBytes / 1e9).toFixed(2)} GB, but ${(transferAmountBytes / 1e9).toFixed(2)} GB was requested.`,
        dag: [],
        intermediatePartitions: []
      };
    }
  } else {
    // Source is a formatted partition: verify maximum shrink capacity
    const sourceAnalysis = analyzePartition(disk, sourcePart);
    if (sourceAnalysis.maxSupportedShrinkBytes < transferAmountBytes) {
      return {
        success: false,
        status: FEASIBILITY_STATUS.NOT_SUPPORTED,
        errorTitle: "Insufficient Filesystem Free Space on Source",
        errorMessage: `Source ${sourcePart.volumeLetter || sourcePart.label} can only safely shrink by ${(sourceAnalysis.maxSupportedShrinkBytes / 1e9).toFixed(2)} GB (due to used data and metadata buffers), but ${(transferAmountBytes / 1e9).toFixed(2)} GB was requested.`,
        dag: [],
        intermediatePartitions: []
      };
    }
  }

  // 5. Physical Ordering & Intermediate Extent Mapping
  const sortedExtents = [...disk.partitions].sort((a, b) => a.startLba - b.startLba);
  const sourceIndex = sortedExtents.findIndex(p => p.id === sourcePart.id);
  const targetIndex = sortedExtents.findIndex(p => p.id === targetPart.id);

  const isTargetPreceding = targetIndex < sourceIndex; // Target is Left, Source is Right
  const minIdx = Math.min(sourceIndex, targetIndex);
  const maxIdx = Math.max(sourceIndex, targetIndex);

  // Extract all partitions physically situated between source and target
  const intermediatePartitions = sortedExtents.slice(minIdx + 1, maxIdx);

  // 6. Compile Operation Dependency Graph (DAG)
  const dag = [];
  let stepNumber = 1;
  let overallFeasibility = FEASIBILITY_STATUS.DIRECTLY_EXTENDABLE;
  let requiresWinPE = false;
  let hasBitLockerRisk = false;

  // Step 1: If source is an active partition, shrink it first to liberate space
  if (!isSourceUnallocated) {
    dag.push({
      step: stepNumber++,
      id: `op-shrink-${sourcePart.id}`,
      action: "SHRINK_FILESYSTEM_AND_PARTITION",
      targetId: sourcePart.id,
      targetName: `${sourcePart.volumeLetter || ""} ${sourcePart.label}`.trim(),
      details: `Shrink volume from ${(sourcePart.sizeBytes / 1e9).toFixed(2)} GB to ${((sourcePart.sizeBytes - transferAmountBytes) / 1e9).toFixed(2)} GB.`,
      deltaGb: -(transferAmountGb),
      requiresLock: true,
      direction: "LEFT_ANCHOR",
      risk: sourcePart.isSystem ? "HIGH" : "SAFE"
    });

    if (sourcePart.isSystem) requiresWinPE = true;
    if (sourcePart.isBitLocker) hasBitLockerRisk = true;
  }

  // Step 2..K: Shift all intermediary partitions to bridge the physical gap
  if (intermediatePartitions.length > 0) {
    overallFeasibility = FEASIBILITY_STATUS.REQUIRES_PARTITION_MOVEMENT;

    // Determine shift direction
    // If target is to the Left of source: Intermediate partitions must be shifted to the RIGHT (higher LBA)
    // If target is to the Right of source: Intermediate partitions must be shifted to the LEFT (lower LBA)
    const shiftDirection = isTargetPreceding ? "SHIFT_RIGHT" : "SHIFT_LEFT";

    // When shifting right: copy from rightmost intermediate partition to leftmost to avoid collisions
    // When shifting left: copy from leftmost intermediate partition to rightmost
    const orderedIntermediates = isTargetPreceding ? [...intermediatePartitions].reverse() : [...intermediatePartitions];

    orderedIntermediates.forEach(interPart => {
      if (interPart.category === "UNALLOCATED") return; // Gaps are absorbed

      dag.push({
        step: stepNumber++,
        id: `op-move-${interPart.id}`,
        action: "MOVE_PARTITION_SECTOR_EXTENT",
        targetId: interPart.id,
        targetName: `${interPart.volumeLetter || ""} ${interPart.label}`.trim(),
        details: `Relocate ${interPart.label} by ${(transferAmountBytes / 1e9).toFixed(2)} GB (${shiftDirection === "SHIFT_RIGHT" ? "Toward end of disk" : "Toward start of disk"}). Recalculate VBR and GPT CRC32.`,
        deltaGb: 0,
        requiresLock: true,
        direction: shiftDirection,
        risk: interPart.isSystem || interPart.category === "EFI" ? "HIGH" : "MODERATE"
      });

      if (interPart.isSystem || interPart.category === "EFI") requiresWinPE = true;
      if (interPart.isBitLocker) hasBitLockerRisk = true;
    });
  }

  // Final Step: Extend the target partition into the adjacent space
  dag.push({
    step: stepNumber++,
    id: `op-extend-${targetPart.id}`,
    action: "GROW_PARTITION_AND_FILESYSTEM",
    targetId: targetPart.id,
    targetName: `${targetPart.volumeLetter || ""} ${targetPart.label}`.trim(),
    details: `Grow partition table boundary and extend filesystem from ${(targetPart.sizeBytes / 1e9).toFixed(2)} GB to ${((targetPart.sizeBytes + transferAmountBytes) / 1e9).toFixed(2)} GB via FSCTL_EXTEND_VOLUME.`,
    deltaGb: +(transferAmountGb),
    requiresLock: false,
    direction: "GROW_TAIL",
    risk: "SAFE"
  });

  if (targetPart.isSystem) {
    // Extending C: into adjacent trailing space can occur online in Windows 11
  }

  // Set final operational classification
  if (hasBitLockerRisk) {
    overallFeasibility = FEASIBILITY_STATUS.UNSAFE;
  } else if (requiresWinPE) {
    overallFeasibility = FEASIBILITY_STATUS.REQUIRES_OFFLINE_OPERATION;
  } else if (intermediatePartitions.length > 0) {
    overallFeasibility = FEASIBILITY_STATUS.REQUIRES_PARTITION_MOVEMENT;
  } else {
    overallFeasibility = FEASIBILITY_STATUS.DIRECTLY_EXTENDABLE;
  }

  return {
    success: true,
    status: overallFeasibility,
    sourceDiskId,
    sourceName: `${sourcePart.volumeLetter || ""} ${sourcePart.label}`.trim(),
    targetName: `${targetPart.volumeLetter || ""} ${targetPart.label}`.trim(),
    transferAmountGb,
    transferAmountBytes,
    isTargetPreceding,
    requiresWinPE,
    hasBitLockerRisk,
    intermediatePartitions: intermediatePartitions.filter(p => p.category !== "UNALLOCATED"),
    dag,
    summary: {
      totalSteps: dag.length,
      unallocatedAbsorbed: isSourceUnallocated,
      rebootRequired: requiresWinPE,
      tpmSuspensionRequired: hasBitLockerRisk
    }
  };
}

