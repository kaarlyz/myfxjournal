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
  source: 'CSV' | 'WEBHOOK' | 'MANUAL' | 'MT5_REPORT' | 'QUICK_LOG';
  tradeNumber?: number | null;
  tradeId?: string | null;
  symbol: string;
  timeframe: string;
  side: 'LONG' | 'SHORT';
  entryTime?: string | null;
  exitTime?: string | null;
  entryPrice?: number | null;
  exitPrice?: number | null;
  slPrice?: number | null;
  tpPrice?: number | null;
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
  mistakeTag?: string | null;
  emotionTag?: string | null;
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

export type DataQuality = 'COMPLETE' | 'PARTIAL' | 'R_SIMULATION' | 'LOW_CONFIDENCE';
export type RSource = 'MANUAL' | 'PRICE' | 'ASSUMED' | 'UNKNOWN';

export interface EnrichedTrade extends Trade {
  balanceBefore: number;
  balanceAfter: number;
  rawBalanceAfter?: number;
  riskAmount: number | null;
  slDistance: number | null;
  tpDistance: number | null;
  realizedRR: number | null;
  recalculatedPnl: number;
  holdingMinutes: number;
  timeSincePreviousEntryMinutes: number | null;
  dayKey: string;
  weekKey: string;
  monthKey: string;
  tradingSession: string;
  rSource?: RSource;
  dataQuality?: DataQuality;
  usedAssumedRR?: boolean;
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
  rawRows: string;
  createdAt: string;
}

export interface DataQualitySummary {
  complete: number;
  partial: number;
  rSimulation: number;
  lowConfidence: number;
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
  profitFactorR: number;
  drawdownR: number;
  recoveryFactor: number | null;
  averageFavorableExcursionUsd: number;
  averageAdverseExcursionUsd: number;
  averageTradeDurationMs: number;
  longWinrate: number;
  shortWinrate: number;

  // Analytics Engine Additions
  netProfitRaw: number;
  netProfitRecalculated: number;
  growthPercent: number;
  maxDrawdownRecalculated: number;
  maxDrawdownRecalculatedPct: number;
  avgPlannedRR: number | null;
  avgRealizedRR: number | null;
  medianRR: number | null;
  avgHoldingMinutes: number;
  avgTimeBetweenEntries: number;
  maxConsecutiveProfitableDays: number;
  maxConsecutiveLosingDays: number;
  tradesPerDay: number;
  bestDay: string | null;
  worstDay: string | null;
  bestSession: string | null;
  worstSession: string | null;
  pairBreakdown: Record<string, {
    trades: number;
    winrate: number;
    netPnl: number;
    gp: number;
    gl: number;
    profitFactor: number;
  }>;

  // Risk simulation metadata
  usedAssumedRR: boolean;
  assumedRRValue: number | null;
  dataQualitySummary: DataQualitySummary;
}
