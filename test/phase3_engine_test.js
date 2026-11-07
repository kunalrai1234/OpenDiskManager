import { 
  analyzePartition, 
  planSpaceTransfer, 
  FEASIBILITY_STATUS 
} from "../src/engine/partitionAnalysisEngine.js";

import { REAL_STORAGE_DATA } from "../src/data/realStorage.js";
import { MOCK_DISKS } from "../src/data/mockDisks.js";

console.log("===============================================================================");
console.log("   OPENDISK MANAGER — PHASE 3 PARTITION ENGINE VERIFICATION TEST SUITE        ");
console.log("===============================================================================\n");

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, failureDetails = "") {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] Test ${totalTests}: ${testName}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${testName}`);
    if (failureDetails) console.error(`         Details: ${failureDetails}`);
  }
}

const hostDisk = REAL_STORAGE_DATA.disks[0];

// -----------------------------------------------------------------------------
// TEST SUITE 1: Geometry & Offset Mapping & Adjacency
// -----------------------------------------------------------------------------
console.log("--- 1. Testing Geometry & Physical Extent Mapping ---");

const partC = hostDisk.partitions.find(p => p.volumeLetter === "C:");
const analysisC = analyzePartition(hostDisk, partC);

assert(analysisC !== null, "Partition C: analysis successfully resolved");
assert(analysisC.startLba === 567296, "Partition C: starting LBA matches physical sector 567,296", `Got: ${analysisC.startLba}`);
assert(analysisC.endLba === 456725135, "Partition C: ending LBA matches physical sector 456,725,135", `Got: ${analysisC.endLba}`);
assert(analysisC.isSystemBoot === true, "Partition C: accurately flagged as System Boot volume");

// Check adjacent extents for C:
// Left should be MSR (Partition 2)
assert(analysisC.adjacent.left !== null && analysisC.adjacent.left.category === "MSR", 
  "Partition C: immediately preceded by MSR (Partition 2)");

// Right should be WinRE (Partition 4)
assert(analysisC.adjacent.right !== null && analysisC.adjacent.right.category === "RECOVERY", 
  "Partition C: immediately followed by WinRE Recovery (Partition 4)");

// -----------------------------------------------------------------------------
// TEST SUITE 2: Filesystem Free Space vs Unallocated Physical Space
// -----------------------------------------------------------------------------
console.log("\n--- 2. Testing Free Space vs. Physical Unallocated Space Invariant ---");

const partD = hostDisk.partitions.find(p => p.volumeLetter === "D:");
const analysisD = analyzePartition(hostDisk, partD);

assert(analysisD.fsFreeBytes > 90e9, "Partition D: accurately reports ~93 GB of filesystem free space", 
  `Reported ${(analysisD.fsFreeBytes / 1e9).toFixed(2)} GB`);

// Notice: D: has adjacent unallocated space on its right (Gap 1)
assert(analysisD.adjacent.hasRightUnallocated === true, "Partition D: accurately detects adjacent unallocated Gap 1 on its right");
assert(Math.abs(analysisD.immediateExtendBytes - 26.21e9) < 0.1e9, 
  "Partition D: immediateExtendBytes matches Gap 1 size (~26.21 GB)", 
  `Reported ${(analysisD.immediateExtendBytes / 1e9).toFixed(2)} GB`);

// Verify that D's filesystem free space is NOT confused with unallocated space
assert(analysisD.fsFreeBytes !== analysisD.immediateExtendBytes, 
  "Filesystem free space (93 GB) is strictly decoupled from physical unallocated space (26.21 GB)");

// Verify shrink margin calculation (used + 5% buffer + 512MB metadata)
assert(analysisD.maxSupportedShrinkBytes < analysisD.fsFreeBytes, 
  "Max safe shrink preserves safety margin for filesystem structures and MFT");

// -----------------------------------------------------------------------------
// TEST SUITE 3: Direct Extension (Scenario B)
// -----------------------------------------------------------------------------
console.log("\n--- 3. Testing Scenario: Direct Extension into Adjacent Free Space ---");

const gap1 = hostDisk.partitions.find(p => p.category === "UNALLOCATED");
const planDirect = planSpaceTransfer({
  allDisks: REAL_STORAGE_DATA.disks,
  sourceDiskId: 0,
  sourcePartitionId: gap1.id,
  targetDiskId: 0,
  targetPartitionId: partD.id,
  transferAmountGb: 20
});

assert(planDirect.success === true, "Direct extension planning succeeds");
assert(planDirect.status === FEASIBILITY_STATUS.DIRECTLY_EXTENDABLE, 
  "Direct extension classified as DIRECTLY_EXTENDABLE");
assert(planDirect.intermediatePartitions.length === 0, "Requires 0 intermediate partition movements");
assert(planDirect.dag.length === 1, "DAG contains exactly 1 phase: GROW_PARTITION_AND_FILESYSTEM");
assert(planDirect.dag[0].action === "GROW_PARTITION_AND_FILESYSTEM", "Phase action is GROW_PARTITION_AND_FILESYSTEM");
assert(planDirect.dag[0].direction === "GROW_TAIL", "Extension direction is GROW_TAIL");

// -----------------------------------------------------------------------------
// TEST SUITE 4: Complex Transfer Requiring Partition Movement (Scenario A: D: -> C:)
// -----------------------------------------------------------------------------
console.log("\n--- 4. Testing Scenario: Space Transfer D: -> C: (Requires Partition Movement) ---");

const planMovement = planSpaceTransfer({
  allDisks: REAL_STORAGE_DATA.disks,
  sourceDiskId: 0,
  sourcePartitionId: partD.id,
  targetDiskId: 0,
  targetPartitionId: partC.id,
  transferAmountGb: 25
});

assert(planMovement.success === true, "Complex space transfer planning succeeds");
assert(planMovement.status === FEASIBILITY_STATUS.REQUIRES_PARTITION_MOVEMENT, 
  "Transfer classified as REQUIRES_PARTITION_MOVEMENT");

// Intermediate partitions between C: and D: must include Partition 4 (WinRE)
assert(planMovement.intermediatePartitions.length === 1, "Accurately detects exactly 1 intermediate partition (WinRE)");
assert(planMovement.intermediatePartitions[0].category === "RECOVERY", "Intermediate partition is WinRE (Recovery)");

// DAG must contain 3 phases: Shrink D: -> Move WinRE -> Grow C:
assert(planMovement.dag.length === 3, "DAG compiles exactly 3 discrete sequential phases");
assert(planMovement.dag[0].action === "SHRINK_FILESYSTEM_AND_PARTITION", "Phase 1: Shrinks source D:");
assert(planMovement.dag[1].action === "MOVE_PARTITION_SECTOR_EXTENT", "Phase 2: Relocates intermediate WinRE extent");
assert(planMovement.dag[1].direction === "SHIFT_RIGHT", "WinRE shifted towards higher LBA (SHIFT_RIGHT) to clear space for C:");
assert(planMovement.dag[2].action === "GROW_PARTITION_AND_FILESYSTEM", "Phase 3: Grows target C: tail");

// -----------------------------------------------------------------------------
// TEST SUITE 5: Cross-Physical-Disk Guardrail (Scenario C)
// -----------------------------------------------------------------------------
console.log("\n--- 5. Testing Cross-Physical-Disk Invariant Guardrail ---");

const planCross = planSpaceTransfer({
  allDisks: MOCK_DISKS, // Has Disk 0 and Disk 1
  sourceDiskId: 1,      // Disk 1
  sourcePartitionId: "disk1-part1",
  targetDiskId: 0,      // Disk 0
  targetPartitionId: "disk0-part3",
  transferAmountGb: 30
});

assert(planCross.success === false, "Cross-physical-disk transfer is rejected");
assert(planCross.status === FEASIBILITY_STATUS.NOT_SUPPORTED, "Status is NOT_SUPPORTED");
assert(planCross.errorTitle.includes("Cross-Physical-Disk"), 
  "Rejection reason explicitly cites Cross-Physical-Disk prohibition", 
  planCross.errorMessage);
assert(planCross.dag.length === 0, "No DAG generated for cross-disk attempt");

// -----------------------------------------------------------------------------
// TEST SUITE 6: Unsupported Filesystem ReFS Shrinking (Scenario D)
// -----------------------------------------------------------------------------
console.log("\n--- 6. Testing Filesystem Constraint: ReFS Shrink Invariant ---");

// Mock disk 2 has a ReFS partition
const refsDisk = {
  id: 99,
  path: "\\\\.\\PhysicalDrive99",
  model: "Mock ReFS SAN Volume",
  partitions: [
    {
      id: "disk99-part1",
      label: "ReFS Storage Pool",
      fsType: "ReFS",
      category: "DATA",
      startLba: 2048,
      endLba: 209715200,
      sizeBytes: 107374182400,
      usedBytes: 10737418240,
      isSystem: false
    }
  ]
};

const analysisReFS = analyzePartition(refsDisk, refsDisk.partitions[0]);
assert(analysisReFS.isReFS === true, "Accurately detects ReFS filesystem");
assert(analysisReFS.shrinkFeasibility.status === FEASIBILITY_STATUS.NOT_SUPPORTED, 
  "ReFS volume shrinking classified as NOT_SUPPORTED");
assert(analysisReFS.shrinkFeasibility.reason.includes("ReFS cluster architecture does not support shrinking"), 
  "ReFS shrink failure reason documented accurately");

// -----------------------------------------------------------------------------
// TEST SUITE 7: Insufficient Free Space Capacity Check (Scenario E)
// -----------------------------------------------------------------------------
console.log("\n--- 7. Testing Capacity Boundary: Excessive Shrink Attempt ---");

const planExcessive = planSpaceTransfer({
  allDisks: REAL_STORAGE_DATA.disks,
  sourceDiskId: 0,
  sourcePartitionId: partC.id, // C: has ~29.9 GB free
  targetDiskId: 0,
  targetPartitionId: partD.id,
  transferAmountGb: 50 // Exceeds safe shrink limit
});

assert(planExcessive.success === false, "Excessive shrink request rejected");
assert(planExcessive.status === FEASIBILITY_STATUS.NOT_SUPPORTED, "Status is NOT_SUPPORTED");
assert(planExcessive.errorTitle.includes("Insufficient Filesystem Free Space"), 
  "Accurately pinpoints insufficient filesystem free space on source");

// -----------------------------------------------------------------------------
// TEST SUITE 8: Protected System Partition Guardrails (ESP & MSR)
// -----------------------------------------------------------------------------
console.log("\n--- 8. Testing Protected System Partitions (EFI & MSR) ---");

const partEFI = hostDisk.partitions.find(p => p.category === "EFI");
const analysisEFI = analyzePartition(hostDisk, partEFI);
assert(analysisEFI.isProtectedSystem === true, "EFI partition flagged as protected system extent");
assert(analysisEFI.shrinkFeasibility.status === FEASIBILITY_STATUS.UNSAFE, 
  "Shrinking EFI partition is strictly UNSAFE");

const partMSR = hostDisk.partitions.find(p => p.category === "MSR");
const analysisMSR = analyzePartition(hostDisk, partMSR);
assert(analysisMSR.isProtectedSystem === true, "MSR partition flagged as protected system extent");
assert(analysisMSR.shrinkFeasibility.status === FEASIBILITY_STATUS.UNSAFE, 
  "Shrinking MSR partition is strictly UNSAFE");

// -----------------------------------------------------------------------------
// FINAL REPORT
// -----------------------------------------------------------------------------
console.log("\n===============================================================================");
console.log(`   TEST RESULTS: ${passedTests} / ${totalTests} PASSED (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
console.log("===============================================================================\n");

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
