export type ReplaySource = 'TICK' | 'CANDLE';
export type TradeSide = 'LONG' | 'SHORT';
export type PlannedDataSource = 'ASSUMED' | 'MANUAL' | 'ATR' | 'SWING' | 'FIXED_SL';
export type RiskAssumption = 'FIXED_RR' | 'FIXED_SL' | 'ATR' | 'SWING_HIGH_LOW' | 'MANUAL';
export type ReplayDataQuality = 'FULL' | 'PARTIAL' | 'NO_DATA';

export interface TradeReplayInput {
  tradeId: string;
  symbol: string;
  side: TradeSide;
  entryPrice: number;
  exitPrice: number;
  entryTime: Date;
  exitTime: Date;
  result: string;
  slPrice?: number | null;
  tpPrice?: number | null;
  riskValue?: number | null;
  riskMode?: string | null;
  timeframe?: string;
  includePostExitPotential?: boolean;
}

export interface ReplayAssumption {
  riskAssumption: RiskAssumption;
  plannedRR: number;
  riskDistance: number;
  virtualSL: number;
  virtualTP: number;
  plannedDataSource: PlannedDataSource;
}

export interface ReplayPoint {
  timestamp: Date;
  price: number;
  isExit: boolean;
  rr: number;
  mfe: number;
  mae: number;
  source: ReplaySource;
  candleIndex: number;
}

export interface ReplayCoverage {
  coveragePct: number;
  expectedPointCount: number;
  coveredPointCount: number;
  missingTimestamps: string[];
}

export interface TradeReplayResult {
  tradeId: string;
  symbol: string;
  side: TradeSide;
  replaySource: ReplaySource;
  assumption: ReplayAssumption;
  maxRR: number;
  maxRRPrice: number;
  maxRRTime: Date | null;
  maxRRPointIndex: number;
  mfePrice: number;
  maePrice: number;
  timeToMaxRR: number;
  timeAfterExit: number;
  exitEfficiencyPct: number;
  capturedRR: number;
  potentialRRLost: number;
  replayPoints: ReplayPoint[];
  usedTickData: boolean;
  usedCandleData: boolean;
  dataQuality: ReplayDataQuality;
  selectedTimeframe: string | null;
  dataPointCount: number;
  dataStartTime: Date | null;
  dataEndTime: Date | null;
  coverageGapCount: number;
  coverage: ReplayCoverage;
}

export interface ReplaySummaryMetrics {
  averageMaxRR: number;
  medianMaxRR: number;
  topMissedTrades: Array<{ tradeId: string; maxRR: number; capturedRR: number; potentialRRLost: number }>;
  captureEfficiencyAvg: number;
  averageLostOpportunity: number;
  rrDistribution: Array<{ bucket: string; count: number }>;
  potentialEquityCurve: Array<{ timestamp: string; equity: number }>;
  actualEquityCurve: Array<{ timestamp: string; equity: number }>;
}
