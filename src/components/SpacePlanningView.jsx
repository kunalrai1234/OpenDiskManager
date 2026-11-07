import React, { useState, useMemo } from "react";
import { 
  GitFork, 
  ArrowRight, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Lock, 
  ShieldAlert, 
  Sliders, 
  Database, 
  Cpu, 
  Layers, 
  Sparkles, 
  Info, 
  RefreshCw,
  Move,
  Minimize2,
  Maximize2,
  ListTree,
  AlertCircle
} from "lucide-react";
import { 
  planSpaceTransfer, 
  analyzePartition, 
  FEASIBILITY_STATUS 
} from "../engine/partitionAnalysisEngine";

export function SpacePlanningView({ 
  disks, 
  onStageOperation,
  onNavigateToQueue
}) {
  // Disks must exist
  const firstDisk = disks[0] || null;
  const secondDisk = disks[1] || null;

  // Selected source & target
  // Default to Source: D: (or part 5), Target: C: (part 3) on host
  const defaultSource = firstDisk?.partitions?.find(p => p.volumeLetter === "D:") || 
                        firstDisk?.partitions?.[firstDisk.partitions.length - 2] || 
                        firstDisk?.partitions?.[0];

  const defaultTarget = firstDisk?.partitions?.find(p => p.volumeLetter === "C:") || 
                        firstDisk?.partitions?.[2] || 
                        firstDisk?.partitions?.[0];

  const [sourceDiskId, setSourceDiskId] = useState(firstDisk?.id ?? 0);
  const [sourcePartId, setSourcePartId] = useState(defaultSource?.id || "");
  const [targetDiskId, setTargetDiskId] = useState(firstDisk?.id ?? 0);
  const [targetPartId, setTargetPartId] = useState(defaultTarget?.id || "");
  const [transferAmountGb, setTransferAmountGb] = useState(25);
  const [stagedNotice, setStagedNotice] = useState(null);

  // Quick preset test scenarios
  const applyPresetScenario = (scenarioKey) => {
    setStagedNotice(null);
    if (scenarioKey === "d_to_c") {
      // Transfer 25 GB from D: to C: on Disk 0 (Requires partition movement of WinRE)
      setSourceDiskId(0);
      const dPart = firstDisk?.partitions?.find(p => p.volumeLetter === "D:") || firstDisk?.partitions?.[4];
      if (dPart) setSourcePartId(dPart.id);
      setTargetDiskId(0);
      const cPart = firstDisk?.partitions?.find(p => p.volumeLetter === "C:") || firstDisk?.partitions?.[2];
      if (cPart) setTargetPartId(cPart.id);
      setTransferAmountGb(25);
    } else if (scenarioKey === "gap_to_d") {
      // Extend D: into adjacent unallocated gap 1 (Directly extendable)
      setSourceDiskId(0);
      const gapPart = firstDisk?.partitions?.find(p => p.id === "disk0-unalloc-gap1" || p.category === "UNALLOCATED");
      if (gapPart) setSourcePartId(gapPart.id);
      setTargetDiskId(0);
      const dPart = firstDisk?.partitions?.find(p => p.volumeLetter === "D:") || firstDisk?.partitions?.[4];
      if (dPart) setTargetPartId(dPart.id);
      setTransferAmountGb(20);
    } else if (scenarioKey === "cross_disk") {
      // Attempt to transfer from Disk 1 (or mock secondary) to Disk 0 (Cross-disk rejection)
      setSourceDiskId(1);
      setSourcePartId("disk1-part1");
      setTargetDiskId(0);
      const cPart = firstDisk?.partitions?.find(p => p.volumeLetter === "C:") || firstDisk?.partitions?.[2];
      if (cPart) setTargetPartId(cPart.id);
      setTransferAmountGb(30);
    } else if (scenarioKey === "refs_shrink") {
      // Attempt to shrink ReFS
      setSourceDiskId(0);
      setSourcePartId(defaultSource?.id || "");
      setTargetDiskId(0);
      setTargetPartId(defaultTarget?.id || "");
      setTransferAmountGb(10);
    } else if (scenarioKey === "excessive_shrink") {
      // Attempt to shrink more than available free space
      setSourceDiskId(0);
      const cPart = firstDisk?.partitions?.find(p => p.volumeLetter === "C:") || firstDisk?.partitions?.[2];
      if (cPart) setSourcePartId(cPart.id);
      setTargetDiskId(0);
      const dPart = firstDisk?.partitions?.find(p => p.volumeLetter === "D:") || firstDisk?.partitions?.[4];
      if (dPart) setTargetPartId(dPart.id);
      setTransferAmountGb(150); // C: only has ~29.9 GB free
    }
  };

  // Run the Partition Analysis Engine live on every state change
  const planResult = useMemo(() => {
    return planSpaceTransfer({
      allDisks: disks,
      sourceDiskId: parseInt(sourceDiskId, 10),
      sourcePartitionId: sourcePartId,
      targetDiskId: parseInt(targetDiskId, 10),
      targetPartitionId: targetPartId,
      transferAmountGb: parseFloat(transferAmountGb) || 0
    });
  }, [disks, sourceDiskId, sourcePartId, targetDiskId, targetPartId, transferAmountGb]);

  // Source and Target metadata
  const currentSourceDisk = disks.find(d => d.id === parseInt(sourceDiskId, 10));
  const currentTargetDisk = disks.find(d => d.id === parseInt(targetDiskId, 10));
  const currentSourcePart = currentSourceDisk?.partitions?.find(p => p.id === sourcePartId);
  const currentTargetPart = currentTargetDisk?.partitions?.find(p => p.id === targetPartId);

  const sourceAnalysis = useMemo(() => {
    if (!currentSourceDisk || !currentSourcePart) return null;
    return analyzePartition(currentSourceDisk, currentSourcePart);
  }, [currentSourceDisk, currentSourcePart]);

  const targetAnalysis = useMemo(() => {
    if (!currentTargetDisk || !currentTargetPart) return null;
    return analyzePartition(currentTargetDisk, currentTargetPart);
  }, [currentTargetDisk, currentTargetPart]);

  // Stage proposed plan into operations queue
  const handleStagePlan = () => {
    if (!planResult || !planResult.success || !planResult.dag) return;

    let stagedCount = 0;
    planResult.dag.forEach(step => {
      onStageOperation({
        id: `op-plan-${Date.now()}-${step.step}`,
        action: step.action,
        title: `Plan Step ${step.step}: ${step.action.replace(/_/g, " ")} (${step.targetName})`,
        diskId: sourceDiskId,
        partitionId: step.targetId,
        targetLbaRange: step.direction,
        currentSizeGb: 0,
        targetSizeGb: 0,
        deltaGb: step.deltaGb,
        severity: step.risk === "HIGH" ? "HIGH" : step.risk === "MODERATE" ? "MODERATE" : "SAFE",
        status: "PENDING",
        details: step.details
      });
      stagedCount++;
    });

    setStagedNotice(`Successfully staged ${stagedCount} discrete operations into the Operations Queue!`);
  };

  // Feasibility status badge styling
  const renderStatusBadge = (status) => {
    switch (status) {
      case FEASIBILITY_STATUS.DIRECTLY_EXTENDABLE:
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>DIRECTLY EXTENDABLE — Online FSCTL_EXTEND_VOLUME</span>
          </div>
        );
      case FEASIBILITY_STATUS.REQUIRES_PARTITION_MOVEMENT:
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold text-xs">
            <Move className="w-4 h-4 text-amber-400 shrink-0" />
            <span>REQUIRES PARTITION MOVEMENT — Intermediate Extents Must Shift</span>
          </div>
        );
      case FEASIBILITY_STATUS.REQUIRES_OFFLINE_OPERATION:
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-semibold text-xs">
            <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>REQUIRES OFFLINE OPERATION — WinPE Staging Required for Boot/Locked Files</span>
          </div>
        );
      case FEASIBILITY_STATUS.NOT_SUPPORTED:
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 font-semibold text-xs">
            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>NOT SUPPORTED — Operation Violates Physical/Filesystem Invariants</span>
          </div>
        );
      case FEASIBILITY_STATUS.UNSAFE:
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500/40 text-red-300 font-semibold text-xs">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            <span>UNSAFE — BitLocker or Protected System Partition Collision</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* View Header */}
      <div className="glass-card p-5 border-l-4 border-l-blue-500 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <GitFork className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-white tracking-wide">
              Partition Analysis & Space Planning Engine
            </h2>
            <span className="badge badge-system text-[10px] font-mono">PHASE 3 ACTIVE</span>
            <span className="badge badge-healthy text-[10px] font-mono">STRICT READ-ONLY</span>
          </div>
          <p className="text-xs text-slate-400 max-w-3xl">
            Simulate moving, shrinking, and extending volumes across physical LBA sectors. 
            Determines exact partition ordering, distinguishes filesystem free space from physical unallocated blocks, 
            and compiles an immutable Directed Acyclic Graph (DAG) of discrete operations.
          </p>
        </div>

        {/* Preset quick test buttons */}
        <div className="flex flex-col gap-1.5 shrink-0">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
            Quick Test Scenarios
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button 
              onClick={() => applyPresetScenario("d_to_c")}
              className="px-2.5 py-1 text-[11px] font-medium bg-[#131A2D] hover:bg-[#1E2742] text-blue-300 border border-blue-500/30 rounded"
              title="Transfer 25 GB from D: to C: on NVMe (Moves WinRE)"
            >
              D: → C: (25 GB)
            </button>
            <button 
              onClick={() => applyPresetScenario("gap_to_d")}
              className="px-2.5 py-1 text-[11px] font-medium bg-[#131A2D] hover:bg-[#1E2742] text-emerald-300 border border-emerald-500/30 rounded"
              title="Extend D: into adjacent 26 GB unallocated gap"
            >
              Gap 1 → D: (Direct)
            </button>
            <button 
              onClick={() => applyPresetScenario("cross_disk")}
              className="px-2.5 py-1 text-[11px] font-medium bg-[#131A2D] hover:bg-[#1E2742] text-rose-300 border border-rose-500/30 rounded"
              title="Attempt transfer from Disk 1 to Disk 0 (Hard Rejection)"
            >
              Cross-Disk (Invalid)
            </button>
            <button 
              onClick={() => applyPresetScenario("excessive_shrink")}
              className="px-2.5 py-1 text-[11px] font-medium bg-[#131A2D] hover:bg-[#1E2742] text-amber-300 border border-amber-500/30 rounded"
              title="Attempt to shrink beyond free space"
            >
              Excessive Shrink
            </button>
          </div>
        </div>
      </div>

      {/* Primary Invariant Notice Banner */}
      <div className="bg-[#0D1322] border border-blue-500/20 rounded-xl p-3.5 flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-white block">
            Physical Drive Boundary & Filesystem Allocation Invariants
          </span>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            <strong className="text-blue-300">1. Cross-Disk Invariant:</strong> Partitions can only expand within contiguous physical LBA sectors on the same physical drive (<code className="text-cyan-300">PhysicalDriveN</code>). Space cannot cross drive hardware boundaries under GPT/MBR basic disks.
            <br />
            <strong className="text-blue-300">2. Free Space vs. Unallocated Sectors:</strong> A partition showing 90 GB of "filesystem free space" cannot be absorbed by another partition until that source partition is shrunk via <code className="text-cyan-300">FSCTL_SHRINK_VOLUME</code> to create genuine unallocated disk sectors.
          </p>
        </div>
      </div>

      {/* Main Interactive Controls: Source, Target, Amount */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card 1: Source Partition */}
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#242E49] pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                1. Source Space Provider
              </h3>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">SHRINK / ABSORB</span>
          </div>

          {/* Disk Selector for Source */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Physical Drive:</label>
            <select 
              value={sourceDiskId} 
              onChange={(e) => {
                const newDId = parseInt(e.target.value, 10);
                setSourceDiskId(newDId);
                const d = disks.find(x => x.id === newDId);
                if (d && d.partitions.length > 0) setSourcePartId(d.partitions[0].id);
              }}
              className="w-full bg-[#090D16] border border-[#242E49] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              {disks.map(d => (
                <option key={d.id} value={d.id}>
                  PhysicalDrive{d.id} ({d.model} — {(d.totalSizeBytes / 1e9).toFixed(1)} GB)
                </option>
              ))}
            </select>
          </div>

          {/* Partition Selector for Source */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Partition / Unallocated Extent:</label>
            <select 
              value={sourcePartId} 
              onChange={(e) => setSourcePartId(e.target.value)}
              className="w-full bg-[#090D16] border border-[#242E49] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
            >
              {currentSourceDisk?.partitions?.map(p => {
                const isUnalloc = p.category === "UNALLOCATED";
                const sizeGb = (p.sizeBytes / 1e9).toFixed(2);
                const freeGb = p.usedBytes !== undefined ? ((p.sizeBytes - p.usedBytes) / 1e9).toFixed(2) : sizeGb;
                return (
                  <option key={p.id} value={p.id}>
                    {isUnalloc 
                      ? `[Unallocated Gap] ${sizeGb} GB (${p.label})` 
                      : `${p.volumeLetter || "Part"} ${p.label} (${sizeGb} GB, ${freeGb} GB Free)`}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Source Analysis Summary Box */}
          {sourceAnalysis && (
            <div className="bg-[#0B0F1A] p-2.5 rounded-lg border border-[#1E263D] space-y-1 text-[11px]">
              <div className="flex justify-between text-slate-400">
                <span>Category:</span>
                <span className="font-semibold text-white">{currentSourcePart?.category}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>FS Free Space:</span>
                <span className="font-mono text-emerald-400">
                  {(sourceAnalysis.fsFreeBytes / 1e9).toFixed(2)} GB
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Max Safe Shrink Capacity:</span>
                <span className="font-mono font-bold text-amber-300">
                  {(sourceAnalysis.maxSupportedShrinkBytes / 1e9).toFixed(2)} GB
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Starting LBA:</span>
                <span className="font-mono text-slate-300">{sourceAnalysis.startLba.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Card 2: Target Partition */}
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#242E49] pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                2. Target Partition to Expand
              </h3>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">EXTEND / RECEIVE</span>
          </div>

          {/* Disk Selector for Target */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Physical Drive:</label>
            <select 
              value={targetDiskId} 
              onChange={(e) => {
                const newDId = parseInt(e.target.value, 10);
                setTargetDiskId(newDId);
                const d = disks.find(x => x.id === newDId);
                if (d && d.partitions.length > 0) setTargetPartId(d.partitions[0].id);
              }}
              className="w-full bg-[#090D16] border border-[#242E49] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              {disks.map(d => (
                <option key={d.id} value={d.id}>
                  PhysicalDrive{d.id} ({d.model} — {(d.totalSizeBytes / 1e9).toFixed(1)} GB)
                </option>
              ))}
            </select>
          </div>

          {/* Partition Selector for Target */}
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Target Partition:</label>
            <select 
              value={targetPartId} 
              onChange={(e) => setTargetPartId(e.target.value)}
              className="w-full bg-[#090D16] border border-[#242E49] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
            >
              {currentTargetDisk?.partitions?.filter(p => p.category !== "UNALLOCATED").map(p => {
                const sizeGb = (p.sizeBytes / 1e9).toFixed(2);
                return (
                  <option key={p.id} value={p.id}>
                    {p.volumeLetter ? `[${p.volumeLetter}] ` : ""}{p.label} ({sizeGb} GB — {p.fsType})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Target Analysis Summary Box */}
          {targetAnalysis && (
            <div className="bg-[#0B0F1A] p-2.5 rounded-lg border border-[#1E263D] space-y-1 text-[11px]">
              <div className="flex justify-between text-slate-400">
                <span>Current Capacity:</span>
                <span className="font-mono text-white">{(targetAnalysis.sizeBytes / 1e9).toFixed(2)} GB</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Direct Adjacent Unallocated:</span>
                <span className="font-mono text-cyan-300">
                  {(targetAnalysis.immediateExtendBytes / 1e9).toFixed(2)} GB
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Is Boot / System:</span>
                <span className="font-semibold text-blue-300">
                  {targetAnalysis.isSystemBoot ? "YES (Windows C:)" : "NO (Data Volume)"}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Ending LBA:</span>
                <span className="font-mono text-slate-300">{targetAnalysis.endLba.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Card 3: Space Transfer Amount */}
        <div className="glass-card p-4 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#242E49] pb-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  3. Space Allocation Amount
                </h3>
              </div>
              <span className="font-mono font-bold text-blue-400 text-sm">{transferAmountGb} GB</span>
            </div>

            {/* Numeric input & Slider */}
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>Transfer Quantity:</span>
                  <span className="font-mono font-semibold text-white">{transferAmountGb} GB</span>
                </div>
                <input 
                  type="range"
                  min="1"
                  max="120"
                  step="1"
                  value={transferAmountGb}
                  onChange={(e) => setTransferAmountGb(parseFloat(e.target.value))}
                  className="w-full accent-blue-500 cursor-pointer"
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="grid grid-cols-4 gap-1.5">
                {[5, 10, 25, 50].map(val => (
                  <button
                    key={val}
                    onClick={() => setTransferAmountGb(val)}
                    className={`py-1 rounded text-xs font-mono font-medium border ${
                      transferAmountGb === val 
                        ? "bg-blue-600/30 text-blue-300 border-blue-500" 
                        : "bg-[#0A0E1A] hover:bg-[#151D33] text-slate-300 border-[#242E49]"
                    }`}
                  >
                    +{val} GB
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Staging Action */}
          <div className="pt-2">
            <button
              onClick={handleStagePlan}
              disabled={!planResult || !planResult.success}
              className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                planResult && planResult.success
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/20"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
              }`}
            >
              <ListTree className="w-4 h-4" />
              <span>Stage Proposed Plan into Queue</span>
            </button>
            {stagedNotice && (
              <p className="text-[11px] text-emerald-400 text-center mt-2 font-medium">
                {stagedNotice}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Analysis Output: Feasibility Status & Invariant Check */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#242E49] pb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white">Engine Feasibility Assessment</h3>
            <span className="text-xs text-slate-400">
              (Live AST & Topological Dependency Evaluator)
            </span>
          </div>

          {/* Status Badge */}
          {renderStatusBadge(planResult.status)}
        </div>

        {/* If Rejected or Not Supported */}
        {!planResult.success && (
          <div className="bg-rose-500/15 border border-rose-500/35 rounded-xl p-4 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-rose-200 uppercase tracking-wide">
                {planResult.errorTitle}
              </h4>
              <p className="text-xs text-rose-300/90 leading-relaxed">
                {planResult.errorMessage}
              </p>
              {sourceDiskId !== targetDiskId && (
                <div className="mt-2 text-[11px] bg-rose-950/40 border border-rose-800/40 p-2.5 rounded font-mono text-rose-200">
                  Rule Violation: Partition table entries on PhysicalDrive{sourceDiskId} cannot point to sector offsets on PhysicalDrive{targetDiskId}. Space cannot span independent storage controllers.
                </div>
              )}
            </div>
          </div>
        )}

        {/* If Successful: Intermediate Partitions & Physical Layout Flow */}
        {planResult.success && (
          <div className="space-y-4">
            {/* Physical Order Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-[#0C101D] p-3 rounded-lg border border-[#1E263D]">
                <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                  Geometric Alignment
                </span>
                <span className="text-white font-medium block">
                  {planResult.isTargetPreceding 
                    ? "Target (Left) ← Intermediates ← Source (Right)" 
                    : "Source (Left) → Intermediates → Target (Right)"}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Shift Direction: {planResult.isTargetPreceding ? "Towards High LBA (Right)" : "Towards Low LBA (Left)"}
                </span>
              </div>

              <div className="bg-[#0C101D] p-3 rounded-lg border border-[#1E263D]">
                <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                  Obstacle Count
                </span>
                <span className={`font-medium block ${planResult.intermediatePartitions.length > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  {planResult.intermediatePartitions.length} Intermediate Extents Situated Between
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {planResult.intermediatePartitions.length > 0 ? "Must be physically shifted" : "Direct adjacent expansion"}
                </span>
              </div>

              <div className="bg-[#0C101D] p-3 rounded-lg border border-[#1E263D]">
                <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                  Execution Runtime
                </span>
                <span className="text-white font-medium block">
                  {planResult.requiresWinPE ? "Requires WinPE Reboot" : "100% Online Win32 Execution"}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {planResult.hasBitLockerRisk ? "TPM Suspension Required" : "No TPM / Encryption Interference"}
                </span>
              </div>
            </div>

            {/* Intermediate Partitions List */}
            {planResult.intermediatePartitions.length > 0 && (
              <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                  <Move className="w-4 h-4 text-amber-400" />
                  <span>Physical Intermediate Partitions to be Relocated:</span>
                </div>
                <div className="space-y-1.5">
                  {planResult.intermediatePartitions.map((p, idx) => (
                    <div 
                      key={p.id}
                      className="flex items-center justify-between bg-[#0C101D] px-3 py-2 rounded border border-[#232D48] text-xs font-mono"
                    >
                      <div className="flex items-center gap-2 text-white">
                        <span className="text-slate-500">#{idx + 1}</span>
                        <span className="font-semibold">{p.label}</span>
                        <span className="text-slate-400 text-[11px]">({p.category})</span>
                        {p.category === "RECOVERY" && (
                          <span className="badge badge-warning text-[9px]">WinRE Protected</span>
                        )}
                      </div>
                      <div className="text-slate-400 text-[11px]">
                        LBA {p.startLba.toLocaleString()} → {p.endLba.toLocaleString()} ({(p.sizeBytes / 1e9).toFixed(2)} GB)
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Operation Dependency Graph (DAG) */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ListTree className="w-4 h-4 text-blue-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Compiled Operation Dependency Graph (DAG)
                  </h4>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Total Discrete Phases: {planResult.dag.length}
                </span>
              </div>

              {/* Visual Graph Steps */}
              <div className="space-y-2.5">
                {planResult.dag.map((step, idx) => {
                  const isShrink = step.action.includes("SHRINK");
                  const isMove = step.action.includes("MOVE");
                  const isExtend = step.action.includes("EXTEND") || step.action.includes("GROW");

                  return (
                    <div key={step.id} className="relative">
                      {/* Connector Arrow */}
                      {idx > 0 && (
                        <div className="flex justify-center -my-1 text-slate-600">
                          <span className="text-xs font-mono">↓</span>
                        </div>
                      )}

                      <div className="bg-[#0D1222] border border-[#242E49] hover:border-blue-500/40 rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all">
                        <div className="flex items-start md:items-center gap-3">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                            isShrink 
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" 
                              : isMove 
                              ? "bg-blue-500/20 text-blue-300 border border-blue-500/40" 
                              : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          }`}>
                            {step.step}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-white">
                                {step.action.replace(/_/g, " ")}
                              </span>
                              <span className="text-[11px] font-semibold text-blue-400">
                                ➔ {step.targetName}
                              </span>
                              {step.requiresLock && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded">
                                  <Lock className="w-2.5 h-2.5" /> Requires Lock
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {step.details}
                            </p>
                          </div>
                        </div>

                        {/* Badges on Right */}
                        <div className="flex items-center gap-2 self-end md:self-auto shrink-0 font-mono text-[11px]">
                          <span className="px-2 py-0.5 rounded bg-[#161D32] text-slate-300 border border-[#242E49]">
                            {step.direction}
                          </span>
                          <span className={`px-2 py-0.5 rounded font-bold ${
                            step.risk === "HIGH" 
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" 
                              : step.risk === "MODERATE"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          }`}>
                            {step.risk} RISK
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

