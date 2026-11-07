import React, { useState } from "react";
import { 
  Info, 
  ShieldCheck, 
  AlertTriangle, 
  Sliders, 
  KeyRound, 
  Database,
  Cpu,
  Lock,
  FolderGit2,
  Minimize2,
  Maximize2,
  Trash2,
  CheckCircle2,
  Compass,
  ArrowRight,
  Move,
  Type,
  Split,
  GitMerge,
  ShieldAlert,
  HardDrive,
  FileCode,
  Tag
} from "lucide-react";
import { analyzePartition } from "../engine/partitionAnalysisEngine";
import { isProtectedPartition, isRecoveryPartition, analyzeFileSystemDetails } from "../engine/advancedEngine";

export function PartitionInspector({ partition, disk, onAction }) {
  const [showFsDetails, setShowFsDetails] = useState(true);

  if (!partition) {
    return (
      <div className="glass-card p-6 flex flex-col items-center justify-center text-center text-slate-500">
        <Info className="w-8 h-8 text-slate-600 mb-2" />
        <p className="text-sm font-medium">No Partition Selected</p>
        <p className="text-xs text-slate-600 mt-1">
          Select a partition from the graphical map or list to inspect its low-level geometry.
        </p>
      </div>
    );
  }

  const isUnallocated = partition.category === "UNALLOCATED";
  const analysis = disk ? analyzePartition(disk, partition) : null;
  const isProtected = isProtectedPartition(partition);
  const isRecovery = isRecoveryPartition(partition);
  const fsInfo = !isUnallocated ? analyzeFileSystemDetails(partition) : null;

  // Check 1 MiB alignment (2048 sectors of 512 bytes)
  const isAligned1MiB = (partition.startLba % 2048) === 0;

  return (
    <div className="glass-card p-4 space-y-4">
      {/* Title & Category */}
      <div className="flex items-center justify-between border-b border-[#242E49] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            {partition.category === "SYSTEM" ? (
              <Cpu className="w-4 h-4" />
            ) : partition.category === "EFI" ? (
              <ShieldCheck className="w-4 h-4" />
            ) : isRecovery ? (
              <ShieldAlert className="w-4 h-4 text-purple-400" />
            ) : (
              <FolderGit2 className="w-4 h-4" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              {partition.volumeLetter ? `Volume ${partition.volumeLetter} ` : ""}
              {partition.label || "Unnamed Partition"}
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              {isUnallocated ? "Raw Free Sector Extent" : `Partition Index #${partition.partitionNumber}`}
            </p>
          </div>
        </div>

        {/* Alignment Badge */}
        <div>
          {isAligned1MiB ? (
            <span className="badge badge-healthy text-[10px]">
              <CheckCircle2 className="w-3 h-3" /> 1 MiB Aligned (Pass)
            </span>
          ) : (
            <span className="badge badge-warning text-[10px]">
              <AlertTriangle className="w-3 h-3" /> Misaligned Sector
            </span>
          )}
        </div>
      </div>

      {/* Safety Notice for System / Protected Partitions */}
      {isProtected && (
        <div className="bg-blue-500/10 border border-blue-500/25 rounded-lg p-2.5 flex items-start gap-2 text-xs text-blue-200">
          <AlertTriangle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block">Protected Windows Boot & System Partition</span>
            <span className="text-[11px] text-slate-300">
              Contains active Windows OS kernel, EFI bootloader, or MSR metadata. Formatting and deletion are locked by OpenDisk Manager's protective shields.
            </span>
          </div>
        </div>
      )}

      {partition.isBitLocker && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-2.5 flex items-start gap-2 text-xs text-amber-200">
          <KeyRound className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block">BitLocker Volume Encryption Active</span>
            <span className="text-[11px] text-slate-300">
              {partition.bitLockerStatus || "Encrypted"}. Ensure 48-digit recovery key is verified before performing operations.
            </span>
          </div>
        </div>
      )}

      {/* Phase 3 Analysis Panel: Topology & Physical Adjacency */}
      {analysis && (
        <div className="bg-[#090D18] p-3 rounded-lg border border-blue-500/20 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-blue-400 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5" /> Physical Geometry & Adjacency
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Offset: #{analysis.index + 1} of {analysis.totalExtentsCount}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-[#101628] p-2 rounded border border-[#1F2944]">
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Preceding Extent (Left)</span>
              <span className="text-slate-200 font-mono font-medium truncate block">
                {analysis.adjacent.left ? `${analysis.adjacent.left.label} (${(analysis.adjacent.left.sizeBytes / 1e9).toFixed(1)} GB)` : "Start of Disk"}
              </span>
              <span className={`text-[10px] font-semibold mt-0.5 block ${analysis.adjacent.hasLeftUnallocated ? "text-emerald-400" : "text-slate-500"}`}>
                {analysis.adjacent.hasLeftUnallocated ? "✓ Unallocated Gap" : "Allocated Partition"}
              </span>
            </div>

            <div className="bg-[#101628] p-2 rounded border border-[#1F2944]">
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Succeeding Extent (Right)</span>
              <span className="text-slate-200 font-mono font-medium truncate block">
                {analysis.adjacent.right ? `${analysis.adjacent.right.label} (${(analysis.adjacent.right.sizeBytes / 1e9).toFixed(1)} GB)` : "End of Disk"}
              </span>
              <span className={`text-[10px] font-semibold mt-0.5 block ${analysis.adjacent.hasRightUnallocated ? "text-emerald-400" : "text-slate-500"}`}>
                {analysis.adjacent.hasRightUnallocated ? "✓ Unallocated Gap" : "Allocated Partition"}
              </span>
            </div>
          </div>

          {/* Filesystem Free Space vs Physical Unallocated Space */}
          <div className="pt-1 border-t border-[#1F2944] space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Filesystem Free Space:</span>
              <span className="font-mono text-emerald-400 font-medium">
                {(analysis.fsFreeBytes / 1e9).toFixed(2)} GB
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Max Safe Shrink Boundary:</span>
              <span className="font-mono text-amber-300 font-bold">
                {(analysis.maxSupportedShrinkBytes / 1e9).toFixed(2)} GB
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Direct Extend Capacity:</span>
              <span className="font-mono text-cyan-300 font-medium">
                {(analysis.immediateExtendBytes / 1e9).toFixed(2)} GB
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Grid of Technical Properties */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-[#0D1220] p-2 rounded-lg border border-[#1E263D]">
          <span className="text-slate-500 block text-[9px] uppercase font-semibold">File System</span>
          <span className="text-white font-mono font-medium">{partition.fsType || "RAW"}</span>
          <span className="text-slate-400 text-[10px] block mt-0.5">
            Cluster: {partition.clusterSize ? `${partition.clusterSize} B` : "4096 B"}
          </span>
        </div>

        <div className="bg-[#0D1220] p-2 rounded-lg border border-[#1E263D]">
          <span className="text-slate-500 block text-[9px] uppercase font-semibold">Capacity</span>
          <span className="text-white font-mono font-medium">{((partition.sizeBytes || 0) / 1e9).toFixed(2)} GB</span>
          <span className="text-slate-400 text-[10px] block mt-0.5">
            {(partition.sizeBytes || 0).toLocaleString()} Bytes
          </span>
        </div>

        <div className="bg-[#0D1220] p-2 rounded-lg border border-[#1E263D]">
          <span className="text-slate-500 block text-[9px] uppercase font-semibold">Starting LBA</span>
          <span className="text-white font-mono">{partition.startLba.toLocaleString()}</span>
          <span className="text-slate-400 text-[10px] block mt-0.5">
            Offset: {((partition.startLba || 0) * 512).toLocaleString()} B
          </span>
        </div>

        <div className="bg-[#0D1220] p-2 rounded-lg border border-[#1E263D]">
          <span className="text-slate-500 block text-[9px] uppercase font-semibold">Ending LBA</span>
          <span className="text-white font-mono">{partition.endLba.toLocaleString()}</span>
          <span className="text-slate-400 text-[10px] block mt-0.5">
            Total Sectors: {((partition.endLba - partition.startLba + 1) || 0).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Phase 6 Feature: Detailed Filesystem & Cluster Architecture */}
      {fsInfo && (
        <div className="bg-[#0A0E1A] p-3 rounded-lg border border-[#1F2944] space-y-2 text-xs">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowFsDetails(prev => !prev)}>
            <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" /> Filesystem & Cluster Allocation
            </span>
            <span className="text-[10px] text-slate-500 hover:text-slate-300">
              {showFsDetails ? "Hide" : "Show Details"}
            </span>
          </div>

          {showFsDetails && (
            <div className="space-y-2 pt-1 border-t border-[#1C253D]">
              <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                <div className="bg-[#11172A] p-1.5 rounded">
                  <span className="text-slate-500 block text-[8px] uppercase">Total Clusters</span>
                  <span className="text-slate-200">{fsInfo.totalClusters.toLocaleString()}</span>
                </div>
                <div className="bg-[#11172A] p-1.5 rounded">
                  <span className="text-slate-500 block text-[8px] uppercase">Used Clusters</span>
                  <span className="text-emerald-400">{fsInfo.usedClusters.toLocaleString()}</span>
                </div>
                <div className="bg-[#11172A] p-1.5 rounded">
                  <span className="text-slate-500 block text-[8px] uppercase">Free Clusters</span>
                  <span className="text-cyan-400">{fsInfo.freeClusters.toLocaleString()}</span>
                </div>
              </div>

              {/* Feature capability flags */}
              <div className="flex flex-wrap gap-1 text-[9px] pt-1">
                {fsInfo.supportsCompression && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">Compression</span>
                )}
                {fsInfo.supportsSparseFiles && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">Sparse Files</span>
                )}
                {fsInfo.supportsReparsePoints && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">Reparse Points</span>
                )}
                {fsInfo.supportsHardLinks && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">Hard Links</span>
                )}
                {fsInfo.supportsEncryption && (
                  <span className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">EFS Support</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Primary Partition Actions (Resize & Move) */}
      {!isUnallocated && (
        <div className="pt-2 border-t border-[#242E49] space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Primary Operations
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            <button
              onClick={() => onAction("RESIZE_MOVE", partition)}
              className="btn btn-primary btn-sm flex-1 text-xs py-1.5"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Resize</span>
            </button>
            <button
              onClick={() => onAction("MOVE", partition)}
              className="btn btn-secondary btn-sm text-xs py-1.5"
              title="Move partition extent left or right"
            >
              <Move className="w-3.5 h-3.5 text-blue-400" />
              <span>Move</span>
            </button>
            <button
              onClick={() => onAction("SHRINK", partition)}
              className="btn btn-secondary btn-sm text-xs py-1.5"
              title="Shrink volume"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Shrink</span>
            </button>
            <button
              onClick={() => onAction("EXTEND", partition)}
              className="btn btn-secondary btn-sm text-xs py-1.5"
              title="Extend into trailing unallocated space"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Extend</span>
            </button>
          </div>

          {/* Phase 6 Advanced Partition Operations */}
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block pt-1">
            Advanced Operations (Phase 6)
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => onAction("FORMAT", partition)}
              disabled={isProtected}
              className={`btn btn-secondary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5 ${
                isProtected ? "opacity-40 cursor-not-allowed" : "hover:border-rose-500 hover:text-rose-300"
              }`}
              title={isProtected ? "Protected partition cannot be formatted." : "Format this volume with NTFS/exFAT/FAT32"}
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Format</span>
            </button>

            <button
              onClick={() => onAction("DELETE", partition)}
              disabled={isProtected}
              className={`btn btn-secondary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5 ${
                isProtected ? "opacity-40 cursor-not-allowed" : "hover:border-rose-500 hover:text-rose-400"
              }`}
              title={isProtected ? "Protected partition cannot be deleted." : "Permanently delete partition"}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
              <span>Delete</span>
            </button>

            <button
              onClick={() => onAction("LETTER", partition)}
              disabled={isProtected && partition.volumeLetter === "C:"}
              className="btn btn-secondary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5"
              title="Assign, change or remove drive letter"
            >
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              <span>Letter</span>
            </button>

            <button
              onClick={() => onAction("LABEL", partition)}
              disabled={isProtected && partition.category !== "SYSTEM"}
              className="btn btn-secondary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5"
              title="Change friendly volume label"
            >
              <Tag className="w-3.5 h-3.5 text-amber-400" />
              <span>Label</span>
            </button>

            <button
              onClick={() => onAction("SPLIT", partition)}
              disabled={isProtected}
              className={`btn btn-secondary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5 ${
                isProtected ? "opacity-40 cursor-not-allowed" : ""
              }`}
              title={isProtected ? "Protected partition cannot be split." : "Split volume into two partitions"}
            >
              <Split className="w-3.5 h-3.5 text-indigo-400" />
              <span>Split</span>
            </button>

            <button
              onClick={() => onAction("MERGE", partition)}
              disabled={isProtected}
              className={`btn btn-secondary btn-sm text-xs py-1.5 flex items-center justify-center gap-1.5 ${
                isProtected ? "opacity-40 cursor-not-allowed" : ""
              }`}
              title={isProtected ? "Protected partition cannot be merged." : "Merge adjacent partition into this volume"}
            >
              <GitMerge className="w-3.5 h-3.5 text-emerald-400" />
              <span>Merge</span>
            </button>
          </div>
        </div>
      )}

      {isUnallocated && (
        <div className="pt-2 border-t border-[#242E49]">
          <button
            onClick={() => onAction("CREATE", partition)}
            className="btn btn-primary btn-sm w-full py-2"
          >
            <span>+ Create New Partition in this Space</span>
          </button>
        </div>
      )}
    </div>
  );
}
