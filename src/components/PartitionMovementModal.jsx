import React, { useState, useEffect } from "react";
import { 
  X, 
  Move, 
  Sliders, 
  Check, 
  AlertCircle, 
  ArrowRight, 
  ArrowLeft,
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  Lock, 
  Terminal, 
  Activity, 
  Layers, 
  CheckCircle2, 
  XCircle, 
  Play, 
  Clock,
  Sparkles,
  RefreshCw,
  HardDrive
} from "lucide-react";
import { 
  planMovement, 
  validateMovement, 
  simulateMovement, 
  stageWinpeMovement, 
  executeMovement,
  MOVEMENT_STATUS 
} from "../engine/movementEngine";

export function PartitionMovementModal({ 
  isOpen, 
  onClose, 
  partition, 
  disk, 
  onStageOperation 
}) {
  if (!isOpen || !partition) return null;

  const currentSizeGb = partition.sizeBytes / 1e9;
  const [shiftDeltaGb, setShiftDeltaGb] = useState(0);
  const [plan, setPlan] = useState(null);
  const [validation, setValidation] = useState(null);
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);
  
  // Safety acknowledgments
  const [acknowledgeBackup, setAcknowledgeBackup] = useState(false);
  const [userConfirmed, setUserConfirmed] = useState(false);
  
  // Status and results
  const [status, setStatus] = useState(MOVEMENT_STATUS.READY);
  const [simulationResult, setSimulationResult] = useState(null);
  const [executionResult, setExecutionResult] = useState(null);
  const [stagedWinpeResult, setStagedWinpeResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Load initial plan
  useEffect(() => {
    let active = true;
    async function loadInitial() {
      setIsLoadingPlan(true);
      setStatus(MOVEMENT_STATUS.READY);
      setSimulationResult(null);
      setExecutionResult(null);
      setStagedWinpeResult(null);
      setAcknowledgeBackup(false);
      setUserConfirmed(false);
      setErrorMessage(null);

      // Default shift: if partition has adjacent unallocated space on right, suggest +10GB
      const p = await planMovement({ disk, partition, shiftDeltaGb: 0 });
      if (!active) return;
      setPlan(p);
      setIsLoadingPlan(false);
    }

    loadInitial();
    return () => { active = false; };
  }, [partition, disk]);

  // Re-plan and re-validate whenever shiftDeltaGb or acknowledgeBackup changes
  useEffect(() => {
    let active = true;
    async function updatePlan() {
      if (!disk || !partition) return;
      const p = await planMovement({ disk, partition, shiftDeltaGb });
      if (!active) return;
      setPlan(p);

      const v = await validateMovement({
        disk,
        partition,
        shiftDeltaGb,
        acknowledgeBackup
      });
      if (!active) return;
      setValidation(v);
    }

    updatePlan();
    return () => { active = false; };
  }, [disk, partition, shiftDeltaGb, acknowledgeBackup]);

  // Max shift bounds based on available adjacent unallocated gaps
  const maxRightShiftGb = plan ? plan.availableGapGb : 25;

  // Handlers
  const handleSimulate = async () => {
    setStatus(MOVEMENT_STATUS.SIMULATING);
    setErrorMessage(null);
    try {
      const sim = await simulateMovement({
        disk,
        partition,
        shiftDeltaGb,
        acknowledgeBackup
      });
      setSimulationResult(sim);
      setStatus(MOVEMENT_STATUS.CONFIRMING);
    } catch (err) {
      setErrorMessage("Simulation error: " + err.message);
      setStatus(MOVEMENT_STATUS.ERROR);
    }
  };

  const handleStageWinpe = async () => {
    setStatus(MOVEMENT_STATUS.STAGING);
    setErrorMessage(null);
    try {
      const res = await stageWinpeMovement({
        disk,
        partition,
        shiftDeltaGb,
        acknowledgeBackup
      });
      if (res && res.success) {
        setStagedWinpeResult(res);
        setStatus(MOVEMENT_STATUS.SUCCESS);
      } else {
        setErrorMessage(res?.error || "WinPE staging failed.");
        setStatus(MOVEMENT_STATUS.ERROR);
      }
    } catch (err) {
      setErrorMessage("Staging error: " + err.message);
      setStatus(MOVEMENT_STATUS.ERROR);
    }
  };

  const handleExecute = async () => {
    if (!acknowledgeBackup || !userConfirmed) {
      setErrorMessage("Both backup acknowledgment and explicit authorization are required.");
      return;
    }

    setStatus(MOVEMENT_STATUS.CONFIRMING);
    setErrorMessage(null);

    try {
      const res = await executeMovement({
        disk,
        partition,
        shiftDeltaGb,
        confirmed: true,
        confirmationCode: partition.volumeLetter || partition.label,
        acknowledgeBackup: true
      });

      if (res && res.success) {
        setExecutionResult(res);
        setStatus(MOVEMENT_STATUS.SUCCESS);
      } else {
        setErrorMessage(res?.error || "Movement aborted by safety engine.");
        setStatus(MOVEMENT_STATUS.ERROR);
      }
    } catch (err) {
      setErrorMessage("Execution error: " + err.message);
      setStatus(MOVEMENT_STATUS.ERROR);
    }
  };

  const handleStageInQueue = () => {
    onStageOperation({
      id: `op-mov-${Date.now()}`,
      action: "MOVE_PARTITION_SECTOR_EXTENT",
      title: `Move ${partition.volumeLetter ? `Volume ${partition.volumeLetter}` : partition.label} (${shiftDeltaGb > 0 ? `+${shiftDeltaGb} GB Right` : `${shiftDeltaGb} GB Left`})`,
      diskId: disk.id,
      partitionId: partition.id,
      targetLbaRange: `Target LBA ${plan?.geometry?.targetStartLba?.toLocaleString()} (${plan?.shiftDirection})`,
      currentSizeGb: parseFloat(currentSizeGb.toFixed(2)),
      targetSizeGb: parseFloat(currentSizeGb.toFixed(2)),
      deltaGb: 0,
      severity: plan?.requiresWinPE ? "HIGH" : "MODERATE",
      status: "PENDING",
      details: `Sector displacement: ${plan?.shiftDirection} via ${plan?.copyOrder}. Recalculates NTFS VBR and GPT CRC32.`
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0B0F1A] border border-[#242E49] rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-[#101627] border-b border-[#242E49] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Move className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Partition Movement & Relocation Controller
                <span className="badge badge-system text-[9px] font-mono">PHASE 5</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                {partition.volumeLetter ? `Volume ${partition.volumeLetter} ` : ""}{partition.label} — PhysicalDrive{disk.id} Partition #{partition.partitionNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
              plan?.requiresWinPE 
                ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" 
                : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
            }`}>
              {plan?.requiresWinPE ? "REQUIRES WINPE" : "ONLINE LOCKED"}
            </span>
            <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto">
          
          {/* Complete Backup Warning Banner */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-amber-200 block text-xs">
                MANDATORY PRE-REQUISITE: COMPLETE BACKUP ADVISORY
              </span>
              <p className="text-[11px] text-amber-300/80 leading-relaxed">
                Relocating physical partition sectors copies millions of raw data blocks, updates the NTFS Volume Boot Record (VBR) hidden sectors, and rewrites Primary and Secondary GPT tables. 
                <strong> Rollback cannot be guaranteed in the event of power loss during sector relocation.</strong> Ensure all critical files are backed up to external media prior to committing.
              </p>
            </div>
          </div>

          {/* Extent Movement Geometry & Visual Bar */}
          <div className="space-y-2 bg-[#090D18] p-4 rounded-xl border border-[#1E2740]">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-white uppercase tracking-wider text-[10px]">
                Geometric LBA Displacement
              </span>
              <span className="font-mono text-blue-400 font-bold">
                {shiftDeltaGb > 0 ? `+${shiftDeltaGb} GB Right` : shiftDeltaGb < 0 ? `${shiftDeltaGb} GB Left` : "0 GB (Current Position)"}
              </span>
            </div>

            {/* Visual Extent Movement Simulation Bar */}
            <div className="w-full h-10 bg-[#060912] border border-[#242E49] rounded-lg p-1 flex items-center gap-1 font-mono text-[11px]">
              {shiftDeltaGb > 0 && (
                <div 
                  style={{ width: `${Math.min(shiftDeltaGb * 3, 30)}%` }}
                  className="h-full rounded pattern-unallocated flex items-center justify-center text-[10px] text-slate-500"
                >
                  +{shiftDeltaGb}GB Gap
                </div>
              )}

              <div className="h-full flex-1 rounded bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-between px-3 text-white">
                <span>{partition.label}</span>
                <span className="font-bold">{(partition.sizeBytes / 1e9).toFixed(1)} GB</span>
              </div>

              {shiftDeltaGb < 0 && (
                <div 
                  style={{ width: `${Math.min(Math.abs(shiftDeltaGb) * 3, 30)}%` }}
                  className="h-full rounded pattern-unallocated flex items-center justify-center text-[10px] text-slate-500"
                >
                  {shiftDeltaGb}GB
                </div>
              )}
            </div>

            {/* Shift Slider */}
            <div className="pt-2 space-y-2">
              <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                <span>Shift Left (Lower LBA)</span>
                <span>In-Place</span>
                <span>Shift Right (Higher LBA)</span>
              </div>
              <input 
                type="range"
                min="0"
                max={Math.max(1, maxRightShiftGb)}
                step="1"
                value={shiftDeltaGb}
                disabled={isLoadingPlan || status === MOVEMENT_STATUS.CONFIRMING}
                onChange={(e) => {
                  setShiftDeltaGb(parseFloat(e.target.value));
                  setSimulationResult(null);
                  setExecutionResult(null);
                  setStagedWinpeResult(null);
                  setStatus(MOVEMENT_STATUS.READY);
                }}
                className="w-full accent-blue-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
            </div>

            {/* Geometry Details */}
            {plan && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#1C253B] text-[11px] font-mono">
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase">Current Starting LBA</span>
                  <span className="text-slate-200">{plan.geometry.currentStartLba.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase">Target Starting LBA (1 MiB Aligned)</span>
                  <span className="text-emerald-400 font-bold">{plan.geometry.targetStartLba.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase">Overlap Copy Strategy</span>
                  <span className="text-amber-300 font-semibold">{plan.copyOrder}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase">Adjacent Free Gap</span>
                  <span className="text-cyan-300">{plan.availableGapGb} GB</span>
                </div>
              </div>
            )}
          </div>

          {/* Pre-Flight Invariant Safety Checks */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" /> Movement Invariant Verifications
              </span>
              <span className={`font-mono text-[10px] font-bold ${validation?.isValid ? "text-emerald-400" : "text-rose-400"}`}>
                {validation?.isValid ? "✓ READY FOR SIMULATION" : "⚠ VALIDATION FAILED"}
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

          {/* Simulation Output Card */}
          {simulationResult && (
            <div className="bg-[#0C1220] border border-blue-500/30 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-blue-300">
                <span className="flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  Movement Simulation Vector & Plan
                </span>
                <span className="badge badge-healthy text-[9px]">SIMULATION PASSED</span>
              </div>
              <div className="text-[11px] font-mono text-slate-300 bg-[#070A12] p-2.5 rounded border border-[#19223A] space-y-1">
                <div>Vector Direction: <span className="text-cyan-300 font-bold">{simulationResult.movementVector.direction}</span></div>
                <div>Copy Sequencing: <span className="text-amber-300">{simulationResult.movementVector.copyOrder}</span></div>
                <div>Pre-LBA Extent: {simulationResult.simulatedBefore.startLba.toLocaleString()} → {simulationResult.simulatedBefore.endLba.toLocaleString()}</div>
                <div>Post-LBA Extent: {simulationResult.simulatedAfter.startLba.toLocaleString()} → {simulationResult.simulatedAfter.endLba.toLocaleString()}</div>
                <div>Offline WinPE Required: {simulationResult.offlineStagingRequired ? "YES (System Extent)" : "NO (Online Locked)"}</div>
              </div>
            </div>
          )}

          {/* Staged WinPE Output */}
          {stagedWinpeResult && (
            <div className="bg-indigo-500/15 border border-indigo-500/30 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-indigo-300">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  WinPE Offline Relocation Task Staged!
                </span>
                <span className="badge badge-system text-[9px]">BCD READY</span>
              </div>
              <p className="text-[11px] text-slate-300">
                Task written to <code className="text-cyan-300">opendisk-winpe-task.json</code>. The relocation will execute during the automated WinPE boot stage with volumes offline and unmounted.
              </p>
            </div>
          )}

          {/* Execution Result */}
          {executionResult && (
            <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-xl p-3.5 space-y-1.5 text-xs font-mono">
              <span className="font-bold text-emerald-300 block">
                ✓ Partition Movement Completed & Verified!
              </span>
              <div className="text-[11px] text-slate-300">
                Target Starting LBA: {executionResult.targetStartLba.toLocaleString()} (Verified) | Duration: {executionResult.durationMs} ms
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="bg-rose-500/15 border border-rose-500/40 rounded-lg p-3 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Two-Step Safety Checkboxes */}
          {status !== MOVEMENT_STATUS.SUCCESS && (
            <div className="bg-[#121828] border border-amber-500/30 rounded-lg p-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <input 
                  type="checkbox"
                  id="chk-backup"
                  checked={acknowledgeBackup}
                  onChange={(e) => setAcknowledgeBackup(e.target.checked)}
                  className="mt-1 accent-blue-500 cursor-pointer"
                />
                <label htmlFor="chk-backup" className="text-[11px] text-slate-300 cursor-pointer select-none">
                  <strong className="text-white block font-semibold">1. Backup Verification:</strong>
                  I certify that I have created a verified external backup or system image of all data on this drive before relocating partition sectors.
                </label>
              </div>

              <div className="flex items-start gap-2 pt-1 border-t border-[#1F2944]">
                <input 
                  type="checkbox"
                  id="chk-auth"
                  checked={userConfirmed}
                  onChange={(e) => setUserConfirmed(e.target.checked)}
                  className="mt-1 accent-blue-500 cursor-pointer"
                />
                <label htmlFor="chk-auth" className="text-[11px] text-slate-300 cursor-pointer select-none">
                  <strong className="text-white block font-semibold">2. Sector Movement Authorization:</strong>
                  I authorize relocating <code className="text-amber-300">PhysicalDrive{disk.id} Partition #{partition.partitionNumber}</code> to LBA <strong>{plan?.geometry?.targetStartLba?.toLocaleString()}</strong>.
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
          >
            Stage in Queue
          </button>

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn btn-secondary btn-sm">
              {status === MOVEMENT_STATUS.SUCCESS ? "Close" : "Cancel"}
            </button>

            {status !== MOVEMENT_STATUS.SUCCESS && (
              <>
                <button 
                  onClick={handleSimulate}
                  disabled={!validation?.isValid || shiftDeltaGb === 0}
                  className="btn btn-secondary btn-sm flex items-center gap-1.5"
                >
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Simulate Dry-Run</span>
                </button>

                {plan?.requiresWinPE ? (
                  <button 
                    onClick={handleStageWinpe}
                    disabled={!validation?.isValid || !acknowledgeBackup || !userConfirmed || shiftDeltaGb === 0}
                    className={`btn btn-sm flex items-center gap-1.5 font-bold ${
                      validation?.isValid && acknowledgeBackup && userConfirmed
                        ? "bg-indigo-600 hover:bg-indigo-500 text-white" 
                        : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Stage Offline WinPE Task</span>
                  </button>
                ) : (
                  <button 
                    onClick={handleExecute}
                    disabled={!validation?.isValid || !acknowledgeBackup || !userConfirmed || shiftDeltaGb === 0}
                    className={`btn btn-sm flex items-center gap-1.5 font-bold ${
                      validation?.isValid && acknowledgeBackup && userConfirmed
                        ? "bg-blue-600 hover:bg-blue-500 text-white" 
                        : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                    }`}
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Authorize Relocation</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

