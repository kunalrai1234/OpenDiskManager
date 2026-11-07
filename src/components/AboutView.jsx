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
        <div className="w-14 h-14 rounded-2xl bg-[#13192B] flex items-center justify-center shadow-xl shadow-blue-500/25 border border-blue-400/30 shrink-0 p-1.5 overflow-hidden">
          <img src="./logo.svg" alt="OpenDisk Manager" className="w-full h-full object-contain" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              OpenDisk Manager
            </h2>
            <span className="badge badge-info text-[10px]">
              Production Release (v1.0.0)
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            A free, modern, and open-source Windows disk partition management suite engineered specifically for Windows 11 x64. Provides safe, non-destructive partition resizing, moving, format, delete, split, merge, and inspection without proprietary paywalls or adware bloat.
          </p>
          <div className="flex items-center gap-4 text-xs text-slate-400 pt-2 font-mono">
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
        <div className="bg-[#0E1424] border border-[#222B45] rounded-xl p-4 space-y-1.5">
          <span className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs mb-2">
            1
          </span>
          <h4 className="font-bold text-white text-xs">Rust Core Safety</h4>
          <p className="text-[11px] text-slate-400">
            Affine type systems and memory safety prevent buffer overruns and off-by-one sector corruptions.
          </p>
        </div>

        <div className="bg-[#0E1424] border border-[#222B45] rounded-xl p-4 space-y-1.5">
          <span className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs mb-2">
            2
          </span>
          <h4 className="font-bold text-white text-xs">Direct Win32 I/O</h4>
          <p className="text-[11px] text-slate-400">
            Sub-millisecond IOCTL calls eliminate slow PowerShell process spawning and brittle string parsing.
          </p>
        </div>

        <div className="bg-[#0E1424] border border-[#222B45] rounded-xl p-4 space-y-1.5">
          <span className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs mb-2">
            3
          </span>
          <h4 className="font-bold text-white text-xs">WinPE Handoff</h4>
          <p className="text-[11px] text-slate-400">
            Safe offline staging for active C: drive relocation avoids blue screen (BSOD) risks from legacy boot drivers.
          </p>
        </div>
      </div>

      {/* Project Documentation References */}
      <div className="glass-card p-5 space-y-3">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
          Approved Architectural Specifications
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 bg-[#0D1220] rounded border border-slate-800 text-slate-300">
            <span className="font-bold block text-white">PROJECT_ARCHITECTURE.md</span>
            <span className="text-[10px] text-slate-500">Tauri IPC & execution pipeline specification</span>
          </div>
          <div className="p-2.5 bg-[#0D1220] rounded border border-slate-800 text-slate-300">
            <span className="font-bold block text-white">TECHNICAL_RESEARCH.md</span>
            <span className="text-[10px] text-slate-500">14 mandatory storage research topics</span>
          </div>
          <div className="p-2.5 bg-[#0D1220] rounded border border-slate-800 text-slate-300">
            <span className="font-bold block text-white">SECURITY_AND_SAFETY.md</span>
            <span className="text-[10px] text-slate-500">The Ten Golden Invariants & WAL Journaling</span>
          </div>
          <div className="p-2.5 bg-[#0D1220] rounded border border-slate-800 text-slate-300">
            <span className="font-bold block text-white">DEVELOPMENT_ROADMAP.md</span>
            <span className="text-[10px] text-slate-500">24-week phased engineering plan</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-slate-500 pt-3">
        OpenDisk Manager is committed to free, transparent, and bloat-free system utilities.
      </div>
    </div>
  );
}

