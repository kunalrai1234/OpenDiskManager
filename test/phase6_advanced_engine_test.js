/**
 * Phase 6 Advanced Partition Management Engine Test Suite
 * OpenDisk Manager - Automated Testing
 */

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isProtectedPartition,
  isRecoveryPartition,
  getAvailableDriveLetters,
  validateFormat,
  validateDelete,
  validateDriveLetter,
  validateRemoveDriveLetter,
  validateVolumeLabel,
  validateSplit,
  validateMerge,
  detectStorageConfigurationIssues,
  analyzeFileSystemDetails
} from "../src/engine/advancedEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const psScriptPath = path.join(__dirname, "..", "advanced-engine.ps1");

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  [PASS] #${total}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] #${total}: ${name}`);
    console.error(`         ${err.message}`);
  }
}

console.log("\n=======================================================");
console.log("  OpenDisk Manager - Phase 6 Advanced Engine Tests");
console.log("=======================================================\n");

// Test Fixtures
const MOCK_DISK = {
  id: 0,
  friendlyName: "Micron 2450 NVMe 512GB",
  partitionStyle: "GPT",
  totalSizeBytes: 512110190592
};

const PART_EFI = {
  id: "d0-p1",
  partitionNumber: 1,
  category: "EFI",
  typeGuid: "c12a7328-f81f-11d2-ba4b-00a0c93ec93b",
  volumeLetter: null,
  sizeBytes: 272629760,
  startLba: 2048,
  endLba: 534527,
  isSystem: true
};

const PART_MSR = {
  id: "d0-p2",
  partitionNumber: 2,
  category: "MSR",
  typeGuid: "e3c9e316-0b5c-4db8-817d-f92df00215ae",
  volumeLetter: null,
  sizeBytes: 16777216,
  startLba: 534528,
  endLba: 567295,
  isSystem: false
};

const PART_OS = {
  id: "d0-p3",
  partitionNumber: 3,
  category: "SYSTEM",
  label: "OS",
  volumeLetter: "C:",
  sizeBytes: 233552813568,
  usedBytes: 204000000000,
  startLba: 567296,
  endLba: 456726527,
  isSystem: true,
  isBoot: true,
  fsType: "NTFS"
};

const PART_RECOVERY = {
  id: "d0-p4",
  partitionNumber: 4,
  category: "RECOVERY",
  typeGuid: "de94bba4-06d1-4d40-a16a-bfd50179d6ac",
  label: "Recovery",
  volumeLetter: null,
  sizeBytes: 1169162240,
  startLba: 456726528,
  endLba: 459009967,
  isSystem: false,
  fsType: "NTFS"
};

const PART_DATA_D = {
  id: "d0-p5",
  partitionNumber: 5,
  category: "DATA",
  label: "Projects",
  volumeLetter: "D:",
  sizeBytes: 100000000000, // 100 GB
  usedBytes: 30000000000,  // 30 GB used
  startLba: 459009968,
  endLba: 654322467,
  isSystem: false,
  fsType: "NTFS",
  clusterSize: 4096
};

// Strictly adjacent to D
const PART_DATA_E = {
  id: "d0-p6",
  partitionNumber: 6,
  category: "DATA",
  label: "Media",
  volumeLetter: "E:",
  sizeBytes: 100000000000, // 100 GB
  usedBytes: 20000000000,  // 20 GB used
  startLba: 654322468, // Exactly 1 sector after D
  endLba: 849634967,
  isSystem: false,
  fsType: "NTFS",
  clusterSize: 4096
};

// Non-adjacent with a gap
const PART_DATA_F = {
  id: "d0-p7",
  partitionNumber: 7,
  category: "DATA",
  label: "Archive",
  volumeLetter: "F:",
  sizeBytes: 50000000000,
  usedBytes: 10000000000,
  startLba: 900000000, // Gap between E and F
  endLba: 997656250,
  isSystem: false,
  fsType: "NTFS"
};

const DISK_WITH_PARTS = {
  ...MOCK_DISK,
  partitions: [PART_EFI, PART_MSR, PART_OS, PART_RECOVERY, PART_DATA_D, PART_DATA_E, PART_DATA_F]
};

// =============================================================================
// Suite 1: Safety Shields
// =============================================================================
console.log("--- Suite 1: Safety Shields & Protected Partition Identification ---");

