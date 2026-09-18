import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { csvProvider } from '../integrations/mt5-sync/csvProvider';
import * as parquetProvider from '../integrations/mt5-sync/parquetDataProvider';
import {
  advanceReplay,
  stepBackReplay,
  calculatePositionSize,
  calculateRR,
  calculateTPFromRR,
  evaluateCandleHit,
  calculatePnL,
  calculateSMA,
  calculateBacktestStats,
  resampleM1Candles,
  TIMEFRAME_MINUTES,
  BacktestCandle,
  TradeSide,
  ChartTimeframe,
  calculateCandleMetrics,
  getSymbolContractSize,
  getEffectiveOrderType,
  getSymbolPriceTolerance,
  evaluatePendingOrderTrigger,
  OrderExecutionType,
} from '../services/backtestEngine';

const router = Router();

// ── 0. Available Symbols Catalog ──
interface SymbolCatalogEntry {
  symbol: string;
  provider: string;
  candleCount: number;
  dateFrom?: string | null;
  dateTo?: string | null;
}

interface CachedSymbols {
  timestamp: number;
  data: SymbolCatalogEntry[];
}

interface CachedCandlesResponse {
  timestamp: number;
  data: any;
}

const SYMBOLS_CACHE_TTL_MS = 60 * 1000; // 60 seconds
let symbolsCache: CachedSymbols | null = null;
let symbolsInFlightPromise: Promise<SymbolCatalogEntry[]> | null = null;

const CANDLES_RESPONSE_CACHE_TTL_MS = 30 * 1000; // 30 seconds
const candlesResponseCache = new Map<string, CachedCandlesResponse>();

export function invalidateCandlesCache(): void {
  candlesResponseCache.clear();
}

export function invalidateSymbolsCache(): void {
  symbolsCache = null;
  invalidateCandlesCache();
}

