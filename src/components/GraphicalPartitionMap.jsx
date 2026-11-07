import React from "react";
import { 
  Monitor, 
  FolderGit2, 
  Cpu, 
  ShieldAlert, 
  Lock, 
  PlusCircle, 
  HardDrive,
  KeyRound
} from "lucide-react";

export function GraphicalPartitionMap({ 
  disk, 
  selectedPartitionId, 
  onSelectPartition,
  onQuickAction
}) {
  const totalDiskBytes = disk.totalSizeBytes;

  // Visual helper to calculate width percentage with a sensible visual minimum
  // (so small 100 MB EFI or 16 MB MSR remain clearly clickable and readable)
  const getPartitionWidthPercent = (partitionBytes) => {
    const rawPercent = (partitionBytes / totalDiskBytes) * 100;
    // Minimum 3.5% width so tiny partitions remain easily clickable
    return Math.max(rawPercent, 3.8);
  };

  const getCategoryStyles = (category, isSelected, isBitLocker) => {
    switch (category) {
      case "SYSTEM":
        return {
          background: "linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)",
          border: isSelected ? "2px solid #60A5FA" : "1px solid #1E40AF",
          badgeBg: "bg-blue-900/60 text-blue-200 border-blue-400/40",
          name: "Windows System",
          icon: Monitor,
        };
      case "DATA":
        return {
          background: "linear-gradient(135deg, #047857 0%, #10B981 100%)",
          border: isSelected ? "2px solid #34D399" : "1px solid #065F46",
          badgeBg: "bg-emerald-900/60 text-emerald-200 border-emerald-400/40",
          name: "Basic Data",
          icon: FolderGit2,
        };
      case "EFI":
        return {
          background: "linear-gradient(135deg, #B45309 0%, #F59E0B 100%)",
          border: isSelected ? "2px solid #FCD34D" : "1px solid #92400E",
          badgeBg: "bg-amber-900/60 text-amber-200 border-amber-400/40",
          name: "EFI System",
          icon: Cpu,
        };
      case "RECOVERY":
        return {
          background: "linear-gradient(135deg, #6D28D9 0%, #8B5CF6 100%)",
          border: isSelected ? "2px solid #C4B5FD" : "1px solid #5B21B6",
          badgeBg: "bg-purple-900/60 text-purple-200 border-purple-400/40",
          name: "Recovery (WinRE)",
          icon: ShieldAlert,
        };
      case "MSR":
        return {
          background: "linear-gradient(135deg, #334155 0%, #475569 100%)",
          border: isSelected ? "2px solid #94A3B8" : "1px solid #1E293B",
          badgeBg: "bg-slate-800 text-slate-300 border-slate-600",
          name: "Microsoft Reserved",
          icon: Lock,
        };
      case "UNALLOCATED":
      default:
        return {
          background: "repeating-linear-gradient(-45deg, rgba(30, 41, 59, 0.4), rgba(30, 41, 59, 0.4) 8px, rgba(15, 23, 42, 0.7) 8px, rgba(15, 23, 42, 0.7) 16px)",
          border: isSelected ? "2px dashed #94A3B8" : "1px dashed #475569",
          badgeBg: "bg-slate-900/80 text-slate-400 border-slate-700",
          name: "Unallocated Space",
          icon: PlusCircle,
        };
    }
  };

  return (
    <div className="glass-card p-4 space-y-3">
      {/* Header & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#242E49] pb-3">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-bold text-white tracking-wide">
            Graphical Partition Map — Disk {disk.id}
          </h2>
          <span className="text-xs text-slate-400">
            ({disk.partitions.length} Extents)
          </span>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 shadow-sm shadow-blue-500/50" />
            <span>Windows (C:)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shadow-sm shadow-emerald-500/50" />
            <span>Data</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 shadow-sm shadow-amber-500/50" />
            <span>EFI</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-purple-500 shadow-sm shadow-purple-500/50" />
            <span>Recovery</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-600" />
            <span>MSR</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm border border-dashed border-slate-400 bg-slate-900" />
            <span>Unallocated</span>
          </div>
        </div>
      </div>

      {/* Graphical Bar */}
      <div className="w-full h-24 bg-[#090D16] border border-[#242E49] rounded-xl p-1.5 flex gap-1.5 overflow-hidden shadow-inner">
        {disk.partitions.map((part) => {
          const isSelected = selectedPartitionId === part.id;
          const styles = getCategoryStyles(part.category, isSelected, part.isBitLocker);
          const Icon = styles.icon;
          const widthPercent = getPartitionWidthPercent(part.sizeBytes);
          const isUnallocated = part.category === "UNALLOCATED";

          // Calculate internal usage percentage
          const usagePercent = part.sizeBytes > 0 && part.usedBytes 
            ? Math.round((part.usedBytes / part.sizeBytes) * 100) 
            : 0;

          // Display label
          const sizeDisplay = part.sizeBytes >= 1e9 
            ? `${(part.sizeBytes / 1e9).toFixed(1)} GB`
            : `${(part.sizeBytes / 1e6).toFixed(0)} MB`;

          return (
            <div
              key={part.id}
              onClick={() => onSelectPartition(part.id)}
              style={{
                flex: `${widthPercent} 0 auto`,
                background: styles.background,
                border: styles.border,
              }}
              className={`h-full rounded-lg relative cursor-pointer select-none transition-all duration-150 flex flex-col justify-between p-2 group ${
                isSelected 
                  ? "ring-2 ring-white/80 ring-offset-2 ring-offset-[#090D16] shadow-xl z-10 scale-[1.01]" 
                  : "hover:brightness-110 opacity-95 hover:opacity-100"
              }`}
            >
              {/* Top Row: Label & Icons */}
              <div className="flex items-center justify-between text-white drop-shadow-sm">
                <div className="flex items-center gap-1.5 truncate">
                  <Icon className="w-3.5 h-3.5 shrink-0 opacity-90" />
                  <span className="font-bold text-xs truncate">
                    {part.volumeLetter ? `(${part.volumeLetter})` : ""} {part.label}
                  </span>
                </div>
                {part.isBitLocker && (
                  <span title="BitLocker Encrypted (Unlocked)">
                    <KeyRound className="w-3 h-3 text-amber-300 shrink-0" />
                  </span>
                )}
              </div>

              {/* Middle: Usage Bar (for formatted partitions) */}
              {!isUnallocated && part.category !== "MSR" && (
                <div className="w-full bg-black/30 rounded-full h-1.5 overflow-hidden my-auto border border-white/10">
                  <div 
                    className="h-full bg-white/70 rounded-full transition-all duration-300"
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              )}

              {isUnallocated && (
                <div className="flex items-center justify-center text-[10px] text-slate-400 font-medium">
                  <span>+ Free Space</span>
                </div>
              )}

              {/* Bottom Row: Size & Filesystem */}
              <div className="flex items-center justify-between text-[11px] text-white/90 font-mono">
                <span className="font-semibold">{sizeDisplay}</span>
                <span className="text-[10px] opacity-80 uppercase">{part.fsType}</span>
              </div>

              {/* Hover Tooltip Overlay */}
              <div className="absolute inset-0 bg-slate-900/90 rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex flex-col justify-center text-[10px] text-slate-200 z-20">
                <div className="font-bold text-white text-xs truncate mb-0.5">
                  {part.volumeLetter ? `${part.volumeLetter} ` : ""}{part.label}
                </div>
                <div>Type: <span className="text-blue-300">{styles.name}</span></div>
                <div>Size: <span className="text-white font-mono">{sizeDisplay}</span></div>
                {!isUnallocated && (
                  <div>Used: <span className="text-white font-mono">{usagePercent}%</span></div>
                )}
                <div className="text-[9px] text-slate-400 font-mono truncate mt-0.5">
                  LBA {part.startLba.toLocaleString()} - {part.endLba.toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono px-1">
        <span>Offset: LBA 0 (Protective MBR / Primary GPT)</span>
        <span>End of Disk: LBA {(disk.totalSizeBytes / disk.sectorSize).toLocaleString()} (Backup GPT)</span>
      </div>
    </div>
  );
}

