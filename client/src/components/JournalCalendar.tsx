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
import { formatPercent, formatPnL, formatCompactPnL } from '../utils/numberUtils';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { apiUrl, defaultHeaders } from '../utils/api';

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
  if (!day.inMonth) return 'bg-[#F0F0F0]/40 border-2 border-dashed border-[#121212]/15 opacity-40 cursor-default';
  if (!hasTrades) return 'bg-white border-2 border-[#121212] hover:bg-[#F0F0F0] hover:shadow-[3px_3px_0px_0px_#121212] hover:-translate-y-0.5 hover:-translate-x-0.5';
  if (pnl > 0) return 'bg-[var(--profit-dim)] border-2 border-[var(--profit)] shadow-[2px_2px_0px_0px_var(--profit)] hover:shadow-[4px_4px_0px_0px_var(--profit)] hover:-translate-y-0.5 hover:-translate-x-0.5';
  if (pnl < 0) return 'bg-[var(--loss-dim)] border-2 border-[var(--loss)] shadow-[2px_2px_0px_0px_var(--loss)] hover:shadow-[4px_4px_0px_0px_var(--loss)] hover:-translate-y-0.5 hover:-translate-x-0.5';
  return 'bg-white border-2 border-[#121212] hover:bg-[#E0E0E0]';
}

