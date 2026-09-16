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
  Sparkles,
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
  isAiCopilotOpen?: boolean;
  onToggleAiCopilot?: () => void;
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
  isAiCopilotOpen = true,
  onToggleAiCopilot,
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
    <div className="flex flex-col items-center bg-white border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] p-1 gap-1 z-20 select-none shrink-0">
      {/* Prominent AI Copilot Button */}
      {onToggleAiCopilot && (
        <button
          type="button"
          onClick={onToggleAiCopilot}
          title={isAiCopilotOpen ? 'Sembunyikan AI Copilot' : 'Tampilkan AI Copilot'}
          className={`relative group p-2 transition-all active:scale-95 cursor-pointer ${
            isAiCopilotOpen
              ? 'bg-[#FFD000] text-[#121212] border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212]'
              : 'border-2 border-transparent text-[#1040C0] hover:bg-[#FFFDEB] hover:border-[#121212]'
          }`}
        >
          <Sparkles className="w-4 h-4 text-[#1040C0] stroke-[2.5]" />
          <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-white text-[#121212] text-[11px] font-bold border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 flex items-center gap-1.5">
            <span>⚡ MurplyFX AI Copilot</span>
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
          </div>
        </button>
      )}

      {onToggleAiCopilot && <div className="w-5 h-[2px] bg-[#121212] my-0.5" />}
      {tools.map((t) => {
        const isActive = activeTool === t.id;
        const activeClass =
          t.id === 'long_position'
            ? 'bg-[#E7F9F0] text-[#059669] border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212]'
            : t.id === 'short_position'
              ? 'bg-[#FDECEC] text-[#DC2626] border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212]'
              : 'bg-[#EBF2FF] text-[#1040C0] border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212]';

        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onToolChange(t.id)}
            title={`${t.label} (${t.shortcut})`}
            className={`relative group p-2 transition-all active:scale-95 cursor-pointer ${
              isActive
                ? activeClass
                : 'border-2 border-transparent text-[#121212] hover:text-[#121212] hover:bg-[#FFFDEB] hover:border-[#121212]'
            }`}
          >
            {t.icon}
            
            {/* Tooltip on hover */}
            <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-white text-[#121212] text-[11px] font-bold border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
              <div className="flex items-center gap-1.5">
                <span>{t.label}</span>
                <span className="bg-[#F0F0F0] text-[#121212] px-1 py-0.2 font-mono text-[9px] border border-[#121212]">{t.shortcut}</span>
              </div>
            </div>
          </button>
        );
      })}

      <div className="w-5 h-[2px] bg-[#121212] my-1" />

      {/* Lock RR Toggle for Position Tools */}
      {onToggleLockRR && (
        <button
          type="button"
          onClick={onToggleLockRR}
          title={lockRR ? 'Lock RR: ON (TP otomatis menyesuaikan SL)' : 'Lock RR: OFF'}
          className={`relative group p-2 transition-all active:scale-95 cursor-pointer ${
            lockRR
              ? 'bg-[#FEF3C7] text-[#D97706] border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212]'
              : 'border-2 border-transparent text-[#121212] hover:text-[#121212] hover:bg-[#FFFDEB] hover:border-[#121212]'
          }`}
        >
          {lockRR ? <Lock className="w-4 h-4 stroke-[2.5]" /> : <Unlock className="w-4 h-4 stroke-[2.5]" />}
          <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-white text-[#121212] text-[11px] font-bold border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
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
          className="relative group p-2 text-[#DC2626] hover:bg-[#FDECEC] border-2 border-transparent hover:border-[#121212] transition-all active:scale-95 cursor-pointer"
        >
          <Trash2 className="w-4 h-4 stroke-[2.5]" />
          <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-white text-[#DC2626] text-[11px] font-bold border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
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
          className="relative group p-2 text-[#121212] hover:bg-[#FFFDEB] border-2 border-transparent hover:border-[#121212] transition-all active:scale-95 cursor-pointer"
        >
          <Eraser className="w-4 h-4 stroke-[2.5]" />
          <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-white text-[#121212] text-[11px] font-bold border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
            Hapus Semua Gambar
          </div>
        </button>
      )}
    </div>
  );
};
