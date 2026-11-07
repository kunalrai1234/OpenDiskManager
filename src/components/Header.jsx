import React from "react";
import { 
  Layers, 
  ShieldCheck, 
  RefreshCw, 
  Sliders, 
  Cpu,
  CheckCircle2,
  HardDrive
} from "lucide-react";

export function Header({ 
  onRefresh, 
  isRefreshing, 
  pendingCount, 
  onOpenOperations,
  activeProfile,
  onProfileChange,
  isRealData,
  hostDiskModel
}) {
  return (
    <header className="h-[58px] bg-[#0E1322] border-b border-[#242E49] px-4 flex items-center justify-between select-none z-20 shrink-0">
      {/* Brand & Title */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#13192B] flex items-center justify-center shadow-lg shadow-blue-500/20 border border-blue-400/30 overflow-hidden p-1">
          <img src="./logo.svg" alt="OpenDisk Manager" className="w-full h-full object-contain" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
              OpenDisk Manager
              <span className="text-[10px] font-semibold tracking-wider bg-blue-500/15 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded">
                v1.0.0 RELEASE
              </span>
            </h1>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            Windows 11 Storage Systems Director
          </p>
        </div>
      </div>

      {/* Center: Real Hardware Detection Status */}
      <div className="flex items-center gap-2 bg-[#13192B] border border-[#242E49] px-3.5 py-1.5 rounded-full shadow-inner">
        <div className={`w-2 h-2 rounded-full ${isRealData ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
        <span className={`text-[11px] font-bold uppercase tracking-wider ${isRealData ? "text-emerald-400" : "text-amber-400"}`}>
          {isRealData ? "Real Disk Detection Active" : "Mock Simulation Mode"}
        </span>
        <span className="text-slate-600">|</span>
        <span className="text-[11px] text-slate-300 font-mono truncate max-w-[260px]">
          {isRealData ? hostDiskModel : "Synthetic Test Profile"}
        </span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Source Switcher */}
        <div className="flex items-center gap-1.5 bg-[#13192B] border border-[#242E49] px-2 py-1 rounded-md text-xs">
          <span className="text-slate-400 text-[11px]">Storage Source:</span>
          <select 
            value={activeProfile}
            onChange={(e) => onProfileChange(e.target.value)}
            className="bg-transparent text-slate-200 text-xs font-semibold outline-none cursor-pointer"
          >
            <option value="real" className="bg-[#13192B] text-emerald-300">★ Real Host Hardware (Live Windows Detection)</option>
            <option value="standard" className="bg-[#13192B] text-slate-200">Mock: Multi-Drive (1TB NVMe + 2TB SATA + USB)</option>
            <option value="single-nvme" className="bg-[#13192B] text-slate-200">Mock: Single NVMe (450GB C: + Free Space)</option>
            <option value="dual-ssd" className="bg-[#13192B] text-slate-200">Mock: Dual SSDs (Workstation)</option>
          </select>
        </div>

        {/* Scan Disks Button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="btn btn-secondary btn-sm flex items-center gap-1.5 hover:border-blue-500"
          title="Rescan host storage subsystem"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isRefreshing ? "animate-spin" : ""}`} />
          <span>{isRefreshing ? "Scanning..." : "Rescan Disks"}</span>
        </button>

        {/* Pending Operations Badge Button */}
        <button
          onClick={onOpenOperations}
          className={`btn btn-sm flex items-center gap-2 relative ${
            pendingCount > 0 
              ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/25 border-blue-400/40" 
              : "btn-secondary text-slate-300"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Pending Ops</span>
          {pendingCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-900 font-bold text-[11px] flex items-center justify-center -mr-1">
              {pendingCount}
            </span>
          )}
        </button>

        {/* Read-Only Safety Badge */}
        <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 px-2.5 py-1 rounded-md text-xs font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Read-Only</span>
        </div>
      </div>
    </header>
  );
}