// GET /api/backtest/symbols
router.get('/symbols', async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.refresh === 'true' || req.query.force === 'true';

    if (!forceRefresh && symbolsCache && Date.now() - symbolsCache.timestamp < SYMBOLS_CACHE_TTL_MS) {
      return res.json({ ok: true, data: symbolsCache.data });
    }

    if (!forceRefresh && symbolsInFlightPromise) {
      const data = await symbolsInFlightPromise;
      return res.json({ ok: true, data });
    }

    symbolsInFlightPromise = (async () => {
      try {
        const map = new Map<string, SymbolCatalogEntry>();

        // 1. Parquet datasets available (e.g. XAUUSD canonical tick data)
        try {
          const pqBounds = await parquetProvider.getTimelineBounds();
          if (pqBounds && pqBounds.symbol) {
            const key = `${pqBounds.symbol}_${pqBounds.provider || 'PARQUET'}`;
            map.set(key, {
              symbol: pqBounds.symbol,
              provider: pqBounds.provider || 'PARQUET',
              candleCount: pqBounds.totalTicks,
              dateFrom: pqBounds.dateFrom,
              dateTo: pqBounds.dateTo,
            });
          }
        } catch {
          // Parquet not available or failed
        }

        // 2. Catalogs in SQLite
        const catalogs = await prisma.marketDataCatalog.findMany({
          select: { symbol: true, provider: true, candleCount: true, dateFrom: true, dateTo: true },
        });
        for (const c of catalogs) {
          const key = `${c.symbol}_${c.provider}`;
          map.set(key, {
            symbol: c.symbol,
            provider: c.provider,
            candleCount: c.candleCount,
            dateFrom: c.dateFrom ? c.dateFrom.toISOString() : null,
            dateTo: c.dateTo ? c.dateTo.toISOString() : null,
          });
        }

        // 3. mt5CandleData in SQLite
        const symbolsGroup = await prisma.mt5CandleData.groupBy({
          by: ['symbol', 'provider'],
          _count: { _all: true },
        });
        for (const item of symbolsGroup) {
          const key = `${item.symbol}_${item.provider}`;
          const existing = map.get(key);
          let dateFrom = existing?.dateFrom || null;
          let dateTo = existing?.dateTo || null;
          if (!dateFrom || !dateTo) {
            const [first, last] = await Promise.all([
              prisma.mt5CandleData.findFirst({
                where: { provider: item.provider, symbol: item.symbol },
                orderBy: { time: 'asc' },
                select: { time: true },
              }),
              prisma.mt5CandleData.findFirst({
                where: { provider: item.provider, symbol: item.symbol },
                orderBy: { time: 'desc' },
                select: { time: true },
              }),
            ]);
            dateFrom = first?.time ? first.time.toISOString() : null;
            dateTo = last?.time ? last.time.toISOString() : null;
          }
          map.set(key, {
            symbol: item.symbol,
            provider: item.provider,
            candleCount: Math.max(existing?.candleCount ?? 0, item._count._all),
            dateFrom,
            dateTo,
          });
        }

        const result = Array.from(map.values()).sort((a, b) => b.candleCount - a.candleCount);
        symbolsCache = { timestamp: Date.now(), data: result };
        return result;
      } finally {
        symbolsInFlightPromise = null;
      }
    })();

    const data = await symbolsInFlightPromise;
    return res.json({ ok: true, data });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. WINDOWED HISTORICAL CANDLES STREAM
// ═══════════════════════════════════════════════════════════════════════════
// GET /api/backtest/candles?symbol=XAUUSD&timeframe=M1&provider=DUKASCOPY&replayTime=...&limit=1500&beforeTime=...&afterTime=...
router.get('/candles', async (req: Request, res: Response) => {
  try {
    const symbol = (req.query.symbol as string) || 'XAUUSD';
    const targetTF = ((req.query.timeframe as string) || 'M1').toUpperCase() as ChartTimeframe;
    const provider = (req.query.provider as string) || 'DUKASCOPY';

    // Adaptive limits based on timeframe
    let defaultLimit = 1200;
    let maxLimit = 1200;
    if (targetTF === 'M1' || targetTF === 'M5') {
      defaultLimit = 1200;
      maxLimit = 1200;
    } else if (targetTF === 'M15' || targetTF === 'M30') {
      defaultLimit = 800;
      maxLimit = 800;
    } else if (targetTF === 'H1' || targetTF === 'H4') {
      defaultLimit = 600;
      maxLimit = 600;
    } else if (targetTF === 'D1') {
      defaultLimit = 365;
      maxLimit = 365;
    }

    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string, 10) || defaultLimit), maxLimit);
    const replayTimeStr = req.query.replayTime as string;
    const beforeTimeStr = req.query.beforeTime as string;
    const afterTimeStr = req.query.afterTime as string;
    const fromStr = req.query.from as string;

    const cacheKey = `${provider}:${symbol}:${targetTF}:${limit}:${replayTimeStr || ''}:${beforeTimeStr || ''}:${afterTimeStr || ''}:${fromStr || ''}`;
    const cached = candlesResponseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CANDLES_RESPONSE_CACHE_TTL_MS) {
      return res.json({ ok: true, data: cached.data });
    }

    let rawLimit = limit;
    if (targetTF === 'M1') {
      rawLimit = limit;
    } else if (targetTF === 'M5') {
      rawLimit = limit * 5 * 2;
    } else if (targetTF === 'M15') {
      rawLimit = limit * 15 * 2;
    } else if (targetTF === 'M30') {
      rawLimit = limit * 30 * 2;
    } else if (targetTF === 'H1') {
      rawLimit = limit * 60 * 2;
    } else if (targetTF === 'H4') {
      rawLimit = Math.min(limit * 240, 36000);
    } else if (targetTF === 'D1') {
      const d1Limit = Math.min(limit, 500);
      rawLimit = Math.min(d1Limit * 1440, 72000);
    }

    let rawCandles: any[] = [];
    const selectFields = {
      time: true,
      open: true,
      high: true,
      low: true,
      close: true,
      tickVolume: true,
      realVolume: true,
    };

    if (afterTimeStr) {
      // Forward stream (for Normal Analysis Mode scrolling right)
      const afterTime = new Date(afterTimeStr);
      rawCandles = await prisma.mt5CandleData.findMany({
        where: {
          provider,
          symbol,
          timeframe: 'M1',
          time: { gt: afterTime },
        },
        orderBy: { time: 'asc' },
        take: rawLimit,
        select: selectFields,
      });
    } else {
      // Backward/Windowed stream
      const timeFilter: any = {};
      if (beforeTimeStr) {
        timeFilter.lt = new Date(beforeTimeStr);
      } else if (replayTimeStr) {
        timeFilter.lte = new Date(replayTimeStr); // STRICT CUTOFF: NEVER returns candles after replayTime
      }
      if (fromStr) {
        const fromDate = new Date(fromStr);
        if (!isNaN(fromDate.getTime())) {
          timeFilter.gte = fromDate;
        }
      }

      const queryWhere: any = {
        provider,
        symbol,
        timeframe: 'M1',
      };
      if (Object.keys(timeFilter).length > 0) {
        queryWhere.time = timeFilter;
      }

      const fetched = await prisma.mt5CandleData.findMany({
        where: queryWhere,
        orderBy: { time: 'desc' },
        take: rawLimit,
        select: selectFields,
      });
      rawCandles = fetched.reverse();
    }

    const m1Candles: BacktestCandle[] = rawCandles.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      tickVolume: c.tickVolume ?? undefined,
      realVolume: c.realVolume ?? undefined,
    }));

    if (m1Candles.length === 0 && symbol.toUpperCase() === 'XAUUSD') {
      // ── Parquet-first: query DuckDB tick daemon ONLY for XAUUSD ───────────
      const pqCandles = await parquetProvider.getCandles({
        symbol,
        timeframe: targetTF,
        limit,
        beforeTime: beforeTimeStr ? new Date(beforeTimeStr) : null,
        afterTime: afterTimeStr ? new Date(afterTimeStr) : null,
        fromTime: fromStr ? new Date(fromStr) : null,
        replayTime: replayTimeStr ? new Date(replayTimeStr) : null,
      });

      if (pqCandles.length > 0) {
        const sma20 = calculateSMA(pqCandles, 20);
        const sma50 = calculateSMA(pqCandles, 50);
        const sma200 = calculateSMA(pqCandles, 200);
        const responseData = {
          symbol,
          timeframe: targetTF,
          provider: 'PARQUET',
          count: pqCandles.length,
          candles: pqCandles,
          indicators: { sma20, sma50, sma200 },
        };
        candlesResponseCache.set(cacheKey, { timestamp: Date.now(), data: responseData });
        return res.json({ ok: true, data: responseData });
      }

      // ── Final fallback: CSV ───────────────────────────────────────────────
      const csvCandles = await csvProvider.getCandles(
        symbol,
        targetTF,
        fromStr ? new Date(fromStr) : new Date(0),
        replayTimeStr ? new Date(replayTimeStr) : new Date(),
      );
      const candlesFromCsv = csvCandles.map((c) => ({
        time: new Date(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        tickVolume: c.tickVolume ?? undefined,
        realVolume: c.realVolume ?? undefined,
      }));
      const sma20 = calculateSMA(candlesFromCsv, 20);
      const sma50 = calculateSMA(candlesFromCsv, 50);
      const sma200 = calculateSMA(candlesFromCsv, 200);
      const responseData = {
        symbol,
        timeframe: targetTF,
        provider: 'CSV',
        count: candlesFromCsv.length,
        candles: candlesFromCsv,
        indicators: { sma20, sma50, sma200 },
      };
      candlesResponseCache.set(cacheKey, { timestamp: Date.now(), data: responseData });
      return res.json({ ok: true, data: responseData });
    }

    // Resample to requested timeframe if not M1
    const resampled = targetTF === 'M1' ? m1Candles : resampleM1Candles(m1Candles, targetTF);

    let candles: BacktestCandle[];
    if (afterTimeStr) {
      candles = resampled.slice(0, limit);
    } else {
      candles = resampled.slice(-limit);
    }

    const sma20 = calculateSMA(candles, 20);
    const sma50 = calculateSMA(candles, 50);
    const sma200 = calculateSMA(candles, 200);

    const responseData = {
      symbol,
      timeframe: targetTF,
      provider,
      count: candles.length,
      candles,
      indicators: { sma20, sma50, sma200 },
    };

    if (candlesResponseCache.size > 200) {
      const oldestKey = candlesResponseCache.keys().next().value;
      if (oldestKey) candlesResponseCache.delete(oldestKey);
    }
    candlesResponseCache.set(cacheKey, { timestamp: Date.now(), data: responseData });

    return res.json({
      ok: true,
      data: responseData,
    });
  } catch (error: any) {
    console.error('Error fetching backtest candles:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
});

