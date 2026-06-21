import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  CalendarDay,
  CalendarTrade,
  DailyStats,
  buildCalendarMonth,
  buildDailyStatsMap,
  getInitialCalendarMonth,
  getTradeCalendarDate,
  getTradePnl,
  getTradeTime,
} from '../utils/calendarStats';
import { formatPercent, formatPnL } from '../utils/numberUtils';

interface JournalCalendarProps {
  mode: 'BACKTEST' | 'LIVE';
  trades: CalendarTrade[];
  title?: string;
  currency?: string;
  selectedMonth?: Date;
  timezone?: string;
  onDayClick?: (stats: DailyStats | null, day: CalendarDay) => void;
  compact?: boolean;
  storageKey?: string;
  defaultCollapsed?: boolean;
  contextType?: 'BACKTEST_SESSION' | 'LIVE_ACCOUNT';
  contextId?: string | null;
  hideSummaryCards?: boolean;
  hideLegend?: boolean;
}

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const fullDateFormatter = new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' });
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function resultLabel(trade: CalendarTrade) {
  const result = String(trade.result || '').toUpperCase();
  if (result) return result;
  const pnl = getTradePnl(trade);
  if (pnl > 0) return 'WIN';
  if (pnl < 0) return 'LOSS';
  return 'BE';
}

function dayClass(day: CalendarDay) {
  const pnl = day.stats?.totalPnl || 0;
  const hasTrades = !!day.stats?.tradeCount;
  if (!day.inMonth) return 'bg-[#11151b] border-[#202630] opacity-45';
  if (!hasTrades) return 'bg-[#181a20] border-[#2b3139] hover:border-[#3a4149]';
  if (pnl > 0) return 'bg-[rgba(14,203,129,0.09)] border-[rgba(14,203,129,0.26)] hover:border-[#0ecb81]';
  if (pnl < 0) return 'bg-[rgba(246,70,93,0.09)] border-[rgba(246,70,93,0.26)] hover:border-[#f6465d]';
  return 'bg-[#1e2329] border-[#3a4149] hover:border-[#707a8a]';
}

function pnlClass(value: number) {
  if (value > 0) return 'text-[#0ecb81]';
  if (value < 0) return 'text-[#f6465d]';
  return 'text-[#929aa5]';
}

function maxLossStreak(trades: CalendarTrade[]) {
  let current = 0;
  let max = 0;
  trades.forEach((trade) => {
    if (getTradePnl(trade) < 0) {
      current += 1;
      max = Math.max(max, current);
    } else if (getTradePnl(trade) > 0) {
      current = 0;
    }
  });
  return max;
}

function dailyComment(stats: DailyStats | null) {
  if (!stats) return 'No trades on this day.';
  if (stats.totalPnl < 0 && stats.losses >= stats.wins) return 'Drawdown day: kerugian lebih dominan, review entry setelah loss.';
  if (stats.tradeCount >= 10) return 'Overtrade day: jumlah trade tinggi, cek apakah semua setup valid.';
  if (stats.totalPnl > 0 && stats.wins > stats.losses) return 'Recovery/profit day: pertahankan setup yang paling bersih.';
  if (stats.totalPnl === 0) return 'Break-even day: kualitas entry perlu dicek karena hasil tidak berkembang.';
  return 'Mixed day: cek trade terbaik dan terburuk untuk menemukan pola.';
}

