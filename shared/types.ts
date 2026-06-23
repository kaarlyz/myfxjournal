export interface BacktestSession {
  id: string;
  name: string;
  sourceMode: 'CSV' | 'WEBHOOK' | 'MANUAL' | 'MT5_REPORT';
  symbol: string;
  marketType: 'Forex' | 'Gold' | 'Crypto' | 'Index' | 'Custom';
  timeframe: string;
  initialBalance: number;
  balanceCurrency: 'USD' | 'CENT' | 'IDR';
  usdIdrRate: number;
  riskMode: 'FIXED_USD' | 'FIXED_PCT' | 'NO_R';
  riskValue: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Trade {
  id: string;
  sessionId: string;
  source: 'CSV' | 'WEBHOOK' | 'MANUAL' | 'MT5_REPORT';
  tradeNumber?: number | null;
  tradeId?: string | null;
  symbol: string;
  timeframe: string;
  side: 'LONG' | 'SHORT';
  entryTime?: string | null;
  exitTime?: string | null;
  entryPrice?: number | null;
  exitPrice?: number | null;
  qty?: number | null;
  positionValue?: number | null;
  netPnlUsd?: number | null;
  netPnlPct?: number | null;
  netPnlIdr?: number | null;
  favorableExcursionUsd?: number | null;
  favorableExcursionPct?: number | null;
  adverseExcursionUsd?: number | null;
  adverseExcursionPct?: number | null;
  cumulativePnlUsd?: number | null;
  cumulativePnlPct?: number | null;
  entrySignal?: string | null;
  exitSignal?: string | null;
  setupTag?: string | null;
  status: 'OPEN' | 'CLOSED' | 'INVALID';
  result?: 'WIN' | 'LOSS' | 'BE' | null;
  rMultiple?: number | null;
  plannedRR?: number | null;
  riskUsd?: number | null;
  notes?: string | null;
  screenshotUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEvent {
  id: string;
  receivedAt: string;
  rawPayload: string;
  eventType: 'ENTRY' | 'EXIT';
  tradeId: string;
  status: 'SUCCESS' | 'ERROR' | 'ORPHAN';
  errorMessage?: string | null;
}

export interface InvalidTrade {
  id: string;
  sessionId: string;
  tradeNumber: number;
  reason: string;
  rawRows: string; // JSON string representation of source rows
  createdAt: string;
}

export interface DashboardMetrics {
  initialBalance: number;
  endingBalance: number;
  netPnlUsd: number;
  netPnlIdr: number;
  netPnlPct: number;
  totalTrades: number;
  win: number;
  loss: number;
  breakEven: number;
  winrate: number;
  lossrate: number;
  profitFactor: number;
  grossProfit: number;
  grossLoss: number;
  averageWin: number;
  averageLoss: number;
  averageTrade: number;
  bestTrade: number;
  worstTrade: number;
  maxDrawdownUsd: number;
  maxDrawdownPct: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  averageR: number | null;
  netR: number | null;
  expectancyUsd: number;
  expectancyR: number | null;
  averageFavorableExcursionUsd: number;
  averageAdverseExcursionUsd: number;
  averageTradeDurationMs: number; // in milliseconds
  longWinrate: number;
  shortWinrate: number;
}
