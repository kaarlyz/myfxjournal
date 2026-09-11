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
    { id: 'measure', label: 'Measure Ruler', icon: <Ruler className="w-4 h-4" />, shortcut: 'M' },
    { id: 'long_position', label: 'Long Position Tool', icon: <ArrowUpRight className="w-4 h-4 text-[#059669]" />, shortcut: 'L' },
    { id: 'short_position', label: 'Short Position Tool', icon: <ArrowDownRight className="w-4 h-4 text-[#DC2626]" />, shortcut: 'S' },
  ];

  return (
    <div className="flex flex-col items-center bg-white border border-slate-200 shadow-sm p-1 gap-1 z-20 select-none shrink-0 rounded-xl">
      {tools.map((t) => {
        const isActive = activeTool === t.id;
        const activeClass =
          t.id === 'long_position'
            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm'
            : t.id === 'short_position'
              ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-sm'
              : 'bg-blue-50 text-blue-600 border border-blue-200 shadow-sm';

        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onToolChange(t.id)}
            title={`${t.label} (${t.shortcut})`}
            className={`relative group p-2 transition-all active:scale-95 rounded-md border ${
              isActive
                ? activeClass
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100 hover:border-slate-200'
            }`}
          >
            {t.icon}
            
            {/* Tooltip on hover */}
            <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-slate-50 text-slate-700 text-[11px] font-medium border border-slate-200 shadow-sm whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
              <div className="flex items-center gap-1.5">
                <span>{t.label}</span>
                <span className="bg-slate-100 text-slate-600 px-1 py-0.2 font-mono text-[9px] border border-slate-200">{t.shortcut}</span>
              </div>
            </div>
          </button>
        );
      })}

      <div className="w-5 h-[2px] bg-slate-200 my-1" />

      {/* Lock RR Toggle for Position Tools */}
      {onToggleLockRR && (
        <button
          type="button"
          onClick={onToggleLockRR}
          title={lockRR ? 'Lock RR: ON (TP otomatis menyesuaikan SL)' : 'Lock RR: OFF'}
          className={`relative group p-2 transition-all active:scale-95 rounded-md border ${
            lockRR
              ? 'bg-amber-50 text-amber-600 border border-amber-200 shadow-sm'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100 hover:border-slate-200'
          }`}
        >
          {lockRR ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-slate-50 text-slate-700 text-[11px] font-medium border border-slate-200 shadow-sm whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
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
          className="relative group p-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-all active:scale-95 border border-transparent hover:border-rose-200"
        >
          <Trash2 className="w-4 h-4" />
          <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-slate-50 text-rose-600 text-[11px] font-medium border border-slate-200 shadow-sm whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
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
          className="relative group p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all active:scale-95 border border-transparent hover:border-slate-200"
        >
          <Eraser className="w-4 h-4" />
          <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-slate-50 text-slate-700 text-[11px] font-medium border border-slate-200 shadow-sm whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
            Hapus Semua Gambar
          </div>
        </button>
      )}
    </div>
  );
};
