import { prisma } from '../../prisma';
import { MarketDataStorage } from './storageInterface';
import { Tick, Candle } from './types';

export class SQLiteMarketDataStorage implements MarketDataStorage {
  async saveTicks(ticks: Tick[], terminalId?: string): Promise<number> {
    if (!ticks.length) return 0;
    
    let inserted = 0;
    const batchSize = 500;
    
    for (let i = 0; i < ticks.length; i += batchSize) {
      const batch = ticks.slice(i, i + batchSize);
      const values = batch.map(t => ({
        terminalId: terminalId || null,
        symbol: t.symbol.toUpperCase(),
        time: new Date(t.time),
        bid: Number(t.bid),
        ask: Number(t.ask),
        last: t.last != null ? Number(t.last) : null,
        volume: t.volume != null ? Number(t.volume) : null,
        flags: t.flags != null ? Number(t.flags) : null,
      }));

      const times = values.map(v => v.time);
      const symbol = values[0].symbol;
      
      const existing = await prisma.mt5TickData.findMany({
        where: { symbol, time: { in: times } },
        select: { time: true }
      });
      
      const existingTimes = new Set(existing.map(e => e.time.getTime()));
      const newValues = values.filter(v => !existingTimes.has(v.time.getTime()));

      if (newValues.length > 0) {
        const res = await prisma.mt5TickData.createMany({
          data: newValues,
        });
        inserted += res.count;
      }
    }

    return inserted;
  }

  async saveCandles(candles: Candle[], terminalId?: string): Promise<number> {
    if (!candles.length) return 0;

    let inserted = 0;
    const batchSize = 500;

    for (let i = 0; i < candles.length; i += batchSize) {
      const batch = candles.slice(i, i + batchSize);
      const values = batch.map(c => ({
        terminalId: terminalId || null,
        symbol: c.symbol.toUpperCase(),
        timeframe: c.timeframe.toUpperCase(),
        time: new Date(c.time),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        tickVolume: c.tickVolume != null ? Number(c.tickVolume) : null,
        realVolume: c.realVolume != null ? Number(c.realVolume) : null,
        spread: c.spread != null ? Number(c.spread) : null,
      }));

      const times = values.map(v => v.time);
      const symbol = values[0].symbol;
      const timeframe = values[0].timeframe;
      
      const existing = await prisma.mt5CandleData.findMany({
        where: { symbol, timeframe, time: { in: times } },
        select: { time: true }
      });
      
      const existingTimes = new Set(existing.map(e => e.time.getTime()));
      const newValues = values.filter(v => !existingTimes.has(v.time.getTime()));

      if (newValues.length > 0) {
        const res = await prisma.mt5CandleData.createMany({
          data: newValues,
        });
        inserted += res.count;
      }
    }

    return inserted;
  }

  async getTicks(symbol: string, from: Date, to: Date, limit = 50000): Promise<Tick[]> {
    const rows = await prisma.mt5TickData.findMany({
      where: {
        symbol: symbol.toUpperCase(),
        time: { gte: from, lte: to },
      },
      orderBy: { time: 'asc' },
      take: limit,
    });

    return rows.map(r => ({
      symbol: r.symbol,
      time: r.time,
      bid: r.bid,
      ask: r.ask,
      last: r.last,
      volume: r.volume,
      flags: r.flags,
    }));
  }

  async getCandles(symbol: string, timeframe: string, from: Date, to: Date, limit = 10000): Promise<Candle[]> {
    const rows = await prisma.mt5CandleData.findMany({
      where: {
        symbol: symbol.toUpperCase(),
        timeframe: timeframe.toUpperCase(),
        time: { gte: from, lte: to },
      },
      orderBy: { time: 'asc' },
      take: limit,
    });

    return rows.map(r => ({
      symbol: r.symbol,
      timeframe: r.timeframe,
      time: r.time,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      tickVolume: r.tickVolume,
      realVolume: r.realVolume,
      spread: r.spread,
    }));
  }

  async getTickCount(symbol: string, from: Date, to: Date): Promise<number> {
    return prisma.mt5TickData.count({
      where: {
        symbol: symbol.toUpperCase(),
        time: { gte: from, lte: to },
      },
    });
  }

  async getCandleCount(symbol: string, timeframe: string, from: Date, to: Date): Promise<number> {
    return prisma.mt5CandleData.count({
      where: {
        symbol: symbol.toUpperCase(),
        timeframe: timeframe.toUpperCase(),
        time: { gte: from, lte: to },
      },
    });
  }

  async getCoverage(symbol: string, dataType: 'TICK' | 'CANDLE', timeframe?: string): Promise<{ dateFrom: Date | null; dateTo: Date | null; count: number }> {
    if (dataType === 'TICK') {
      const first = await prisma.mt5TickData.findFirst({
        where: { symbol: symbol.toUpperCase() },
        orderBy: { time: 'asc' },
        select: { time: true },
      });
      const last = await prisma.mt5TickData.findFirst({
        where: { symbol: symbol.toUpperCase() },
        orderBy: { time: 'desc' },
        select: { time: true },
      });
      const count = await prisma.mt5TickData.count({
        where: { symbol: symbol.toUpperCase() },
      });
      return {
        dateFrom: first?.time || null,
        dateTo: last?.time || null,
        count,
      };
    } else {
      const tf = (timeframe || 'H1').toUpperCase();
      const first = await prisma.mt5CandleData.findFirst({
        where: { symbol: symbol.toUpperCase(), timeframe: tf },
        orderBy: { time: 'asc' },
        select: { time: true },
      });
      const last = await prisma.mt5CandleData.findFirst({
        where: { symbol: symbol.toUpperCase(), timeframe: tf },
        orderBy: { time: 'desc' },
        select: { time: true },
      });
      const count = await prisma.mt5CandleData.count({
        where: { symbol: symbol.toUpperCase(), timeframe: tf },
      });
      return {
        dateFrom: first?.time || null,
        dateTo: last?.time || null,
        count,
      };
    }
  }
}

export const defaultStorage = new SQLiteMarketDataStorage();