// ── 2. Sequential Step Forward: Fetch Next Single Candle ──
// GET /api/backtest/next-candle?symbol=XAUUSD&timeframe=M1&provider=DUKASCOPY&afterTime=...
router.get('/next-candle', async (req: Request, res: Response) => {
  try {
    const symbol = (req.query.symbol as string) || 'XAUUSD';
    const targetTF = ((req.query.timeframe as string) || 'M1').toUpperCase() as ChartTimeframe;
    const provider = (req.query.provider as string) || 'DUKASCOPY';
    const afterTimeStr = req.query.afterTime as string;

    if (!afterTimeStr) {
      return res.status(400).json({ ok: false, error: 'Parameter afterTime is required.' });
    }

    const afterTime = new Date(afterTimeStr);
    if (isNaN(afterTime.getTime())) {
      return res.status(400).json({ ok: false, error: 'Invalid afterTime format.' });
    }

    const tfMinutes = TIMEFRAME_MINUTES[targetTF] || 1;

    // Fast-path: For XAUUSD, query high-speed Parquet DuckDB engine first
    if (symbol.toUpperCase() === 'XAUUSD') {
      const pqNext = await parquetProvider.getNextCandle({ symbol, timeframe: targetTF, afterTime });
      if (pqNext) {
        return res.json({ ok: true, data: pqNext });
      }
    }

    if (targetTF === 'M1') {
      const nextCandle = await prisma.mt5CandleData.findFirst({
        where: {
          provider,
          symbol,
          timeframe: 'M1',
          time: { gt: afterTime },
        },
        orderBy: { time: 'asc' },
      });

      if (!nextCandle) {
        // Parquet-first step forward
        const pqNext = await parquetProvider.getNextCandle({ symbol, timeframe: 'M1', afterTime });
        if (pqNext) {
          return res.json({ ok: true, data: pqNext });
        }
        const csvCandles = await csvProvider.getCandles(symbol, 'M1', new Date(afterTime.getTime() + 1), new Date());
        const nextCsvCandle = csvCandles[0];
        if (!nextCsvCandle) {
          return res.json({ ok: true, data: null, message: 'End of available market dataset reached.' });
        }
        return res.json({
          ok: true,
          data: {
            time: nextCsvCandle.time,
            open: nextCsvCandle.open,
            high: nextCsvCandle.high,
            low: nextCsvCandle.low,
            close: nextCsvCandle.close,
            tickVolume: nextCsvCandle.tickVolume ?? undefined,
          },
        });
      }

      const sessionIdParam = req.query.sessionId as string;
      if (sessionIdParam && typeof sessionIdParam === 'string' && sessionIdParam !== 'undefined') {
        try {
          await prisma.manualBacktestSession.update({
            where: { id: sessionIdParam },
            data: { replayTime: nextCandle.time },
          });
        } catch (e) {
          console.error('Error updating session replayTime on next-candle:', e);
        }
      }

      return res.json({
        ok: true,
        data: {
          time: nextCandle.time,
          open: nextCandle.open,
          high: nextCandle.high,
          low: nextCandle.low,
          close: nextCandle.close,
          tickVolume: nextCandle.tickVolume ?? undefined,
        },
      });
    }

    // Multi-timeframe step forward:
    // Determine the next timeframe bucket starting strictly after afterTime's bucket
    const tfMs = tfMinutes * 60 * 1000;
    const currentBucketTime = Math.floor(afterTime.getTime() / tfMs) * tfMs;
    const nextBucketStartTime = currentBucketTime + tfMs;
    const nextBucketStartDate = new Date(nextBucketStartTime);

    // Find the first available M1 candle at or after nextBucketStartDate (handles weekends / market closures)
    const firstM1 = await prisma.mt5CandleData.findFirst({
      where: {
        provider,
        symbol,
        timeframe: 'M1',
        time: { gte: nextBucketStartDate },
      },
      orderBy: { time: 'asc' },
    });

    if (!firstM1) {
      // Parquet-first for multi-TF step
      const pqNext = await parquetProvider.getNextCandle({ symbol, timeframe: targetTF, afterTime });
      if (pqNext) {
        return res.json({ ok: true, data: pqNext });
      }
      const csvCandles = await csvProvider.getCandles(symbol, targetTF, nextBucketStartDate, new Date());
      const nextCsvCandle = csvCandles[0];
      if (!nextCsvCandle) {
        return res.json({ ok: true, data: null, message: 'End of available market dataset reached.' });
      }
      return res.json({
        ok: true,
        data: {
          time: nextCsvCandle.time,
          open: nextCsvCandle.open,
          high: nextCsvCandle.high,
          low: nextCsvCandle.low,
          close: nextCsvCandle.close,
          tickVolume: nextCsvCandle.tickVolume ?? undefined,
        },
      });
    }

    const actualBucketTime = Math.floor(new Date(firstM1.time).getTime() / tfMs) * tfMs;
    const actualBucketStart = new Date(actualBucketTime);
    const actualBucketEnd = new Date(actualBucketTime + tfMs);

    const rawBars = await prisma.mt5CandleData.findMany({
      where: {
        provider,
        symbol,
        timeframe: 'M1',
        time: { gte: actualBucketStart, lt: actualBucketEnd },
      },
      orderBy: { time: 'asc' },
    });

    if (rawBars.length === 0) {
      return res.json({ ok: true, data: null, message: 'End of available market dataset reached.' });
    }

    const m1Bars: BacktestCandle[] = rawBars.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      tickVolume: c.tickVolume ?? undefined,
      realVolume: c.realVolume ?? undefined,
    }));

    const resampled = resampleM1Candles(m1Bars, targetTF);
    const nextBar = resampled[0];

    const lastRawTime = rawBars[rawBars.length - 1].time;
    const sessionIdParam = req.query.sessionId as string;
    if (sessionIdParam && typeof sessionIdParam === 'string' && sessionIdParam !== 'undefined') {
      try {
        await prisma.manualBacktestSession.update({
          where: { id: sessionIdParam },
          data: { replayTime: lastRawTime },
        });
      } catch (e) {
        console.error('Error updating session replayTime on next-candle (MTF):', e);
      }
    }

    return res.json({
      ok: true,
      data: {
        time: nextBar.time,
        open: nextBar.open,
        high: nextBar.high,
        low: nextBar.low,
        close: nextBar.close,
        tickVolume: nextBar.tickVolume,
      },
    });
  } catch (error: any) {
    console.error('Error fetching next candle:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
});

