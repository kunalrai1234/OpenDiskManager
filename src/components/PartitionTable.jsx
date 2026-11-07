import React from "react";
import { 
  Monitor, 
  FolderGit2, 
  Cpu, 
  ShieldAlert, 
  Lock, 
  PlusCircle,
  KeyRound,
  MoveHorizontal,
  Move,
  Sliders,
  Maximize2,
  Minimize2,
  Trash2,
  Settings2,
  CheckCircle2,
  Info
} from "lucide-react";

export function PartitionTable({ 
  disk, 
  selectedPartitionId, 
  onSelectPartition,
  onActionClick
}) {
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    return `${(bytes / 1e6).toFixed(0)} MB`;
  };

  const getCategoryBadge = (category) => {
    switch (category) {
      case "SYSTEM":
        return <span className="badge badge-info flex items-center gap-1"><Monitor className="w-3 h-3" /> System (OS)</span>;
      case "DATA":
        return <span className="badge badge-healthy flex items-center gap-1"><FolderGit2 className="w-3 h-3" /> Basic Data</span>;
      case "EFI":
        return <span className="badge badge-warning flex items-center gap-1"><Cpu className="w-3 h-3" /> EFI System</span>;
      case "RECOVERY":
        return <span className="badge bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Recovery</span>;
      case "MSR":
        return <span className="badge bg-slate-700 text-slate-300 border border-slate-600 flex items-center gap-1"><Lock className="w-3 h-3" /> Reserved</span>;
      case "UNALLOCATED":
      default:
        return <span className="badge bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1"><PlusCircle className="w-3 h-3" /> Unallocated</span>;
    }
  };

  return (
    <div className="glass-card overflow-hidden">
      {/* Table Title Bar */}
      <div className="px-4 py-3 bg-[#111728] border-b border-[#242E49] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Partition Table & Extent Registry
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">
            Disk {disk.id} ({disk.partitionStyle})
          </span>
        </div>
        <div className="text-xs text-slate-400 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-blue-400" />
          <span>Click any row to inspect technical geometry</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#0B0F1A] text-slate-400 border-b border-[#242E49] text-[11px] uppercase tracking-wider">
            <tr>
              <th className="py-2.5 px-3 font-semibold">Volume / Label</th>
              <th className="py-2.5 px-3 font-semibold">Partition Type</th>
              <th className="py-2.5 px-3 font-semibold">File System</th>
              <th className="py-2.5 px-3 font-semibold">Capacity</th>
              <th className="py-2.5 px-3 font-semibold">Used Space</th>
              <th className="py-2.5 px-3 font-semibold">Free Space</th>
              <th className="py-2.5 px-3 font-semibold">Status</th>
              <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1D253B]">
            {disk.partitions.map((part) => {
              const isSelected = selectedPartitionId === part.id;
              const isUnallocated = part.category === "UNALLOCATED";
              const freeBytes = isUnallocated ? part.sizeBytes : Math.max(0, part.sizeBytes - (part.usedBytes || 0));
              const usagePercent = part.sizeBytes > 0 && part.usedBytes ? Math.round((part.usedBytes / part.sizeBytes) * 100) : 0;

              return (
                <tr
                  key={part.id}
                  onClick={() => onSelectPartition(part.id)}
                  className={`transition-colors cursor-pointer ${
                    isSelected 
                      ? "bg-blue-600/15 border-l-4 border-l-blue-500" 
                      : "hover:bg-[#161D31]"
                  }`}
                >
                  {/* Volume / Label */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      {part.volumeLetter ? (
                        <span className="w-6 h-6 rounded bg-blue-500/20 text-blue-300 font-bold font-mono text-xs flex items-center justify-center border border-blue-500/30">
                          {part.volumeLetter[0]}
                        </span>
                      ) : (
                        <span className="w-6 h-6 rounded bg-slate-800 text-slate-400 text-xs flex items-center justify-center border border-slate-700">
                          -
                        </span>
                      )}
                      <div>
                        <span className="font-semibold text-white block">
                          {part.label}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {isUnallocated ? "Free Block" : `Partition ${part.partitionNumber}`}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Partition Type */}
                  <td className="py-3 px-3">
                    {getCategoryBadge(part.category)}
                  </td>

                  {/* Filesystem */}
                  <td className="py-3 px-3 font-mono font-medium text-slate-300">
                    {part.fsType}
                  </td>

                  {/* Capacity */}
                  <td className="py-3 px-3 font-mono font-semibold text-white">
                    {formatBytes(part.sizeBytes)}
                  </td>

                  {/* Used Space */}
                  <td className="py-3 px-3">
                    {!isUnallocated && part.category !== "MSR" ? (
                      <div className="w-32">
                        <div className="flex justify-between text-[10px] text-slate-300 font-mono mb-1">
                          <span>{formatBytes(part.usedBytes)}</span>
                          <span>{usagePercent}%</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              usagePercent > 85 ? "bg-rose-500" : usagePercent > 65 ? "bg-amber-400" : "bg-blue-500"
                            }`}
                            style={{ width: `${usagePercent}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-500 text-[11px] font-mono">N/A</span>
                    )}
                  </td>

                  {/* Free Space */}
                  <td className="py-3 px-3 font-mono text-slate-300">
                    {formatBytes(freeBytes)}
                  </td>

                  {/* Status */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5">
                      {part.isBitLocker && (
                        <span className="badge badge-warning text-[10px]" title="BitLocker Protected">
                          <KeyRound className="w-3 h-3" /> BitLocker
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 truncate max-w-[150px]">
                        {part.status}
                      </span>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-3 text-right">
                    <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {!isUnallocated && (
                        <>
                          <button
                            onClick={() => onActionClick("RESIZE_MOVE", part)}
                            className="btn btn-ghost btn-sm p-1.5 hover:text-blue-400"
                            title="Resize Partition"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onActionClick("MOVE", part)}
                            className="btn btn-ghost btn-sm p-1.5 hover:text-cyan-400"
                            title="Move Partition"
                          >
                            <Move className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onActionClick("FORMAT", part)}
                            className="btn btn-ghost btn-sm p-1.5 hover:text-rose-400"
                            title="Format Volume"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {isUnallocated && (
                        <button
                          onClick={() => onActionClick("CREATE", part)}
                          className="btn btn-primary btn-sm py-1 px-2 text-[11px]"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>Create</span>
                        </button>
                      )}
                      <button
                        onClick={() => onActionClick("PROPERTIES", part)}
                        className="btn btn-ghost btn-sm p-1.5 hover:text-white"
                        title="Inspect Properties"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

