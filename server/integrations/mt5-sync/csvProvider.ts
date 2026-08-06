import { MarketDataProvider } from './providerInterface';
import { Tick, Candle } from './types';
import { parseTradingViewCsv } from '../../src/utils/csvParser';

export class CSVMarketDataProvider implements MarketDataProvider {
  readonly providerName = 'CSV';

  async getTicks(symbol: string, from: Date, to: Date): Promise<Tick[]> {
    // CSV provider tick support fallback (returns empty if ticks not present in CSV)
    return [];
  }

  async getCandles(symbol: string, timeframe: string, from: Date, to: Date): Promise<Candle[]> {
    return [];
  }

  supportsLiveStream(): boolean {
    return false;
  }
}

export const csvProvider = new CSVMarketDataProvider();
