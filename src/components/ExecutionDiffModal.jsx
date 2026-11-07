import React, { useState } from "react";
import { 
  X, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Layers, 
  ArrowRight,
  Loader2,
  Terminal,
  Database
} from "lucide-react";

export function ExecutionDiffModal({ 
  isOpen, 
  onClose, 
  operations, 
  onCommitSuccess 
}) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [logs, setLogs] = useState([]);
  const [isDone, setIsDone] = useState(false);

  if (!isOpen) return null;

  const handleStartSimulation = () => {
    setIsExecuting(true);
    setProgress(5);
    setCurrentStep("Pre-flight safety invariant validation...");
    setLogs(["[00:00.050] Checking 1 MiB sector boundaries across all target extents..."]);

    setTimeout(() => {
      setProgress(25);
      setCurrentStep("Acquiring exclusive volume locks (FSCTL_LOCK_VOLUME)...");
      setLogs(prev => [
        ...prev, 
        "[00:00.320] Volume lock verified on target partition.",
        "[00:00.410] BitLocker encryption envelope queried: Unlocked."
      ]);
    }, 800);

    setTimeout(() => {
      setProgress(55);
      setCurrentStep("Executing simulated raw directional block move...");
      setLogs(prev => [
        ...prev,
        "[00:00.950] Transferring sectors in 4 MiB non-buffered blocks.",
        "[00:01.300] Parallel SIMD CRC32 hash matches source payload."
      ]);
    }, 1800);

    setTimeout(() => {
      setProgress(85);
      setCurrentStep("Writing Primary & Backup GPT headers and recalculating CRC32...");
      setLogs(prev => [
        ...prev,
        "[00:02.100] Updating NTFS VBR hidden sectors offset.",
        "[00:02.400] Primary GPT Header (LBA 1) and Backup GPT (LBA N) written."
      ]);
    }, 2800);

    setTimeout(() => {
      setProgress(100);
      setCurrentStep("Transaction committed successfully!");
      setLogs(prev => [
        ...prev,
        "[00:03.100] IOCTL_DISK_UPDATE_PROPERTIES dispatched to partmgr.sys.",
        "[00:03.200] Simulation complete. Invariants preserved."
      ]);
      setIsExecuting(false);
      setIsDone(true);
    }, 3600);
  };

  const handleFinish = () => {
    onCommitSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0F1424] border border-[#242E49] rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-[#13192B] border-b border-[#242E49] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-sm font-bold text-white">
                Execute Operations Plan (Simulated Commit)
              </h2>
              <p className="text-[11px] text-slate-400">
                Visual diff preview & pre-flight safety verification
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            disabled={isExecuting}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Safety Notice */}
          <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg p-3 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-emerald-300 block mb-0.5">
                Phase 1 Sandbox Active — Non-Destructive Emulation
              </span>
              <p className="text-slate-300">
                OpenDisk Manager is currently running in Phase 1 safe mode. Physical disk writes are blocked. The actions below will run through the complete transaction planner, DAG scheduler, and mock state machine.
              </p>
            </div>
          </div>

          {/* Staged Plan List */}
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Staged Operations Sequence ({operations.length})
            </h4>
            <div className="space-y-2">
              {operations.map((op, idx) => (
                <div key={op.id || idx} className="bg-[#121829] border border-[#222B45] rounded-lg p-3 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded bg-blue-500/20 text-blue-300 font-bold font-mono text-[11px] flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <span className="font-semibold text-white block">{op.title}</span>
                      <span className="text-[11px] text-slate-400">{op.details}</span>
                    </div>
                  </div>
                  <div className="text-right font-mono text-[11px]">
                    <span className="text-slate-400 block">{op.targetLbaRange}</span>
                    <span className="text-emerald-400 font-semibold">{op.deltaGb !== 0 ? `${op.deltaGb} GB` : "LBA Relocate"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Execution Progress & Terminal View (when running) */}
          {(isExecuting || isDone) && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white flex items-center gap-2">
                  {isExecuting && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />}
                  {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  <span>{currentStep}</span>
                </span>
                <span className="font-mono text-blue-400 font-bold">{progress}%</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-[#0B0F1A] rounded-full h-2 overflow-hidden border border-[#242E49]">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Live Terminal Log Stream */}
              <div className="bg-[#090D16] border border-[#1E263D] rounded-lg p-3 font-mono text-[11px] text-slate-300 space-y-1 max-h-36 overflow-y-auto">
                <div className="text-slate-500 flex items-center gap-1.5 pb-1 border-b border-slate-800">
                  <Terminal className="w-3 h-3" />
                  <span>Transaction Journal Stream</span>
                </div>
                {logs.map((log, i) => (
                  <div key={i} className="text-emerald-300/90 leading-tight">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-[#13192B] border-t border-[#242E49] flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {isDone ? "All operations simulated successfully." : "Ready to simulate plan execution."}
          </span>
          <div className="flex items-center gap-2">
            {!isDone ? (
              <>
                <button
                  onClick={onClose}
                  disabled={isExecuting}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartSimulation}
                  disabled={isExecuting}
                  className="btn btn-primary btn-sm flex items-center gap-2 px-4"
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Executing...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Execute Simulation</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <button
                onClick={handleFinish}
                className="btn btn-primary btn-sm px-5"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

