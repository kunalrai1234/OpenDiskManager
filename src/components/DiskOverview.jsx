import React from "react";
import { 
  HardDrive, 
  Layers, 
  Activity, 
  Thermometer, 
  ShieldCheck, 
  Database,
  Cpu,
  Clock,
  AlertCircle
} from "lucide-react";

export function DiskOverview({ disk, allDisks }) {
  // Aggregate stats across all disks
  const totalStorageBytes = allDisks.reduce((acc, d) => acc + d.totalSizeBytes, 0);
  const totalStorageGb = (totalStorageBytes / 1e9).toFixed(1);

  // Active disk calculations
  const diskSizeGb = (disk.totalSizeBytes / 1e9).toFixed(1);
  const unallocatedBytes = disk.partitions
    .filter(p => p.category === "UNALLOCATED")
    .reduce((acc, p) => acc + p.sizeBytes, 0);
  const unallocatedGb = (unallocatedBytes / 1e9).toFixed(1);

  const allocatedBytes = disk.totalSizeBytes - unallocatedBytes;
  const allocatedGb = (allocatedBytes / 1e9).toFixed(1);

  const totalPartitionsCount = disk.partitions.filter(p => p.category !== "UNALLOCATED").length;

  return (
    <div className="space-y-4">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Total Capacity Card */}
        <div className="glass-card p-3.5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Total Disk Space
            </p>
            <p className="text-xl font-bold font-mono text-white mt-0.5">
              {diskSizeGb} <span className="text-xs font-normal text-slate-400">GB</span>
            </p>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
              {(disk.totalSizeBytes / (1024**3)).toFixed(1)} GiB (Binary)
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <HardDrive className="w-5 h-5" />
          </div>
        </div>

        {/* Partitioned / Allocated Space Card */}
        <div className="glass-card p-3.5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Allocated Partitions
            </p>
            <p className="text-xl font-bold font-mono text-emerald-400 mt-0.5">
              {allocatedGb} <span className="text-xs font-normal text-slate-400">GB</span>
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {totalPartitionsCount} Active Partition{totalPartitionsCount > 1 ? "s" : ""}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Unallocated Space Card */}
        <div className="glass-card p-3.5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Unallocated Space
            </p>
            <p className="text-xl font-bold font-mono text-amber-400 mt-0.5">
              {unallocatedGb} <span className="text-xs font-normal text-slate-400">GB</span>
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {((unallocatedBytes / disk.totalSizeBytes) * 100).toFixed(1)}% Free on Platter/Flash
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Database className="w-5 h-5" />
          </div>
        </div>

        {/* S.M.A.R.T. Health Card */}
        <div className="glass-card p-3.5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Drive S.M.A.R.T. Health
            </p>
            <p className="text-xl font-bold font-mono text-cyan-400 mt-0.5 flex items-center gap-1.5">
              <span>{disk.healthPercent}%</span>
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Good
              </span>
            </p>
            <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
              <Thermometer className="w-3 h-3 text-amber-400" />
              <span>{disk.temperatureCelsius}°C</span>
              <span className="text-slate-600">|</span>
              <Clock className="w-3 h-3 text-slate-400" />
              <span>{disk.powerOnHours} hrs</span>
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Activity className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Selected Disk Technical Profile Strip */}
      <div className="bg-[#101626] border border-[#242E49] rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between text-xs gap-3">
        <div className="flex items-center gap-3">
          <span className="font-bold text-white text-sm flex items-center gap-2">
            Disk {disk.id}: {disk.model}
          </span>
          <span className="font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded text-[11px]">
            {disk.path}
          </span>
        </div>

        <div className="flex items-center gap-4 text-slate-300 font-mono text-[11px]">
          <div>
            <span className="text-slate-500">Bus:</span> {disk.busType}
          </div>
          <div>
            <span className="text-slate-500">Style:</span> {disk.partitionStyle}
          </div>
          <div>
            <span className="text-slate-500">Sector:</span> {disk.sectorSize}B / {disk.physicalSectorSize}B (4Kn)
          </div>
          <div>
            <span className="text-slate-500">S/N:</span> {disk.serialNumber}
          </div>
        </div>
      </div>
    </div>
  );
}

