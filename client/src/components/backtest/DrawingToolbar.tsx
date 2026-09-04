import React from 'react';
import {
  MousePointer2,
  Crosshair,
  Minus,
  SplitSquareVertical,
  TrendingUp,
  Square,
  Binary,
  Ruler,
  ArrowUpRight,
  ArrowDownRight,
  Trash2,
  Lock,
  Unlock,
  Eraser,
} from 'lucide-react';

export type DrawingTool =
  | 'cursor'
  | 'crosshair'
  | 'hline'
  | 'vline'
  | 'trendline'
  | 'rect'
  | 'fibonacci'
  | 'measure'
  | 'long_position'
  | 'short_position';

interface DrawingToolbarProps {
  activeTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  onDeleteSelected?: () => void;
  onDeleteAll?: () => void;
  hasSelectedDrawing?: boolean;
  hasDrawings?: boolean;
  lockRR?: boolean;
  onToggleLockRR?: () => void;
}

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  activeTool,
  onToolChange,
  onDeleteSelected,
  onDeleteAll,
  hasSelectedDrawing,
  hasDrawings,
  lockRR = false,
  onToggleLockRR,
}) => {
  const tools: Array<{ id: DrawingTool; label: string; icon: React.ReactNode; shortcut: string }> = [
    { id: 'cursor', label: 'Cursor (Pan / Drag)', icon: <MousePointer2 className="w-4 h-4" />, shortcut: 'Esc' },
    { id: 'crosshair', label: 'Crosshair', icon: <Crosshair className="w-4 h-4" />, shortcut: 'C' },
    { id: 'hline', label: 'Horizontal Line', icon: <Minus className="w-4 h-4" />, shortcut: 'H' },
    { id: 'vline', label: 'Vertical Line', icon: <SplitSquareVertical className="w-4 h-4" />, shortcut: 'V' },
    { id: 'trendline', label: 'Trendline', icon: <TrendingUp className="w-4 h-4" />, shortcut: 'T' },
    { id: 'rect', label: 'Rectangle (Zone)', icon: <Square className="w-4 h-4" />, shortcut: 'R' },
    { id: 'fibonacci', label: 'Fibonacci Retracement', icon: <Binary className="w-4 h-4" />, shortcut: 'F' },
    { id: 'measure', label: 'Measure Ruler', icon: <Ruler className="w-4 h-4 text-cyan-400" />, shortcut: 'M' },
    { id: 'long_position', label: 'Long Position Tool', icon: <ArrowUpRight className="w-4 h-4 text-emerald-400" />, shortcut: 'L' },
    { id: 'short_position', label: 'Short Position Tool', icon: <ArrowDownRight className="w-4 h-4 text-rose-400" />, shortcut: 'S' },
  ];

  return (
    <div className="flex flex-col items-center bg-slate-900/95 backdrop-blur border border-slate-800 rounded-xl p-1.5 gap-1 shadow-2xl z-20 select-none shrink-0">
      {tools.map((t) => {
        const isActive = activeTool === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onToolChange(t.id)}
            title={`${t.label} (${t.shortcut})`}
            className={`relative group p-2 rounded-lg transition-all active:scale-95 ${
              isActive
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50 ring-1 ring-blue-400/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {t.icon}
            
            {/* Tooltip on hover */}
            <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-slate-850 text-slate-200 text-[11px] font-medium rounded-md shadow-xl border border-slate-700 whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
              <div className="flex items-center gap-1.5">
                <span>{t.label}</span>
                <span className="bg-slate-750 text-slate-300 px-1 py-0.2 rounded font-mono text-[9px] border border-slate-650">{t.shortcut}</span>
              </div>
            </div>
          </button>
        );
      })}

      <div className="w-5 h-[1px] bg-slate-800 my-1" />

      {/* Lock RR Toggle for Position Tools */}
      {onToggleLockRR && (
        <button
          type="button"
          onClick={onToggleLockRR}
          title={lockRR ? 'Lock RR: ON (TP otomatis menyesuaikan SL)' : 'Lock RR: OFF'}
          className={`relative group p-2 rounded-lg transition-all active:scale-95 ${
            lockRR
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          {lockRR ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-slate-850 text-slate-200 text-[11px] font-medium rounded-md shadow-xl border border-slate-700 whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
            {lockRR ? 'Lock RR: ON (Kunci Rasio)' : 'Lock RR: OFF'}
          </div>
        </button>
      )}

      {/* Delete Selected Tool */}
      {hasSelectedDrawing && onDeleteSelected && (
        <button
          type="button"
          onClick={onDeleteSelected}
          title="Hapus Gambar Terpilih (Delete / Backspace)"
          className="relative group p-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition-all active:scale-95"
        >
          <Trash2 className="w-4 h-4" />
          <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-slate-850 text-rose-300 text-[11px] font-medium rounded-md shadow-xl border border-slate-700 whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
            Hapus Terpilih (Del)
          </div>
        </button>
      )}

      {/* Clear All Drawings */}
      {hasDrawings && onDeleteAll && (
        <button
          type="button"
          onClick={onDeleteAll}
          title="Hapus Semua Gambar di Chart"
          className="relative group p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-all active:scale-95"
        >
          <Eraser className="w-4 h-4" />
          <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-slate-850 text-slate-300 text-[11px] font-medium rounded-md shadow-xl border border-slate-700 whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
            Hapus Semua Gambar
          </div>
        </button>
      )}
    </div>
  );
};
