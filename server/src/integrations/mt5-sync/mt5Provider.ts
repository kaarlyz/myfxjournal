import { MarketDataProvider } from './providerInterface';
import { defaultStorage } from './sqliteStorage';
import { Tick, Candle } from './types';

export class MT5MarketDataProvider implements MarketDataProvider {
  readonly providerName = 'MT5';

  async getTicks(symbol: string, from: Date, to: Date): Promise<Tick[]> {
    return defaultStorage.getTicks(symbol, from, to);
  }

  async getCandles(symbol: string, timeframe: string, from: Date, to: Date): Promise<Candle[]> {
    return defaultStorage.getCandles(symbol, timeframe, from, to);
  }

  supportsLiveStream(): boolean {
    return true;
  }
}

export const mt5Provider = new MT5MarketDataProvider();
