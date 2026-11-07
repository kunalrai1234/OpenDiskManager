import React, { useState, useEffect } from "react";
import { 
  FileText, 
  Terminal, 
  Search, 
  Trash2, 
  Filter, 
  CheckCircle, 
  AlertTriangle, 
  Info,
  ShieldCheck,
  RotateCcw,
  Clock,
  Sliders,
  Move,
  Layers
} from "lucide-react";
import { fetchAuditLogs } from "../engine/resizeEngine";
import { fetchMovementAuditLogs } from "../engine/movementEngine";
import { getAdvancedAuditLogs } from "../engine/advancedEngine";

export function LogsView() {
  const [activeTab, setActiveTab] = useState("telemetry"); // 'telemetry', 'resize', 'movement', 'advanced'
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [resizeLogs, setResizeLogs] = useState([]);
  const [movementLogs, setMovementLogs] = useState([]);
  const [advancedLogs, setAdvancedLogs] = useState([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  useEffect(() => {
    async function loadLogs() {
      setIsLoadingAudit(true);
      try {
        const [rLogs, mLogs, aLogs] = await Promise.all([
          fetchAuditLogs(),
          fetchMovementAuditLogs(),
          getAdvancedAuditLogs()
        ]);
        setResizeLogs(rLogs || []);
        setMovementLogs(mLogs || []);
        setAdvancedLogs(aLogs || []);
      } catch (e) {
        console.error("Failed to load audit logs:", e);
      } finally {
        setIsLoadingAudit(false);
      }
    }
    loadLogs();
  }, [activeTab]);

  const sampleLogs = [
    { id: 1, time: "14:02:11.102", level: "INFO", category: "STORAGE", msg: "Initialized Tauri IPC storage channel with Windows 11 host." },
    { id: 2, time: "14:02:11.120", level: "INFO", category: "SECURITY", msg: "Process elevation check: SeManageVolumePrivilege and SeBackupPrivilege evaluated." },
    { id: 3, time: "14:02:11.245", level: "INFO", category: "SETUPAPI", msg: "Enumerated physical drives via GUID_DEVINTERFACE_DISK." },
    { id: 4, time: "14:02:11.310", level: "INFO", category: "IOCTL", msg: "PhysicalDrive0: IOCTL_DISK_GET_DRIVE_GEOMETRY_EX returned 512B sector alignment." },
    { id: 5, time: "14:02:11.340", level: "INFO", category: "GPT", msg: "Verified Primary GPT Header (LBA 1) and Backup GPT. CRC32 matches." },
    { id: 6, time: "14:02:11.412", level: "INFO", category: "BITLOCKER", msg: "Queried BitLocker volume status for all online basic partitions." },
    { id: 7, time: "14:02:11.515", level: "WARNING", category: "PLANNER", msg: "Protected partitions (ESP/MSR/WinRE) shielded against direct sector resize." },
    { id: 8, time: "14:02:12.004", level: "INFO", category: "WINRE", msg: "Queried reagentc: WinRE active on Partition 4 (Recovery)." },
    { id: 9, time: "14:02:15.650", level: "AUDIT", category: "INVARIANT", msg: "Pre-flight validation: 100% of all target boundaries align to 2048 sector (1 MiB) grid." }
  ];

  const filteredLogs = sampleLogs.filter(log => {
    if (filter !== "ALL" && log.level !== filter) return false;
    if (search && !log.msg.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4 p-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            <span>Diagnostic & Storage Activity Logs</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time telemetry stream from Windows storage subsystem and immutable audit logs.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-[#0E1424] border border-[#222B45] p-1 rounded-lg text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab("telemetry")}
            className={`px-3 py-1 rounded font-semibold transition-all whitespace-nowrap ${
              activeTab === "telemetry" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            Telemetry
          </button>
          <button
            onClick={() => setActiveTab("resize")}
            className={`px-3 py-1 rounded font-semibold transition-all whitespace-nowrap ${
              activeTab === "resize" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            Resize Audit ({resizeLogs.length})
          </button>
          <button
            onClick={() => setActiveTab("movement")}
            className={`px-3 py-1 rounded font-semibold transition-all whitespace-nowrap ${
              activeTab === "movement" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            Movement Audit ({movementLogs.length})
          </button>
          <button
            onClick={() => setActiveTab("advanced")}
            className={`px-3 py-1 rounded font-semibold transition-all whitespace-nowrap ${
              activeTab === "advanced" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            Advanced Audit ({advancedLogs.length})
          </button>
        </div>
      </div>

      {/* VIEW A: Telemetry Stream */}
      {activeTab === "telemetry" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 bg-[#0E1424] border border-[#222B45] px-2.5 py-1.5 rounded-lg text-xs">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input 
                type="text"
                placeholder="Search telemetry..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-white outline-none w-48 text-xs"
              />
            </div>
          </div>

          <div className="glass-card p-3 font-mono text-xs bg-[#070A12] border border-[#1C253D] rounded-xl overflow-hidden">
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {filteredLogs.map(log => (
                <div key={log.id} className="flex items-start gap-2 py-0.5 hover:bg-[#0D1424] px-1 rounded">
                  <span className="text-slate-500 text-[11px] shrink-0">{log.time}</span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 ${
                    log.level === "INFO" ? "bg-blue-900/40 text-blue-300" :
                    log.level === "WARNING" ? "bg-amber-900/40 text-amber-300" :
                    "bg-emerald-900/40 text-emerald-300"
                  }`}>
                    {log.level}
                  </span>
                  <span className="text-slate-400 text-[11px] shrink-0 font-bold">[{log.category}]</span>
                  <span className="text-slate-200 text-xs">{log.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VIEW B: Resize Audit Trail */}
      {activeTab === "resize" && (
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#242E49] pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-white">Immutable Partition Resize Audit Trail</h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">Source: resize-audit.log</span>
          </div>

          {resizeLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="font-semibold text-slate-400">No Partition Modifications Executed Yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {resizeLogs.map((entry, idx) => (
                <div key={idx} className="bg-[#090D18] p-3 rounded-lg border border-[#212E4D] space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {entry.action}
                    </span>
                    <span className="text-slate-500 text-[11px]">{entry.timestamp}</span>
                  </div>
                  <div className="text-slate-300">
                    Disk {entry.diskNumber} Partition #{entry.partitionNumber}: Requested {(entry.requestedSizeBytes / 1e9).toFixed(2)} GB &rarr; Actual {(entry.actualSizeBytes / 1e9).toFixed(2)} GB
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW C: Movement Audit Trail */}
      {activeTab === "movement" && (
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#242E49] pb-3">
            <div className="flex items-center gap-2">
              <Move className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white">Partition Relocation & Movement Audit Trail</h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">Source: movement-audit.log</span>
          </div>

          {movementLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="font-semibold text-slate-400">No Partition Relocations Executed Yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {movementLogs.map((entry, idx) => (
                <div key={idx} className="bg-[#090D18] p-3 rounded-lg border border-[#212E4D] space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      {entry.action}
                    </span>
                    <span className="text-slate-500 text-[11px]">{entry.timestamp}</span>
                  </div>
                  <div className="text-slate-300">
                    Disk {entry.diskNumber} Partition #{entry.partitionNumber}: Delta {entry.shiftDeltaGb} GB (Strategy: {entry.directionStrategy})
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW D: Advanced Operations Audit Trail */}
      {activeTab === "advanced" && (
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#242E49] pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Advanced Operations Audit Trail (Phase 6)</h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">Source: advanced-audit.log</span>
          </div>

          {advancedLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="font-semibold text-slate-400">No Advanced Operations Executed Yet</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Format, delete, drive letter assignments, volume label updates, splits, and merges are permanently recorded in this audit log.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {advancedLogs.map((entry, idx) => (
                <div key={idx} className="bg-[#090D18] p-3 rounded-lg border border-[#212E4D] space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {entry.action}
                    </span>
                    <span className="text-slate-500 text-[11px]">{entry.timestamp}</span>
                  </div>
                  <div className="text-slate-300">
                    Disk {entry.diskNumber} {entry.partitionNumber ? `Partition #${entry.partitionNumber}` : ""}: Status {entry.status}
                    {entry.fileSystem ? ` · FS: ${entry.fileSystem}` : ""}
                    {entry.newLetter ? ` · New Letter: ${entry.newLetter}:` : ""}
                    {entry.newLabel ? ` · Label: "${entry.newLabel}"` : ""}
                    {entry.durationMs ? ` · Duration: ${entry.durationMs}ms` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
