export interface CalendarTrade {
  id?: string;
  symbol?: string | null;
  side?: string | null;
  result?: string | null;
  status?: string | null;
  profit?: number | null;
  pnl?: number | null;
  netPnl?: number | null;
  netPnlUsd?: number | null;
  rMultiple?: number | null;
  rr?: number | null;
  lot?: number | null;
  qty?: number | null;
  notes?: string | null;
  closeTime?: string | null;
  closedAt?: string | null;
  exitDate?: string | null;
  exitTime?: string | null;
  entryTime?: string | null;
  openTime?: string | null;
  openedAt?: string | null;
  entryDate?: string | null;
  importedAt?: string | null;
  createdAt?: string | null;
  [key: string]: any;
}

export interface DailyStats {
  date: string;
  totalPnl: number;
  tradeCount: number;
  openTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  breakEven: number;
  winrate: number;
  grossProfit: number;
  grossLoss: number;
  bestTrade: CalendarTrade | null;
  worstTrade: CalendarTrade | null;
  totalLots: number;
  symbols: string[];
  sides: {
    buy: number;
    sell: number;
    long: number;
    short: number;
  };
  trades: CalendarTrade[];
}

export interface CalendarDay {
  date: Date;
  dateKey: string;
  inMonth: boolean;
  isToday: boolean;
  stats: DailyStats | null;
}

const safeNumber = (value: any, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const isValidDateValue = (value: any): boolean => {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

export const getTradePnl = (trade: CalendarTrade): number => {
  return safeNumber(
    trade.netPnlUsd ?? trade.profit ?? trade.pnl ?? trade.netPnl,
    0
  );
};

export const getTradeCalendarDate = (trade: CalendarTrade, mode: 'BACKTEST' | 'LIVE' = 'BACKTEST'): string | null => {
  const candidates = mode === 'BACKTEST'
    ? [
        trade.exitTime,
        trade.closeTime,
        trade.closedAt,
        trade.exitDate,
        trade.entryTime,
        trade.openTime,
        trade.openedAt,
        trade.entryDate,
        trade.createdAt,
      ]
    : [
        trade.closeTime,
        trade.closedAt,
        trade.exitTime,
        trade.exitDate,
        trade.entryTime,
        trade.openTime,
        trade.openedAt,
        trade.entryDate,
        trade.createdAt,
      ];

  const match = candidates.find(isValidDateValue);
  return match ? String(match) : null;
};

export const getTradeTime = (trade: CalendarTrade, mode: 'BACKTEST' | 'LIVE' = 'BACKTEST'): string | null => {
  return getTradeCalendarDate(trade, mode);
};

export const getTradeDateKey = (trade: CalendarTrade, mode: 'BACKTEST' | 'LIVE' = 'BACKTEST', timezone?: string): string | null => {
  const rawTime = getTradeCalendarDate(trade, mode);
  if (!rawTime) return null;
  const date = new Date(rawTime);
  if (Number.isNaN(date.getTime())) return null;

  if (timezone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const d = parts.find(p => p.type === 'day')?.value;
    return y && m && d ? `${y}-${m}-${d}` : null;
  }

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const toDateKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export function groupTradesByDay(trades: CalendarTrade[] = [], mode: 'BACKTEST' | 'LIVE' = 'BACKTEST', timezone?: string): Record<string, CalendarTrade[]> {
  return trades.reduce<Record<string, CalendarTrade[]>>((acc, trade) => {
    const key = getTradeDateKey(trade, mode, timezone);
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(trade);
    return acc;
  }, {});
}

export function calculateDailyStats(dayTrades: CalendarTrade[] = [], date = ''): DailyStats {
  let wins = 0;
  let losses = 0;
  let breakEven = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let bestTrade: CalendarTrade | null = null;
  let worstTrade: CalendarTrade | null = null;
  let bestPnl = Number.NEGATIVE_INFINITY;
  let worstPnl = Number.POSITIVE_INFINITY;
  let openTrades = 0;
  let closedTrades = 0;
  let totalLots = 0;
  const symbols = new Set<string>();
  const sides = { buy: 0, sell: 0, long: 0, short: 0 };

  dayTrades.forEach(trade => {
    const pnl = getTradePnl(trade);
    const status = String(trade.status || '').toUpperCase();
    const isOpen = status === 'OPEN' || (!trade.closeTime && !trade.exitTime && status !== 'CLOSED');

    if (isOpen) openTrades += 1;
    else closedTrades += 1;

    if (pnl > 0) {
      wins += 1;
      grossProfit += pnl;
    } else if (pnl < 0) {
      losses += 1;
      grossLoss += Math.abs(pnl);
    } else {
      breakEven += 1;
    }

    if (pnl > bestPnl) {
      bestPnl = pnl;
      bestTrade = trade;
    }
    if (pnl < worstPnl) {
      worstPnl = pnl;
      worstTrade = trade;
    }

    totalLots += safeNumber(trade.lot ?? trade.qty, 0);
    if (trade.symbol) symbols.add(String(trade.symbol));

    const side = String(trade.side || '').toUpperCase();
    if (side === 'BUY') sides.buy += 1;
    if (side === 'SELL') sides.sell += 1;
    if (side === 'LONG') sides.long += 1;
    if (side === 'SHORT') sides.short += 1;
  });

  const totalPnl = dayTrades.reduce((sum, trade) => sum + getTradePnl(trade), 0);
  const decisiveTrades = wins + losses;

  return {
    date,
    totalPnl,
    tradeCount: dayTrades.length,
    openTrades,
    closedTrades,
    wins,
    losses,
    breakEven,
    winrate: decisiveTrades > 0 ? (wins / decisiveTrades) * 100 : 0,
    grossProfit,
    grossLoss,
    bestTrade,
    worstTrade,
    totalLots,
    symbols: Array.from(symbols),
    sides,
    trades: dayTrades,
  };
}

export function buildCalendarMonth(
  year: number,
  month: number,
  dailyStats: Record<string, DailyStats>
): CalendarDay[] {
  const firstDay = new Date(year, month, 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  const todayKey = toDateKey(new Date());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateKey = toDateKey(date);
    return {
      date,
      dateKey,
      inMonth: date.getMonth() === month,
      isToday: dateKey === todayKey,
      stats: dailyStats[dateKey] || null,
    };
  });
}

export function buildDailyStatsMap(trades: CalendarTrade[] = [], mode: 'BACKTEST' | 'LIVE' = 'BACKTEST', timezone?: string): Record<string, DailyStats> {
  const grouped = groupTradesByDay(trades, mode, timezone);
  return Object.entries(grouped).reduce<Record<string, DailyStats>>((acc, [date, dayTrades]) => {
    acc[date] = calculateDailyStats(dayTrades, date);
    return acc;
  }, {});
}

export function getInitialCalendarMonth(trades: CalendarTrade[] = [], mode: 'BACKTEST' | 'LIVE' = 'BACKTEST'): Date {
  const latestMs = (trades || []).reduce((latest, trade) => {
    const raw = getTradeCalendarDate(trade, mode);
    if (!raw) return latest;
    const ms = new Date(raw).getTime();
    return Number.isFinite(ms) && ms > latest ? ms : latest;
  }, 0);

  const date = latestMs > 0 ? new Date(latestMs) : new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
