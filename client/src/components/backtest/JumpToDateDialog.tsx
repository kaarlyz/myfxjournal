import React, { useState } from 'react';
import { Calendar, Clock, ArrowRight, X, Dices, RotateCcw } from 'lucide-react';
import { format, subDays, subWeeks, subMonths } from 'date-fns';

interface JumpToDateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onJump: (targetDate: Date) => void;
  onRandomStart?: () => void;
  currentReplayTime: Date;
}

export const JumpToDateDialog: React.FC<JumpToDateDialogProps> = ({
  isOpen,
  onClose,
  onJump,
  onRandomStart,
  currentReplayTime,
}) => {
  const [dateTimeStr, setDateTimeStr] = useState<string>(
    format(currentReplayTime, "yyyy-MM-dd'T'HH:mm")
  );

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const d = new Date(dateTimeStr);
    if (!isNaN(d.getTime())) {
      onJump(d);
      onClose();
    }
  };

  const handlePreset = (date: Date) => {
    onJump(date);
    onClose();
  };

  const now = new Date('2026-08-20T00:00:00Z'); // dataset reference date
  const presets = [
    { label: '1 Hari Lalu', date: subDays(currentReplayTime, 1) },
    { label: '1 Minggu Lalu', date: subWeeks(currentReplayTime, 1) },
    { label: '1 Bulan Lalu', date: subMonths(currentReplayTime, 1) },
    { label: 'Awal Dataset (2021-09-01)', date: new Date('2021-09-01T00:00:00Z') },
    { label: 'Summer Rally (2024-06-03)', date: new Date('2024-06-03T03:00:00Z') },
    { label: 'Puncak 2025 (2025-08-01)', date: new Date('2025-08-01T03:00:00Z') },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Navigasi Waktu Historis (Chart Replay)</h2>
              <p className="text-[11px] text-slate-400">Pilih titik awal backtest dari dataset Dukascopy 2021–2026</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Random & Quick Action Buttons */}
        {onRandomStart && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onRandomStart();
                onClose();
              }}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all active:scale-95"
            >
              <Dices className="w-4 h-4 text-amber-400" />
              <span>🎲 Random Start</span>
            </button>
            <button
              type="button"
              onClick={() => handlePreset(new Date('2021-09-01T00:00:00Z'))}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all active:scale-95"
            >
              <RotateCcw className="w-4 h-4 text-blue-400" />
              <span>First Available</span>
            </button>
          </div>
        )}

        {/* Quick Presets */}
        <div>
          <div className="text-[11px] font-medium text-slate-400 mb-1.5">Preset Waktu Cepat:</div>
          <div className="grid grid-cols-2 gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => handlePreset(p.date)}
                className="text-left px-2.5 py-1.5 bg-slate-800/80 hover:bg-blue-600 hover:text-white text-slate-300 rounded-lg border border-slate-700/60 text-xs transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Form Input for Exact Date & Time */}
        <form onSubmit={handleSubmit} className="space-y-3 pt-2 border-t border-slate-800">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Pilih Tanggal & Jam Spesifik:
            </label>
            <input
              type="datetime-local"
              value={dateTimeStr}
              min="2021-09-01T00:00"
              max="2026-08-20T23:59"
              onChange={(e) => setDateTimeStr(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-sm focus:outline-none focus:border-blue-500 transition-colors"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md active:scale-95"
            >
              <span>Mulai Replay di Sini</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