function readStoredCollapsed(storageKey?: string, fallback = false) {
  if (!storageKey || typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(storageKey);
  if (value === 'true') return false;
  if (value === 'false') return true;
  return fallback;
}

export default function JournalCalendar({
  mode,
  trades = [],
  title = 'Journal Calendar',
  currency = 'USD',
  selectedMonth,
  timezone,
  onDayClick,
  compact = false,
  storageKey,
  defaultCollapsed = false,
  contextType,
  contextId,
  hideSummaryCards = false,
  hideLegend = false,
}: JournalCalendarProps) {
  const safeTrades = Array.isArray(trades) ? trades : [];
  const initialMonth = selectedMonth || getInitialCalendarMonth(safeTrades, mode);
  const [visibleMonth, setVisibleMonth] = useState(new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [collapsed, setCollapsed] = useState(() => readStoredCollapsed(storageKey, defaultCollapsed));
  const [dailyNote, setDailyNote] = useState('');
  const [noteLoaded, setNoteLoaded] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteLastSavedAt, setNoteLastSavedAt] = useState<string | null>(null);

  const latestCalendarDate = useMemo(() => {
    return safeTrades.reduce((latest, trade) => {
      const raw = getTradeCalendarDate(trade, mode);
      if (!raw) return latest;
      const ms = new Date(raw).getTime();
      return Number.isFinite(ms) && ms > latest ? ms : latest;
    }, 0);
  }, [safeTrades, mode]);

  useEffect(() => {
    if (selectedMonth) {
      setVisibleMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1));
      return;
    }
    const next = getInitialCalendarMonth(safeTrades, mode);
    setVisibleMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  }, [selectedMonth, latestCalendarDate, mode]);

  const dailyStats = useMemo(() => buildDailyStatsMap(safeTrades, mode, timezone), [safeTrades, mode, timezone]);
  const days = useMemo(
    () => buildCalendarMonth(visibleMonth.getFullYear(), visibleMonth.getMonth(), dailyStats),
    [visibleMonth, dailyStats]
  );

  const monthDays = days.filter(day => day.inMonth);
  const monthStats = monthDays
    .map(day => day.stats)
    .filter(Boolean) as DailyStats[];
  const monthPnl = monthStats.reduce((sum, stat) => sum + stat.totalPnl, 0);
  const profitableDays = monthStats.filter(stat => stat.totalPnl > 0).length;
  const losingDays = monthStats.filter(stat => stat.totalPnl < 0).length;
  const breakEvenDays = monthStats.filter(stat => stat.tradeCount > 0 && stat.totalPnl === 0).length;
  const noTradeDays = monthDays.length - monthStats.length;
  const bestDay = monthStats.reduce<DailyStats | null>((best, stat) => !best || stat.totalPnl > best.totalPnl ? stat : best, null);
  const worstDay = monthStats.reduce<DailyStats | null>((worst, stat) => !worst || stat.totalPnl < worst.totalPnl ? stat : worst, null);
  const averageDailyPnl = monthStats.length ? monthPnl / monthStats.length : 0;

  const moveMonth = (direction: number) => {
    setVisibleMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
  };

  const openDay = (day: CalendarDay) => {
    setSelectedDay({
      ...day,
      stats: day.stats ? { ...day.stats, trades: Array.isArray(day.stats.trades) ? day.stats.trades : [] } : null,
    });
    onDayClick?.(day.stats, day);
  };

  useEffect(() => {
    let active = true;
    if (!selectedDay || !contextType || !contextId) {
      setDailyNote('');
      setNoteLoaded(false);
      setNoteError(null);
      setNoteLastSavedAt(null);
      return;
    }

    setDailyNote('');
    setNoteLoaded(false);
    setNoteError(null);
    setNoteLastSavedAt(null);

    const loadNote = async () => {
      try {
        const params = new URLSearchParams({
          scope: contextType,
          contextId,
          dateKey: selectedDay.dateKey,
        });
        const res = await fetch(`/api/journal-notes?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to load daily note');
        const data = await res.json();
        if (!active) return;
        setDailyNote(data.note?.note ?? data.text ?? '');
        setNoteLastSavedAt(data.note?.updatedAt || data.updatedAt || data.note?.createdAt || data.createdAt || null);
      } catch (error: any) {
        if (!active) return;
        setNoteError(error.message || 'Failed to load daily note');
      } finally {
        if (active) setNoteLoaded(true);
      }
    };

    loadNote();
    return () => {
      active = false;
    };
  }, [selectedDay?.dateKey, contextType, contextId]);

  const saveDailyNote = async () => {
    if (!selectedDay || !contextType || !contextId) return;
    setNoteSaving(true);
    setNoteError(null);
    try {
      const res = await fetch('/api/journal-notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: contextType,
          contextId,
          dateKey: selectedDay.dateKey,
          note: dailyNote,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to save daily note');
      }
      const data = await res.json();
      setDailyNote(data.note?.note ?? dailyNote);
      setNoteLastSavedAt(data.note?.updatedAt || new Date().toISOString());
    } catch (error: any) {
      setNoteError(error.message || 'Failed to save daily note');
    } finally {
      setNoteSaving(false);
      setNoteLoaded(true);
    }
  };

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      if (storageKey && typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, String(!next));
      }
      return next;
    });
  };

  return (
    <section className="bn-card border border-[#2b3139] rounded-xl p-4 md:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-[#fcd535]" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">{title}</h3>
            <span className="text-[10px] px-2 py-0.5 rounded bg-[#2b3139] text-[#929aa5]">{mode}</span>
          </div>
          <p className="text-xs text-[#707a8a] mt-1">
            Daily trading performance by realized PnL and trade count.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={toggleCollapsed} className="px-3 py-2 rounded-lg bg-[#fcd535] hover:bg-[#f0b90b] text-[#181a20] text-xs font-bold">
            {collapsed ? 'Show Calendar' : 'Hide Calendar'}
          </button>
          {!collapsed && <button onClick={() => moveMonth(-1)} className="p-2 rounded-lg bg-[#2b3139] hover:bg-[#363e47] text-[#eaecef]">
            <ChevronLeft className="w-4 h-4" />
          </button>}
          <div className="min-w-40 text-center px-3 py-2 rounded-lg border border-[#2b3139] bg-[#181a20] text-sm font-bold text-white">
            {monthFormatter.format(visibleMonth)}
          </div>
          {!collapsed && <button onClick={() => moveMonth(1)} className="p-2 rounded-lg bg-[#2b3139] hover:bg-[#363e47] text-[#eaecef]">
            <ChevronRight className="w-4 h-4" />
          </button>}
          {!collapsed && <button onClick={() => setVisibleMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="px-3 py-2 rounded-lg bg-[#2b3139] hover:bg-[#363e47] text-[#eaecef] text-xs font-bold">
            Today
          </button>}
        </div>
      </div>

      {!hideSummaryCards && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 text-xs">
          <div className="rounded-lg bg-[#181a20] border border-[#2b3139] p-3">
            <div className="text-[#707a8a]">Month PnL</div>
            <div className={`text-base font-bold ${pnlClass(monthPnl)}`}>{formatPnL(monthPnl, currency)}</div>
          </div>
          <div className="rounded-lg bg-[#181a20] border border-[#2b3139] p-3">
            <div className="text-[#707a8a]">Profitable Days</div>
            <div className="text-base font-bold text-[#0ecb81]">{profitableDays}</div>
          </div>
          <div className="rounded-lg bg-[#181a20] border border-[#2b3139] p-3">
            <div className="text-[#707a8a]">Losing Days</div>
            <div className="text-base font-bold text-[#f6465d]">{losingDays}</div>
          </div>
          <div className="rounded-lg bg-[#181a20] border border-[#2b3139] p-3">
            <div className="text-[#707a8a]">No-Trade Days</div>
            <div className="text-base font-bold text-[#929aa5]">{noTradeDays}</div>
          </div>
          <div className="rounded-lg bg-[#181a20] border border-[#2b3139] p-3">
            <div className="text-[#707a8a]">Best Day</div>
            <div className="text-base font-bold text-[#0ecb81]">{bestDay ? formatPnL(bestDay.totalPnl, currency) : '-'}</div>
          </div>
          <div className="rounded-lg bg-[#181a20] border border-[#2b3139] p-3">
            <div className="text-[#707a8a]">Worst Day</div>
            <div className="text-base font-bold text-[#f6465d]">{worstDay ? formatPnL(worstDay.totalPnl, currency) : '-'}</div>
          </div>
          <div className="rounded-lg bg-[#181a20] border border-[#2b3139] p-3">
            <div className="text-[#707a8a]">Avg Daily PnL</div>
            <div className={`text-base font-bold ${pnlClass(averageDailyPnl)}`}>{formatPnL(averageDailyPnl, currency)}</div>
          </div>
        </div>
      )}

      {collapsed && (
        <div className="rounded-xl border border-[#2b3139] bg-[#181a20] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-white">{monthFormatter.format(visibleMonth)} summary</div>
            <div className="text-xs text-[#707a8a] mt-1">
              PnL <span className={pnlClass(monthPnl)}>{formatPnL(monthPnl, currency)}</span>
              <span className="mx-2">•</span>
              Profit days <span className="text-[#0ecb81]">{profitableDays}</span>
              <span className="mx-2">•</span>
              Loss days <span className="text-[#f6465d]">{losingDays}</span>
              <span className="mx-2">•</span>
              Best {bestDay ? <span className="text-[#0ecb81]">{formatPnL(bestDay.totalPnl, currency)}</span> : '-'}
              <span className="mx-2">•</span>
              Worst {worstDay ? <span className="text-[#f6465d]">{formatPnL(worstDay.totalPnl, currency)}</span> : '-'}
            </div>
          </div>
          <button onClick={toggleCollapsed} className="px-4 py-2 rounded-lg bg-[#fcd535] hover:bg-[#f0b90b] text-[#181a20] text-xs font-bold">
            Show Calendar
          </button>
        </div>
      )}

      {!collapsed && !hideLegend && <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#929aa5]">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#0ecb81]" /> Green = profit day</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#f6465d]" /> Red = loss day</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#707a8a]" /> Gray = break-even/no trades</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded border border-[#fcd535]" /> Yellow border = today</span>
        {breakEvenDays > 0 && <span>{breakEvenDays} break-even days</span>}
      </div>}

      {!collapsed && (safeTrades.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#3a4149] bg-[#181a20] p-8 text-center text-sm text-[#707a8a]">
          No trades available for calendar yet.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-7 gap-2">
            {weekdays.map(day => (
              <div key={day} className="text-center text-[10px] font-bold uppercase tracking-wider text-[#707a8a] py-1">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {days.map(day => {
              const stats = day.stats;
              const pnl = stats?.totalPnl || 0;
              const intensity = stats?.tradeCount ? Math.min(100, Math.max(20, Math.abs(pnl) / 10)) : 0;
              return (
                <button
                  key={day.dateKey}
                  onClick={() => openDay(day)}
                  title={stats ? `${day.dateKey}: ${formatPnL(pnl, currency)} / ${stats.tradeCount} trades` : day.dateKey}
                  className={`relative min-h-[92px] ${compact ? 'md:min-h-[72px]' : 'md:min-h-[116px]'} rounded-xl border p-2 text-left transition ${dayClass(day)} ${day.isToday ? 'ring-1 ring-[#fcd535]' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-xs font-bold ${day.inMonth ? 'text-[#eaecef]' : 'text-[#707a8a]'}`}>
                      {day.date.getDate()}
                    </span>
                    {stats?.openTrades ? (
                      <span className="rounded bg-[#fcd535] px-1.5 py-0.5 text-[9px] font-bold text-[#181a20]">
                        {stats.openTrades} open
                      </span>
                    ) : null}
                  </div>

                  {stats ? (
                    <div className="mt-2 space-y-1">
                      <div className={`text-xs md:text-sm font-bold truncate ${pnlClass(pnl)}`}>
                        {formatPnL(pnl, currency)}
                      </div>
                      <div className="text-[10px] text-[#929aa5] truncate">
                        {stats.tradeCount} trades · W{stats.wins}/L{stats.losses}
                      </div>
                      <div className="text-[10px] text-[#707a8a] truncate">
                        WR {formatPercent(stats.winrate)}
                      </div>
                      {!compact && (
                        <div className="text-[10px] text-[#707a8a] truncate">
                          Best {stats.bestTrade ? formatPnL(getTradePnl(stats.bestTrade), currency) : '-'}
                        </div>
                      )}
                      <div className="absolute bottom-2 left-2 right-2 h-1 rounded-full bg-black/30 overflow-hidden">
                        <div
                          className={`h-full ${pnl > 0 ? 'bg-[#0ecb81]' : pnl < 0 ? 'bg-[#f6465d]' : 'bg-[#707a8a]'}`}
                          style={{ width: `${intensity}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-6 text-[10px] text-[#3a4149]">No trades</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-3 md:p-5">
          <div className="w-full max-w-4xl max-h-[94vh] overflow-hidden rounded-xl border border-[#2b3139] bg-[#181a20] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#2b3139] p-5">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Daily Journal - {fullDateFormatter.format(selectedDay.date)}
                </h3>
                <p className="text-xs text-[#707a8a] mt-1">
                  {selectedDay.stats ? `${selectedDay.stats.tradeCount} trades reviewed for this day.` : 'No trades recorded for this day.'}
                </p>
              </div>
              <button onClick={() => setSelectedDay(null)} className="rounded-lg p-2 text-[#707a8a] hover:bg-[#2b3139] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[calc(94vh-88px)] overflow-y-auto p-4 md:p-5 space-y-5">
              <div className="rounded-xl border border-[#2b3139] bg-[#11151b] p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">Daily Note</div>
                    <div className="text-[10px] text-[#707a8a]">
                      {selectedDay.dateKey}
                      {noteLastSavedAt ? ` • Saved ${new Date(noteLastSavedAt).toLocaleString()}` : ''}
                    </div>
                  </div>
                  {contextType && contextId ? (
                    <button
                      onClick={saveDailyNote}
                      disabled={noteSaving}
                      className="px-3 py-2 rounded-lg bg-[#fcd535] hover:bg-[#f0b90b] text-[#181a20] text-xs font-bold disabled:opacity-60"
                    >
                      {noteSaving ? 'Saving...' : 'Save Note'}
                    </button>
                  ) : null}
                </div>
                {contextType && contextId ? (
                  <>
                    <textarea
                      value={dailyNote}
                      onChange={(e) => setDailyNote(e.target.value)}
                      rows={4}
                      className="w-full rounded-lg border border-[#2b3139] bg-[#181a20] px-3 py-2 text-sm text-white outline-none focus:border-[#fcd535]"
                      placeholder="Write the reason, lesson, or market context for this day..."
                    />
                    {!noteLoaded && <div className="text-[10px] text-[#707a8a]">Loading note...</div>}
                    {noteError && <div className="text-[10px] text-[#f6465d]">{noteError}</div>}
                  </>
                ) : (
                  <div className="text-xs text-[#707a8a]">Notes require a session or account context.</div>
                )}
              </div>

              {selectedDay.stats ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="rounded-lg border border-[#2b3139] bg-[#11151b] p-3">
                      <div className="text-[10px] text-[#707a8a]">Total PnL</div>
                      <div className={`text-base font-bold ${pnlClass(selectedDay.stats.totalPnl)}`}>{formatPnL(selectedDay.stats.totalPnl, currency)}</div>
                    </div>
                    <div className="rounded-lg border border-[#2b3139] bg-[#11151b] p-3">
                      <div className="text-[10px] text-[#707a8a]">Trades</div>
                      <div className="text-base font-bold text-white">{selectedDay.stats.tradeCount}</div>
                    </div>
                    <div className="rounded-lg border border-[#2b3139] bg-[#11151b] p-3">
                      <div className="text-[10px] text-[#707a8a]">Winrate</div>
                      <div className="text-base font-bold text-white">{formatPercent(selectedDay.stats.winrate)}</div>
                    </div>
                    <div className="rounded-lg border border-[#2b3139] bg-[#11151b] p-3">
                      <div className="text-[10px] text-[#707a8a]">Best Trade</div>
                      <div className="text-base font-bold text-[#0ecb81]">{selectedDay.stats.bestTrade ? formatPnL(getTradePnl(selectedDay.stats.bestTrade), currency) : '-'}</div>
                    </div>
                    <div className="rounded-lg border border-[#2b3139] bg-[#11151b] p-3">
                      <div className="text-[10px] text-[#707a8a]">Worst Trade</div>
                      <div className="text-base font-bold text-[#f6465d]">{selectedDay.stats.worstTrade ? formatPnL(getTradePnl(selectedDay.stats.worstTrade), currency) : '-'}</div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#2b3139] bg-[#11151b] p-3 text-xs text-[#929aa5]">
                    <div>Symbols: <span className="text-[#eaecef]">{selectedDay.stats.symbols.join(', ') || '-'}</span></div>
                    <div className="mt-1">Wins/Losses/BE: <span className="text-[#eaecef]">{selectedDay.stats.wins}/{selectedDay.stats.losses}/{selectedDay.stats.breakEven}</span></div>
                    <div className="mt-1">Max loss streak: <span className="text-[#eaecef]">{maxLossStreak(selectedDay.stats.trades)}</span></div>
                    <div className="mt-3 rounded-lg border border-[#2b3139] bg-[#181a20] p-3 text-[#eaecef]">
                      {dailyComment(selectedDay.stats)}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-[#2b3139]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#11151b] text-[#707a8a] uppercase">
                        <tr>
                          <th className="px-3 py-3">Time</th>
                          <th className="px-3 py-3">Symbol</th>
                          <th className="px-3 py-3">Side</th>
                          <th className="px-3 py-3">Result</th>
                          <th className="px-3 py-3">PnL</th>
                          <th className="px-3 py-3">R/R</th>
                          <th className="px-3 py-3">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2b3139]">
                        {selectedDay.stats.trades.map((trade, index) => {
                          const rawTime = getTradeTime(trade, mode);
                          const parsedTime = rawTime ? new Date(rawTime) : null;
                          const time = parsedTime && !Number.isNaN(parsedTime.getTime()) ? timeFormatter.format(parsedTime) : '-';
                          const pnl = getTradePnl(trade);
                          return (
                            <tr key={trade.id || index} className="text-[#eaecef]">
                              <td className="px-3 py-3 text-[#929aa5]">{time}</td>
                              <td className="px-3 py-3 font-semibold">{trade.symbol || '-'}</td>
                              <td className="px-3 py-3">{trade.side || '-'}</td>
                              <td className="px-3 py-3">{resultLabel(trade)}</td>
                              <td className={`px-3 py-3 font-bold ${pnlClass(pnl)}`}>{formatPnL(pnl, currency)}</td>
                              <td className="px-3 py-3">{trade.rMultiple ?? trade.rr ?? '-'}</td>
                              <td className="px-3 py-3 max-w-xs truncate text-[#929aa5]" title={trade.notes || ''}>{trade.notes || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-[#3a4149] p-8 text-center text-sm text-[#707a8a]">
                  No trades on this day.
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </section>
  );
}
