import { MarketDataProvider } from './providerInterface';
import { Tick, Candle } from './types';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const MARKET_DATA_DIR = path.resolve(__dirname, '../../../data/market-data');

function value(row: Record<string, unknown>, ...names: string[]): string {
  const entries = Object.entries(row);
  for (const name of names) {
    const match = entries.find(([key]) => key.trim().toLowerCase() === name.toLowerCase());
    if (match) return String(match[1] ?? '').trim();
  }
  return '';
}

function parseTime(row: Record<string, unknown>): Date | null {
  const combined = value(row, 'datetime', 'timestamp');
  const date = value(row, 'date');
  const time = value(row, 'time');
  const parsed = new Date(combined || (date && time ? `${date} ${time}` : date || time));
  return isNaN(parsed.getTime()) ? null : parsed;
}

function parsePrice(row: Record<string, unknown>): number {
  const last = Number(value(row, 'last', 'price', 'close'));
  const bid = Number(value(row, 'bid'));
  const ask = Number(value(row, 'ask'));
  if (Number.isFinite(last) && last > 0) return last;
  if (Number.isFinite(bid) && Number.isFinite(ask)) return (bid + ask) / 2;
  return Number.isFinite(bid) ? bid : ask;
}

function timeframeMinutes(timeframe: string): number {
  const match = timeframe.toUpperCase().match(/^([MHD])(\d+)$/);
  if (!match) return 1;
  const amount = Number(match[2]);
  return match[1] === 'H' ? amount * 60 : match[1] === 'D' ? amount * 1440 : amount;
}

export class CSVMarketDataProvider implements MarketDataProvider {
  readonly providerName = 'CSV';

  async getTicks(symbol: string, from: Date, to: Date): Promise<Tick[]> {
    const filePath = path.join(MARKET_DATA_DIR, `${symbol.toUpperCase()}_ticks.csv`);
    if (!fs.existsSync(filePath)) return [];

    const text = fs.readFileSync(filePath, 'utf8');
    const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
    return parsed.data.flatMap((row) => {
      const time = parseTime(row);
      const price = parsePrice(row);
      if (!time || time < from || time > to || !Number.isFinite(price) || price <= 0) return [];
      const bid = Number(value(row, 'bid')) || price;
      const ask = Number(value(row, 'ask')) || price;
      return [{
        symbol: symbol.toUpperCase(),
        time,
        bid,
        ask,
        last: price,
        volume: Number(value(row, 'volume', 'tickvolume')) || null,
      }];
    }).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }

  async getCandles(symbol: string, timeframe: string, from: Date, to: Date): Promise<Candle[]> {
    const ticks = await this.getTicks(symbol, from, to);
    const intervalMs = timeframeMinutes(timeframe) * 60_000;
    const buckets = new Map<number, Candle>();

    for (const tick of ticks) {
      const tickTime = new Date(tick.time);
      const bucketTime = Math.floor(tickTime.getTime() / intervalMs) * intervalMs;
      const price = tick.last ?? (tick.bid + tick.ask) / 2;
      const existing = buckets.get(bucketTime);
      if (!existing) {
        buckets.set(bucketTime, {
          symbol: symbol.toUpperCase(), timeframe: timeframe.toUpperCase(), time: new Date(bucketTime),
          open: price, high: price, low: price, close: price, tickVolume: tick.volume ?? 1,
        });
      } else {
        existing.high = Math.max(existing.high, price);
        existing.low = Math.min(existing.low, price);
        existing.close = price;
        existing.tickVolume = (existing.tickVolume ?? 0) + (tick.volume ?? 1);
      }
    }

    return Array.from(buckets.values()).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }

  supportsLiveStream(): boolean {
    return false;
  }
}

export const csvProvider = new CSVMarketDataProvider();
