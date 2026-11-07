import React from "react";
import { 
  ListTree, 
  History, 
  Play, 
  RotateCcw, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Layers,
  ArrowRight
} from "lucide-react";

export function OperationsQueueView({ 
  operations, 
  history, 
  onUndo, 
  onDiscard, 
  onApply 
}) {
  return (
    <div className="space-y-6 p-2">
      {/* View Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <ListTree className="w-5 h-5 text-blue-400" />
            <span>Operations Queue & Transaction Scheduler</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Pending partition modifications awaiting two-phase transactional execution.
          </p>
        </div>

        {operations.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={onUndo}
              className="btn btn-secondary btn-sm"
              title="Undo last operation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>
            <button
              onClick={onDiscard}
              className="btn btn-danger btn-sm"
              title="Discard all queued actions"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Discard All</span>
            </button>
            <button
              onClick={onApply}
              className="btn btn-primary btn-sm px-4"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Apply Operations ({operations.length})</span>
            </button>
          </div>
        )}
      </div>

      {/* Pending Queue Section */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center justify-between">
          <span>Staged Operations Queue ({operations.length})</span>
          <span className="text-[11px] text-slate-400 font-normal">
            Actions execute sequentially in strict order
          </span>
        </h3>

        {operations.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            <Clock className="w-7 h-7 mx-auto mb-2 text-slate-600" />
            <p className="font-medium text-slate-400">Queue is Empty</p>
            <p className="text-slate-600 mt-0.5">
              Select a partition from Disk Management to resize, move, or extend.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {operations.map((op, idx) => (
              <div 
                key={op.id || idx}
                className="bg-[#0E1424] border border-[#222B45] rounded-lg p-3 text-xs flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 font-bold font-mono text-xs flex items-center justify-center border border-blue-500/30">
                    {idx + 1}
                  </span>
                  <div>
                    <span className="font-bold text-white text-sm block">
                      {op.title}
                    </span>
                    <span className="text-slate-400 text-xs mt-0.5 block">
                      {op.details}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                      Target Range: {op.targetLbaRange}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="badge badge-info text-[10px] mb-1">
                    {op.status}
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-400 block">
                    {op.deltaGb !== 0 ? `${op.deltaGb > 0 ? "+" : ""}${op.deltaGb} GB` : "Shift Start Sector"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Operation History Section */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <History className="w-4 h-4 text-cyan-400" />
          <span>Execution Audit History</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B0F1A] text-slate-400 border-b border-[#242E49] text-[11px] uppercase">
              <tr>
                <th className="py-2 px-3">Timestamp</th>
                <th className="py-2 px-3">Action</th>
                <th className="py-2 px-3">Target Disk / Volume</th>
                <th className="py-2 px-3">Details</th>
                <th className="py-2 px-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D253B]">
              {history.map((hist) => (
                <tr key={hist.id} className="hover:bg-[#121829]">
                  <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">
                    {hist.timestamp}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-white">
                    {hist.action}
                  </td>
                  <td className="py-2.5 px-3 text-blue-300">
                    {hist.disk}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">
                    {hist.details}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="badge badge-healthy text-[10px]">
                      <CheckCircle2 className="w-3 h-3" /> {hist.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

