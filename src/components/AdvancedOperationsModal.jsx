import React, { useState, useEffect } from "react";
import {
  X,
  AlertTriangle,
  ShieldAlert,
  HardDrive,
  CheckCircle2,
  Sliders,
  Type,
  FolderGit2,
  Trash2,
  Layers,
  ArrowRight,
  GitMerge,
  Split,
  FileCode,
  Lock,
  Compass,
  Info
} from "lucide-react";

import {
  isProtectedPartition,
  isRecoveryPartition,
  validateFormat,
  validateDelete,
  validateDriveLetter,
  validateRemoveDriveLetter,
  validateVolumeLabel,
  validateSplit,
  validateMerge,
  getAvailableDriveLetters,
  executeFormat,
  executeDelete,
  setDriveLetter,
  removeDriveLetter,
  setVolumeLabel,
  planSplitPartition,
  executeSplitPartition,
  planMergePartitions,
  executeMergePartitions
} from "../engine/advancedEngine";

export function AdvancedOperationsModal({
  isOpen,
  onClose,
  initialMode = "FORMAT", // FORMAT, DELETE, LETTER, LABEL, SPLIT, MERGE
  partition,
  disk,
  allDisks = [],
  onStageOperation,
  onOperationSuccess
}) {
  const [activeTab, setActiveTab] = useState(initialMode);

  // Format fields
  const [formatFs, setFormatFs] = useState("NTFS");
  const [formatLabel, setFormatLabel] = useState("");
  const [formatCluster, setFormatCluster] = useState(4096);
  const [formatQuick, setFormatQuick] = useState(true);

  // Label fields
  const [newLabelText, setNewLabelText] = useState("");

  // Drive letter fields
  const [targetLetter, setTargetLetter] = useState("");
  const [removeLetterMode, setRemoveLetterMode] = useState(false);

  // Split fields
  const [splitSizeGb, setSplitSizeGb] = useState(10);
  const [splitFs, setSplitFs] = useState("NTFS");
  const [splitLabel, setSplitLabel] = useState("New_Volume");
  const [splitLetter, setSplitLetter] = useState("");

  // Merge fields
  const [selectedSourcePartNumber, setSelectedSourcePartNumber] = useState(null);
  const [preserveMergeData, setPreserveMergeData] = useState(true);

  // Confirmation & Preflight state
  const [validationResult, setValidationResult] = useState(null);
  const [userConfirmCode, setUserConfirmCode] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState(null);
  const [executionSuccess, setExecutionSuccess] = useState(null);

  // Initialize defaults on partition change or modal open
  useEffect(() => {
    if (partition) {
      setFormatLabel(partition.label || "Volume");
      setNewLabelText(partition.label || "");
      const currentLetter = (partition.volumeLetter || "").replace(":", "").trim().toUpperCase();
      
      const { available } = getAvailableDriveLetters(allDisks);
      setTargetLetter(available[0] || "Z");
      setSplitLetter(available[0] || "Z");

      // Set default source partition for merge (first eligible adjacent partition on same disk)
      if (disk && disk.partitions) {
        const adjacentPart = disk.partitions.find(p => 
          p.partitionNumber !== partition.partitionNumber &&
          p.category !== "UNALLOCATED" &&
          !isProtectedPartition(p) &&
          !isRecoveryPartition(p) &&
          Math.abs((partition.endLba + 1) - p.startLba) <= 2048
        );
        if (adjacentPart) {
          setSelectedSourcePartNumber(adjacentPart.partitionNumber);
        } else {
          setSelectedSourcePartNumber(null);
        }
      }
    }
    setActiveTab(initialMode);
    setUserConfirmCode("");
    setExecutionError(null);
    setExecutionSuccess(null);
  }, [partition, disk, initialMode, isOpen]);

  // Recalculate validation whenever options change
  useEffect(() => {
    if (!partition || !disk) return;

    let res = null;
    if (activeTab === "FORMAT") {
      res = validateFormat(partition, disk, {
        fileSystem: formatFs,
        label: formatLabel,
        clusterSize: formatCluster,
        quickFormat: formatQuick
      });
    } else if (activeTab === "DELETE") {
      res = validateDelete(partition, disk);
    } else if (activeTab === "LETTER") {
      if (removeLetterMode) {
        res = validateRemoveDriveLetter(partition, disk);
      } else {
        res = validateDriveLetter(partition, disk, allDisks, targetLetter);
      }
    } else if (activeTab === "LABEL") {
      res = validateVolumeLabel(partition, disk, newLabelText);
    } else if (activeTab === "SPLIT") {
      res = validateSplit(partition, disk, splitSizeGb, {
        fileSystem: splitFs,
        label: splitLabel,
        targetDriveLetter: splitLetter
      }, allDisks);
    } else if (activeTab === "MERGE") {
      const sourcePart = (disk.partitions || []).find(p => p.partitionNumber === Number(selectedSourcePartNumber));
      res = validateMerge(partition, sourcePart, disk, preserveMergeData);
    }

    setValidationResult(res);
  }, [
    activeTab,
    partition,
    disk,
    allDisks,
    formatFs,
    formatLabel,
    formatCluster,
    formatQuick,
    newLabelText,
    targetLetter,
    removeLetterMode,
    splitSizeGb,
    splitFs,
    splitLabel,
    splitLetter,
    selectedSourcePartNumber,
    preserveMergeData
  ]);

  if (!isOpen || !partition || !disk) return null;

  const isProtected = isProtectedPartition(partition);
  const isRecovery = isRecoveryPartition(partition);
  const letter = (partition.volumeLetter || "").replace(":", "").trim().toUpperCase();
  const { available: availableLetters, inUse: inUseLetters } = getAvailableDriveLetters(allDisks);

  // Direct Execution Handler
  const handleExecute = async () => {
    if (!validationResult || !validationResult.canExecute) return;
    if (validationResult.expectedConfirmationCode && userConfirmCode !== validationResult.expectedConfirmationCode) {
      setExecutionError(`Confirmation code does not match '${validationResult.expectedConfirmationCode}'.`);
      return;
    }

    setIsExecuting(true);
    setExecutionError(null);
    setExecutionSuccess(null);

    try {
      let result = null;
      if (activeTab === "FORMAT") {
        result = await executeFormat({
          diskNumber: disk.id,
          partitionNumber: partition.partitionNumber,
          targetFileSystem: formatFs,
          targetLabel: formatLabel,
          targetAllocationUnitSize: formatCluster,
          quickFormat: formatQuick,
          confirmed: true,
          confirmationCode: userConfirmCode
        });
      } else if (activeTab === "DELETE") {
        result = await executeDelete({
          diskNumber: disk.id,
          partitionNumber: partition.partitionNumber,
          confirmed: true,
          confirmationCode: userConfirmCode
        });
      } else if (activeTab === "LETTER") {
        if (removeLetterMode) {
          result = await removeDriveLetter({
            diskNumber: disk.id,
            partitionNumber: partition.partitionNumber,
            confirmed: true
          });
        } else {
          result = await setDriveLetter({
            diskNumber: disk.id,
            partitionNumber: partition.partitionNumber,
            targetDriveLetter: targetLetter,
            confirmed: true
          });
        }
      } else if (activeTab === "LABEL") {
        result = await setVolumeLabel({
          diskNumber: disk.id,
          partitionNumber: partition.partitionNumber,
          targetLabel: newLabelText,
          confirmed: true
        });
      } else if (activeTab === "SPLIT") {
        result = await executeSplitPartition({
          diskNumber: disk.id,
          partitionNumber: partition.partitionNumber,
          splitSizeBytes: Math.floor(splitSizeGb * 1e9),
          targetFileSystem: splitFs,
          targetLabel: splitLabel,
          targetDriveLetter: splitLetter,
          confirmed: true,
          confirmationCode: userConfirmCode
        });
      } else if (activeTab === "MERGE") {
        result = await executeMergePartitions({
          diskNumber: disk.id,
          targetPartitionNumber: partition.partitionNumber,
          sourcePartitionNumber: Number(selectedSourcePartNumber),
          preserveSourceData: preserveMergeData,
          confirmed: true,
          confirmationCode: userConfirmCode
        });
      }

      if (result && (result.success !== false && result.status !== "EXECUTION_FAILED" && !result.error)) {
        setExecutionSuccess(result.message || "Operation completed successfully!");
        if (onOperationSuccess) onOperationSuccess(result);
      } else {
        setExecutionError(result?.error || "Operation failed to execute.");
      }
    } catch (err) {
      setExecutionError(err.message || "Execution exception occurred.");
    } finally {
      setIsExecuting(false);
    }
  };

  // Staging handler to add to Operations Queue
  const handleStageToQueue = () => {
    if (!validationResult || !validationResult.canExecute) return;
    if (onStageOperation) {
      let title = "";
      let action = "";
      if (activeTab === "FORMAT") {
        action = "FORMAT_VOLUME";
        title = `Format Volume ${letter || "#" + partition.partitionNumber} with ${formatFs} (${formatLabel})`;
      } else if (activeTab === "DELETE") {
        action = "DELETE_PARTITION";
        title = `Delete Partition #${partition.partitionNumber} (${(partition.sizeBytes / 1e9).toFixed(1)} GB)`;
      } else if (activeTab === "LETTER") {
        action = removeLetterMode ? "REMOVE_DRIVE_LETTER" : "SET_DRIVE_LETTER";
        title = removeLetterMode ? `Remove drive letter from Partition #${partition.partitionNumber}` : `Assign drive letter ${targetLetter}: to Partition #${partition.partitionNumber}`;
      } else if (activeTab === "LABEL") {
        action = "SET_VOLUME_LABEL";
        title = `Set label of Volume #${partition.partitionNumber} to "${newLabelText}"`;
      } else if (activeTab === "SPLIT") {
        action = "SPLIT_PARTITION";
        title = `Split Partition #${partition.partitionNumber} to allocate ${splitSizeGb} GB into new ${splitFs} volume`;
      } else if (activeTab === "MERGE") {
        action = "MERGE_PARTITIONS";
        title = `Merge Partition #${selectedSourcePartNumber} into Target Partition #${partition.partitionNumber}`;
      }

      onStageOperation({
        id: `op-${Date.now()}`,
        action,
        title,
        diskId: disk.id,
        partitionId: partition.id,
        details: validationResult.consequences ? validationResult.consequences.join(" ") : "",
        status: "PENDING",
        severity: activeTab === "DELETE" || activeTab === "FORMAT" ? "HIGH_RISK" : "SAFE",
        timestamp: new Date().toISOString()
      });
      onClose();
    }
  };

  const tabs = [
    { id: "FORMAT", label: "Format Volume", icon: Trash2 },
    { id: "DELETE", label: "Delete Partition", icon: ShieldAlert },
    { id: "LETTER", label: "Drive Letter", icon: Compass },
    { id: "LABEL", label: "Change Label", icon: Type },
    { id: "SPLIT", label: "Split Partition", icon: Split },
    { id: "MERGE", label: "Merge Adjacent", icon: GitMerge }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="glass-card w-full max-w-2xl overflow-hidden border border-[#2B3554] shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#0D1222] border-b border-[#242E49] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Advanced Partition Operations</span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/40 font-mono">
                  Disk {disk.id} · Part #{partition.partitionNumber} {letter ? `(${letter}:)` : ""}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Preflight verified operations with safety guardrails and audit recording.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-[#1E263D] bg-[#090D18] px-3 pt-2 gap-1 overflow-x-auto select-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setUserConfirmCode("");
                  setExecutionError(null);
                  setExecutionSuccess(null);
                }}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-t-lg transition-all border-t border-x ${
                  isActive
                    ? "bg-[#10172A] text-blue-400 border-[#2A375A] border-b-transparent shadow"
                    : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-[#12192F]"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-blue-400" : "text-slate-500"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Protected Partition Warning if active */}
          {isProtected && (
            <div className="bg-rose-500/15 border border-rose-500/30 rounded-lg p-3 text-xs text-rose-200 flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Protected Windows System Volume</span>
                <span className="text-[11px] text-rose-300">
                  This volume is critical to Windows 11 boot and stability. Destructive operations (Format, Delete, Splitting, Merging, changing boot letter) are strictly locked to protect the operating system.
                </span>
              </div>
            </div>
          )}

          {/* TAB 1: FORMAT VOLUME */}
          {activeTab === "FORMAT" && (
            <div className="space-y-4 text-xs">
              <div className="bg-[#0B0F1C] p-3.5 rounded-lg border border-[#1E2742] space-y-3">
                <span className="text-[11px] font-bold uppercase text-slate-300 block">Format Configuration</span>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">File System:</label>
                    <select
                      value={formatFs}
                      onChange={(e) => setFormatFs(e.target.value)}
                      disabled={isProtected}
                      className="w-full bg-[#141C33] border border-[#263359] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                    >
                      <option value="NTFS">NTFS (Recommended for Windows)</option>
                      <option value="exFAT">exFAT (Cross-platform compatibility)</option>
                      <option value="FAT32">FAT32 (Legacy & UEFI compatible, max 32GB)</option>
                      <option value="ReFS">ReFS (Resilient File System)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Allocation Unit (Cluster) Size:</label>
                    <select
                      value={formatCluster}
                      onChange={(e) => setFormatCluster(Number(e.target.value))}
                      disabled={isProtected}
                      className="w-full bg-[#141C33] border border-[#263359] rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                    >
                      <option value={4096}>4096 Bytes (Default / Standard 4KB)</option>
                      <option value={8192}>8192 Bytes (8KB)</option>
                      <option value={16384}>16 KB</option>
                      <option value={32768}>32 KB</option>
                      <option value={65536}>64 KB (High-throughput large files)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Volume Label (Name):</label>
                  <input
                    type="text"
                    value={formatLabel}
                    onChange={(e) => setFormatLabel(e.target.value)}
                    disabled={isProtected}
                    maxLength={formatFs === "NTFS" ? 32 : 11}
                    placeholder="e.g. Storage_Drive"
                    className="w-full bg-[#141C33] border border-[#263359] rounded px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Max {formatFs === "NTFS" ? "32" : "11"} characters. No illegal characters (&lt; &gt; : " / \ | ? *).
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="quickFormatCheck"
                    checked={formatQuick}
                    onChange={(e) => setFormatQuick(e.target.checked)}
                    disabled={isProtected}
                    className="rounded bg-[#141C33] border-[#263359] text-blue-500"
                  />
                  <label htmlFor="quickFormatCheck" className="text-slate-300 cursor-pointer">
                    Perform a quick format (fast initialization without sector zeroing)
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DELETE PARTITION */}
          {activeTab === "DELETE" && (
            <div className="space-y-4 text-xs">
              <div className="bg-rose-950/20 border border-rose-900/40 p-4 rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Permanent Partition Deletion</span>
                </div>
                <p className="text-slate-300 text-xs">
                  Deleting this partition will permanently remove its entry from the {disk.partitionStyle || "GPT"} partition table and revert its entire <span className="font-bold text-white font-mono">{((partition.sizeBytes || 0) / 1e9).toFixed(1)} GB</span> extent into <span className="text-amber-400 font-bold">Unallocated Space</span>.
                </p>
                {isRecovery && (
                  <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
                    Warning: This partition contains the Windows Recovery Environment (WinRE). Deleting it will disable built-in boot repair features.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DRIVE LETTER */}
          {activeTab === "LETTER" && (
            <div className="space-y-4 text-xs">
              <div className="bg-[#0B0F1C] p-4 rounded-lg border border-[#1E2742] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-bold">Volume Drive Letter Configuration</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setRemoveLetterMode(false)}
                      className={`px-2 py-1 rounded text-[11px] font-semibold ${
                        !removeLetterMode ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      Assign / Change
                    </button>
                    <button
                      onClick={() => setRemoveLetterMode(true)}
                      className={`px-2 py-1 rounded text-[11px] font-semibold ${
                        removeLetterMode ? "bg-rose-600 text-white" : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      Remove Letter
                    </button>
                  </div>
                </div>

                {!removeLetterMode ? (
                  <div>
                    <label className="text-slate-400 block mb-1">Select New Drive Letter:</label>
                    <div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5 max-h-40 overflow-y-auto p-1.5 bg-[#080C16] rounded border border-[#1A233A]">
                      {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((ch) => {
                        const isInUse = inUseLetters.some(x => x.letter === ch);
                        const isCurrent = letter === ch;
                        const isSelected = targetLetter === ch;
                        const isForbiddenC = ch === "C";

                        return (
                          <button
                            key={ch}
                            disabled={isInUse || isForbiddenC}
                            onClick={() => setTargetLetter(ch)}
                            className={`p-1.5 text-center rounded font-mono text-xs font-bold transition-all ${
                              isSelected
                                ? "bg-blue-600 text-white ring-2 ring-blue-400"
                                : isCurrent
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                : isInUse || isForbiddenC
                                ? "bg-slate-900 text-slate-600 cursor-not-allowed border border-slate-800"
                                : "bg-[#141C33] text-slate-200 hover:bg-blue-600/30 border border-[#253257]"
                            }`}
                            title={isCurrent ? "Current Letter" : isInUse ? "In Use" : isForbiddenC ? "Reserved for Windows OS" : "Available"}
                          >
                            {ch}:
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Green = Current · Blue = Selected · Dark Gray = In Use
                    </span>
                  </div>
                ) : (
                  <div className="bg-amber-500/10 border border-amber-500/25 p-3 rounded text-amber-200 text-xs">
                    Removing drive letter <span className="font-bold font-mono">{letter}:</span> will hide the volume from Windows Explorer without destroying any files.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: CHANGE VOLUME LABEL */}
          {activeTab === "LABEL" && (
            <div className="space-y-4 text-xs">
              <div className="bg-[#0B0F1C] p-4 rounded-lg border border-[#1E2742] space-y-3">
                <span className="text-slate-300 font-bold block">Update Volume Label</span>
                <div>
                  <label className="text-slate-400 block mb-1">New Volume Name:</label>
                  <input
                    type="text"
                    value={newLabelText}
                    onChange={(e) => setNewLabelText(e.target.value)}
                    maxLength={32}
                    placeholder="Enter new label"
                    className="w-full bg-[#141C33] border border-[#263359] rounded px-3 py-2 text-white font-medium text-xs focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Current: "{partition.label || "Unnamed"}" · Max 32 characters for NTFS.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SPLIT PARTITION */}
          {activeTab === "SPLIT" && (
            <div className="space-y-4 text-xs">
              <div className="bg-[#0B0F1C] p-4 rounded-lg border border-[#1E2742] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-bold">Split into Two Discrete Volumes</span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    Total: {((partition.sizeBytes || 0) / 1e9).toFixed(1)} GB
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Allocated to New Volume:</span>
                    <span className="font-bold font-mono text-cyan-400">{splitSizeGb} GB</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={Math.max(1, Math.floor(((partition.sizeBytes || 0) - (partition.usedBytes || 0) - 5e9) / 1e9))}
                    value={splitSizeGb}
                    onChange={(e) => setSplitSizeGb(Number(e.target.value))}
                    disabled={isProtected}
                    className="w-full accent-cyan-400"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                    <span>Retained in Original: {Math.max(0, (((partition.sizeBytes || 0) / 1e9) - splitSizeGb)).toFixed(1)} GB</span>
                    <span>New Volume: {splitSizeGb} GB</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#1E2742]">
                  <div>
                    <label className="text-slate-400 block mb-1 text-[10px]">New File System:</label>
                    <select
                      value={splitFs}
                      onChange={(e) => setSplitFs(e.target.value)}
                      className="w-full bg-[#141C33] border border-[#263359] rounded px-2 py-1 text-white text-xs"
                    >
                      <option value="NTFS">NTFS</option>
                      <option value="exFAT">exFAT</option>
                      <option value="FAT32">FAT32</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 text-[10px]">New Volume Label:</label>
                    <input
                      type="text"
                      value={splitLabel}
                      onChange={(e) => setSplitLabel(e.target.value)}
                      className="w-full bg-[#141C33] border border-[#263359] rounded px-2 py-1 text-white text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 text-[10px]">New Drive Letter:</label>
                    <select
                      value={splitLetter}
                      onChange={(e) => setSplitLetter(e.target.value)}
                      className="w-full bg-[#141C33] border border-[#263359] rounded px-2 py-1 text-white text-xs font-mono"
                    >
                      {availableLetters.map(ch => (
                        <option key={ch} value={ch}>{ch}:</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: MERGE PARTITIONS */}
          {activeTab === "MERGE" && (
            <div className="space-y-4 text-xs">
              <div className="bg-[#0B0F1C] p-4 rounded-lg border border-[#1E2742] space-y-3">
                <span className="text-slate-300 font-bold block">Merge Contiguous Adjacent Partitions</span>
                <p className="text-slate-400 text-[11px]">
                  Target Partition <span className="font-bold text-white">#{partition.partitionNumber} {letter ? `(${letter}:)` : ""}</span> will absorb the selected adjacent source partition.
                </p>

                <div>
                  <label className="text-slate-400 block mb-1">Select Contiguous Source Partition to Absorb:</label>
                  <select
                    value={selectedSourcePartNumber || ""}
                    onChange={(e) => setSelectedSourcePartNumber(e.target.value)}
                    className="w-full bg-[#141C33] border border-[#263359] rounded px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Choose adjacent partition --</option>
                    {(disk.partitions || [])
                      .filter(p => p.partitionNumber !== partition.partitionNumber && p.category !== "UNALLOCATED")
                      .map(p => (
                        <option key={p.id} value={p.partitionNumber}>
                          Partition #{p.partitionNumber} ({p.volumeLetter || "No Letter"} - {p.label}) · {((p.sizeBytes || 0) / 1e9).toFixed(1)} GB
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="preserveDataCheck"
                    checked={preserveMergeData}
                    onChange={(e) => setPreserveMergeData(e.target.checked)}
                    className="rounded bg-[#141C33] border-[#263359] text-blue-500"
                  />
                  <label htmlFor="preserveDataCheck" className="text-slate-300 cursor-pointer">
                    Preserve source files (auto-consolidate into target folder before deletion)
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Preflight Validation Result Panel */}
          {validationResult && (
            <div className={`p-3.5 rounded-lg border text-xs space-y-2 ${
              validationResult.canExecute 
                ? "bg-blue-950/20 border-blue-500/30 text-blue-200" 
                : "bg-rose-950/25 border-rose-500/30 text-rose-200"
            }`}>
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-[11px]">
                  {validationResult.canExecute ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Preflight Validation Passed</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <span className="text-rose-400">Operation Blocked</span>
                    </>
                  )}
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  Status: {validationResult.status}
                </span>
              </div>

              {!validationResult.canExecute && (
                <p className="text-rose-300 font-medium text-xs">
                  {validationResult.error}
                </p>
              )}

              {/* Execution Steps */}
              {validationResult.steps && validationResult.steps.length > 0 && (
                <div className="pt-2 border-t border-[#232F4C] space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Execution Sequence:</span>
                  <ul className="space-y-1 text-[11px] font-mono text-slate-300">
                    {validationResult.steps.map((st, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <ArrowRight className="w-3 h-3 text-cyan-400 shrink-0 mt-0.5" />
                        <span>{st}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Consequences */}
              {validationResult.consequences && validationResult.consequences.length > 0 && (
                <div className="pt-2 border-t border-[#232F4C] space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Consequences:</span>
                  <ul className="space-y-0.5 text-[11px] text-slate-300 list-disc list-inside">
                    {validationResult.consequences.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Explicit Confirmation Code Prompt if code is expected */}
              {validationResult.expectedConfirmationCode && (
                <div className="pt-2.5 border-t border-[#232F4C] space-y-1.5">
                  <label className="text-[11px] font-bold text-white block">
                    Type Confirmation Code to Unlock:{" "}
                    <span className="text-amber-400 font-mono select-all bg-[#080D1A] px-1.5 py-0.5 rounded border border-amber-500/40">
                      {validationResult.expectedConfirmationCode}
                    </span>
                  </label>
                  <input
                    type="text"
                    value={userConfirmCode}
                    onChange={(e) => setUserConfirmCode(e.target.value.trim())}
                    placeholder={`Type ${validationResult.expectedConfirmationCode}`}
                    className="w-full bg-[#0D1322] border border-[#2B3859] rounded px-3 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                  />
                </div>
              )}
            </div>
          )}

          {/* Feedback Alerts */}
          {executionError && (
            <div className="bg-rose-500/20 border border-rose-500/40 p-3 rounded text-rose-200 text-xs">
              {executionError}
            </div>
          )}
          {executionSuccess && (
            <div className="bg-emerald-500/20 border border-emerald-500/40 p-3 rounded text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{executionSuccess}</span>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-5 py-3 bg-[#0B0F1C] border-t border-[#242E49] flex items-center justify-between">
          <button
            onClick={onClose}
            className="btn btn-secondary btn-sm"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleStageToQueue}
              disabled={!validationResult || !validationResult.canExecute || isExecuting}
              className="btn btn-secondary btn-sm"
              title="Add operation to pending operations queue"
            >
              + Stage to Queue
            </button>

            <button
              onClick={handleExecute}
              disabled={
                !validationResult ||
                !validationResult.canExecute ||
                isExecuting ||
                (validationResult.expectedConfirmationCode && userConfirmCode !== validationResult.expectedConfirmationCode)
              }
              className={`btn btn-sm ${
                activeTab === "DELETE" || activeTab === "FORMAT" ? "btn-danger" : "btn-primary"
              }`}
            >
              {isExecuting ? (
                <span>Executing...</span>
              ) : (
                <span>Execute Operation Now</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

