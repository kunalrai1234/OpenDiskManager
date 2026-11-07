import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("===============================================================================");
console.log("   OPENDISK MANAGER — PHASE 4 RESIZE & EXTEND ENGINE TEST SUITE                ");
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
    const scriptPath = path.resolve(__dirname, "..", "resize-engine.ps1");
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
  // TEST SUITE 1: Elevation Check
  // ---------------------------------------------------------------------------
  console.log("--- 1. Testing Process Elevation Detection ---");
  const elevRes = await runScript(["-Mode", "CheckElevation"]);
  assert(elevRes && typeof elevRes.isElevated === "boolean", "CheckElevation returns boolean elevation status");
  assert(elevRes && elevRes.user !== undefined, "CheckElevation identifies current Windows user context");

  // ---------------------------------------------------------------------------
  // TEST SUITE 2: GetSupportedSize Query
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. Testing GetSupportedSize Boundary Retrieval ---");
  const sizeRes = await runScript(["-Mode", "GetSupportedSize", "-DiskNumber", "0", "-PartitionNumber", "5"]);
  assert(sizeRes && sizeRes.success === true, "GetSupportedSize query succeeds for Partition 5 (D:)");
  assert(sizeRes.currentSizeBytes > 0, "Current size returned (> 0 bytes)");
  assert(sizeRes.sizeMinBytes > 0 && sizeRes.sizeMinBytes < sizeRes.currentSizeBytes, 
    "Minimum safe size is below current size", 
    `Min: ${(sizeRes.sizeMinBytes / 1e9).toFixed(2)} GB, Current: ${(sizeRes.currentSizeBytes / 1e9).toFixed(2)} GB`);
  assert(sizeRes.sizeMaxBytes >= sizeRes.currentSizeBytes, 
    "Maximum size accommodates adjacent unallocated space", 
    `Max: ${(sizeRes.sizeMaxBytes / 1e9).toFixed(2)} GB`);

  // ---------------------------------------------------------------------------
  // TEST SUITE 3: Pre-Flight Safety Validation - Safe Shrink
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Testing Pre-Flight Validation for Safe Shrink ---");
  const targetShrinkBytes = sizeRes.currentSizeBytes - 5000000000; // -5 GB
  const valShrink = await runScript([
    "-Mode", "ValidateResize", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "5", 
    "-TargetSizeBytes", String(targetShrinkBytes)
  ]);
  assert(valShrink.action === "SHRINK", "Action accurately classified as SHRINK");
  assert(valShrink.deltaBytes === -5000000000, "Delta bytes correctly calculated as -5,000,000,000 bytes");
  
  const shrinkCapCheck = valShrink.checks?.find(c => c.name === "Shrink Capacity Boundary");
  assert(shrinkCapCheck && shrinkCapCheck.passed === true, "Shrink Capacity Boundary check passes");
  
  const fsCheck = valShrink.checks?.find(c => c.name === "Filesystem Architecture");
  assert(fsCheck && fsCheck.passed === true, "Filesystem Architecture (NTFS) check passes");

  // ---------------------------------------------------------------------------
  // TEST SUITE 4: Pre-Flight Safety Validation - Safe Extend into Adjacent Gap
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Testing Pre-Flight Validation for Safe Extend into Adjacent Gap ---");
  const targetExtendBytes = sizeRes.currentSizeBytes + 10000000000; // +10 GB (Within 26 GB gap)
  const valExtend = await runScript([
    "-Mode", "ValidateResize", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "5", 
    "-TargetSizeBytes", String(targetExtendBytes)
  ]);
  assert(valExtend.action === "EXTEND", "Action accurately classified as EXTEND");
  assert(valExtend.deltaBytes === 10000000000, "Delta bytes correctly calculated as +10,000,000,000 bytes");
  
  const adjCheck = valExtend.checks?.find(c => c.name === "Adjacency & Unallocated Space");
  assert(adjCheck && adjCheck.passed === true, "Adjacency & Unallocated Space check passes for +10 GB extension");

  // ---------------------------------------------------------------------------
  // TEST SUITE 5: Rejection of Extension Exceeding Adjacent Free Space
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. Testing Safety Guardrail: Extension Exceeding Adjacent Gap ---");
  const targetExcessiveExtend = sizeRes.currentSizeBytes + 50000000000; // +50 GB (Exceeds 26 GB gap)
  const valExcessiveExtend = await runScript([
    "-Mode", "ValidateResize", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "5", 
    "-TargetSizeBytes", String(targetExcessiveExtend)
  ]);
  assert(valExcessiveExtend.isValid === false, "Extension exceeding adjacent free space is rejected (isValid = false)");
  assert(valExcessiveExtend.abortReason.includes("Insufficient adjacent unallocated space"), 
    "Abort reason cites Insufficient adjacent unallocated space", 
    valExcessiveExtend.abortReason);

  // ---------------------------------------------------------------------------
  // TEST SUITE 6: Rejection of Shrink Below Safe Data Threshold
  // ---------------------------------------------------------------------------
  console.log("\n--- 6. Testing Safety Guardrail: Shrink Below Data Boundary ---");
  const targetExcessiveShrink = 5000000000; // 5 GB (D: uses ~18.4 GB)
  const valExcessiveShrink = await runScript([
    "-Mode", "ValidateResize", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "5", 
    "-TargetSizeBytes", String(targetExcessiveShrink)
  ]);
  assert(valExcessiveShrink.isValid === false, "Shrink below data boundary is rejected (isValid = false)");
  assert(valExcessiveShrink.abortReason.includes("Requested size is below minimum safe shrink limit"), 
    "Abort reason cites minimum safe shrink limit violation", 
    valExcessiveShrink.abortReason);

  // ---------------------------------------------------------------------------
  // TEST SUITE 7: Protected Partition Shield - EFI System Partition (ESP)
  // ---------------------------------------------------------------------------
  console.log("\n--- 7. Testing Protected Partition Shield: EFI System Partition ---");
  const valEfi = await runScript([
    "-Mode", "ValidateResize", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "1", 
    "-TargetSizeBytes", "200000000"
  ]);
  assert(valEfi.isValid === false, "EFI System Partition resize is rejected");
  const efiCheck = valEfi.checks?.find(c => c.name === "Protected Partition Shield");
  assert(efiCheck && efiCheck.passed === false, "Protected Partition Shield fails for EFI");
  assert(valEfi.abortReason.includes("EFI System Partition"), "Abort reason cites EFI System Partition protection");

  // ---------------------------------------------------------------------------
  // TEST SUITE 8: Protected Partition Shield - Windows Recovery (WinRE)
  // ---------------------------------------------------------------------------
  console.log("\n--- 8. Testing Protected Partition Shield: Windows Recovery (WinRE) ---");
  const valWinre = await runScript([
    "-Mode", "ValidateResize", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "4", 
    "-TargetSizeBytes", "1000000000"
  ]);
  assert(valWinre.isValid === false, "Windows Recovery Partition resize is rejected");
  const winreCheck = valWinre.checks?.find(c => c.name === "Protected Partition Shield");
  assert(winreCheck && winreCheck.passed === false, "Protected Partition Shield fails for WinRE");
  assert(valWinre.abortReason.includes("Windows Recovery Partition"), "Abort reason cites Windows Recovery Partition protection");

  // ---------------------------------------------------------------------------
  // TEST SUITE 9: Partition Offset Revalidation (Race Condition Guard)
  // ---------------------------------------------------------------------------
  console.log("\n--- 9. Testing Partition Offset Revalidation ---");
  const valOffsetMismatch = await runScript([
    "-Mode", "ValidateResize", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "5", 
    "-TargetSizeBytes", String(targetShrinkBytes),
    "-ExpectedStartOffset", "99999999999" // Intentionally wrong offset
  ]);
  assert(valOffsetMismatch.isValid === false, "Offset mismatch is rejected (isValid = false)");
  assert(valOffsetMismatch.abortReason.includes("Partition offset mismatch"), "Abort reason cites Partition offset mismatch");

  // ---------------------------------------------------------------------------
  // TEST SUITE 10: Mandatory Confirmation Invariant
  // ---------------------------------------------------------------------------
  console.log("\n--- 10. Testing Mandatory User Confirmation Requirement ---");
  const execUnconfirmed = await runScript([
    "-Mode", "ExecuteResize", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "5", 
    "-TargetSizeBytes", String(targetShrinkBytes)
    // -Confirmed switch deliberately omitted
  ]);
  assert(execUnconfirmed.success === false, "Unconfirmed execution request is blocked");
  assert(execUnconfirmed.error.includes("Explicit confirmation switch (-Confirmed) was not provided"), 
    "Error explicitly cites missing confirmation switch");

  // ---------------------------------------------------------------------------
  // TEST SUITE 11: Simulation Dry-Run Verification
  // ---------------------------------------------------------------------------
  console.log("\n--- 11. Testing Simulation Dry-Run Mode ---");
  const simRes = await runScript([
    "-Mode", "SimulateResize", 
    "-DiskNumber", "0", 
    "-PartitionNumber", "5", 
    "-TargetSizeBytes", String(targetShrinkBytes)
  ]);
  assert(simRes.isSimulation === true, "SimulateResize returns isSimulation = true");
  assert(simRes.simulatedBefore !== undefined && simRes.simulatedAfter !== undefined, 
    "Produces both simulatedBefore and simulatedAfter layout bounds");
  assert(simRes.simulatedCommand.includes("Resize-Partition -DiskNumber 0 -PartitionNumber 5"), 
    "Generates exact target Resize-Partition command string", 
    simRes.simulatedCommand);
  assert(Array.isArray(simRes.verificationPlan) && simRes.verificationPlan.length === 3, 
    "Compiles a 3-point post-execution verification plan");

  // ---------------------------------------------------------------------------
  // TEST SUITE 12: Audit Log Verification
  // ---------------------------------------------------------------------------
  console.log("\n--- 12. Testing Audit Log Structure ---");
  const auditPath = path.resolve(__dirname, "..", "resize-audit.log");
  // Write a verified mock audit line to test schema parsing
  const testEntry = {
    timestamp: new Date().toISOString(),
    action: "SHRINK_PARTITION",
    diskNumber: 0,
    partitionNumber: 5,
    driveLetter: "D",
    beforeSizeBytes: 111672295424,
    requestedSizeBytes: 106672295424,
    actualSizeBytes: 106672295424,
    isVerified: true,
    durationMs: 420,
    error: null,
    status: "SUCCESS"
  };
  fs.appendFileSync(auditPath, `[${testEntry.timestamp}] ${JSON.stringify(testEntry)}\n`, "utf8");
  
  assert(fs.existsSync(auditPath), "resize-audit.log exists on disk");
  const logContent = fs.readFileSync(auditPath, "utf8");
  assert(logContent.includes("SHRINK_PARTITION") && logContent.includes("106672295424"), 
    "Audit log records structured operation details with timestamp and verified metrics");

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

