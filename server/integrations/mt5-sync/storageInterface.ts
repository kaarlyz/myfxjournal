import { Tick, Candle } from './types';

export interface MarketDataStorage {
  saveTicks(ticks: Tick[], terminalId?: string): Promise<number>;
  saveCandles(candles: Candle[], terminalId?: string): Promise<number>;
  getTicks(symbol: string, from: Date, to: Date, limit?: number): Promise<Tick[]>;
  getCandles(symbol: string, timeframe: string, from: Date, to: Date, limit?: number): Promise<Candle[]>;
  getTickCount(symbol: string, from: Date, to: Date): Promise<number>;
  getCandleCount(symbol: string, timeframe: string, from: Date, to: Date): Promise<number>;
  getCoverage(symbol: string, dataType: 'TICK' | 'CANDLE', timeframe?: string): Promise<{ dateFrom: Date | null; dateTo: Date | null; count: number }>;
}
