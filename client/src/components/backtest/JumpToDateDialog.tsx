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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-end md:justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm select-none">
      <div className="relative w-full max-w-md bg-white border-t-4 md:border-4 border-[#121212] shadow-[0px_-4px_24px_rgba(0,0,0,0.25)] md:shadow-[8px_8px_0px_0px_#121212] rounded-t-2xl md:rounded-xl p-5 space-y-4">
        {/* Top Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-[4px] bg-[#1040C0] rounded-t-2xl md:rounded-t-lg" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#121212]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg border-2 border-[#121212] bg-[#EAF2FF] flex items-center justify-center text-[#1040C0] shadow-[1px_1px_0px_0px_#121212]">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-[#121212] font-mono">Pilih Titik Awal</h2>
              <p className="text-[10px] text-[#717182] font-bold uppercase tracking-wider">Dataset Dukascopy 2021–2026</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 border-2 border-[#121212] bg-white rounded-lg text-[#121212] hover:bg-[#F0F0F0] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none flex items-center justify-center transition-all"
            aria-label="Tutup dialog"
          >
            <X className="w-4 h-4 font-bold" strokeWidth={2.5} />
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
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-[#F0C020] text-[#121212] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] rounded-lg text-xs font-black uppercase font-mono active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
            >
              <Dices className="w-4 h-4" />
              <span>🎲 Random Start</span>
            </button>
            <button
              type="button"
              onClick={() => handlePreset(new Date('2021-09-01T00:00:00Z'))}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white text-[#121212] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] rounded-lg text-xs font-black uppercase font-mono hover:bg-[#F0F0F0] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              <span>First Available</span>
            </button>
          </div>
        )}

        {/* Quick Presets */}
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#717182] mb-2">Pilih Cepat:</div>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => handlePreset(p.date)}
                className="text-left px-3 py-2 bg-white hover:bg-[#EAF2FF] hover:text-[#1040C0] text-[#121212] rounded-lg border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] text-xs font-mono font-bold transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Form Input for Exact Date & Time */}
        <form onSubmit={handleSubmit} className="space-y-4 pt-3 border-t-2 border-[#121212]">
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[#717182] mb-1.5">
              Tanggal & Jam Spesifik:
            </label>
            <input
              type="datetime-local"
              value={dateTimeStr}
              min="2021-09-01T00:00"
              max="2026-08-20T23:59"
              onChange={(e) => setDateTimeStr(e.target.value)}
              className="w-full bg-white border-2 border-[#121212] rounded-lg px-3 py-2 text-[#121212] font-mono font-bold text-sm shadow-[2px_2px_0px_0px_#121212] focus:outline-none focus:bg-[#FFFDEB] transition-colors"
              required
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg bg-white border-2 border-[#121212] hover:bg-[#F0F0F0] text-[#121212] text-xs font-extrabold uppercase font-mono shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#1040C0] hover:bg-[#0C3299] text-white text-xs font-black uppercase font-mono border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
            >
              <span>Mulai Replay di Sini</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
