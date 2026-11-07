const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("openDiskBridge", {
  scanRealStorage: () => ipcRenderer.invoke("scan-real-storage"),
  readCachedStorage: () => ipcRenderer.invoke("read-cached-storage"),
  checkElevation: () => ipcRenderer.invoke("check-elevation"),
  
  // Phase 4: Resize Engine
  getSupportedSize: (params) => ipcRenderer.invoke("get-supported-size", params),
  validateResize: (params) => ipcRenderer.invoke("validate-resize", params),
  simulateResize: (params) => ipcRenderer.invoke("simulate-resize", params),
  executeResize: (params) => ipcRenderer.invoke("execute-resize", params),
  getAuditLogs: () => ipcRenderer.invoke("get-audit-logs"),

  // Phase 5: Movement Engine
  planMovement: (params) => ipcRenderer.invoke("plan-movement", params),
  validateMovement: (params) => ipcRenderer.invoke("validate-movement", params),
  simulateMovement: (params) => ipcRenderer.invoke("simulate-movement", params),
  stageWinpeMovement: (params) => ipcRenderer.invoke("stage-winpe-movement", params),
  executeMovement: (params) => ipcRenderer.invoke("execute-movement", params),
  getMovementAuditLogs: () => ipcRenderer.invoke("get-movement-audit-logs"),

  // Phase 6: Advanced Partition Operations
  formatVolume: (params) => ipcRenderer.invoke("format-volume", params),
  deletePartition: (params) => ipcRenderer.invoke("delete-partition", params),
  setDriveLetter: (params) => ipcRenderer.invoke("set-drive-letter", params),
  removeDriveLetter: (params) => ipcRenderer.invoke("remove-drive-letter", params),
  setVolumeLabel: (params) => ipcRenderer.invoke("set-volume-label", params),
  planSplitPartition: (params) => ipcRenderer.invoke("plan-split-partition", params),
  executeSplitPartition: (params) => ipcRenderer.invoke("execute-split-partition", params),
  planMergePartitions: (params) => ipcRenderer.invoke("plan-merge-partitions", params),
  executeMergePartitions: (params) => ipcRenderer.invoke("execute-merge-partitions", params),
  inspectFileSystem: (params) => ipcRenderer.invoke("inspect-filesystem", params),
  detectConfigIssues: () => ipcRenderer.invoke("detect-config-issues"),
  getAvailableDriveLetters: () => ipcRenderer.invoke("get-available-drive-letters"),
  getAdvancedAuditLogs: () => ipcRenderer.invoke("get-advanced-audit-logs")
});
