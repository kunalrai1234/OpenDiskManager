import React from "react";
import { 
  Info, 
  Layers, 
  ShieldCheck, 
  ExternalLink, 
  Github, 
  FileCode, 
  Heart,
  CheckCircle2
} from "lucide-react";

export function AboutView() {
  return (
    <div className="space-y-5 p-2 max-w-3xl">
      {/* Brand Hero Card */}
      <div className="glass-card p-6 flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-[var(--bg-surface-elevated)] flex items-center justify-center shadow-lg shadow-blue-500/20 border border-blue-400/30 shrink-0 p-1.5 overflow-hidden">
          <img 
            src="./logo.svg" 
            alt="OpenDisk Manager" 
            width="56"
            height="56"
            className="app-logo-lg" 
          />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
              OpenDisk Manager
            </h2>
            <span className="badge badge-info text-[10px]">
              Production Release (v1.0.0)
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            A free, modern, and open-source Windows disk partition management suite engineered specifically for Windows 11 x64. Provides safe, non-destructive partition resizing, moving, format, delete, split, merge, and inspection without proprietary paywalls or adware bloat.
          </p>
          <div className="flex items-center gap-4 text-xs text-[var(--text-muted)] pt-2 font-mono">
            <span>Target: Windows 11 x64</span>
            <span>•</span>
            <span>License: Apache-2.0</span>
            <span>•</span>
            <span>Security: Zero-Trust Defense</span>
          </div>
        </div>
      </div>

      {/* Architectural Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-1.5 shadow-sm">
          <span className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center font-bold text-xs mb-2">
            1
          </span>
          <h4 className="font-bold text-[var(--text-primary)] text-xs">Rust Core Safety</h4>
          <p className="text-[11px] text-[var(--text-secondary)]">
            Affine type systems and memory safety prevent buffer overruns and off-by-one sector corruptions.
          </p>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-1.5 shadow-sm">
          <span className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold text-xs mb-2">
            2
          </span>
          <h4 className="font-bold text-[var(--text-primary)] text-xs">Direct Win32 & Storage APIs</h4>
          <p className="text-[11px] text-[var(--text-secondary)]">
            Structured Windows Storage cmdlets and Win32 IOCTLs eliminate brittle formatted text parsing.
          </p>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-1.5 shadow-sm">
          <span className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-500 flex items-center justify-center font-bold text-xs mb-2">
            3
          </span>
          <h4 className="font-bold text-[var(--text-primary)] text-xs">WinPE Handoff</h4>
          <p className="text-[11px] text-[var(--text-secondary)]">
            Safe offline staging for active C: drive relocation avoids blue screen (BSOD) risks from in-use files.
          </p>
        </div>
      </div>

      {/* Project Documentation References */}
      <div className="glass-card p-5 space-y-3">
        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
          Approved Architectural Specifications
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 bg-[var(--bg-surface-elevated)] rounded border border-[var(--border-subtle)] text-[var(--text-secondary)]">
            <span className="font-bold block text-[var(--text-primary)]">PROJECT_ARCHITECTURE.md</span>
            <span className="text-[10px] text-[var(--text-muted)]">IPC & execution pipeline specification</span>
          </div>
          <div className="p-2.5 bg-[var(--bg-surface-elevated)] rounded border border-[var(--border-subtle)] text-[var(--text-secondary)]">
            <span className="font-bold block text-[var(--text-primary)]">TECHNICAL_RESEARCH.md</span>
            <span className="text-[10px] text-[var(--text-muted)]">14 mandatory storage research topics</span>
          </div>
          <div className="p-2.5 bg-[var(--bg-surface-elevated)] rounded border border-[var(--border-subtle)] text-[var(--text-secondary)]">
            <span className="font-bold block text-[var(--text-primary)]">SECURITY_AND_SAFETY.md</span>
            <span className="text-[10px] text-[var(--text-muted)]">The Ten Golden Invariants & WAL Journaling</span>
          </div>
          <div className="p-2.5 bg-[var(--bg-surface-elevated)] rounded border border-[var(--border-subtle)] text-[var(--text-secondary)]">
            <span className="font-bold block text-[var(--text-primary)]">DEVELOPMENT_ROADMAP.md</span>
            <span className="text-[10px] text-[var(--text-muted)]">24-week phased engineering plan</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-[var(--text-muted)] pt-3">
        OpenDisk Manager is committed to free, transparent, and bloat-free system utilities.
      </div>
    </div>
  );
}