function pnlClass(value: number) {
  if (value > 0) return 'text-[var(--profit)]';
  if (value < 0) return 'text-[var(--loss)]';
  return 'text-[#717182]';
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
        const res = await fetch(apiUrl(`/journal-notes?${params.toString()}`), { headers: defaultHeaders() });
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
      const res = await fetch(apiUrl('/journal-notes'), {
        method: 'PUT',
        headers: defaultHeaders({ 'Content-Type': 'application/json' }),
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
    <section className="bg-white border-2 border-[#121212] p-3 sm:p-4 md:p-6 shadow-[4px_4px_0px_0px_#121212] sm:shadow-[6px_6px_0px_0px_#121212] space-y-4 sm:space-y-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-[#1040C0] opacity-[0.03] rounded-full pointer-events-none transform translate-x-1/3 -translate-y-1/3" />
      
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 relative z-10">
        <div>
          <div className="flex items-center gap-2 sm:gap-3">
            <h3 className="text-lg sm:text-xl font-extrabold text-[#121212] uppercase tracking-wider font-display flex items-center gap-2">
              <CalendarDays className="w-4 h-4 sm:w-5 sm:h-5 text-[#1040C0]" />
              {title}
            </h3>
            <Badge variant="blue">{mode}</Badge>
          </div>
          <p className="text-[11px] sm:text-xs text-[#717182] mt-0.5 sm:mt-1 font-bold">
            Daily trading performance by realized PnL and trade count.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={toggleCollapsed} size="sm">
            {collapsed ? 'Show Calendar' : 'Hide Calendar'}
          </Button>
          {!collapsed && (
            <div className="flex items-center bg-[#F0F0F0] border-2 border-[#121212] p-0.5 sm:p-1 rounded-sm shadow-[2px_2px_0px_0px_#121212]">
              <button onClick={() => moveMonth(-1)} aria-label="Previous month" className="p-1 hover:bg-[#E0E0E0] text-[#121212] transition-colors rounded-sm">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="min-w-[100px] sm:min-w-[120px] text-center text-xs sm:text-[13px] font-extrabold text-[#121212] uppercase tracking-wider">
                {monthFormatter.format(visibleMonth)}
              </div>
              <button onClick={() => moveMonth(1)} aria-label="Next month" className="p-1 hover:bg-[#E0E0E0] text-[#121212] transition-colors rounded-sm">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          {!collapsed && (
            <Button variant="yellow" onClick={() => setVisibleMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} size="sm">
              Today
            </Button>
          )}
        </div>
      </div>

      {!hideSummaryCards && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3 text-xs relative z-10">
          <div className="bg-white border-2 border-[#121212] p-2.5 sm:p-3 shadow-[2px_2px_0px_0px_#121212]">
            <div className="text-[9px] sm:text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-0.5 sm:mb-1">Month PnL</div>
            <div className={`text-sm sm:text-base font-extrabold font-number truncate ${pnlClass(monthPnl)}`}>{formatPnL(monthPnl, currency)}</div>
          </div>
          <div className="bg-white border-2 border-[#121212] p-2.5 sm:p-3 shadow-[2px_2px_0px_0px_#121212]">
            <div className="text-[9px] sm:text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-0.5 sm:mb-1">Profitable Days</div>
            <div className="text-sm sm:text-base font-extrabold text-[var(--profit)] font-number">{profitableDays}</div>
          </div>
          <div className="bg-white border-2 border-[#121212] p-2.5 sm:p-3 shadow-[2px_2px_0px_0px_#121212]">
            <div className="text-[9px] sm:text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-0.5 sm:mb-1">Losing Days</div>
            <div className="text-sm sm:text-base font-extrabold text-[var(--loss)] font-number">{losingDays}</div>
          </div>
          <div className="bg-white border-2 border-[#121212] p-2.5 sm:p-3 shadow-[2px_2px_0px_0px_#121212]">
            <div className="text-[9px] sm:text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-0.5 sm:mb-1">No-Trade Days</div>
            <div className="text-sm sm:text-base font-extrabold text-[#717182] font-number">{noTradeDays}</div>
          </div>
          <div className="bg-white border-2 border-[#121212] p-2.5 sm:p-3 shadow-[2px_2px_0px_0px_#121212]">
            <div className="text-[9px] sm:text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-0.5 sm:mb-1">Best Day</div>
            <div className="text-sm sm:text-base font-extrabold text-[var(--profit)] font-number truncate">{bestDay ? formatPnL(bestDay.totalPnl, currency) : '-'}</div>
          </div>
          <div className="bg-white border-2 border-[#121212] p-2.5 sm:p-3 shadow-[2px_2px_0px_0px_#121212]">
            <div className="text-[9px] sm:text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-0.5 sm:mb-1">Worst Day</div>
            <div className="text-sm sm:text-base font-extrabold text-[var(--loss)] font-number truncate">{worstDay ? formatPnL(worstDay.totalPnl, currency) : '-'}</div>
          </div>
          <div className="bg-white border-2 border-[#121212] p-2.5 sm:p-3 shadow-[2px_2px_0px_0px_#121212] col-span-2 sm:col-span-1">
            <div className="text-[9px] sm:text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-0.5 sm:mb-1">Avg Daily PnL</div>
            <div className={`text-sm sm:text-base font-extrabold font-number truncate ${pnlClass(averageDailyPnl)}`}>{formatPnL(averageDailyPnl, currency)}</div>
          </div>
        </div>
      )}

      {collapsed && (
        <div className="bg-[#F0F0F0] border-2 border-[#121212] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[3px_3px_0px_0px_#121212]">
          <div>
            <div className="text-sm font-extrabold text-[#121212] uppercase tracking-widest">{monthFormatter.format(visibleMonth)} SUMMARY</div>
            <div className="text-xs font-bold text-[#717182] mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>PnL <span className={pnlClass(monthPnl)}>{formatPnL(monthPnl, currency)}</span></span>
              <span>•</span>
              <span>Profit days <span className="text-[var(--profit)]">{profitableDays}</span></span>
              <span>•</span>
              <span>Loss days <span className="text-[var(--loss)]">{losingDays}</span></span>
              <span>•</span>
              <span>Best {bestDay ? <span className="text-[var(--profit)]">{formatPnL(bestDay.totalPnl, currency)}</span> : '-'}</span>
              <span>•</span>
              <span>Worst {worstDay ? <span className="text-[var(--loss)]">{formatPnL(worstDay.totalPnl, currency)}</span> : '-'}</span>
            </div>
          </div>
          <Button variant="blue" onClick={toggleCollapsed}>
            Show Calendar
          </Button>
        </div>
      )}

      {!collapsed && !hideLegend && (
        <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold uppercase tracking-wider text-[#717182]">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[var(--profit)] border border-[#121212]" /> Profit day</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[var(--loss)] border border-[#121212]" /> Loss day</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-white border-2 border-[#121212]" /> Break-even / No trades</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-dashed border-[#121212]" /> Today</span>
          {breakEvenDays > 0 && <span className="ml-auto text-[#121212] bg-[#F0F0F0] px-2 py-0.5">{breakEvenDays} break-even days</span>}
        </div>
      )}

      {!collapsed && (safeTrades.length === 0 ? (
        <div className="border-2 border-dashed border-[#121212]/30 bg-[#F0F0F0] p-8 sm:p-10 text-center text-xs sm:text-sm font-bold text-[#717182]">
          No trades available for calendar yet.
        </div>
      ) : (
        <div className="space-y-1 sm:space-y-2">
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {weekdays.map(day => (
              <div key={day} className="text-center text-[9px] sm:text-[10px] md:text-xs font-extrabold uppercase tracking-wider sm:tracking-widest text-[#121212] py-1.5 sm:py-2 bg-[#F0F0F0] border-2 border-[#121212]">
                <span className="inline sm:hidden">{day.charAt(0)}</span>
                <span className="hidden sm:inline">{day}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {days.map(day => {
              const stats = day.stats;
              const pnl = stats?.totalPnl || 0;
              return (
                <button
                  key={day.dateKey}
                  onClick={() => openDay(day)}
                  disabled={!day.inMonth && !stats}
                  title={stats ? `${day.dateKey}: ${formatPnL(pnl, currency)} / ${stats.tradeCount} trades` : day.dateKey}
                  className={`relative min-h-[52px] sm:min-h-[64px] ${compact ? 'md:min-h-[72px]' : 'md:min-h-[116px]'} p-1 sm:p-1.5 md:p-2 text-left transition-all flex flex-col justify-between ${dayClass(day)} ${day.isToday ? 'ring-2 ring-offset-1 md:ring-offset-2 ring-dashed ring-[#121212]' : ''}`}
                >
                  <div className="flex items-start justify-between gap-1 w-full">
                    <span className={`text-[11px] sm:text-xs md:text-[13px] font-extrabold leading-none ${day.inMonth ? 'text-[#121212]' : 'text-[#717182]/50'}`}>
                      {day.date.getDate()}
                    </span>
                    {stats?.openTrades ? (
                      <span className="bg-[#1040C0] px-1 py-0.5 text-[8px] sm:text-[9px] font-bold text-white uppercase tracking-wider shadow-[1px_1px_0px_0px_#121212] leading-none">
                        {stats.openTrades}
                        <span className="hidden md:inline"> open</span>
                      </span>
                    ) : null}
                  </div>

                  {stats ? (
                    <div className="w-full mt-1 sm:mt-1.5 md:mt-2 space-y-0.5 md:space-y-1">
                      {/* Mobile View (< md): Clean compact PnL badge */}
                      <div className="block md:hidden">
                        <div className={`text-[10px] sm:text-xs font-black tracking-tight font-number leading-tight truncate ${pnlClass(pnl)}`}>
                          {formatCompactPnL(pnl, currency)}
                        </div>
                      </div>

                      {/* Desktop View (>= md): Richer micro-metrics */}
                      <div className="hidden md:block space-y-1">
                        <div className={`text-xs md:text-sm font-extrabold truncate font-number ${pnlClass(pnl)}`}>
                          {formatPnL(pnl, currency)}
                        </div>
                        <div className="text-[10px] font-bold text-[#717182] truncate">
                          {stats.tradeCount} trades · <span className="text-[var(--profit)] font-extrabold">W{stats.wins}</span>/<span className="text-[var(--loss)] font-extrabold">L{stats.losses}</span>
                        </div>
                        <div className="text-[10px] font-bold text-[#717182] truncate">
                          WR {formatPercent(stats.winrate)}
                        </div>
                        {!compact && (
                          <div className="text-[10px] font-bold text-[#717182] truncate">
                            Best {stats.bestTrade ? <span className="text-[var(--profit)] font-extrabold">{formatPnL(getTradePnl(stats.bestTrade), currency)}</span> : '-'}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {selectedDay && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4">
          <div className="absolute inset-0 bg-[#121212]/80 backdrop-blur-sm" onClick={() => setSelectedDay(null)} />
          
          <div className="relative w-full max-w-5xl max-h-[92vh] bg-white border-3 sm:border-4 border-[#121212] flex flex-col shadow-[8px_8px_0px_0px_#121212] sm:shadow-[12px_12px_0px_0px_#121212] animate-fade-in">
            <div className="absolute top-0 left-0 right-0 h-[4px] bg-[#F0C020]" />
            
            <div className="flex items-center justify-between gap-3 border-b-3 sm:border-b-4 border-[#121212] p-4 sm:p-6 bg-[#F0F0F0]">
              <div>
                <h3 className="text-lg sm:text-2xl font-extrabold text-[#121212] uppercase tracking-wider font-display">
                  Daily Journal
                </h3>
                <p className="text-xs sm:text-sm font-bold text-[#717182] mt-0.5 sm:mt-1">
                  {fullDateFormatter.format(selectedDay.date)} • {selectedDay.stats ? `${selectedDay.stats.tradeCount} trades reviewed.` : 'No trades recorded.'}
                </p>
              </div>
              <button 
                onClick={() => setSelectedDay(null)} 
                aria-label="Close daily journal dialog"
                className="w-9 h-9 sm:w-10 sm:h-10 min-w-[36px] min-h-[36px] border-2 border-[#121212] bg-white flex items-center justify-center text-[#121212] hover:bg-[#E0E0E0] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 font-bold" strokeWidth={3} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
              {/* Daily Note Section */}
              <div className="bg-white border-2 border-[#121212] p-4 sm:p-5 shadow-[3px_3px_0px_0px_#121212] sm:shadow-[4px_4px_0px_0px_#121212] space-y-3 sm:space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                  <div>
                    <div className="text-[11px] font-bold text-[#121212] uppercase tracking-wider">Catatan Harian</div>
                    <div className="text-[10px] text-[#717182] font-semibold mt-0.5 sm:mt-1">
                      {selectedDay.dateKey}
                      {noteLastSavedAt ? ` • Tersimpan: ${new Date(noteLastSavedAt).toLocaleString()}` : ''}
                    </div>
                  </div>
                  {contextType && contextId && (
                    <Button
                      variant="yellow"
                      onClick={saveDailyNote}
                      disabled={noteSaving}
                      isLoading={noteSaving}
                      size="sm"
                    >
                      Simpan Catatan
                    </Button>
                  )}
                </div>
                
                {contextType && contextId ? (
                  <>
                    <textarea
                      value={dailyNote}
                      onChange={(e) => setDailyNote(e.target.value)}
                      rows={3}
                      className="w-full bg-white border-2 border-[#121212] focus:shadow-[4px_4px_0px_0px_#F0C020] outline-none p-2.5 sm:p-3 text-xs sm:text-[13px] text-[#121212] font-semibold leading-relaxed resize-none transition-all font-[Outfit]"
                      placeholder="Tuliskan evaluasi, kondisi psikologi, atau konteks market untuk hari ini..."
                    />
                    {!noteLoaded && <div className="text-[10px] font-bold text-[#717182] uppercase animate-pulse">Memuat catatan...</div>}
                    {noteError && <div className="text-[10px] font-bold text-[var(--loss)] uppercase bg-[var(--loss-dim)] p-2">{noteError}</div>}
                  </>
                ) : (
                  <div className="text-xs font-bold text-[#717182] p-3 sm:p-4 bg-[#F0F0F0] border-2 border-dashed border-[#121212]/20">
                    Fitur catatan memerlukan konteks sesi atau akun.
                  </div>
                )}
              </div>

              {selectedDay.stats ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4">
                    <div className="bg-[#F0F0F0] border-2 border-[#121212] p-3 sm:p-4">
                      <div className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-1">Total PnL</div>
                      <div className={`text-base sm:text-xl font-extrabold font-number ${pnlClass(selectedDay.stats.totalPnl)}`}>{formatPnL(selectedDay.stats.totalPnl, currency)}</div>
                    </div>
                    <div className="bg-[#F0F0F0] border-2 border-[#121212] p-3 sm:p-4">
                      <div className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-1">Trades</div>
                      <div className="text-base sm:text-xl font-extrabold text-[#121212] font-number">{selectedDay.stats.tradeCount}</div>
                    </div>
                    <div className="bg-[#F0F0F0] border-2 border-[#121212] p-3 sm:p-4">
                      <div className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-1">Winrate</div>
                      <div className="text-base sm:text-xl font-extrabold text-[#121212] font-number">{formatPercent(selectedDay.stats.winrate)}</div>
                    </div>
                    <div className="bg-[#F0F0F0] border-2 border-[#121212] p-3 sm:p-4">
                      <div className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-1">Best Trade</div>
                      <div className="text-base sm:text-xl font-extrabold text-[var(--profit)] font-number truncate">{selectedDay.stats.bestTrade ? formatPnL(getTradePnl(selectedDay.stats.bestTrade), currency) : '-'}</div>
                    </div>
                    <div className="bg-[#F0F0F0] border-2 border-[#121212] p-3 sm:p-4 col-span-2 sm:col-span-1">
                      <div className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-1">Worst Trade</div>
                      <div className="text-base sm:text-xl font-extrabold text-[var(--loss)] font-number truncate">{selectedDay.stats.worstTrade ? formatPnL(getTradePnl(selectedDay.stats.worstTrade), currency) : '-'}</div>
                    </div>
                  </div>

                  <div className="bg-white border-2 border-[#121212] p-4 sm:p-5 shadow-[3px_3px_0px_0px_#121212] sm:shadow-[4px_4px_0px_0px_#121212] text-xs sm:text-[13px] text-[#121212] font-semibold font-[Outfit]">
                    <div className="flex items-center justify-between pb-2 border-b-2 border-dashed border-[#121212]/20">
                      <span className="text-[#717182] uppercase tracking-wider text-[10px] font-bold">Symbols Traded</span>
                      <span className="font-bold">{selectedDay.stats.symbols.join(', ') || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b-2 border-dashed border-[#121212]/20">
                      <span className="text-[#717182] uppercase tracking-wider text-[10px] font-bold">Wins / Losses / BE</span>
                      <span><span className="text-[var(--profit)] font-extrabold">{selectedDay.stats.wins}</span> / <span className="text-[var(--loss)] font-extrabold">{selectedDay.stats.losses}</span> / {selectedDay.stats.breakEven}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-[#717182] uppercase tracking-wider text-[10px] font-bold">Max Loss Streak</span>
                      <span className="font-extrabold text-[var(--loss)]">{maxLossStreak(selectedDay.stats.trades)}</span>
                    </div>
                    
                    <div className="mt-3 sm:mt-4 border-2 border-[#121212] bg-[#F0F0F0] p-3 sm:p-4 font-bold text-[#1040C0] flex items-start gap-2.5 sm:gap-3">
                      <div className="bg-white border-2 border-[#121212] px-2 py-0.5 sm:py-1 text-[9px] sm:text-[10px] uppercase tracking-widest text-[#121212] shrink-0">Insight</div>
                      <div className="text-xs sm:text-sm leading-relaxed">{dailyComment(selectedDay.stats)}</div>
                    </div>
                  </div>

                  {/* Trades Table inside Modal */}
                  <div className="bg-white border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] sm:shadow-[6px_6px_0px_0px_#121212] overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs sm:text-[13px] font-[Outfit] min-w-[480px]">
                        <thead>
                          <tr className="bg-[#121212] text-white">
                            <th className="px-3 sm:px-4 py-2 sm:py-3 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">Time</th>
                            <th className="px-3 sm:px-4 py-2 sm:py-3 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">Symbol</th>
                            <th className="px-3 sm:px-4 py-2 sm:py-3 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">Side</th>
                            <th className="px-3 sm:px-4 py-2 sm:py-3 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">Result</th>
                            <th className="px-3 sm:px-4 py-2 sm:py-3 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">PnL</th>
                            <th className="px-3 sm:px-4 py-2 sm:py-3 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">R/R</th>
                            <th className="px-3 sm:px-4 py-2 sm:py-3 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y-2 divide-[#121212]/10">
                          {selectedDay.stats.trades.map((trade, index) => {
                            const rawTime = getTradeTime(trade, mode);
                            const parsedTime = rawTime ? new Date(rawTime) : null;
                            const time = parsedTime && !Number.isNaN(parsedTime.getTime()) ? timeFormatter.format(parsedTime) : '-';
                            const pnl = getTradePnl(trade);
                            return (
                              <tr key={trade.id || index} className="hover:bg-[#F0F0F0] transition-colors">
                                <td className="px-3 sm:px-4 py-2 sm:py-3 font-bold text-[#717182] whitespace-nowrap">{time}</td>
                                <td className="px-3 sm:px-4 py-2 sm:py-3 font-extrabold text-[#121212] font-display whitespace-nowrap">{trade.symbol || '-'}</td>
                                <td className="px-3 sm:px-4 py-2 sm:py-3 whitespace-nowrap">
                                  <Badge variant={trade.side === 'LONG' ? 'profit' : 'loss'}>{trade.side}</Badge>
                                </td>
                                <td className="px-3 sm:px-4 py-2 sm:py-3 font-extrabold whitespace-nowrap">{resultLabel(trade)}</td>
                                <td className={`px-3 sm:px-4 py-2 sm:py-3 font-extrabold font-number whitespace-nowrap ${pnlClass(pnl)}`}>{formatPnL(pnl, currency)}</td>
                                <td className="px-3 sm:px-4 py-2 sm:py-3 font-bold font-number whitespace-nowrap">{trade.rMultiple ?? trade.rr ?? '-'}</td>
                                <td className="px-3 sm:px-4 py-2 sm:py-3 max-w-[160px] sm:max-w-xs truncate text-[#717182] font-medium" title={trade.notes || ''}>{trade.notes || '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="border-2 border-dashed border-[#121212]/20 bg-[#F0F0F0] p-8 sm:p-10 text-center text-xs sm:text-sm font-bold text-[#717182] uppercase tracking-widest">
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
