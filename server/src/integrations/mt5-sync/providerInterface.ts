import { Tick, Candle } from './types';

export interface MarketDataProvider {
  readonly providerName: string;

  /**
   * Fetch ticks for a given symbol and date range
   */
  getTicks(symbol: string, from: Date, to: Date): Promise<Tick[]>;

  /**
   * Fetch OHLCV candles for a given symbol, timeframe, and date range
   */
  getCandles(symbol: string, timeframe: string, from: Date, to: Date): Promise<Candle[]>;

  /**
   * Check if the provider supports live tick streaming or direct polling
   */
  supportsLiveStream(): boolean;
}