test("isProtectedPartition identifies EFI system partition", () => {
  assert.strictEqual(isProtectedPartition(PART_EFI), true);
});

test("isProtectedPartition identifies MSR partition", () => {
  assert.strictEqual(isProtectedPartition(PART_MSR), true);
});

test("isProtectedPartition identifies Windows Boot OS volume (C:)", () => {
  assert.strictEqual(isProtectedPartition(PART_OS), true);
});

test("isProtectedPartition permits basic data partition D:", () => {
  assert.strictEqual(isProtectedPartition(PART_DATA_D), false);
});

test("isRecoveryPartition correctly identifies recovery partition", () => {
  assert.strictEqual(isRecoveryPartition(PART_RECOVERY), true);
  assert.strictEqual(isRecoveryPartition(PART_DATA_D), false);
});

// =============================================================================
// Suite 2: Drive Letter Assignment & Availability
// =============================================================================
console.log("\n--- Suite 2: Drive Letter Management & Conflict Detection ---");

test("getAvailableDriveLetters computes available and in-use letters", () => {
  const result = getAvailableDriveLetters([DISK_WITH_PARTS]);
  assert.ok(result.inUse.some(x => x.letter === "C"));
  assert.ok(result.inUse.some(x => x.letter === "D"));
  assert.ok(result.inUse.some(x => x.letter === "E"));
  assert.ok(result.inUse.some(x => x.letter === "F"));
  assert.ok(result.available.includes("G"));
  assert.ok(!result.available.includes("C"));
});

test("validateDriveLetter rejects changing C: boot drive letter", () => {
  const res = validateDriveLetter(PART_OS, MOCK_DISK, [DISK_WITH_PARTS], "X");
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "BOOT_PARTITION_LOCKED");
});

test("validateDriveLetter rejects assigning reserved 'C' letter", () => {
  const res = validateDriveLetter(PART_DATA_D, MOCK_DISK, [DISK_WITH_PARTS], "C");
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "RESERVED_LETTER");
});

test("validateDriveLetter detects collision with already assigned letter", () => {
  const res = validateDriveLetter(PART_DATA_D, MOCK_DISK, [DISK_WITH_PARTS], "E");
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "LETTER_COLLISION");
  assert.ok(res.error.includes("already in use"));
});

test("validateDriveLetter passes for available letter and generates consequences", () => {
  const res = validateDriveLetter(PART_DATA_D, MOCK_DISK, [DISK_WITH_PARTS], "Z");
  assert.strictEqual(res.canExecute, true);
  assert.strictEqual(res.status, "PREFLIGHT_PASS");
  assert.strictEqual(res.targetLetter, "Z");
  assert.ok(res.consequences.length > 0);
});

test("validateRemoveDriveLetter blocks removing C:", () => {
  const res = validateRemoveDriveLetter(PART_OS, MOCK_DISK);
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "BOOT_PARTITION_LOCKED");
});

test("validateRemoveDriveLetter succeeds on data partition D:", () => {
  const res = validateRemoveDriveLetter(PART_DATA_D, MOCK_DISK);
  assert.strictEqual(res.canExecute, true);
  assert.strictEqual(res.status, "PREFLIGHT_PASS");
  assert.strictEqual(res.removedLetter, "D");
});

// =============================================================================
// Suite 3: Format Volume Preflight Validation
// =============================================================================
console.log("\n--- Suite 3: Format Volume Validation & Protective Shields ---");

test("validateFormat immediately blocks formatting C: Windows OS", () => {
  const res = validateFormat(PART_OS, MOCK_DISK, { fileSystem: "NTFS" });
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "PROTECTED_PARTITION_BLOCKED");
});

test("validateFormat immediately blocks formatting EFI partition", () => {
  const res = validateFormat(PART_EFI, MOCK_DISK, { fileSystem: "FAT32" });
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "PROTECTED_PARTITION_BLOCKED");
});

test("validateFormat immediately blocks formatting Recovery partition", () => {
  const res = validateFormat(PART_RECOVERY, MOCK_DISK, { fileSystem: "NTFS" });
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "RECOVERY_PARTITION_BLOCKED");
});

test("validateFormat rejects unsupported filesystem format", () => {
  const res = validateFormat(PART_DATA_D, MOCK_DISK, { fileSystem: "EXT4" });
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "UNSUPPORTED_FS");
});

