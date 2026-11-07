import React, { useState, useEffect } from "react";
import { 
  PieChart, 
  HardDrive, 
  Layers, 
  Database, 
  Cpu, 
  FolderGit2, 
  BarChart3, 
  Percent,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Compass,
  RefreshCw,
  Info,
  KeyRound
} from "lucide-react";
import { detectStorageConfigurationIssues, detectConfigIssues } from "../engine/advancedEngine";

export function StorageAnalyzerView({ disks }) {
  const [diagnostics, setDiagnostics] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedDiskFilter, setSelectedDiskFilter] = useState("ALL");

  // Run initial diagnostic scan from topology
  useEffect(() => {
    if (disks && disks.length > 0) {
      const clientDiag = detectStorageConfigurationIssues(disks);
      setDiagnostics(clientDiag);
    }
  }, [disks]);

  // Live Deep Diagnostics Scan via Native Backend
  const handleLiveDiagnosticScan = async () => {
    setIsScanning(true);
    try {
      const liveRes = await detectConfigIssues();
      if (liveRes && liveRes.issues) {
        setDiagnostics(liveRes);
      } else {
        // Fallback to client-side diagnostics
        setDiagnostics(detectStorageConfigurationIssues(disks));
      }
    } catch (err) {
      setDiagnostics(detectStorageConfigurationIssues(disks));
    } finally {
      setIsScanning(false);
    }
  };

  // Aggregate stats
  const totalPhysicalBytes = disks.reduce((sum, d) => sum + d.totalSizeBytes, 0);
  const totalPhysicalGb = (totalPhysicalBytes / 1e9).toFixed(1);

  // Group by filesystem
  const fsDistribution = {};
  let totalAllocatedBytes = 0;
  let totalUsedBytes = 0;
  const allPartitions = [];

  disks.forEach(disk => {
    disk.partitions.forEach(p => {
      if (p.category !== "UNALLOCATED") {
        totalAllocatedBytes += p.sizeBytes;
        totalUsedBytes += (p.usedBytes || 0);

        const fs = p.fsType || "RAW";
        if (!fsDistribution[fs]) {
          fsDistribution[fs] = { sizeBytes: 0, count: 0 };
        }
        fsDistribution[fs].sizeBytes += p.sizeBytes;
        fsDistribution[fs].count += 1;

        allPartitions.push({
          ...p,
          diskId: disk.id,
          diskModel: disk.model
        });
      }
    });
  });

  const totalUnallocatedBytes = totalPhysicalBytes - totalAllocatedBytes;
  const usedPercent = totalAllocatedBytes > 0 ? Math.round((totalUsedBytes / totalAllocatedBytes) * 100) : 0;

  const filteredPartitions = selectedDiskFilter === "ALL" 
    ? allPartitions 
    : allPartitions.filter(p => p.diskId === Number(selectedDiskFilter));

  return (
    <div className="space-y-5 p-2">
      {/* View Header with Live Diagnostics Scan Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <PieChart className="w-5 h-5 text-blue-400" />
            <span>Storage Analyzer & System Configuration Diagnostics</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Phase 6 deep filesystem inspections, cluster allocations, and conflict diagnostics.
          </p>
        </div>

        <button
          onClick={handleLiveDiagnosticScan}
          disabled={isScanning}
          className="btn btn-secondary btn-sm flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin text-blue-400" : ""}`} />
          <span>{isScanning ? "Scanning Topology..." : "Run Storage Diagnostics"}</span>
        </button>
      </div>

      {/* Configuration Issues & Health Banner */}
      {diagnostics && (
        <div className={`p-4 rounded-xl border ${
          diagnostics.issues && diagnostics.issues.length > 0 
            ? "bg-rose-950/20 border-rose-500/40" 
            : diagnostics.warnings && diagnostics.warnings.length > 0
            ? "bg-[#0C1222] border-blue-500/30"
            : "bg-emerald-950/20 border-emerald-500/30"
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {diagnostics.issues && diagnostics.issues.length > 0 ? (
                <ShieldAlert className="w-5 h-5 text-rose-400" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              )}
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Storage Configuration Diagnostics:{" "}
                <span className={diagnostics.issues && diagnostics.issues.length > 0 ? "text-rose-400" : "text-emerald-400"}>
                  {diagnostics.status || "HEALTHY"}
                </span>
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {diagnostics.totalIssuesCount || 0} Issues · {diagnostics.totalWarningsCount || 0} Advisory Warnings
            </span>
          </div>

          {/* Issues List */}
          <div className="space-y-1.5 mt-2">
            {diagnostics.issues && diagnostics.issues.map((iss, idx) => (
              <div key={idx} className="bg-rose-900/30 border border-rose-700/40 rounded p-2 text-xs text-rose-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold font-mono text-[11px] uppercase mr-2">{iss.code}:</span>
                  <span>{iss.message}</span>
                </div>
              </div>
            ))}

            {diagnostics.warnings && diagnostics.warnings.map((warn, idx) => (
              <div key={idx} className="bg-[#121B32] border border-[#213057] rounded p-2 text-xs text-slate-300 flex items-start gap-2">
                <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold font-mono text-[11px] uppercase text-cyan-300 mr-2">{warn.code}:</span>
                  <span>{warn.message}</span>
                </div>
              </div>
            ))}

            {(!diagnostics.issues || diagnostics.issues.length === 0) && (!diagnostics.warnings || diagnostics.warnings.length === 0) && (
              <p className="text-xs text-emerald-300/80">
                All volumes passed 1 MiB physical sector alignment, unique drive letter assignment, and filesystem structural integrity checks.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Top Storage High-Level Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="glass-card p-4">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Total Hardware Capacity
          </span>
          <p className="text-2xl font-bold font-mono text-white mt-1">
            {totalPhysicalGb} <span className="text-sm font-normal text-slate-400">GB</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Across {disks.length} Physical Drives (NVMe, SATA, USB)
          </p>
        </div>

        <div className="glass-card p-4">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Overall Filesystem Consumption
          </span>
          <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">
            {(totalUsedBytes / 1e9).toFixed(1)} <span className="text-sm font-normal text-slate-400">GB ({usedPercent}%)</span>
          </p>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mt-2">
            <div 
              className="h-full bg-emerald-500 rounded-full" 
              style={{ width: `${usedPercent}%` }}
            />
          </div>
        </div>

        <div className="glass-card p-4">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Total Raw Unallocated Space
          </span>
          <p className="text-2xl font-bold font-mono text-amber-400 mt-1">
            {(totalUnallocatedBytes / 1e9).toFixed(1)} <span className="text-sm font-normal text-slate-400">GB</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Available for volume expansion and new partition creation
          </p>
        </div>
      </div>

      {/* Filesystem Breakdown Table */}
      <div className="glass-card p-4">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-cyan-400" />
          <span>Filesystem Distribution & Format Summary</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(fsDistribution).map(([fs, data]) => {
            const gb = (data.sizeBytes / 1e9).toFixed(1);
            const pct = totalAllocatedBytes > 0 ? ((data.sizeBytes / totalAllocatedBytes) * 100).toFixed(1) : "0";
            return (
              <div key={fs} className="bg-[#0E1424] border border-[#222B45] rounded-lg p-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-white font-mono">{fs}</span>
                  <span className="text-xs text-blue-400 font-semibold">{pct}%</span>
                </div>
                <p className="text-xs text-slate-300 font-mono">{gb} GB</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{data.count} volume{data.count > 1 ? "s" : ""}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed Volume & Cluster Allocation Table */}
      <div className="glass-card p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <span>Filesystem & Cluster Geometry Registry</span>
          </h3>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Filter Disk:</span>
            <select
              value={selectedDiskFilter}
              onChange={(e) => setSelectedDiskFilter(e.target.value)}
              className="bg-[#12182B] border border-[#222E4E] rounded px-2 py-1 text-xs text-white"
            >
              <option value="ALL">All Disks</option>
              {disks.map(d => (
                <option key={d.id} value={d.id}>Disk {d.id} ({d.model})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#090D18] text-slate-400 text-[10px] uppercase tracking-wider border-b border-[#1E263D]">
              <tr>
                <th className="py-2.5 px-3">Volume / Partition</th>
                <th className="py-2.5 px-3">Physical Disk</th>
                <th className="py-2.5 px-3">File System</th>
                <th className="py-2.5 px-3">Cluster Size</th>
                <th className="py-2.5 px-3">Capacity</th>
                <th className="py-2.5 px-3">Used / Free</th>
                <th className="py-2.5 px-3">Total Clusters</th>
                <th className="py-2.5 px-3">Security & Features</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182138] font-mono">
              {filteredPartitions.map((p) => {
                const clusterSize = p.clusterSize || 4096;
                const totalClusters = Math.floor(p.sizeBytes / clusterSize);
                const usedGb = ((p.usedBytes || 0) / 1e9).toFixed(1);
                const totalGb = (p.sizeBytes / 1e9).toFixed(1);
                const freeGb = Math.max(0, (p.sizeBytes - (p.usedBytes || 0)) / 1e9).toFixed(1);
                const isNtfs = (p.fsType || "").toUpperCase() === "NTFS";

                return (
                  <tr key={`${p.diskId}-${p.id}`} className="hover:bg-[#12192F] transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="font-sans font-semibold text-white flex items-center gap-1.5">
                        {p.volumeLetter ? (
                          <span className="w-5 h-5 rounded bg-blue-500/20 text-blue-300 flex items-center justify-center text-xs font-mono font-bold">
                            {p.volumeLetter[0]}
                          </span>
                        ) : (
                          <span className="w-5 h-5 rounded bg-slate-800 text-slate-400 flex items-center justify-center text-xs font-mono">
                            -
                          </span>
                        )}
                        <span>{p.label || "Volume"}</span>
                        <span className="text-[10px] text-slate-500 font-mono">#{p.partitionNumber}</span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 font-sans text-slate-300">
                      Disk {p.diskId}
                    </td>

                    <td className="py-2.5 px-3 font-bold text-slate-200">
                      {p.fsType || "RAW"}
                    </td>

                    <td className="py-2.5 px-3 text-cyan-300">
                      {clusterSize} Bytes
                    </td>

                    <td className="py-2.5 px-3 text-white font-semibold">
                      {totalGb} GB
                    </td>

                    <td className="py-2.5 px-3 text-slate-300">
                      <span className="text-emerald-400">{usedGb} GB</span> / <span className="text-cyan-400">{freeGb} GB</span>
                    </td>

                    <td className="py-2.5 px-3 text-slate-400">
                      {totalClusters.toLocaleString()}
                    </td>

                    <td className="py-2.5 px-3 font-sans">
                      <div className="flex items-center gap-1">
                        {p.isBitLocker && (
                          <span className="badge badge-warning text-[9px] flex items-center gap-1">
                            <KeyRound className="w-2.5 h-2.5" /> BitLocker
                          </span>
                        )}
                        {isNtfs && (
                          <span className="badge badge-info text-[9px]">LFS 3.1</span>
                        )}
                        {p.category === "SYSTEM" && (
                          <span className="badge badge-healthy text-[9px]">OS Active</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
