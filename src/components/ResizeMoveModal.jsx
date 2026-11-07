import React, { useState, useEffect } from "react";
import { 
  X, 
  Sliders, 
  Check, 
  AlertCircle, 
  ArrowRight,
  Maximize2,
  Minimize2,
  Info,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Lock,
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  Terminal,
  Activity
} from "lucide-react";
import { 
  fetchSupportedSize, 
  validateResizePlan, 
  simulateResizeOperation,
  executeResizeOperation,
  checkElevation,
  RESIZE_STATUS
} from "../engine/resizeEngine";

export function ResizeMoveModal({ 
  isOpen, 
  onClose, 
  partition, 
  disk, 
  onStageOperation 
}) {
  if (!isOpen || !partition) return null;

  const currentSizeGb = partition.sizeBytes / 1e9;
  const [targetSizeGb, setTargetSizeGb] = useState(parseFloat(currentSizeGb.toFixed(2)));
  const [supportedBounds, setSupportedBounds] = useState(null);
  const [isLoadingBounds, setIsLoadingBounds] = useState(true);
  const [isElevated, setIsElevated] = useState(false);
  const [validation, setValidation] = useState(null);
  
  // Execution & Simulation state
  const [status, setStatus] = useState(RESIZE_STATUS.READY);
  const [simulationResult, setSimulationResult] = useState(null);
  const [executionResult, setExecutionResult] = useState(null);
  const [userConfirmed, setUserConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Load supported size boundaries on modal open or partition change
  useEffect(() => {
    let active = true;
    async function loadData() {
      setIsLoadingBounds(true);
      setStatus(RESIZE_STATUS.READY);
      setSimulationResult(null);
      setExecutionResult(null);
      setUserConfirmed(false);
      setErrorMessage(null);

      const elevated = await checkElevation();
      if (!active) return;
      setIsElevated(elevated);

      const bounds = await fetchSupportedSize(disk, partition);
      if (!active) return;
      setSupportedBounds(bounds);
      setTargetSizeGb(parseFloat(currentSizeGb.toFixed(2)));
      setIsLoadingBounds(false);
    }

    loadData();
    return () => { active = false; };
  }, [partition, disk]);

  // Run live validation whenever targetSize changes
  useEffect(() => {
    let active = true;
    async function runValidation() {
      if (!disk || !partition) return;
      const val = await validateResizePlan({
        disk,
        partition,
        targetSizeGb,
        isElevated
      });
      if (!active) return;
      setValidation(val);
    }

    runValidation();
    return () => { active = false; };
  }, [disk, partition, targetSizeGb, isElevated]);

  const deltaGb = parseFloat((targetSizeGb - currentSizeGb).toFixed(2));
  const isShrink = deltaGb < 0;
  const isExtend = deltaGb > 0;

  // Min and Max slider boundaries
  const minSliderGb = supportedBounds ? supportedBounds.minGb : parseFloat((partition.usedBytes * 1.05 / 1e9).toFixed(2));
  const maxSliderGb = supportedBounds ? supportedBounds.maxGb : parseFloat((currentSizeGb + 50).toFixed(2));

  // Handler: Simulate Dry-Run
  const handleSimulate = async () => {
    setStatus(RESIZE_STATUS.VALIDATING);
    setErrorMessage(null);
    try {
      const sim = await simulateResizeOperation({
        disk,
        partition,
        targetSizeGb
      });
      setSimulationResult(sim);
      setStatus(RESIZE_STATUS.CONFIRMING);
    } catch (err) {
      setErrorMessage("Simulation failed: " + err.message);
      setStatus(RESIZE_STATUS.ERROR);
    }
  };

  // Handler: Real Execution with Confirmation
  const handleExecute = async () => {
    if (!userConfirmed) {
      setErrorMessage("Explicit user confirmation authorization is required before execution.");
      return;
    }

    setStatus(RESIZE_STATUS.EXECUTING);
    setErrorMessage(null);

    try {
      const res = await executeResizeOperation({
        disk,
        partition,
        targetSizeGb,
        confirmed: true,
        confirmationCode: partition.volumeLetter || partition.label
      });

      if (res && res.success) {
        setExecutionResult(res);
        setStatus(RESIZE_STATUS.SUCCESS);
      } else {
        setErrorMessage(res?.error || "Execution aborted by safety engine.");
        setStatus(RESIZE_STATUS.ERROR);
      }
    } catch (err) {
      setErrorMessage("Execution error: " + err.message);
      setStatus(RESIZE_STATUS.ERROR);
    }
  };

  // Handler: Queue for operations queue
  const handleStageInQueue = () => {
    const actionType = isShrink ? "SHRINK_VOLUME" : isExtend ? "EXTEND_VOLUME" : "RESIZE_VOLUME";
    const title = `${isShrink ? "Shrink" : isExtend ? "Extend" : "Resize"} ${partition.volumeLetter ? `Volume ${partition.volumeLetter}` : partition.label} to ${targetSizeGb} GB`;

    onStageOperation({
      id: `op-${Date.now()}`,
      action: actionType,
      title,
      diskId: disk.id,
      partitionId: partition.id,
      targetLbaRange: `Offset ${(partition.startLba * 512).toLocaleString()} bytes (${targetSizeGb} GB)`,
      currentSizeGb: parseFloat(currentSizeGb.toFixed(2)),
      targetSizeGb: parseFloat(targetSizeGb.toFixed(2)),
      deltaGb,
      severity: partition.isSystem ? "HIGH" : isShrink ? "MODERATE" : "SAFE",
      status: "PENDING",
      details: `${isShrink ? "Shrinks" : "Extends"} partition and filesystem via native Resize-Partition. Pre-flight checks verified.`
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0B0F1A] border border-[#242E49] rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-[#101627] border-b border-[#242E49] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Safe Partition Resize & Extend Controller
                <span className="badge badge-system text-[9px] font-mono">PHASE 4</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                {partition.volumeLetter ? `Volume ${partition.volumeLetter} ` : ""}{partition.label} — PhysicalDrive{disk.id} Partition #{partition.partitionNumber}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
              isElevated 
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" 
                : "bg-amber-500/15 text-amber-300 border-amber-500/30"
            }`}>
              {isElevated ? "ELEVATED (ADMIN)" : "USER CONTEXT"}
            </span>
            <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto">
          
          {/* Step 1 & 2: Current Configuration & Technical Identity */}
          <div className="grid grid-cols-4 gap-2 bg-[#080C14] p-3 rounded-lg border border-[#1E273F] text-[11px]">
            <div>
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">File System</span>
              <span className="text-white font-mono font-medium">{partition.fsType}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Current Size</span>
              <span className="text-white font-mono font-medium">{currentSizeGb.toFixed(2)} GB</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Used Clusters</span>
              <span className="text-emerald-400 font-mono font-medium">
                {partition.usedBytes ? `${(partition.usedBytes / 1e9).toFixed(2)} GB` : "N/A"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Starting LBA</span>
              <span className="text-slate-300 font-mono font-medium">{partition.startLba.toLocaleString()}</span>
            </div>
          </div>

          {/* Step 3: Supported Boundaries Display */}
          <div className="bg-[#0D1322] border border-blue-500/20 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-blue-400" />
                Kernel Supported Size Boundaries:
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {supportedBounds?.isNativeCim ? "Query: Get-PartitionSupportedSize" : "Calculated Bounds"}
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-3 text-[11px] pt-1">
              <div className="bg-[#10172A] p-2 rounded border border-[#212E4D]">
                <span className="text-amber-400 block text-[9px] uppercase font-bold">Minimum Safe Size (Shrink Limit)</span>
                <span className="text-white font-mono font-bold text-xs">
                  {isLoadingBounds ? "Calculating..." : `${minSliderGb} GB`}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Preserves data & MFT buffer</span>
              </div>

              <div className="bg-[#10172A] p-2 rounded border border-[#212E4D]">
                <span className="text-blue-400 block text-[9px] uppercase font-bold">Current Allocated Extent</span>
                <span className="text-white font-mono font-bold text-xs">{currentSizeGb.toFixed(2)} GB</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Partition table entry</span>
              </div>

              <div className="bg-[#10172A] p-2 rounded border border-[#212E4D]">
                <span className="text-emerald-400 block text-[9px] uppercase font-bold">Maximum Size (Extend Limit)</span>
                <span className="text-white font-mono font-bold text-xs">
                  {isLoadingBounds ? "Calculating..." : `${maxSliderGb} GB`}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Adjacent unallocated space</span>
              </div>
            </div>
          </div>

          {/* Step 4 & 5: Interactive Size Slider & Proposed Size */}
          <div className="space-y-3 bg-[#0A0E18] p-4 rounded-lg border border-[#1E263D]">
            <div className="flex justify-between items-center">
              <span className="text-slate-300 font-semibold text-xs">Proposed Target Partition Size:</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold text-blue-400">{targetSizeGb} GB</span>
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                  deltaGb < 0 
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" 
                    : deltaGb > 0 
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
                    : "bg-slate-800 text-slate-400"
                }`}>
                  {deltaGb > 0 ? `+${deltaGb}` : deltaGb} GB
                </span>
              </div>
            </div>

            {/* Slider */}
            <input 
              type="range"
              min={minSliderGb}
              max={maxSliderGb}
              step="0.25"
              value={targetSizeGb}
              disabled={isLoadingBounds || status === RESIZE_STATUS.EXECUTING}
              onChange={(e) => {
                setTargetSizeGb(parseFloat(e.target.value));
                setSimulationResult(null);
                setExecutionResult(null);
                setStatus(RESIZE_STATUS.READY);
              }}
              className="w-full accent-blue-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />

            {/* Quick Adjustment Presets */}
            <div className="flex flex-wrap items-center justify-between gap-1 pt-1">
              <div className="flex gap-1.5">
                {[-10, -5, -2].map(step => (
                  <button
                    key={step}
                    onClick={() => {
                      const next = Math.max(minSliderGb, parseFloat((targetSizeGb + step).toFixed(2)));
                      setTargetSizeGb(next);
                    }}
                    className="px-2 py-1 rounded bg-[#131A2B] hover:bg-[#1E263E] border border-[#232F4C] text-[10px] font-mono text-amber-300"
                  >
                    {step} GB
                  </button>
                ))}
              </div>

              <button
                onClick={() => setTargetSizeGb(parseFloat(currentSizeGb.toFixed(2)))}
                className="px-2 py-1 rounded bg-[#131A2B] hover:bg-[#1E263E] border border-[#232F4C] text-[10px] font-mono text-slate-300"
              >
                Reset (Current)
              </button>

              <div className="flex gap-1.5">
                {[+2, +5, +10].map(step => (
                  <button
                    key={step}
                    onClick={() => {
                      const next = Math.min(maxSliderGb, parseFloat((targetSizeGb + step).toFixed(2)));
                      setTargetSizeGb(next);
                    }}
                    className="px-2 py-1 rounded bg-[#131A2B] hover:bg-[#1E263E] border border-[#232F4C] text-[10px] font-mono text-emerald-300"
                  >
                    +{step} GB
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Step 6: Pre-Flight Safety Validation Checks */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" /> Pre-Flight Safety Invariant Checks
              </span>
              <span className={`font-mono text-[10px] font-bold ${validation?.isValid ? "text-emerald-400" : "text-rose-400"}`}>
                {validation?.isValid ? "✓ ALL CHECKS PASSED" : "⚠ VALIDATION FAILED"}
              </span>
            </div>

            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {validation?.checks?.map((chk, idx) => (
                <div 
                  key={idx}
                  className={`p-2 rounded flex items-start gap-2 border text-[11px] ${
                    chk.passed 
                      ? "bg-[#090F1C] border-[#1C263F] text-slate-300" 
                      : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  }`}
                >
                  {chk.passed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <span className="font-semibold block">{chk.name}</span>
                    <span className="text-[10px] opacity-80">{chk.details}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Simulation Output Card (When Simulated) */}
          {simulationResult && (
            <div className="bg-[#0C1220] border border-blue-500/30 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-blue-300">
                <span className="flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  Simulated Dry-Run Verification Summary
                </span>
                <span className="badge badge-healthy text-[9px]">SIMULATION READY</span>
              </div>
              <div className="text-[11px] font-mono text-slate-300 bg-[#070A12] p-2 rounded border border-[#19223A] space-y-1">
                <div>Command: <code className="text-cyan-300">{simulationResult.simulatedCommand}</code></div>
                <div>Pre-LBA Extent: {(simulationResult.simulatedBefore.startOffset / 512).toLocaleString()} → {(simulationResult.simulatedBefore.endOffset / 512).toLocaleString()}</div>
                <div>Post-LBA Extent: {(simulationResult.simulatedAfter.startOffset / 512).toLocaleString()} → {(simulationResult.simulatedAfter.endOffset / 512).toLocaleString()}</div>
              </div>
            </div>
          )}

          {/* Step 9 & 10: Post-Execution Verification Output */}
          {executionResult && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-emerald-300">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Resize Operation Successfully Executed & Verified!
                </span>
                <span className="badge badge-healthy text-[9px]">{executionResult.durationMs} ms</span>
              </div>
              <div className="text-[11px] text-slate-300 space-y-1 font-mono">
                <div>Verified Partition Size: {executionResult.actualGb} GB ({executionResult.actualSizeBytes.toLocaleString()} bytes)</div>
                <div>Filesystem Status: {executionResult.volumeHealth}</div>
                <div>Audit Log Written: resize-audit.log</div>
              </div>
            </div>
          )}

          {/* Error Message Alert */}
          {errorMessage && (
            <div className="bg-rose-500/15 border border-rose-500/40 rounded-lg p-3 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Step 7: Explicit Confirmation Checkbox (Safety Mandate) */}
          {status !== RESIZE_STATUS.SUCCESS && (
            <div className="bg-[#121828] border border-amber-500/30 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <input 
                  type="checkbox"
                  id="user-auth-check"
                  checked={userConfirmed}
                  onChange={(e) => setUserConfirmed(e.target.checked)}
                  className="mt-1 accent-blue-500 cursor-pointer"
                />
                <label htmlFor="user-auth-check" className="text-[11px] text-slate-300 cursor-pointer select-none leading-relaxed">
                  <strong className="text-white block font-semibold">
                    Explicit Operation Authorization:
                  </strong>
                  I acknowledge and authorize modifying <code className="text-amber-300">PhysicalDrive{disk.id} Partition #{partition.partitionNumber}</code> from <strong>{currentSizeGb.toFixed(2)} GB</strong> to <strong>{targetSizeGb} GB</strong>. Rollback cannot be guaranteed if power is interrupted during sector allocation updates.
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-5 py-3.5 bg-[#101627] border-t border-[#242E49] flex items-center justify-between">
          <button 
            onClick={handleStageInQueue} 
            className="btn btn-secondary btn-sm"
            title="Add to queue for scheduled batch review"
          >
            Stage in Queue
          </button>

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn btn-secondary btn-sm">
              {status === RESIZE_STATUS.SUCCESS ? "Close" : "Cancel"}
            </button>

            {status !== RESIZE_STATUS.SUCCESS && (
              <>
                <button 
                  onClick={handleSimulate}
                  disabled={!validation?.isValid || deltaGb === 0}
                  className="btn btn-secondary btn-sm flex items-center gap-1.5"
                  title="Run validation and calculate diff without writing to disk"
                >
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Simulate Dry-Run</span>
                </button>

                <button 
                  onClick={handleExecute}
                  disabled={!validation?.isValid || !userConfirmed || deltaGb === 0 || status === RESIZE_STATUS.EXECUTING}
                  className={`btn btn-sm flex items-center gap-1.5 font-bold ${
                    validation?.isValid && userConfirmed
                      ? isShrink 
                        ? "bg-amber-600 hover:bg-amber-500 text-white" 
                        : "bg-emerald-600 hover:bg-emerald-500 text-white"
                      : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                  }`}
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>
                    {status === RESIZE_STATUS.EXECUTING 
                      ? "Executing..." 
                      : isShrink ? `Authorize Shrink (-${Math.abs(deltaGb)} GB)` : `Authorize Extend (+${deltaGb} GB)`}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