test("validateFormat enforces 32 GB Windows ceiling on FAT32", () => {
  // PART_DATA_D is 100 GB
  const res = validateFormat(PART_DATA_D, MOCK_DISK, { fileSystem: "FAT32" });
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "FAT32_SIZE_EXCEEDED");
});

test("validateFormat rejects illegal characters in volume label", () => {
  const res = validateFormat(PART_DATA_D, MOCK_DISK, { fileSystem: "NTFS", label: "Bad:Label*" });
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "ILLEGAL_LABEL_CHARS");
});

test("validateFormat succeeds for NTFS data partition and provides confirmation code", () => {
  const res = validateFormat(PART_DATA_D, MOCK_DISK, { fileSystem: "NTFS", label: "Fast_Storage" });
  assert.strictEqual(res.canExecute, true);
  assert.strictEqual(res.status, "PREFLIGHT_PASS");
  assert.strictEqual(res.expectedConfirmationCode, "FORMAT_D");
  assert.strictEqual(res.targetLabel, "Fast_Storage");
  assert.ok(res.consequences.some(c => c.includes("PERMANENTLY ERASED")));
});

// =============================================================================
// Suite 4: Delete Partition Preflight Validation
// =============================================================================
console.log("\n--- Suite 4: Delete Partition Validation & Guardrails ---");

test("validateDelete blocks deleting Windows OS boot partition", () => {
  const res = validateDelete(PART_OS, MOCK_DISK);
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "PROTECTED_PARTITION_BLOCKED");
});

test("validateDelete blocks deleting EFI system partition", () => {
  const res = validateDelete(PART_EFI, MOCK_DISK);
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "PROTECTED_PARTITION_BLOCKED");
});

test("validateDelete flags Recovery partition with high risk warning", () => {
  const res = validateDelete(PART_RECOVERY, MOCK_DISK);
  assert.strictEqual(res.isRecoveryPartition, true);
  assert.ok(res.consequences.some(c => c.includes("WinRE")));
});

test("validateDelete passes for data partition and returns extent geometry", () => {
  const res = validateDelete(PART_DATA_D, MOCK_DISK);
  assert.strictEqual(res.canExecute, true);
  assert.strictEqual(res.status, "PREFLIGHT_PASS");
  assert.strictEqual(res.expectedConfirmationCode, "DELETE_DISK0_PART5");
  assert.strictEqual(res.sizeGb, 100);
});

// =============================================================================
// Suite 5: Volume Label Validation
// =============================================================================
console.log("\n--- Suite 5: Volume Label Management ---");

test("validateVolumeLabel rejects labels exceeding 32 characters on NTFS", () => {
  const longLabel = "A".repeat(33);
  const res = validateVolumeLabel(PART_DATA_D, MOCK_DISK, longLabel);
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "LABEL_TOO_LONG");
});

test("validateVolumeLabel rejects illegal characters", () => {
  const res = validateVolumeLabel(PART_DATA_D, MOCK_DISK, "Invalid/Name");
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "ILLEGAL_CHARACTERS");
});

test("validateVolumeLabel passes valid label", () => {
  const res = validateVolumeLabel(PART_DATA_D, MOCK_DISK, "Work_Documents");
  assert.strictEqual(res.canExecute, true);
  assert.strictEqual(res.newLabel, "Work_Documents");
});

// =============================================================================
// Suite 6: Split Partition Planning
// =============================================================================
console.log("\n--- Suite 6: Split Partition Engine ---");

test("validateSplit blocks splitting EFI partition", () => {
  const res = validateSplit(PART_EFI, MOCK_DISK, 10);
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "PROTECTED_PARTITION");
});

test("validateSplit rejects split size exceeding free space", () => {
  // PART_DATA_D has 100 GB total, 30 GB used. Max split ~68 GB. Requesting 80 GB should fail.
  const res = validateSplit(PART_DATA_D, MOCK_DISK, 85);
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "SPLIT_SIZE_EXCEEDS_FREE_SPACE");
});

test("validateSplit detects collision on requested new drive letter", () => {
  const res = validateSplit(PART_DATA_D, MOCK_DISK, 20, { targetDriveLetter: "E" }, [DISK_WITH_PARTS]);
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "LETTER_COLLISION");
});

