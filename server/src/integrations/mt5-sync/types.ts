export interface Tick {
  symbol: string;
  time: Date | string;
  bid: number;
  ask: number;
  last?: number | null;
  volume?: number | null;
  flags?: number | null;
}

export interface Candle {
  symbol: string;
  timeframe: string;
  time: Date | string;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume?: number | null;
  realVolume?: number | null;
  spread?: number | null;
}

export interface DateRange {
  from: Date;
  to: Date;
}

export interface MissingRange {
  from: string;
  to: string;
}

export type JobStatus = 'PENDING' | 'QUEUED' | 'RUNNING' | 'PAUSED' | 'FINISHED' | 'FAILED' | 'CANCELLED';

export interface SyncJobDefinition {
  id?: string;
  terminalId?: string | null;
  symbol: string;
  dataType: 'TICK' | 'CANDLE' | 'HISTORY';
  timeframe?: string | null;
  dateFrom: Date | string;
  dateTo: Date | string;
  status?: JobStatus;
  progressPct?: number;
  cursorTimestamp?: Date | string | null;
  chunkCount?: number;
  downloadedItems?: number;
  errorMessage?: string | null;
}

export interface MarketDataCatalogItem {
  id: string;
  provider: string;
  symbol: string;
  dataType: 'TICK' | 'CANDLE';
  timeframe?: string | null;
  dateFrom: Date;
  dateTo: Date;
  tickCount: number;
  candleCount: number;
  fileSizeBytes: number;
  lastSyncedAt: Date;
  missingRanges: MissingRange[];
  downloadStatus: 'COMPLETE' | 'PARTIAL' | 'IN_PROGRESS';
}

export interface TerminalAuthPayload {
  terminalId: string;
  accountNumber?: string;
  broker?: string;
  brokerServer?: string;
  platformVersion?: string;
  apiKey: string;
  balance?: number;
  equity?: number;
  leverage?: string;
  currency?: string;
}

export interface LiveTradePayload {
  terminalId: string;
  accountNumber?: string;
  positionId?: string;
  dealId?: string;
  orderId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  lot: number;
  entryPrice?: number;
  closePrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  openTime?: Date | string;
  closeTime?: Date | string;
  rawMt5Time?: number;
  status: 'OPEN' | 'CLOSED' | 'MODIFIED' | 'PARTIAL_CLOSE';
  profit?: number;
  commission?: number;
  swap?: number;
  magicNumber?: string;
  comment?: string;
}

export interface HistoricalSyncPayload {
  terminalId: string;
  accountNumber?: string;
  deals: any[];
  orders: any[];
}
