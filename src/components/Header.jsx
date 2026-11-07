import React from "react";
import { 
  Layers, 
  ShieldCheck, 
  RefreshCw, 
  Sliders, 
  Cpu,
  CheckCircle2,
  HardDrive,
  Sun,
  Moon
} from "lucide-react";

export function Header({ 
  onRefresh, 
  isRefreshing, 
  pendingCount, 
  onOpenOperations,
  activeProfile,
  onProfileChange,
  isRealData,
  hostDiskModel,
  theme,
  onToggleTheme
}) {
  return (
    <header className="h-[58px] bg-[var(--bg-sidebar)] border-b border-[var(--border-subtle)] px-4 flex items-center justify-between select-none z-20 shrink-0">
      {/* Brand & Title */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[var(--bg-surface)] flex items-center justify-center shadow-md shadow-blue-500/10 border border-blue-400/30 overflow-hidden p-1 shrink-0">
          <img 
            src="./logo.svg" 
            alt="OpenDisk Manager" 
            width="36"
            height="36"
            className="app-logo" 
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
              OpenDisk Manager
              <span className="text-[10px] font-semibold tracking-wider bg-blue-500/15 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded">
                v1.0.0 RELEASE
              </span>
            </h1>
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] font-medium">
            Windows 11 Storage Systems Director
          </p>
        </div>
      </div>

      {/* Center: Real Hardware Detection Status */}
      <div className="flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-1.5 rounded-full shadow-inner">
        <div className={`w-2 h-2 rounded-full ${isRealData ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
        <span className={`text-[11px] font-bold uppercase tracking-wider ${isRealData ? "text-emerald-400" : "text-amber-400"}`}>
          {isRealData ? "Real Disk Detection Active" : "Mock Simulation Mode"}
        </span>
        <span className="text-[var(--text-muted)]">|</span>
        <span className="text-[11px] text-[var(--text-secondary)] font-mono truncate max-w-[260px]">
          {isRealData ? hostDiskModel : "Synthetic Test Profile"}
        </span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Source Switcher */}
        <div className="flex items-center gap-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-2 py-1 rounded-md text-xs">
          <span className="text-[var(--text-secondary)] text-[11px]">Storage Source:</span>
          <select 
            value={activeProfile}
            onChange={(e) => onProfileChange(e.target.value)}
            className="form-select bg-transparent text-[var(--text-primary)] text-xs font-semibold outline-none cursor-pointer py-0.5 pr-6"
          >
            <option value="real" className="bg-[var(--bg-surface)] text-emerald-400">★ Real Host Hardware (Live Windows Detection)</option>
            <option value="standard" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Mock: Multi-Drive (1TB NVMe + 2TB SATA + USB)</option>
            <option value="single-nvme" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Mock: Single NVMe (450GB C: + Free Space)</option>
            <option value="dual-ssd" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Mock: Dual SSDs (Workstation)</option>
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
              : "btn-secondary text-[var(--text-primary)]"
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

        {/* Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          className="btn btn-ghost btn-sm p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          title={theme === "light" ? "Switch to Fluent Dark Theme" : "Switch to Fluent Light Theme"}
        >
          {theme === "light" ? <Moon className="w-4 h-4 text-slate-700" /> : <Sun className="w-4 h-4 text-amber-400" />}
        </button>

        {/* Read-Only Safety Badge */}
        <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 px-2.5 py-1 rounded-md text-xs font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Read-Only</span>
        </div>
      </div>
    </header>
  );
}