test("validateSplit generates 4-step execution plan and confirmation code", () => {
  const res = validateSplit(PART_DATA_D, MOCK_DISK, 25, { targetDriveLetter: "G", label: "Dev_Drive" }, [DISK_WITH_PARTS]);
  assert.strictEqual(res.canExecute, true);
  assert.strictEqual(res.status, "PREFLIGHT_PASS");
  assert.strictEqual(res.retainedSizeGb, 75);
  assert.strictEqual(res.newPartitionSizeGb, 25);
  assert.strictEqual(res.newDriveLetter, "G");
  assert.strictEqual(res.expectedConfirmationCode, "SPLIT_DISK0_PART5");
  assert.strictEqual(res.steps.length, 4);
});

// =============================================================================
// Suite 7: Merge Partitions Planning
// =============================================================================
console.log("\n--- Suite 7: Merge Partitions Engine ---");

test("validateMerge blocks merging identical partition", () => {
  const res = validateMerge(PART_DATA_D, PART_DATA_D, MOCK_DISK);
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "IDENTICAL_PARTITIONS");
});

test("validateMerge blocks merging EFI or OS partitions", () => {
  const res = validateMerge(PART_OS, PART_DATA_D, MOCK_DISK);
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "PROTECTED_PARTITION");
});

test("validateMerge rejects non-contiguous partitions with intervening gap", () => {
  // D and F have E and an unallocated gap between them
  const res = validateMerge(PART_DATA_D, PART_DATA_F, MOCK_DISK);
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "NOT_ADJACENT");
});

test("validateMerge rejects reverse merge (source precedes target) due to NTFS limitation", () => {
  // E is Target, D is Source (D precedes E)
  const res = validateMerge(PART_DATA_E, PART_DATA_D, MOCK_DISK);
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "REVERSE_MERGE_REQUIRES_RELOCATION");
});

test("validateMerge checks target capacity against source data size", () => {
  // If target has 10 GB free space, and source has 30 GB used data
  const crampedTarget = { ...PART_DATA_D, sizeBytes: 50e9, usedBytes: 45e9 }; // 5 GB free
  const largeSource = { ...PART_DATA_E, startLba: crampedTarget.endLba + 1, usedBytes: 20e9 }; // 20 GB used
  const res = validateMerge(crampedTarget, largeSource, MOCK_DISK, true);
  assert.strictEqual(res.canExecute, false);
  assert.strictEqual(res.status, "INSUFFICIENT_TARGET_SPACE");
});

test("validateMerge generates step-by-step consolidation and extend plan for contiguous partitions", () => {
  // D is Target, E is Source (D is immediately followed by E)
  const res = validateMerge(PART_DATA_D, PART_DATA_E, MOCK_DISK, true);
  assert.strictEqual(res.canExecute, true);
  assert.strictEqual(res.status, "PREFLIGHT_PASS");
  assert.strictEqual(res.direction, "TARGET_BEFORE_SOURCE");
  assert.strictEqual(res.mergedSizeGb, 200);
  assert.strictEqual(res.expectedConfirmationCode, "MERGE_P5_WITH_P6");
  assert.strictEqual(res.steps.length, 3);
});

// =============================================================================
// Suite 8: Storage Diagnostics & Configuration Issue Scanner
// =============================================================================
console.log("\n--- Suite 8: Storage Diagnostics & Configuration Issues ---");

test("detectStorageConfigurationIssues detects duplicate drive letter collision", () => {
  const diskWithCollision = {
    ...MOCK_DISK,
    partitions: [
      { ...PART_DATA_D, volumeLetter: "D:" },
      { ...PART_DATA_E, volumeLetter: "D:" } // Duplicate letter!
    ]
  };
  const res = detectStorageConfigurationIssues([diskWithCollision]);
  assert.strictEqual(res.status, "ISSUES_DETECTED");
  assert.ok(res.issues.some(i => i.code === "DUPLICATE_DRIVE_LETTER"));
});

test("detectStorageConfigurationIssues detects partition not aligned to 1 MiB", () => {
  const diskWithMisalignment = {
    ...MOCK_DISK,
    partitions: [
      { ...PART_DATA_D, startLba: 2049 } // Not divisible by 2048!
    ]
  };
  const res = detectStorageConfigurationIssues([diskWithMisalignment]);
  assert.ok(res.warnings.some(w => w.code === "PARTITION_NOT_1MIB_ALIGNED"));
});

