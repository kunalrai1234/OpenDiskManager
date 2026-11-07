import React from "react";
import { 
  Sliders, 
  RotateCcw, 
  Trash2, 
  Play, 
  ChevronUp, 
  ChevronDown,
  AlertCircle,
  Clock
} from "lucide-react";

export function PendingOperationsPanel({ 
  operations, 
  onUndo, 
  onDiscard, 
  onApply,
  isOpen,
  onToggle
}) {
  if (!operations || operations.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-[250px] right-0 z-30 transition-all duration-300">
      {/* Drawer Container */}
      <div className="bg-[#0E1424] border-t-2 border-blue-500 shadow-2xl shadow-black/80">
        {/* Header Bar */}
        <div 
          onClick={onToggle}
          className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-[#131A2F] border-b border-[#1E263D]"
        >
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-blue-500 text-white font-bold text-xs flex items-center justify-center">
              {operations.length}
            </span>
            <div>
              <span className="font-bold text-xs text-white">
                Pending Operations Queue
              </span>
              <span className="text-[11px] text-slate-400 ml-2">
                (Non-destructive: No physical writes until Applied)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onUndo}
              className="btn btn-ghost btn-sm text-slate-400 hover:text-white"
              title="Undo last action"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>
            <button
              onClick={onDiscard}
              className="btn btn-ghost btn-sm text-rose-400 hover:bg-rose-500/10"
              title="Discard all pending operations"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Discard All</span>
            </button>
            <button
              onClick={onApply}
              className="btn btn-primary btn-sm px-4 bg-gradient-to-r from-blue-600 to-indigo-600 shadow-md shadow-blue-500/30"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Apply Operations ({operations.length})</span>
            </button>
            <button
              onClick={onToggle}
              className="p-1 text-slate-400 hover:text-white"
            >
              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Collapsible Content */}
        {isOpen && (
          <div className="max-h-56 overflow-y-auto p-3 space-y-2 bg-[#090D16]">
            {operations.map((op, idx) => (
              <div 
                key={op.id || idx}
                className="bg-[#121829] border border-[#222B45] rounded-lg p-2.5 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-slate-500 font-bold text-[11px]">
                    #{idx + 1}
                  </span>
                  <div>
                    <span className="font-semibold text-white block">
                      {op.title}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {op.details}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs text-blue-300">
                    {op.deltaGb !== 0 ? `${op.deltaGb > 0 ? "+" : ""}${op.deltaGb} GB` : "Shift LBA"}
                  </span>
                  <span className="badge badge-info text-[10px]">
                    {op.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