// ── 2b. Timeline Range & Dataset Bounds ──
// GET /api/backtest/timeline-bounds?symbol=XAUUSD&timeframe=M1&provider=DUKASCOPY
router.get('/timeline-bounds', async (req: Request, res: Response) => {
  try {
    const symbol = (req.query.symbol as string) || 'XAUUSD';
    const timeframe = (req.query.timeframe as string) || 'M1';
    const provider = (req.query.provider as string) || 'DUKASCOPY';

    // Parquet is the primary source of truth ONLY for XAUUSD
    if (symbol.toUpperCase() === 'XAUUSD') {
      try {
        const pqBounds = await parquetProvider.getTimelineBounds();
        if (pqBounds && pqBounds.symbol === symbol.toUpperCase()) {
          return res.json({
            ok: true,
            data: {
              dateFrom: pqBounds.dateFrom,
              dateTo: pqBounds.dateTo,
              candleCount: pqBounds.totalTicks,
              provider: 'PARQUET',
            },
          });
        }
      } catch {
        // Fallback to SQLite DB
      }
    }

    const catalog = await prisma.marketDataCatalog.findFirst({
      where: { provider, symbol, timeframe },
    });

    if (catalog) {
      return res.json({
        ok: true,
        data: {
          dateFrom: catalog.dateFrom,
          dateTo: catalog.dateTo,
          candleCount: catalog.candleCount,
        },
      });
    }

    // Fail-fast existence check: check if any candle exists for this symbol/provider
    const first = await prisma.mt5CandleData.findFirst({
      where: { provider, symbol, timeframe },
      orderBy: { time: 'asc' },
      select: { time: true },
    });

    if (!first) {
      // Fail-fast: do not fabricate date ranges for non-existent symbols
      return res.json({
        ok: true,
        data: {
          dateFrom: null,
          dateTo: null,
          candleCount: 0,
        },
      });
    }

    const last = await prisma.mt5CandleData.findFirst({
      where: { provider, symbol, timeframe },
      orderBy: { time: 'desc' },
      select: { time: true },
    });

    return res.json({
      ok: true,
      data: {
        dateFrom: first.time,
        dateTo: last?.time || first.time,
        candleCount: 0,
      },
    });
  } catch (error: any) {
    console.error('Error fetching timeline bounds:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// ── 2c. Random Replay Start Generator ──
// GET /api/backtest/random-start?symbol=XAUUSD&timeframe=M1&provider=DUKASCOPY
router.get('/random-start', async (req: Request, res: Response) => {
  try {
    const symbol = (req.query.symbol as string) || 'XAUUSD';
    const timeframe = (req.query.timeframe as string) || 'M1';
    const provider = (req.query.provider as string) || 'DUKASCOPY';

    let minTime: Date | null = null;
    let maxTime: Date | null = null;

    if (symbol.toUpperCase() === 'XAUUSD') {
      try {
        const pqBounds = await parquetProvider.getTimelineBounds();
        if (pqBounds) {
          minTime = new Date(pqBounds.dateFrom);
          maxTime = new Date(pqBounds.dateTo);
        }
      } catch {
        // Fallback to SQLite
      }
    }

    if (!minTime || !maxTime) {
      const catalog = await prisma.marketDataCatalog.findFirst({
        where: { provider, symbol, timeframe },
      });
      if (catalog && catalog.dateFrom && catalog.dateTo) {
        minTime = new Date(catalog.dateFrom);
        maxTime = new Date(catalog.dateTo);
      }
    }

    if (!minTime || !maxTime) {
      const first = await prisma.mt5CandleData.findFirst({
        where: { symbol },
        orderBy: { time: 'asc' },
        select: { time: true },
      });
      const last = await prisma.mt5CandleData.findFirst({
        where: { symbol },
        orderBy: { time: 'desc' },
        select: { time: true },
      });
      if (first && last) {
        minTime = first.time;
        maxTime = last.time;
      }
    }

    let randomTimestamp: Date;

    if (minTime && maxTime && maxTime.getTime() > minTime.getTime()) {
      // Leave ~100 M1 bars (100 mins) buffer from the beginning so initial candles load properly
      const bufferMs = 100 * 60 * 1000;
      let startMs = minTime.getTime() + bufferMs;
      let endMs = maxTime.getTime() - bufferMs;
      if (endMs <= startMs) {
        startMs = minTime.getTime();
        endMs = maxTime.getTime();
      }
      randomTimestamp = new Date(startMs + Math.random() * (endMs - startMs));
    } else {
      // Fallback range if no bounds could be determined
      const minTimestamp = new Date('2021-09-01T00:00:00Z').getTime();
      const maxTimestamp = new Date('2026-06-01T00:00:00Z').getTime();
      randomTimestamp = new Date(minTimestamp + Math.random() * (maxTimestamp - minTimestamp));
    }

    // Find nearest valid candle in DB
    let candle = await prisma.mt5CandleData.findFirst({
      where: {
        symbol,
        time: { gte: randomTimestamp },
      },
      orderBy: { time: 'asc' },
    });

    if (!candle) {
      candle = await prisma.mt5CandleData.findFirst({
        where: {
          symbol,
          time: { lte: randomTimestamp },
        },
        orderBy: { time: 'desc' },
      });
    }

    if (candle) {
      return res.json({
        ok: true,
        data: {
          time: candle.time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        },
      });
    }

    // Parquet provider for random start if symbol is XAUUSD
    const pqNext = await parquetProvider.getNextCandle({
      symbol,
      timeframe,
      afterTime: randomTimestamp,
    });

    if (pqNext) {
      return res.json({
        ok: true,
        data: {
          time: pqNext.time,
          open: pqNext.open,
          high: pqNext.high,
          low: pqNext.low,
          close: pqNext.close,
        },
      });
    }

    return res.json({
      ok: true,
      data: {
        time: minTime || new Date('2025-04-01T04:00:00Z'),
      },
    });
  } catch (error: any) {
    console.error('Error getting random start:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// ── 3. Sessions Management ──
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const sessions = await prisma.manualBacktestSession.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        trades: {
          orderBy: { tradeNumber: 'asc' },
        },
      },
    });
    return res.json({ ok: true, data: sessions });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/sessions', async (req: Request, res: Response) => {
  try {
    const {
      name,
      symbol = 'XAUUSD',
      provider = 'DUKASCOPY',
      timeframe = 'M1',
      startTime,
      initialBalance = 10000,
      riskPercent = 1.0,
      drawingsJson,
    } = req.body;

    const start = startTime ? new Date(startTime) : new Date('2025-04-01T04:00:00Z');

    const session = await prisma.manualBacktestSession.create({
      data: {
        name: name || `Manual Backtest XAUUSD ${new Date().toISOString().slice(0, 10)}`,
        symbol,
        provider,
        timeframe,
        startTime: start,
        replayTime: start,
        initialBalance: parseFloat(initialBalance) || 10000,
        currentBalance: parseFloat(initialBalance) || 10000,
        riskPercent: parseFloat(riskPercent) || 1.0,
        drawingsJson: drawingsJson || '[]',
      },
    });

    return res.json({ ok: true, data: session });
  } catch (error: any) {
    console.error('Error creating backtest session:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const session = await prisma.manualBacktestSession.findUnique({
      where: { id: req.params.id },
      include: {
        trades: {
          orderBy: { tradeNumber: 'asc' },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ ok: false, error: 'Session not found' });
    }

    return res.json({ ok: true, data: session });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.put('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const { replayTime, currentTime, currentBalance, status, drawingsJson, timeframe, name } = req.body;

    const updateData: any = {};
    if (replayTime || currentTime) updateData.replayTime = new Date(replayTime || currentTime);
    if (currentBalance != null) updateData.currentBalance = parseFloat(currentBalance);
    if (status) updateData.status = status;
    if (drawingsJson !== undefined) updateData.drawingsJson = drawingsJson;
    if (timeframe) updateData.timeframe = timeframe;
    if (name) updateData.name = name;

    const updated = await prisma.manualBacktestSession.update({
      where: { id: req.params.id },
      data: updateData,
    });

    return res.json({ ok: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// ── 4. Trades Management ──
router.post('/sessions/:id/trades', async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.id;
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '' || sessionId === 'undefined') {
      return res.status(400).json({ ok: false, error: 'Valid Session ID is required' });
    }

    const session = await prisma.manualBacktestSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Session not found' });
    }

    const { side, entryPrice, slPrice, tpPrice, volume, riskAmount, entryTime, orderType, status } = req.body;
    if (!side || (side !== 'LONG' && side !== 'SHORT')) {
      return res.status(400).json({ ok: false, error: 'Valid side (LONG or SHORT) is required' });
    }

    const numEntry = parseFloat(entryPrice);
    const numSL = parseFloat(slPrice);
    const numTP = parseFloat(tpPrice);
    const numVol = parseFloat(volume);
    const numRisk = parseFloat(riskAmount) || 0;

    if (isNaN(numEntry) || isNaN(numSL) || isNaN(numTP) || isNaN(numVol) || numVol <= 0) {
      return res.status(400).json({ ok: false, error: 'Invalid trade prices or volume' });
    }

    // Authoritative session replayTime
    const sessionReplayTime = session.replayTime ? new Date(session.replayTime) : null;
    const requestedTime = entryTime ? new Date(entryTime) : null;

    console.log(
      `[TradeEntry Lifecycle] sessionId=${sessionId} | DB session.replayTime=${sessionReplayTime?.toISOString()} | requested entryTime=${requestedTime?.toISOString()}`
    );

    // If client supplied an entryTime, it must NOT be in the future relative to session.replayTime
    let tradeTime = sessionReplayTime || new Date();
    if (requestedTime) {
      if (sessionReplayTime && requestedTime.getTime() > sessionReplayTime.getTime()) {
        console.error(
          `[LookAhead Bias Error] entryTime (${requestedTime.toISOString()}) > session.replayTime (${sessionReplayTime.toISOString()})`
        );
        return res.status(400).json({
          ok: false,
          error: 'Look-ahead bias error: entryTime cannot be in the future relative to replayTime',
        });
      }
      tradeTime = requestedTime;
    } else if (sessionReplayTime) {
      tradeTime = sessionReplayTime;
    }

    // Determine current market price at or before tradeTime
    let marketPrice = numEntry;
    const lastCandle = await prisma.mt5CandleData.findFirst({
      where: {
        provider: session.provider,
        symbol: session.symbol,
        timeframe: 'M1',
        time: { lte: tradeTime },
      },
      orderBy: { time: 'desc' },
    });
    if (lastCandle) {
      marketPrice = lastCandle.close;
    }

    const tolerance = getSymbolPriceTolerance(session.symbol);
    const isWithinCandleRange = lastCandle
      ? (lastCandle.low - tolerance <= numEntry && numEntry <= lastCandle.high + tolerance)
      : false;
    const isAtCurrentClose = Math.abs(numEntry - marketPrice) <= tolerance;
    const isTradeableAtMarket = isAtCurrentClose || isWithinCandleRange;

    const direction = side === 'LONG' ? 'BUY' : 'SELL';
    const effective = getEffectiveOrderType({
      direction,
      entryPrice: numEntry,
      marketPrice,
      symbol: session.symbol,
    });

    // Check if requested to place as PENDING or if it is effectively a pending order
    const isPendingOrder = status === 'PENDING' || (status !== 'OPEN' && orderType && orderType !== 'MARKET_BUY' && orderType !== 'MARKET_SELL') || (status !== 'OPEN' && !isTradeableAtMarket && effective.isPending);

    // Exception: If status is explicitly 'OPEN' and orderType is a pending type (BUY_LIMIT, SELL_LIMIT, BUY_STOP, SELL_STOP),
    // it represents a filled pending order triggered at entryPrice, so bypass the isTradeableAtMarket 422 guard.
    const isFilledPendingOrder = status === 'OPEN' && Boolean(orderType && orderType !== 'MARKET_BUY' && orderType !== 'MARKET_SELL');

    // Guard: If trying to execute immediately as OPEN, but entry price is outside market tolerance and candle range:
    if (!isPendingOrder && !isFilledPendingOrder && !isTradeableAtMarket && effective.isPending) {
      return res.status(422).json({
        ok: false,
        error: `Eksekusi Market tidak valid: Harga Entry ($${numEntry.toFixed(2)}) berada di luar jangkauan harga market saat ini ($${marketPrice.toFixed(2)}). Order harus ditempatkan sebagai ${effective.orderType.replace('_', ' ')} (Pending Order).`,
      });
    }

    // Guard against stacked positions: ONLY 1 OPEN position allowed per session
    if (!isPendingOrder) {
      const existingOpenTrade = await prisma.manualBacktestTrade.findFirst({
        where: { sessionId, status: 'OPEN' },
      });
      if (existingOpenTrade) {
        return res.status(409).json({
          ok: false,
          error: `Tidak dapat membuka posisi baru: Posisi #${existingOpenTrade.tradeNumber} masih terbuka. Tutup posisi aktif terlebih dahulu.`,
        });
      }
    }

    const finalOrderType = (orderType as OrderExecutionType) || effective.orderType;
    const finalStatus = isPendingOrder ? 'PENDING' : 'OPEN';

    const tradeCount = await prisma.manualBacktestTrade.count({
      where: { sessionId },
    });

    const trade = await prisma.manualBacktestTrade.create({
      data: {
        sessionId,
        tradeNumber: tradeCount + 1,
        orderType: finalOrderType,
        side: side as TradeSide,
        entryTime: tradeTime,
        entryPrice: numEntry,
        slPrice: numSL,
        tpPrice: numTP,
        volume: numVol,
        riskAmount: numRisk,
        status: finalStatus,
      },
    });

    return res.json({ ok: true, data: trade });
  } catch (error: any) {
    console.error('Error opening manual backtest trade:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// Trigger a PENDING trade to become OPEN
router.post('/sessions/:id/trades/:tradeId/trigger', async (req: Request, res: Response) => {
  try {
    const { id: sessionId, tradeId } = req.params;
    const trade = await prisma.manualBacktestTrade.findUnique({
      where: { id: tradeId },
    });
    if (!trade || trade.sessionId !== sessionId) {
      return res.status(404).json({ ok: false, error: 'Trade not found' });
    }
    if (trade.status !== 'PENDING') {
      return res.status(400).json({ ok: false, error: `Trade is not pending (status: ${trade.status})` });
    }

    // Check if there is already an open trade
    const existingOpen = await prisma.manualBacktestTrade.findFirst({
      where: { sessionId, status: 'OPEN' },
    });
    if (existingOpen) {
      return res.status(409).json({
        ok: false,
        error: `Cannot trigger pending order: Position #${existingOpen.tradeNumber} is already open.`,
      });
    }

    const { triggerTime, triggerPrice } = req.body;
    const numTriggerPrice = triggerPrice ? parseFloat(triggerPrice) : trade.entryPrice;
    const newEntryTime = triggerTime ? new Date(triggerTime) : new Date();

    const updated = await prisma.manualBacktestTrade.update({
      where: { id: tradeId },
      data: {
        status: 'OPEN',
        entryTime: newEntryTime,
        entryPrice: numTriggerPrice,
      },
    });

    return res.json({ ok: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// Cancel and delete a pending trade
router.delete('/sessions/:id/trades/:tradeId', async (req: Request, res: Response) => {
  try {
    const { id: sessionId, tradeId } = req.params;
    const trade = await prisma.manualBacktestTrade.findUnique({
      where: { id: tradeId },
    });
    if (!trade || trade.sessionId !== sessionId) {
      return res.status(404).json({ ok: false, error: 'Trade not found' });
    }
    if (trade.status === 'OPEN') {
      return res.status(400).json({ ok: false, error: 'Cannot delete an OPEN trade; use close trade instead.' });
    }
    await prisma.manualBacktestTrade.delete({
      where: { id: tradeId },
    });
    return res.json({ ok: true, message: 'Trade cancelled and deleted' });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/sessions/:id/trades/:tradeId/close', async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.id || req.params.sessionId;
    const tradeId = req.params.tradeId;

    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '' || sessionId === 'undefined' ||
        !tradeId || typeof tradeId !== 'string' || tradeId.trim() === '' || tradeId === 'undefined') {
      return res.status(400).json({ ok: false, error: 'Valid Session ID and Trade ID are required' });
    }

    const session = await prisma.manualBacktestSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Session not found' });
    }

    const trade = await prisma.manualBacktestTrade.findUnique({
      where: { id: tradeId },
    });
    if (!trade) {
      return res.status(404).json({ ok: false, error: 'Trade not found' });
    }

    if (trade.sessionId !== sessionId) {
      return res.status(400).json({ ok: false, error: 'Trade does not belong to the specified session' });
    }

    if (trade.status === 'CLOSED') {
      return res.status(409).json({ ok: false, error: 'Trade is already closed' });
    }

    const { exitTime, exitPrice, exitReason } = req.body;
    const numExitPrice = parseFloat(exitPrice);
    if (isNaN(numExitPrice) || numExitPrice <= 0) {
      return res.status(400).json({ ok: false, error: 'Valid exitPrice is required' });
    }

    const pnl = calculatePnL(trade.side as TradeSide, trade.entryPrice, numExitPrice, trade.volume, getSymbolContractSize(session.symbol));
    const priceRisk = Math.abs(trade.entryPrice - trade.slPrice);
    const priceCaptured = trade.side === 'LONG'
      ? numExitPrice - trade.entryPrice
      : trade.entryPrice - numExitPrice;
    const realizedRR = priceRisk > 0 ? Math.round((priceCaptured / priceRisk) * 100) / 100 : 0;

    const closedTrade = await prisma.manualBacktestTrade.update({
      where: { id: tradeId },
      data: {
        exitTime: exitTime ? new Date(exitTime) : new Date(),
        exitPrice: numExitPrice,
        exitReason: exitReason || 'MANUAL_CLOSE',
        pnl,
        rr: realizedRR,
        status: 'CLOSED',
      },
    });

    const newBalance = (session.currentBalance || 10000) + pnl;

    const updatedSession = await prisma.manualBacktestSession.update({
      where: { id: sessionId },
      data: {
        currentBalance: Math.round(newBalance * 100) / 100,
      },
    });

    return res.json({
      ok: true,
      data: {
        trade: closedTrade,
        session: updatedSession,
      },
    });
  } catch (error: any) {
    console.error('Error closing manual backtest trade:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/sessions/:id/trades/close-all', async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.id;
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'Session ID is required' });
    }

    const session = await prisma.manualBacktestSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Session not found' });
    }

    const openTrades = await prisma.manualBacktestTrade.findMany({
      where: { sessionId, status: 'OPEN' },
    });

    if (openTrades.length === 0) {
      return res.json({ ok: true, data: { trades: [], session } });
    }

    const { exitTime, exitPrice, exitReason } = req.body;
    const numExitPrice = parseFloat(exitPrice);
    if (isNaN(numExitPrice) || numExitPrice <= 0) {
      return res.status(400).json({ ok: false, error: 'Valid exitPrice is required' });
    }

    let totalPnl = 0;
    const closedTrades = [];

    for (const trade of openTrades) {
      const pnl = calculatePnL(trade.side as TradeSide, trade.entryPrice, numExitPrice, trade.volume, getSymbolContractSize(session.symbol));
      const priceRisk = Math.abs(trade.entryPrice - trade.slPrice);
      const priceCaptured = trade.side === 'LONG'
        ? numExitPrice - trade.entryPrice
        : trade.entryPrice - numExitPrice;
      const realizedRR = priceRisk > 0 ? Math.round((priceCaptured / priceRisk) * 100) / 100 : 0;
      totalPnl += pnl;

      const closed = await prisma.manualBacktestTrade.update({
        where: { id: trade.id },
        data: {
          exitTime: exitTime ? new Date(exitTime) : new Date(),
          exitPrice: numExitPrice,
          exitReason: exitReason || 'CLOSE_ALL',
          pnl,
          rr: realizedRR,
          status: 'CLOSED',
        },
      });
      closedTrades.push(closed);
    }

    const newBalance = Math.round(((session.currentBalance || 10000) + totalPnl) * 100) / 100;
    const updatedSession = await prisma.manualBacktestSession.update({
      where: { id: sessionId },
      data: { currentBalance: newBalance },
    });

    return res.json({
      ok: true,
      data: {
        trades: closedTrades,
        session: updatedSession,
      },
    });
  } catch (error: any) {
    console.error('Error closing all trades:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// ── 6. Sync Chart Reply Replay Session & Trades to Main Journal & Dashboard ──
router.post('/sessions/:id/sync-to-journal', async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.id;
    const manualSession = await prisma.manualBacktestSession.findUnique({
      where: { id: sessionId },
      include: {
        trades: {
          orderBy: { tradeNumber: 'asc' },
        },
      },
    });

    if (!manualSession) {
      return res.status(404).json({ ok: false, error: 'Manual backtest session not found' });
    }

    const sessionTag = `[MANUAL_REPLAY_ID:${manualSession.id}]`;
    let journalSession = await prisma.backtestSession.findFirst({
      where: {
        notes: {
          contains: sessionTag,
        },
      },
    });

    const sessionName = manualSession.name || `Chart Reply ${manualSession.symbol} (${manualSession.timeframe})`;

    if (!journalSession) {
      journalSession = await prisma.backtestSession.create({
        data: {
          name: sessionName,
          sourceMode: 'MANUAL',
          symbol: manualSession.symbol || 'XAUUSD',
          marketType: 'Gold',
          timeframe: manualSession.timeframe || 'M1',
          initialBalance: manualSession.initialBalance || 10000,
          balanceCurrency: 'USD',
          centMultiplier: 100,
          usdIdrRate: 16000,
          riskMode: 'FIXED_PCT',
          riskValue: manualSession.riskPercent || 1.0,
          notes: `${sessionTag} Chart Reply manual session created at ${manualSession.createdAt.toISOString()}`,
        },
      });
    } else {
      journalSession = await prisma.backtestSession.update({
        where: { id: journalSession.id },
        data: {
          name: sessionName,
          timeframe: manualSession.timeframe || 'M1',
          riskValue: manualSession.riskPercent || 1.0,
        },
      });
    }

    // Sync all closed trades
    const closedTrades = manualSession.trades.filter((t) => t.status === 'CLOSED');
    let syncedCount = 0;

    for (const mt of closedTrades) {
      const tradeFingerprint = `replay_trade_${mt.id}`;
      const rMultiple = mt.rr !== null && mt.rr !== undefined ? mt.rr : 0;
      const plannedRR = mt.slPrice && mt.tpPrice && mt.entryPrice && Math.abs(mt.entryPrice - mt.slPrice) > 0
        ? Math.abs(mt.tpPrice - mt.entryPrice) / Math.abs(mt.entryPrice - mt.slPrice)
        : null;
      const netPnlUsd = mt.pnl ?? 0;
      const netPnlPct = manualSession.initialBalance > 0 ? (netPnlUsd / manualSession.initialBalance) * 100 : 0;
      const result = netPnlUsd > 0.001 ? 'WIN' : netPnlUsd < -0.001 ? 'LOSS' : 'BE';

      let durationMinutes = 0;
      if (mt.entryTime && mt.exitTime) {
        durationMinutes = Math.max(0, Math.round((new Date(mt.exitTime).getTime() - new Date(mt.entryTime).getTime()) / 60000));
      }

      const existingTrade = await prisma.trade.findFirst({
        where: {
          sessionId: journalSession.id,
          importFingerprint: tradeFingerprint,
        },
      });

      const tradeData = {
        sessionId: journalSession.id,
        source: 'MANUAL',
        tradeNumber: mt.tradeNumber,
        tradeId: `REPLAY-${mt.tradeNumber}-${mt.id.slice(0, 8)}`,
        symbol: manualSession.symbol || 'XAUUSD',
        timeframe: manualSession.timeframe || 'M1',
        side: mt.side,
        entryTime: mt.entryTime,
        exitTime: mt.exitTime || mt.entryTime,
        entryPrice: mt.entryPrice,
        exitPrice: mt.exitPrice || mt.entryPrice,
        slPrice: mt.slPrice,
        tpPrice: mt.tpPrice,
        qty: mt.volume,
        positionValue: mt.volume * 100 * mt.entryPrice,
        netPnlUsd,
        netPnlPct,
        netPnlIdr: netPnlUsd * 16000,
        durationMinutes,
        rMultiple,
        plannedRR,
        riskUsd: mt.riskAmount,
        status: 'CLOSED',
        result,
        notes: `Chart Reply Trade #${mt.tradeNumber}. Exit Reason: ${mt.exitReason || 'MANUAL'}`,
        importFingerprint: tradeFingerprint,
      };

      if (existingTrade) {
        await prisma.trade.update({
          where: { id: existingTrade.id },
          data: tradeData,
        });
      } else {
        await prisma.trade.create({
          data: tradeData,
        });
      }
      syncedCount++;
    }

    return res.json({
      ok: true,
      data: {
        journalSessionId: journalSession.id,
        manualSessionId: manualSession.id,
        syncedTradesCount: syncedCount,
      },
    });
  } catch (error: any) {
    console.error('Error syncing manual backtest to journal:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
