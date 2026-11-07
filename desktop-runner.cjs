const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

function getAppLogDir() {
  if (!app.isPackaged) {
    return __dirname;
  }
  const appData = app.getPath("userData");
  const logDir = path.join(appData, "logs");
  if (!fs.existsSync(logDir)) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch (e) {}
  }
  return logDir;
}

function resolveScriptPath(scriptName) {
  // 1. Packaged extraResources
  if (process.resourcesPath) {
    const resScript = path.join(process.resourcesPath, scriptName);
    if (fs.existsSync(resScript)) return resScript;
    const resSub = path.join(process.resourcesPath, "scripts", scriptName);
    if (fs.existsSync(resSub)) return resSub;
  }
  // 2. Local __dirname
  const local = path.join(__dirname, scriptName);
  if (fs.existsSync(local)) return local;
  return local;
}

const logDir = getAppLogDir();
const logFile = path.join(logDir, "desktop-runner.log");
const auditLogFile = path.join(logDir, "resize-audit.log");

function log(msg) {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {}
}

log(`Starting OpenDisk Manager Engine. app.isReady() = ${app.isReady()}`);

function runPsScript(scriptName, args = []) {
  return new Promise((resolve) => {
    const scriptPath = resolveScriptPath(scriptName);
    const fullArgs = [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", scriptPath,
      ...args
    ];
    log(`Running PS: powershell.exe ${fullArgs.join(" ")}`);

    execFile("powershell.exe", fullArgs, { encoding: "utf8", maxBuffer: 15 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (stderr) log(`PS stderr: ${stderr}`);
      if (stdout && stdout.trim()) {
        try {
          // Find first { and last } to avoid any incidental banners
          const text = stdout.trim();
          const firstBrace = text.indexOf("{");
          const lastBrace = text.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const jsonText = text.substring(firstBrace, lastBrace + 1);
            const parsed = JSON.parse(jsonText);
            return resolve(parsed);
          }
          return resolve({ raw: text, success: !err });
        } catch (e) {
          log(`JSON parse error: ${e.message}. Raw output: ${stdout}`);
          return resolve({ raw: stdout, error: e.message, success: false });
        }
      }
      if (err) {
        log(`execFile error: ${err.message}`);
        return resolve({ success: false, error: err.message });
      }
      resolve({ success: true });
    });
  });
}

// -----------------------------------------------------------------------------
// IPC Handlers
// -----------------------------------------------------------------------------
ipcMain.handle("scan-real-storage", async () => {
  log("IPC: scan-real-storage triggered.");
  const res = await runPsScript("detect-disks.ps1");
  return res;
});

