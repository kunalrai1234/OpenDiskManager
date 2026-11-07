import React, { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { DiskOverview } from "./components/DiskOverview";
import { GraphicalPartitionMap } from "./components/GraphicalPartitionMap";
import { PartitionTable } from "./components/PartitionTable";
import { PartitionInspector } from "./components/PartitionInspector";
import { SpacePlanningView } from "./components/SpacePlanningView";
import { PendingOperationsPanel } from "./components/PendingOperationsPanel";
import { ExecutionDiffModal } from "./components/ExecutionDiffModal";
import { ResizeMoveModal } from "./components/ResizeMoveModal";
import { PartitionMovementModal } from "./components/PartitionMovementModal";
import { AdvancedOperationsModal } from "./components/AdvancedOperationsModal";
import { StorageAnalyzerView } from "./components/StorageAnalyzerView";
import { OperationsQueueView } from "./components/OperationsQueueView";
import { LogsView } from "./components/LogsView";
import { SettingsView } from "./components/SettingsView";
import { AboutView } from "./components/AboutView";

import { REAL_STORAGE_DATA, fetchLiveStorageTopology } from "./data/realStorage";
import { MOCK_DISKS, INITIAL_QUEUED_OPS, INITIAL_HISTORY } from "./data/mockDisks";
import "./styles/designSystem.css";

export function App() {
  // Default to Real Host Storage Data detected directly from Windows
  const [disks, setDisks] = useState(REAL_STORAGE_DATA.disks);
  const [isRealData, setIsRealData] = useState(true);
  const [activeProfile, setActiveProfile] = useState("real");
  const [selectedDiskId, setSelectedDiskId] = useState(0);
  const [selectedPartitionId, setSelectedPartitionId] = useState("disk0-part3"); // Default to C: Windows OS
  const [currentTab, setCurrentTab] = useState("disk-mgmt");
  const [pendingOperations, setPendingOperations] = useState([]);
  const [history, setHistory] = useState([]);
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [isResizeModalOpen, setIsResizeModalOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isAdvancedModalOpen, setIsAdvancedModalOpen] = useState(false);
  const [advancedModalMode, setAdvancedModalMode] = useState("FORMAT");
  const [targetActionPartition, setTargetActionPartition] = useState(null);
  const [isPendingPanelOpen, setIsPendingPanelOpen] = useState(false);
  const [detectionError, setDetectionError] = useState(null);

  // Auto-scan real storage on mount
  useEffect(() => {
    async function loadRealData() {
      try {
        const live = await fetchLiveStorageTopology();
        if (live && live.disks && live.disks.length > 0) {
          setDisks(live.disks);
          setIsRealData(true);
          setSelectedDiskId(live.disks[0].id);
          // Auto-select Windows OS partition if present
          const sysPart = live.disks[0].partitions.find(p => p.category === "SYSTEM") || live.disks[0].partitions[0];
          if (sysPart) {
            setSelectedPartitionId(sysPart.id);
          }
        }
      } catch (err) {
        console.error("Failed to load real storage topology:", err);
        setDetectionError(err.message || "Failed to query Windows storage APIs.");
      }
    }

    loadRealData();
  }, []);

  // Active selected disk & partition
  const activeDisk = disks.find((d) => d.id === selectedDiskId) || disks[0] || REAL_STORAGE_DATA.disks[0];
  const activePartition = (activeDisk && activeDisk.partitions) 
    ? (activeDisk.partitions.find((p) => p.id === selectedPartitionId) || activeDisk.partitions[0])
    : null;

  // Refresh handler (Live re-scan)
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setDetectionError(null);
    try {
      if (activeProfile === "real") {
        const live = await fetchLiveStorageTopology();
        if (live && live.disks && live.disks.length > 0) {
          setDisks(live.disks);
          setIsRealData(true);
        }
      } else {
        // Mock profile refresh delay
        await new Promise(r => setTimeout(r, 600));
      }
    } catch (err) {
      setDetectionError("Rescan failed: " + err.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Profile switcher
  const handleProfileChange = (profileKey) => {
    setActiveProfile(profileKey);
    setDetectionError(null);

    if (profileKey === "real") {
      setDisks(REAL_STORAGE_DATA.disks);
      setIsRealData(true);
      setSelectedDiskId(0);
      const sysPart = REAL_STORAGE_DATA.disks[0].partitions.find(p => p.category === "SYSTEM");
      if (sysPart) setSelectedPartitionId(sysPart.id);
    } else if (profileKey === "single-nvme") {
      setDisks([MOCK_DISKS[0]]);
      setIsRealData(false);
      setSelectedDiskId(0);
      setSelectedPartitionId(MOCK_DISKS[0].partitions[2].id);
    } else if (profileKey === "dual-ssd") {
      setDisks([MOCK_DISKS[0], MOCK_DISKS[1]]);
      setIsRealData(false);
      setSelectedDiskId(0);
      setSelectedPartitionId(MOCK_DISKS[0].partitions[2].id);
    } else {
      setDisks(MOCK_DISKS);
      setIsRealData(false);
      setSelectedDiskId(0);
      setSelectedPartitionId(MOCK_DISKS[0].partitions[2].id);
    }
  };

  // Operation queue handlers
  const handleUndo = () => {
    setPendingOperations((prev) => prev.slice(0, -1));
  };

  const handleDiscard = () => {
    setPendingOperations([]);
  };

  const handleStageOperation = (newOp) => {
    setPendingOperations((prev) => [...prev, newOp]);
    setIsPendingPanelOpen(true);
  };

  const handleCommitSuccess = () => {
    const newHistoryEntries = pendingOperations.map((op, idx) => ({
      id: `hist-${Date.now()}-${idx}`,
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
      action: op.action,
      disk: `PhysicalDrive${op.diskId}`,
      details: `${op.title} (${op.details})`,
      status: "COMMITTED"
    }));

    setHistory((prev) => [...newHistoryEntries, ...prev]);
    setPendingOperations([]);
    setIsPendingPanelOpen(false);
  };

  // Partition action triggers
  const handleActionClick = (actionType, partition) => {
    setTargetActionPartition(partition);
    setSelectedPartitionId(partition.id);

    if (["FORMAT", "DELETE", "LETTER", "LABEL", "SPLIT", "MERGE"].includes(actionType)) {
      setAdvancedModalMode(actionType);
      setIsAdvancedModalOpen(true);
    } else if (actionType === "MOVE") {
      setIsMoveModalOpen(true);
    } else if (actionType === "RESIZE_MOVE" || actionType === "SHRINK" || actionType === "EXTEND") {
      setIsResizeModalOpen(true);
    } else if (actionType === "PROPERTIES") {
      // Already selected in inspector
    } else if (actionType === "PLAN_SPACE") {
      setCurrentTab("space-planner");
    } else if (actionType === "CREATE") {
      handleStageOperation({
        id: `op-${Date.now()}`,
        action: "CREATE_PARTITION",
        title: `Create Volume in Unallocated Region on Disk ${activeDisk.id}`,
        diskId: activeDisk.id,
        partitionId: partition.id,
        targetLbaRange: `LBA ${partition.startLba.toLocaleString()} -> ${partition.endLba.toLocaleString()}`,
        currentSizeGb: 0,
        targetSizeGb: parseFloat((partition.sizeBytes / 1e9).toFixed(1)),
        deltaGb: parseFloat((partition.sizeBytes / 1e9).toFixed(1)),
        severity: "SAFE",
        status: "PENDING",
        details: `Creates new Basic Data partition formatted with NTFS in detected free region.`
      });
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#090D16]">
      {/* Top Application Header */}
      <Header
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        pendingCount={pendingOperations.length}
        onOpenOperations={() => setIsDiffModalOpen(true)}
        activeProfile={activeProfile}
        onProfileChange={handleProfileChange}
        isRealData={isRealData}
        hostDiskModel={activeDisk ? activeDisk.model : "NVMe Micron 2450"}
      />

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          disks={disks}
          selectedDiskId={selectedDiskId}
          onSelectDisk={(id) => {
            setSelectedDiskId(id);
            const d = disks.find((x) => x.id === id);
            if (d && d.partitions.length > 0) {
              setSelectedPartitionId(d.partitions[0].id);
            }
          }}
          pendingCount={pendingOperations.length}
        />

        {/* Center / Right Content Panel */}
        <main className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
          {/* Error Alert Banner if detection had an issue */}
          {detectionError && (
            <div className="bg-rose-500/15 border border-rose-500/30 rounded-lg p-3 text-xs text-rose-300 flex items-center justify-between">
              <span>{detectionError}</span>
              <button onClick={() => setDetectionError(null)} className="text-rose-400 font-bold hover:text-white">✕</button>
            </div>
          )}

          {/* View 1: Disk Management (Main Visualizer & Extents Table) */}
          {(currentTab === "disk-mgmt" || currentTab === "overview" || currentTab === "partition-mgr") && (
            <>
              {/* Physical Drive Summary & Stat Cards */}
              <DiskOverview disk={activeDisk} allDisks={disks} />

              {/* Graphical Partition Map (The Centerpiece) */}
              <GraphicalPartitionMap
                disk={activeDisk}
                selectedPartitionId={selectedPartitionId}
                onSelectPartition={setSelectedPartitionId}
                onQuickAction={handleActionClick}
              />

              {/* Two Column Layout: Partition Table & Partition Inspector */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-2">
                  <PartitionTable
                    disk={activeDisk}
                    selectedPartitionId={selectedPartitionId}
                    onSelectPartition={setSelectedPartitionId}
                    onActionClick={handleActionClick}
                  />
                </div>

                <div className="xl:col-span-1">
                  <PartitionInspector
                    partition={activePartition}
                    disk={activeDisk}
                    onAction={handleActionClick}
                  />
                </div>
              </div>
            </>
          )}

          {/* View: Space Planning Engine (Phase 3 Core Feature) */}
          {currentTab === "space-planner" && (
            <SpacePlanningView
              disks={disks}
              onStageOperation={handleStageOperation}
              onNavigateToQueue={() => setCurrentTab("operations-queue")}
            />
          )}

          {/* View 2: Storage Analyzer */}
          {currentTab === "storage-analyzer" && (
            <StorageAnalyzerView disks={disks} />
          )}

          {/* View 3: Operations Queue */}
          {currentTab === "operations-queue" && (
            <OperationsQueueView
              operations={pendingOperations}
              history={history}
              onUndo={handleUndo}
              onDiscard={handleDiscard}
              onApply={() => setIsDiffModalOpen(true)}
            />
          )}

          {/* View 4: System Logs */}
          {currentTab === "logs" && <LogsView />}

          {/* View 5: Settings */}
          {currentTab === "settings" && (
            <SettingsView
              activeProfile={activeProfile}
              onProfileChange={handleProfileChange}
            />
          )}

          {/* View 6: About */}
          {currentTab === "about" && <AboutView />}
        </main>
      </div>

      {/* Floating Pending Operations Panel */}
      <PendingOperationsPanel
        operations={pendingOperations}
        onUndo={handleUndo}
        onDiscard={handleDiscard}
        onApply={() => setIsDiffModalOpen(true)}
        isOpen={isPendingPanelOpen}
        onToggle={() => setIsPendingPanelOpen((prev) => !prev)}
      />

      {/* Execution Diff & Simulation Modal */}
      <ExecutionDiffModal
        isOpen={isDiffModalOpen}
        onClose={() => setIsDiffModalOpen(false)}
        operations={pendingOperations}
        onCommitSuccess={handleCommitSuccess}
      />

      {/* Interactive Resize Modal */}
      <ResizeMoveModal
        isOpen={isResizeModalOpen}
        onClose={() => setIsResizeModalOpen(false)}
        partition={targetActionPartition}
        disk={activeDisk}
        onStageOperation={handleStageOperation}
      />

      {/* Phase 5: Partition Movement & Relocation Modal */}
      <PartitionMovementModal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        partition={targetActionPartition}
        disk={activeDisk}
        onStageOperation={handleStageOperation}
      />

      {/* Phase 6: Advanced Partition Operations Modal */}
      <AdvancedOperationsModal
        isOpen={isAdvancedModalOpen}
        onClose={() => setIsAdvancedModalOpen(false)}
        initialMode={advancedModalMode}
        partition={targetActionPartition}
        disk={activeDisk}
        allDisks={disks}
        onStageOperation={handleStageOperation}
        onOperationSuccess={() => {
          handleRefresh();
        }}
      />
    </div>
  );
}
