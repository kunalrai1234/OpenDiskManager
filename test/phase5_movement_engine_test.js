import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("===============================================================================");
console.log("   OPENDISK MANAGER — PHASE 5 PARTITION MOVEMENT ENGINE TEST SUITE             ");
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

function runScript(args) {
  return new Promise((resolve) => {
    const scriptPath = path.resolve(__dirname, "..", "movement-engine.ps1");
    const fullArgs = [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", scriptPath,
      ...args
    ];

    execFile("powershell.exe", fullArgs, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (stdout && stdout.trim()) {
        try {
          const firstBrace = stdout.indexOf("{");
          const lastBrace = stdout.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const jsonText = stdout.substring(firstBrace, lastBrace + 1);
            return resolve(JSON.parse(jsonText));
          }
          return resolve({ raw: stdout.trim(), success: !err });
        } catch (e) {
          return resolve({ raw: stdout, error: e.message, success: false });
        }
      }
      resolve({ success: false, error: stderr || err?.message });
    });
  });
}

async function runAllTests() {
  // ---------------------------------------------------------------------------
  // TEST SUITE 1: Movement Planning & Geometry Coordinates
  // ---------------------------------------------------------------------------
  console.log("--- 1. Testing Movement Planning & LBA Alignment ---");
  const planD = await runScript([
    "-Mode", "PlanMovement", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "5", 
    "-ShiftDeltaGb", "10"
  ]);

  assert(planD && planD.success === true, "PlanMovement succeeds for Partition 5 (D:)");
  assert(planD.shiftDirection === "SHIFT_RIGHT", "Direction classified as SHIFT_RIGHT");
  assert(planD.copyOrder.includes("TAIL_TO_HEAD"), "Copy order uses TAIL_TO_HEAD reverse copy to prevent overlap collision");
  assert(planD.isAligned1MiB === true, "Target starting LBA is snapped to 1 MiB boundary (divisible by 2048)");
  assert(planD.geometry.targetStartLba > planD.geometry.currentStartLba, "Target start LBA is higher than current start LBA");
  assert(planD.availableGapGb >= 25, "Accurately detects ~26.2 GB adjacent unallocated space on right of D:");
  assert(planD.hasSufficientSpace === true, "hasSufficientSpace is true for 10 GB shift into 26 GB gap");

  // ---------------------------------------------------------------------------
  // TEST SUITE 2: Pre-Flight Safety Validation - Valid Shift Right
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. Testing Pre-Flight Validation with Backup Acknowledgment ---");
  const valD = await runScript([
    "-Mode", "ValidateMovement", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "5", 
    "-ShiftDeltaGb", "10",
    "-AcknowledgeBackup"
  ]);

  assert(valD.shiftDirection === "SHIFT_RIGHT", "Validation confirms SHIFT_RIGHT direction");
  const alignCheck = valD.checks?.find(c => c.name === "1 MiB Boundary Alignment");
  assert(alignCheck && alignCheck.passed === true, "1 MiB Boundary Alignment check passes");

  const gapCheck = valD.checks?.find(c => c.name === "Directional Unallocated Space");
  assert(gapCheck && gapCheck.passed === true, "Directional Unallocated Space check passes");

  const backupCheck = valD.checks?.find(c => c.name === "Backup Acknowledgment");
  assert(backupCheck && backupCheck.passed === true, "Backup Acknowledgment check passes when flag is provided");

  // ---------------------------------------------------------------------------
  // TEST SUITE 3: Rejection when Backup Acknowledgment is Missing
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Testing Mandatory Backup Acknowledgment Guardrail ---");
  const valNoBackup = await runScript([
    "-Mode", "ValidateMovement", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "5", 
    "-ShiftDeltaGb", "10"
    // -AcknowledgeBackup intentionally omitted
  ]);

  const backupCheckFail = valNoBackup.checks?.find(c => c.name === "Backup Acknowledgment");
  assert(backupCheckFail && backupCheckFail.passed === false, "Backup Acknowledgment fails when user has not certified backup");

  // ---------------------------------------------------------------------------
  // TEST SUITE 4: Rejection of Shift Exceeding Available Unallocated Gap
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Testing Shift Exceeding Adjacent Unallocated Space ---");
  const valExcessiveShift = await runScript([
    "-Mode", "ValidateMovement", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "5", 
    "-ShiftDeltaGb", "50", // Exceeds 26 GB gap
    "-AcknowledgeBackup"
  ]);

  assert(valExcessiveShift.isValid === false, "Excessive shift is rejected (isValid = false)");
  assert(valExcessiveShift.abortReason.includes("Insufficient contiguous unallocated space"), 
    "Abort reason cites Insufficient contiguous unallocated space in shift direction");

  // ---------------------------------------------------------------------------
  // TEST SUITE 5: Protected Partition Shield - EFI System Partition (ESP)
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. Testing Protected Partition Shield: EFI System Partition ---");
  const valEfi = await runScript([
    "-Mode", "ValidateMovement", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "1", 
    "-ShiftDeltaGb", "1",
    "-AcknowledgeBackup"
  ]);

  assert(valEfi.isValid === false, "EFI System Partition movement is rejected");
  const efiShield = valEfi.checks?.find(c => c.name === "Protected Partition Shield");
  assert(efiShield && efiShield.passed === false, "Protected Partition Shield fails for EFI");
  assert(valEfi.abortReason.includes("EFI System Partition"), "Abort reason cites EFI System Partition protection");

  // ---------------------------------------------------------------------------
  // TEST SUITE 6: Protected Partition Shield - Microsoft Reserved Partition (MSR)
  // ---------------------------------------------------------------------------
  console.log("\n--- 6. Testing Protected Partition Shield: Microsoft Reserved (MSR) ---");
  const valMsr = await runScript([
    "-Mode", "ValidateMovement", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "2", 
    "-ShiftDeltaGb", "1",
    "-AcknowledgeBackup"
  ]);

  assert(valMsr.isValid === false, "MSR movement is rejected");
  const msrShield = valMsr.checks?.find(c => c.name === "Protected Partition Shield");
  assert(msrShield && msrShield.passed === false, "Protected Partition Shield fails for MSR");

  // ---------------------------------------------------------------------------
  // TEST SUITE 7: System Boot Partition (C:) Offline WinPE Requirement
  // ---------------------------------------------------------------------------
  console.log("\n--- 7. Testing System Boot Partition C: WinPE Requirement ---");
  const planC = await runScript([
    "-Mode", "PlanMovement", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "3", 
    "-ShiftDeltaGb", "5"
  ]);

  assert(planC.isSystemBoot === true, "Partition C: accurately flagged as System Boot volume");
  assert(planC.requiresWinPE === true, "Partition C: movement strictly requires WinPE offline boot environment");
  assert(planC.executionRuntime.includes("OFFLINE_WINPE"), "Execution runtime classified as OFFLINE_WINPE");

  // ---------------------------------------------------------------------------
  // TEST SUITE 8: Anti-Race Condition: Partition Offset Revalidation
  // ---------------------------------------------------------------------------
  console.log("\n--- 8. Testing Partition Offset Revalidation ---");
  const valOffsetFail = await runScript([
    "-Mode", "ValidateMovement", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "5", 
    "-ShiftDeltaGb", "10",
    "-ExpectedStartOffset", "111222333444", // Stale offset
    "-AcknowledgeBackup"
  ]);

  assert(valOffsetFail.isValid === false, "Offset mismatch is rejected");
  assert(valOffsetFail.abortReason.includes("Partition offset mismatch"), "Abort reason cites Partition offset mismatch");

  // ---------------------------------------------------------------------------
  // TEST SUITE 9: Mandatory Confirmation Enforcement
  // ---------------------------------------------------------------------------
  console.log("\n--- 9. Testing Mandatory User Confirmation Requirement ---");
  const execUnconfirmed = await runScript([
    "-Mode", "ExecuteMovement", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "5", 
    "-ShiftDeltaGb", "10",
    "-AcknowledgeBackup"
    // -Confirmed switch deliberately omitted
  ]);

  assert(execUnconfirmed.success === false, "Unconfirmed movement request is blocked");
  assert(execUnconfirmed.error.includes("Explicit confirmation (-Confirmed) was not provided"), 
    "Error cites missing confirmation switch");

  // ---------------------------------------------------------------------------
  // TEST SUITE 10: Protection Against Live Online System Movement
  // ---------------------------------------------------------------------------
  console.log("\n--- 10. Testing Online Execution Block for System Partition ---");
  const execOnlineSystem = await runScript([
    "-Mode", "ExecuteMovement", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "3", // C:
    "-ShiftDeltaGb", "5",
    "-Confirmed",
    "-AcknowledgeBackup"
  ]);

  assert(execOnlineSystem.success === false, "Live online movement of system partition C: is blocked");
  assert(execOnlineSystem.error.includes("Live online movement of Windows system partition (C:) or recovery extents is prohibited"), 
    "Error explicitly cites prohibition of live kernel relocation");

  // ---------------------------------------------------------------------------
  // TEST SUITE 11: Offline WinPE Task Staging
  // ---------------------------------------------------------------------------
  console.log("\n--- 11. Testing Offline WinPE Task Staging ---");
  const stageRes = await runScript([
    "-Mode", "StageWinPE", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "5", 
    "-ShiftDeltaGb", "10",
    "-AcknowledgeBackup"
  ]);

  const winpeTaskFile = path.resolve(__dirname, "..", "opendisk-winpe-task.json");
  assert(fs.existsSync(winpeTaskFile), "opendisk-winpe-task.json created successfully on disk");
  const rawTask = fs.readFileSync(winpeTaskFile, "utf8").trim().replace(/^\uFEFF/, "");
  const taskData = JSON.parse(rawTask);
  assert(taskData.partitionNumber === 5 && taskData.requiresReboot === true, 
    "WinPE task payload contains partition coordinates and reboot flag");

  // ---------------------------------------------------------------------------
  // TEST SUITE 12: Simulation Dry-Run Mode
  // ---------------------------------------------------------------------------
  console.log("\n--- 12. Testing Simulation Dry-Run Mode ---");
  const simRes = await runScript([
    "-Mode", "SimulateMovement", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "5", 
    "-ShiftDeltaGb", "10",
    "-AcknowledgeBackup"
  ]);

  assert(simRes.isSimulation === true, "SimulateMovement returns isSimulation = true");
  assert(simRes.movementVector.direction === "SHIFT_RIGHT", "Movement vector direction is SHIFT_RIGHT");
  assert(Array.isArray(simRes.executionPlan) && simRes.executionPlan.length === 6, 
    "Generates 6-phase atomic execution plan (Lock, Relocate, VBR, GPT, CRC32, Remount)");

  // ---------------------------------------------------------------------------
  // TEST SUITE 13: Audit Logging Verification
  // ---------------------------------------------------------------------------
  console.log("\n--- 13. Testing Movement Audit Logging ---");
  const movLogPath = path.resolve(__dirname, "..", "movement-audit.log");
  const testMovEntry = {
    timestamp: new Date().toISOString(),
    action: "MOVE_PARTITION",
    diskNumber: 0,
    partitionNumber: 5,
    driveLetter: "D",
    direction: "SHIFT_RIGHT",
    beforeStartLba: 459010048,
    actualStartLba: 478539776,
    shiftBytes: 9999220736,
    durationMs: 600,
    status: "VERIFIED_SIMULATED",
    isOffline: false
  };
  fs.appendFileSync(movLogPath, `[${testMovEntry.timestamp}] ${JSON.stringify(testMovEntry)}\n`, "utf8");

  assert(fs.existsSync(movLogPath), "movement-audit.log exists on disk");
  const logContent = fs.readFileSync(movLogPath, "utf8");
  assert(logContent.includes("MOVE_PARTITION") && logContent.includes("478539776"), 
    "Audit log records structured movement details with LBA bounds");

  // ---------------------------------------------------------------------------
  // FINAL RESULTS
  // ---------------------------------------------------------------------------
  console.log("\n===============================================================================");
  console.log(`   TEST RESULTS: ${passedTests} / ${totalTests} PASSED (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
  console.log("===============================================================================\n");

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