ipcMain.handle("read-cached-storage", async () => {
  const cachedPath = path.join(__dirname, "detected-storage.json");
  if (fs.existsSync(cachedPath)) {
    try {
      const raw = fs.readFileSync(cachedPath, "utf8");
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  return null;
});

ipcMain.handle("check-elevation", async () => {
  return await runPsScript("resize-engine.ps1", ["-Mode", "CheckElevation"]);
});

ipcMain.handle("get-supported-size", async (_event, params = {}) => {
  const { diskNumber = 0, partitionNumber = 1 } = params;
  return await runPsScript("resize-engine.ps1", [
    "-Mode", "GetSupportedSize",
    "-DiskNumber", String(diskNumber),
    "-PartitionNumber", String(partitionNumber)
  ]);
});

ipcMain.handle("validate-resize", async (_event, params = {}) => {
  const {
    diskNumber = 0,
    partitionNumber = 1,
    targetSizeBytes = 0,
    expectedStartOffset = 0,
    expectedSizeBytes = 0
  } = params;
  return await runPsScript("resize-engine.ps1", [
    "-Mode", "ValidateResize",
    "-DiskNumber", String(diskNumber),
    "-PartitionNumber", String(partitionNumber),
    "-TargetSizeBytes", String(targetSizeBytes),
    "-ExpectedStartOffset", String(expectedStartOffset),
    "-ExpectedSizeBytes", String(expectedSizeBytes)
  ]);
});

ipcMain.handle("simulate-resize", async (_event, params = {}) => {
  const {
    diskNumber = 0,
    partitionNumber = 1,
    targetSizeBytes = 0
  } = params;
  return await runPsScript("resize-engine.ps1", [
    "-Mode", "SimulateResize",
    "-DiskNumber", String(diskNumber),
    "-PartitionNumber", String(partitionNumber),
    "-TargetSizeBytes", String(targetSizeBytes)
  ]);
});

ipcMain.handle("execute-resize", async (_event, params = {}) => {
  const {
    diskNumber = 0,
    partitionNumber = 1,
    targetSizeBytes = 0,
    confirmed = false,
    confirmationCode = ""
  } = params;

  const args = [
    "-Mode", "ExecuteResize",
    "-DiskNumber", String(diskNumber),
    "-PartitionNumber", String(partitionNumber),
    "-TargetSizeBytes", String(targetSizeBytes),
    "-ConfirmationCode", String(confirmationCode)
  ];
  if (confirmed) args.push("-Confirmed");

  return await runPsScript("resize-engine.ps1", args);
});

ipcMain.handle("get-audit-logs", async () => {
  if (fs.existsSync(auditLogFile)) {
    try {
      const content = fs.readFileSync(auditLogFile, "utf8");
      const lines = content.split("\n").filter(l => l.trim().length > 0);
      return lines.map(line => {
        try {
          const match = line.match(/^\[(.*?)\] (.*)$/);
          if (match) {
            return { timestamp: match[1], ...JSON.parse(match[2]) };
          }
          return { raw: line };
        } catch (e) {
          return { raw: line };
        }
      }).reverse(); // Most recent first
    } catch (e) {
      return [];
    }
  }
  return [];
});

// Phase 5: Partition Movement Handlers
ipcMain.handle("plan-movement", async (_event, params = {}) => {
  const { diskNumber = 0, partitionNumber = 1, shiftDeltaGb = 0, targetStartLba = -1 } = params;
  return await runPsScript("movement-engine.ps1", [
    "-Mode", "PlanMovement",
    "-DiskNumber", String(diskNumber),
    "-PartitionNumber", String(partitionNumber),
    "-ShiftDeltaGb", String(shiftDeltaGb),
    "-TargetStartLba", String(targetStartLba)
  ]);
});

ipcMain.handle("validate-movement", async (_event, params = {}) => {
  const { diskNumber = 0, partitionNumber = 1, shiftDeltaGb = 0, targetStartLba = -1, expectedStartOffset = 0, acknowledgeBackup = false } = params;
  const args = [
    "-Mode", "ValidateMovement",
    "-DiskNumber", String(diskNumber),
    "-PartitionNumber", String(partitionNumber),
    "-ShiftDeltaGb", String(shiftDeltaGb),
    "-TargetStartLba", String(targetStartLba),
    "-ExpectedStartOffset", String(expectedStartOffset)
  ];
  if (acknowledgeBackup) args.push("-AcknowledgeBackup");
  return await runPsScript("movement-engine.ps1", args);
});

ipcMain.handle("simulate-movement", async (_event, params = {}) => {
  const { diskNumber = 0, partitionNumber = 1, shiftDeltaGb = 0, targetStartLba = -1, acknowledgeBackup = false } = params;
  const args = [
    "-Mode", "SimulateMovement",
    "-DiskNumber", String(diskNumber),
    "-PartitionNumber", String(partitionNumber),
    "-ShiftDeltaGb", String(shiftDeltaGb),
    "-TargetStartLba", String(targetStartLba)
  ];
  if (acknowledgeBackup) args.push("-AcknowledgeBackup");
  return await runPsScript("movement-engine.ps1", args);
});

ipcMain.handle("stage-winpe-movement", async (_event, params = {}) => {
  const { diskNumber = 0, partitionNumber = 1, shiftDeltaGb = 0, targetStartLba = -1, acknowledgeBackup = false } = params;
  const args = [
    "-Mode", "StageWinPE",
    "-DiskNumber", String(diskNumber),
    "-PartitionNumber", String(partitionNumber),
    "-ShiftDeltaGb", String(shiftDeltaGb),
    "-TargetStartLba", String(targetStartLba)
  ];
  if (acknowledgeBackup) args.push("-AcknowledgeBackup");
  return await runPsScript("movement-engine.ps1", args);
});

ipcMain.handle("execute-movement", async (_event, params = {}) => {
  const { diskNumber = 0, partitionNumber = 1, shiftDeltaGb = 0, targetStartLba = -1, confirmed = false, confirmationCode = "", acknowledgeBackup = false } = params;
  const args = [
    "-Mode", "ExecuteMovement",
    "-DiskNumber", String(diskNumber),
    "-PartitionNumber", String(partitionNumber),
    "-ShiftDeltaGb", String(shiftDeltaGb),
    "-TargetStartLba", String(targetStartLba),
    "-ConfirmationCode", String(confirmationCode)
  ];
  if (confirmed) args.push("-Confirmed");
  if (acknowledgeBackup) args.push("-AcknowledgeBackup");
  return await runPsScript("movement-engine.ps1", args);
});

ipcMain.handle("get-movement-audit-logs", async () => {
  const movLogFile = path.join(logDir, "movement-audit.log");
  const fallbackFile = path.join(__dirname, "movement-audit.log");
  const targetFile = fs.existsSync(movLogFile) ? movLogFile : fallbackFile;
  if (fs.existsSync(targetFile)) {
    try {
      const content = fs.readFileSync(targetFile, "utf8");
      const lines = content.split("\n").filter(l => l.trim().length > 0);
      return lines.map(line => {
        try {
          const match = line.match(/^\[(.*?)\] (.*)$/);
          if (match) return { timestamp: match[1], ...JSON.parse(match[2]) };
          return { raw: line };
        } catch (e) {
          return { raw: line };
        }
      }).reverse();
    } catch (e) {
      return [];
    }
  }
  return [];
});

// -----------------------------------------------------------------------------
// Phase 6: Advanced Partition Management Handlers
// -----------------------------------------------------------------------------
ipcMain.handle("format-volume", async (_event, params = {}) => {
  const {
    diskNumber = 0,
    partitionNumber = 1,
    targetFileSystem = "NTFS",
    targetLabel = "",
    targetAllocationUnitSize = 0,
    quickFormat = true,
    confirmed = false,
    confirmationCode = ""
  } = params;

  const args = [
    "-Mode", "FormatVolume",
    "-DiskNumber", String(diskNumber),
    "-PartitionNumber", String(partitionNumber),
    "-TargetFileSystem", String(targetFileSystem),
    "-TargetLabel", String(targetLabel),
    "-TargetAllocationUnitSize", String(targetAllocationUnitSize)
  ];
  if (quickFormat) args.push("-QuickFormat");
  if (confirmed) {
    args.push("-Confirmed");
    args.push("-ConfirmationCode", String(confirmationCode));
  }
  return await runPsScript("advanced-engine.ps1", args);
});

ipcMain.handle("delete-partition", async (_event, params = {}) => {
  const {
    diskNumber = 0,
    partitionNumber = 1,
    confirmed = false,
    confirmationCode = ""
  } = params;

  const args = [
    "-Mode", "DeletePartition",
    "-DiskNumber", String(diskNumber),
    "-PartitionNumber", String(partitionNumber)
  ];
  if (confirmed) {
    args.push("-Confirmed");
    args.push("-ConfirmationCode", String(confirmationCode));
  }
  return await runPsScript("advanced-engine.ps1", args);
});

ipcMain.handle("set-drive-letter", async (_event, params = {}) => {
  const {
    diskNumber = 0,
    partitionNumber = 1,
    targetDriveLetter = "",
    confirmed = false
  } = params;

  const args = [
    "-Mode", "SetDriveLetter",
    "-DiskNumber", String(diskNumber),
    "-PartitionNumber", String(partitionNumber),
    "-TargetDriveLetter", String(targetDriveLetter)
  ];
  if (confirmed) args.push("-Confirmed");
  return await runPsScript("advanced-engine.ps1", args);
});

ipcMain.handle("remove-drive-letter", async (_event, params = {}) => {
  const {
    diskNumber = 0,
    partitionNumber = 1,
    confirmed = false
  } = params;

  const args = [
    "-Mode", "RemoveDriveLetter",
    "-DiskNumber", String(diskNumber),
    "-PartitionNumber", String(partitionNumber)
  ];
  if (confirmed) args.push("-Confirmed");
  return await runPsScript("advanced-engine.ps1", args);
});

ipcMain.handle("set-volume-label", async (_event, params = {}) => {
  const {
    diskNumber = 0,
    partitionNumber = 1,
    targetLabel = "",
    confirmed = false
  } = params;

  const args = [
    "-Mode", "SetVolumeLabel",
    "-DiskNumber", String(diskNumber),
    "-PartitionNumber", String(partitionNumber),
    "-TargetLabel", String(targetLabel)
  ];
  if (confirmed) args.push("-Confirmed");
  return await runPsScript("advanced-engine.ps1", args);
});

ipcMain.handle("plan-split-partition", async (_event, params = {}) => {
  const {
    diskNumber = 0,
    partitionNumber = 1,
    splitSizeBytes = 0,
    targetFileSystem = "NTFS",
    targetLabel = "",
    targetDriveLetter = ""
  } = params;

  return await runPsScript("advanced-engine.ps1", [
    "-Mode", "PlanSplitPartition",
    "-DiskNumber", String(diskNumber),
    "-PartitionNumber", String(partitionNumber),
    "-SplitSizeBytes", String(splitSizeBytes),
    "-TargetFileSystem", String(targetFileSystem),
    "-TargetLabel", String(targetLabel),
    "-TargetDriveLetter", String(targetDriveLetter)
  ]);
});

ipcMain.handle("execute-split-partition", async (_event, params = {}) => {
  const {
    diskNumber = 0,
    partitionNumber = 1,
    splitSizeBytes = 0,
    targetFileSystem = "NTFS",
    targetLabel = "",
    targetDriveLetter = "",
    confirmed = false,
    confirmationCode = ""
  } = params;

  const args = [
    "-Mode", "ExecuteSplitPartition",
    "-DiskNumber", String(diskNumber),
    "-PartitionNumber", String(partitionNumber),
    "-SplitSizeBytes", String(splitSizeBytes),
    "-TargetFileSystem", String(targetFileSystem),
    "-TargetLabel", String(targetLabel),
    "-TargetDriveLetter", String(targetDriveLetter)
  ];
  if (confirmed) {
    args.push("-Confirmed");
    args.push("-ConfirmationCode", String(confirmationCode));
  }
  return await runPsScript("advanced-engine.ps1", args);
});

ipcMain.handle("plan-merge-partitions", async (_event, params = {}) => {
  const {
    diskNumber = 0,
    targetPartitionNumber = 1,
    sourcePartitionNumber = 2,
    preserveSourceData = true
  } = params;

  const args = [
    "-Mode", "PlanMergePartitions",
    "-DiskNumber", String(diskNumber),
    "-TargetPartitionNumber", String(targetPartitionNumber),
    "-SourcePartitionNumber", String(sourcePartitionNumber)
  ];
  if (preserveSourceData) args.push("-PreserveSourceData");
  return await runPsScript("advanced-engine.ps1", args);
});

ipcMain.handle("execute-merge-partitions", async (_event, params = {}) => {
  const {
    diskNumber = 0,
    targetPartitionNumber = 1,
    sourcePartitionNumber = 2,
    preserveSourceData = true,
    confirmed = false,
    confirmationCode = ""
  } = params;

  const args = [
    "-Mode", "ExecuteMergePartitions",
    "-DiskNumber", String(diskNumber),
    "-TargetPartitionNumber", String(targetPartitionNumber),
    "-SourcePartitionNumber", String(sourcePartitionNumber)
  ];
  if (preserveSourceData) args.push("-PreserveSourceData");
  if (confirmed) {
    args.push("-Confirmed");
    args.push("-ConfirmationCode", String(confirmationCode));
  }
  return await runPsScript("advanced-engine.ps1", args);
});

ipcMain.handle("inspect-filesystem", async (_event, params = {}) => {
  const { diskNumber = 0, partitionNumber = 1 } = params;
  return await runPsScript("advanced-engine.ps1", [
    "-Mode", "InspectFileSystem",
    "-DiskNumber", String(diskNumber),
    "-PartitionNumber", String(partitionNumber)
  ]);
});

ipcMain.handle("detect-config-issues", async () => {
  return await runPsScript("advanced-engine.ps1", ["-Mode", "DetectConfigIssues"]);
});

ipcMain.handle("get-available-drive-letters", async () => {
  return await runPsScript("advanced-engine.ps1", ["-Mode", "GetAvailableDriveLetters"]);
});

ipcMain.handle("get-advanced-audit-logs", async () => {
  const advLogFile = path.join(logDir, "advanced-audit.log");
  const fallbackFile = path.join(__dirname, "advanced-audit.log");
  const targetFile = fs.existsSync(advLogFile) ? advLogFile : fallbackFile;
  if (fs.existsSync(targetFile)) {
    try {
      const content = fs.readFileSync(targetFile, "utf8");
      const lines = content.split("\n").filter(l => l.trim().length > 0);
      return lines.map(line => {
        try {
          const match = line.match(/^\[(.*?)\] (.*)$/);
          if (match) return { timestamp: match[1], ...JSON.parse(match[2]) };
          return { raw: line };
        } catch (e) {
          return { raw: line };
        }
      }).reverse();
    } catch (e) {
      return [];
    }
  }
  return [];
});

let mainWindow = null;

function createWindow() {
  log("createWindow called.");
  try {
    const indexPath = path.join(__dirname, "dist", "index.html");
    const preloadPath = path.join(__dirname, "preload.cjs");
    log(`Index path: ${indexPath}. Preload: ${preloadPath}`);

    const iconIco = path.join(__dirname, "assets", "icons", "icon.ico");
    const iconPng = path.join(__dirname, "assets", "icons", "icon.png");
    const appIcon = fs.existsSync(iconIco) ? iconIco : (fs.existsSync(iconPng) ? iconPng : undefined);

    mainWindow = new BrowserWindow({
      width: 1400,
      height: 880,
      minWidth: 1060,
      minHeight: 720,
      backgroundColor: "#090D16",
      title: "OpenDisk Manager — Windows 11 Storage Systems Director",
      autoHideMenuBar: true,
      show: true,
      icon: appIcon,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    log("BrowserWindow instance created with preload bridge.");

    mainWindow.loadFile(indexPath).then(() => {
      log("Loaded dist/index.html successfully.");
    }).catch(err => {
      log(`Failed to load index.html: ${err}`);
    });

    mainWindow.on("closed", () => {
      log("MainWindow closed event.");
      mainWindow = null;
    });
  } catch (err) {
    log(`ERROR in createWindow: ${err.stack || err}`);
  }
}

if (app.isReady()) {
  createWindow();
} else {
  app.on("ready", () => {
    log("app 'ready' event fired.");
    createWindow();
  });
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  log("window-all-closed event.");
  if (process.platform !== "darwin") app.quit();
});
