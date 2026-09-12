import React, { useRef, useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Clock, MapPin } from 'lucide-react';

interface ReplayTimelineProps {
  dateFrom: Date;
  dateTo: Date;
  currentReplayTime: Date;
  onSeek: (targetDate: Date) => void;
  disabled?: boolean;
}

export const ReplayTimeline: React.FC<ReplayTimelineProps> = ({
  dateFrom,
  dateTo,
  currentReplayTime,
  onSeek,
  disabled = false,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [scrubPercent, setScrubPercent] = useState<number | null>(null);
  const seekTimerRef = useRef<NodeJS.Timeout | null>(null);

  const minTime = dateFrom.getTime();
  const maxTime = dateTo.getTime();
  const currentTime = currentReplayTime.getTime();
  const totalRange = maxTime - minTime || 1;

  const currentPercent = scrubPercent ?? Math.min(100, Math.max(0, ((currentTime - minTime) / totalRange) * 100));

  const updateFromPointer = (clientX: number, isFinal = false) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const pct = Math.min(1, Math.max(0, clickX / rect.width));
    setScrubPercent(pct * 100);

    const targetTimestamp = new Date(minTime + pct * totalRange);

    if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
    if (isFinal) {
      onSeek(targetTimestamp);
      setScrubPercent(null);
    } else {
      seekTimerRef.current = setTimeout(() => {
        onSeek(targetTimestamp);
      }, 80);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    setIsScrubbing(true);
    updateFromPointer(e.clientX, false);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbing && !disabled) {
      updateFromPointer(e.clientX, false);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbing) {
      setIsScrubbing(false);
      updateFromPointer(e.clientX, true);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Milestone years for timeline ticks
  const milestones = [
    { label: '2021', time: new Date('2021-09-01T00:00:00Z').getTime() },
    { label: '2022', time: new Date('2022-01-01T00:00:00Z').getTime() },
    { label: '2023', time: new Date('2023-01-01T00:00:00Z').getTime() },
    { label: '2024', time: new Date('2024-01-01T00:00:00Z').getTime() },
    { label: '2025', time: new Date('2025-01-01T00:00:00Z').getTime() },
    { label: '2026', time: new Date('2026-01-01T00:00:00Z').getTime() },
  ];

  return (
    <div className="bg-white border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] px-4 py-2 select-none text-[#121212]">
      <div className="flex items-center justify-between text-[11px] font-mono text-[#717182] mb-1.5">
        <span className="flex items-center gap-1 font-bold">
          <Clock className="w-3 h-3 text-[#1040C0]" />
          <span>Awal: <strong className="text-[#121212]">{format(dateFrom, 'yyyy-MM-dd')}</strong></span>
        </span>
        <span className="inline-flex items-center gap-1 bg-[#121212] text-white text-xs px-2.5 py-1 border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] font-black uppercase">
          <MapPin className="w-3 h-3 text-amber-400 stroke-[2.5]" />
          <span>Replay: {format(currentReplayTime, 'yyyy-MM-dd HH:mm')}</span>
        </span>
        <span className="font-bold">Akhir: <strong className="text-[#121212]">{format(dateTo, 'yyyy-MM-dd')}</strong></span>
      </div>

      {/* Interactive Track */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative h-6 flex items-center cursor-pointer touch-none group"
      >
        {/* Background track line */}
        <div className="w-full h-2 bg-[#F0F0F0] border-2 border-[#121212] overflow-hidden relative">
          {/* Progress fill up to replay cursor */}
          <div
            className="h-full bg-[#1040C0] transition-all duration-75"
            style={{ width: `${currentPercent}%` }}
          />
        </div>

        {/* Milestone Tick Marks */}
        {milestones.map((m) => {
          const mPct = ((m.time - minTime) / totalRange) * 100;
          if (mPct < 0 || mPct > 100) return null;
          return (
            <div
              key={m.label}
              className="absolute top-0 bottom-0 pointer-events-none flex flex-col items-center justify-end"
              style={{ left: `${mPct}%` }}
            >
              <div className="w-[2px] h-2.5 bg-[#121212] mb-0.5" />
              <span className="text-[9px] text-[#717182] font-mono font-bold -translate-x-1/2">{m.label}</span>
            </div>
          );
        })}

        {/* Draggable Replay Cursor Handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-[#F59E0B] border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] transition-transform group-hover:scale-125 z-10"
          style={{ left: `${currentPercent}%` }}
        />
      </div>
    </div>
  );
};
