import React from "react";
import { 
  LayoutDashboard, 
  HardDrive, 
  PieChart, 
  ListTree, 
  History, 
  FileText, 
  Settings, 
  Info, 
  Layers,
  CheckCircle,
  Database,
  Usb,
  Cpu,
  GitFork
} from "lucide-react";

export function Sidebar({ 
  currentTab, 
  onSelectTab, 
  disks, 
  selectedDiskId, 
  onSelectDisk,
  pendingCount
}) {
  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "disk-mgmt", label: "Disk Management", icon: HardDrive },
    { id: "space-planner", label: "Space Planner", icon: GitFork },
    { id: "partition-mgr", label: "Partition Manager", icon: Layers },
    { id: "storage-analyzer", label: "Storage Analyzer", icon: PieChart },
    { id: "operations-queue", label: "Operations Queue", icon: ListTree, badge: pendingCount },
    { id: "logs", label: "System Logs", icon: FileText },
    { id: "settings", label: "Settings", icon: Settings },
    { id: "about", label: "About", icon: Info },
  ];

  return (
    <aside className="w-[250px] bg-[#0E1322] border-r border-[#242E49] flex flex-col justify-between shrink-0 select-none">
      {/* Top: Navigation Links */}
      <div className="p-3 space-y-6 overflow-y-auto">
        <div>
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Main Navigation
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive 
                      ? "bg-blue-600/15 text-blue-400 font-semibold border border-blue-500/30 shadow-sm shadow-blue-500/10" 
                      : "text-slate-400 hover:text-slate-200 hover:bg-[#161D31]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? "text-blue-400" : "text-slate-500"}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[10px]">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Physical Disks Selector List */}
        <div>
          <div className="px-3 pb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span>Physical Drives ({disks.length})</span>
            <span className="text-[9px] bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 px-1 rounded font-mono">ONLINE</span>
          </div>
          <div className="space-y-1.5">
            {disks.map((disk) => {
              const isSelected = selectedDiskId === disk.id;
              const isUsb = (disk.busType || "").toLowerCase().includes("usb");
              const isNvme = (disk.busType || "").toLowerCase().includes("nvme");
              const sizeGb = (disk.totalSizeBytes / 1e9).toFixed(1);

              return (
                <div
                  key={disk.id}
                  onClick={() => onSelectDisk(disk.id)}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                    isSelected 
                      ? "bg-[#182138] border-blue-500/50 shadow-md shadow-blue-500/10" 
                      : "bg-[#121727] border-[#222B45] hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      {isUsb ? (
                        <Usb className="w-3.5 h-3.5 text-amber-400" />
                      ) : isNvme ? (
                        <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                      ) : (
                        <Database className="w-3.5 h-3.5 text-blue-400" />
                      )}
                      <span className="font-semibold text-xs text-slate-200">
                        Disk {disk.id}
                      </span>
                      {disk.isSystemDisk && (
                        <span className="text-[9px] bg-blue-500/20 text-blue-300 font-bold px-1 rounded">
                          OS
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono font-medium text-slate-300">
                      {sizeGb} GB
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">
                    {disk.model}
                  </p>
                  <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-500">
                    <span className="font-mono">{disk.partitionStyle}</span>
                    <span className="text-emerald-400 font-medium">{disk.healthPercent}% Healthy</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom: Storage Subsystem Status */}
      <div className="p-3 border-t border-[#242E49] bg-[#0B0F1A]">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-slate-400 font-medium">Subsystem:</span>
          <span className="text-emerald-400 font-semibold flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Ready
          </span>
        </div>
        <div className="text-[10px] text-slate-500 flex justify-between font-mono">
          <span>Engine v0.3.0</span>
          <span>Read-Only Planner</span>
        </div>
      </div>
    </aside>
  );
}