test("detectStorageConfigurationIssues detects fragmented unallocated space", () => {
  const diskWithFragmentation = {
    ...MOCK_DISK,
    partitions: [
      PART_DATA_D,
      { category: "UNALLOCATED", sizeBytes: 20e9, startLba: 660000000 },
      PART_DATA_E,
      { category: "UNALLOCATED", sizeBytes: 25e9, startLba: 860000000 }
    ]
  };
  const res = detectStorageConfigurationIssues([diskWithFragmentation]);
  assert.ok(res.warnings.some(w => w.code === "FRAGMENTED_UNALLOCATED_SPACE"));
});

test("detectStorageConfigurationIssues flags MBR disk exceeding 2 TiB", () => {
  const largeMbrDisk = {
    id: 1,
    partitionStyle: "MBR",
    totalSizeBytes: 4e12, // 4 TB
    partitions: []
  };
  const res = detectStorageConfigurationIssues([largeMbrDisk]);
  assert.ok(res.issues.some(i => i.code === "MBR_OVER_2TB_LIMIT"));
});

test("detectStorageConfigurationIssues passes healthy disk", () => {
  const res = detectStorageConfigurationIssues([DISK_WITH_PARTS]);
  assert.strictEqual(res.status, "HEALTHY");
  assert.strictEqual(res.totalIssuesCount, 0);
});

// =============================================================================
// Suite 9: Filesystem Analysis & Cluster Geometry
// =============================================================================
console.log("\n--- Suite 9: Filesystem Analysis & Cluster Geometry ---");

test("analyzeFileSystemDetails computes cluster allocations accurately", () => {
  const fs = analyzeFileSystemDetails(PART_DATA_D);
  assert.strictEqual(fs.fileSystem, "NTFS");
  assert.strictEqual(fs.clusterSize, 4096);
  assert.strictEqual(fs.totalClusters, Math.floor(100000000000 / 4096));
  assert.strictEqual(fs.usedClusters, Math.floor(30000000000 / 4096));
  assert.strictEqual(fs.supportsCompression, true);
  assert.strictEqual(fs.supportsSparseFiles, true);
  assert.strictEqual(fs.supportsHardLinks, true);
});

// =============================================================================
// Suite 10: PowerShell Engine Integration (Live Host Read-Only Probes)
// =============================================================================
console.log("\n--- Suite 10: PowerShell Engine Integration (Host Validation) ---");

test("PowerShell engine CheckElevation succeeds", () => {
  const output = execFileSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", psScriptPath,
    "-Mode", "CheckElevation"
  ], { encoding: "utf8" });
  const json = JSON.parse(output.trim());
  assert.strictEqual(json.mode, "CheckElevation");
  assert.ok(typeof json.isElevated === "boolean");
});

test("PowerShell engine GetAvailableDriveLetters returns valid alphabet listing", () => {
  const output = execFileSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", psScriptPath,
    "-Mode", "GetAvailableDriveLetters"
  ], { encoding: "utf8" });
  const json = JSON.parse(output.trim());
  assert.strictEqual(json.mode, "GetAvailableDriveLetters");
  assert.ok(json.availableLetters.length > 0);
  assert.ok(json.inUseLetters.some(x => x.letter === "C"));
});

test("PowerShell engine DetectConfigIssues runs full topology diagnostics", () => {
  const output = execFileSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", psScriptPath,
    "-Mode", "DetectConfigIssues"
  ], { encoding: "utf8" });
  const json = JSON.parse(output.trim());
  assert.strictEqual(json.mode, "DetectConfigIssues");
  assert.ok(Array.isArray(json.issues));
  assert.ok(Array.isArray(json.warnings));
});

test("PowerShell engine InspectFileSystem inspects Windows C: partition", () => {
  const output = execFileSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", psScriptPath,
    "-Mode", "InspectFileSystem",
    "-DiskNumber", "0",
    "-PartitionNumber", "3"
  ], { encoding: "utf8" });
  const json = JSON.parse(output.trim());
  assert.strictEqual(json.status, "SUCCESS");
  assert.strictEqual(json.details.driveLetter, "C");
  assert.strictEqual(json.details.fileSystem, "NTFS");
  assert.ok(json.details.totalClusters > 0);
});

// Final Summary
console.log("\n=======================================================");
console.log(`  Phase 6 Test Results: ${passed} / ${total} Passed (${Math.round((passed / total) * 100)}%)`);
console.log("=======================================================\n");

if (passed !== total) {
  process.exit(1);
}

