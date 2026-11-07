import React from "react";
import { 
  Settings, 
  ShieldCheck, 
  Sliders, 
  Database, 
  Palette, 
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Sun,
  Moon
} from "lucide-react";

export function SettingsView({ 
  activeProfile, 
  onProfileChange,
  theme,
  onThemeChange
}) {
  return (
    <div className="space-y-5 p-2 max-w-4xl">
      <div>
        <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-500" />
          <span>Application Settings & Safety Invariants</span>
        </h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Configure appearance, partition alignment rules, cryptographic guardrails, and simulation environments.
        </p>
      </div>

      {/* Appearance & Theming */}
      <div className="glass-card p-5 space-y-4">
        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
          <Palette className="w-4 h-4 text-purple-400" />
          <span>Appearance & Design Theme</span>
        </h3>

        <div className="flex items-center justify-between p-3 bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-lg">
          <div>
            <span className="font-semibold text-[var(--text-primary)] text-xs block">
              Application Visual Theme
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              Choose between Windows 11 Fluent Dark or Fluent Light aesthetics.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onThemeChange("dark")}
              className={`btn btn-sm flex items-center gap-1.5 ${
                theme === "dark" 
                  ? "bg-blue-600 text-white shadow-sm" 
                  : "btn-secondary text-[var(--text-secondary)]"
              }`}
            >
              <Moon className="w-3.5 h-3.5 text-blue-300" />
              <span>Fluent Dark</span>
            </button>
            <button
              onClick={() => onThemeChange("light")}
              className={`btn btn-sm flex items-center gap-1.5 ${
                theme === "light" 
                  ? "bg-blue-600 text-white shadow-sm" 
                  : "btn-secondary text-[var(--text-secondary)]"
              }`}
            >
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span>Fluent Light</span>
            </button>
          </div>
        </div>
      </div>

      {/* Safety Invariant Rules */}
      <div className="glass-card p-5 space-y-4">
        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Core Safety & Verification Invariants</span>
        </h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-lg">
            <div>
              <span className="font-semibold text-[var(--text-primary)] text-xs block">
                Strict 1 MiB (2048 Sector) Boundary Alignment
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                Snaps all partition creation and resizing operations to exact 1 MiB boundaries for optimal SSD 4Kn performance.
              </span>
            </div>
            <span className="badge badge-healthy text-[10px]">ENFORCED</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-lg">
            <div>
              <span className="font-semibold text-[var(--text-primary)] text-xs block">
                BitLocker TPM PCR Protection Interlock
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                Blocks moving partitions on encrypted drives until BitLocker recovery keys are verified and TPM sealing is suspended.
              </span>
            </div>
            <span className="badge badge-healthy text-[10px]">ACTIVE</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-lg">
            <div>
              <span className="font-semibold text-[var(--text-primary)] text-xs block">
                Write-Ahead Journal (WAL) Crash Resilience
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                Maintains binary snapshot of original GPT headers and block progress to survive power outages mid-copy.
              </span>
            </div>
            <span className="badge badge-healthy text-[10px]">ACTIVE</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-lg">
            <div>
              <span className="font-semibold text-[var(--text-primary)] text-xs block">
                Typed Confirmation for Destructive Actions
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                Requires typing "CONFIRM" before deleting partitions, formatting volumes, or clearing disk headers.
              </span>
            </div>
            <span className="badge badge-healthy text-[10px]">ACTIVE</span>
          </div>
        </div>
      </div>

      {/* Mock Profile & Simulation Preferences */}
      <div className="glass-card p-5 space-y-4">
        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-500" />
          <span>Storage Simulation Environment (Phase 1)</span>
        </h3>

        <div className="p-3 bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] rounded-lg flex items-center justify-between">
          <div>
            <span className="font-semibold text-[var(--text-primary)] text-xs block">
              Active Mock Hardware Profile
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              Select predefined disk and partition topologies to test and verify UI behavior.
            </span>
          </div>
          <select
            value={activeProfile}
            onChange={(e) => onProfileChange(e.target.value)}
            className="form-select bg-[var(--bg-surface)] border border-[var(--border-medium)] text-[var(--text-primary)] text-xs font-semibold px-3 py-1.5 rounded-lg outline-none cursor-pointer"
          >
            <option value="standard">Standard: NVMe (1TB) + SATA (2TB) + USB (64GB)</option>
            <option value="single-nvme">Minimal: Single NVMe SSD (450GB C: + Free Space)</option>
            <option value="dual-ssd">Workstation: Dual SSDs (OS + Secondary Storage)</option>
          </select>
        </div>
      </div>

      {/* System Platform Information */}
      <div className="glass-card p-5 space-y-3 font-mono text-xs">
        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2 font-sans">
          <Cpu className="w-4 h-4 text-purple-400" />
          <span>Host System Environment</span>
        </h3>
        <div className="grid grid-cols-2 gap-2 text-[var(--text-muted)]">
          <div>Host OS: <span className="text-[var(--text-primary)]">Windows 11 x64 (Build 22000+)</span></div>
          <div>Desktop Engine: <span className="text-[var(--text-primary)]">Electron v45 + Chromium</span></div>
          <div>Storage API: <span className="text-emerald-500 font-semibold">MSFT_Disk / PowerShell Cmdlets</span></div>
          <div>Privileges: <span className="text-blue-500 font-semibold">Protected User / Administrator</span></div>
        </div>
      </div>
    </div>
  );
}
