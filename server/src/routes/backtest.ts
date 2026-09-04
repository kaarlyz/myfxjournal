import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
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
} from '../services/backtestEngine';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// 1. WINDOWED HISTORICAL CANDLES STREAM
// ═══════════════════════════════════════════════════════════════════════════
// GET /api/backtest/candles?symbol=XAUUSD&timeframe=M1&provider=DUKASCOPY&replayTime=...&limit=1500&beforeTime=...&afterTime=...
router.get('/candles', async (req: Request, res: Response) => {
  try {
    const symbol = (req.query.symbol as string) || 'XAUUSD';
    const targetTF = ((req.query.timeframe as string) || 'M1').toUpperCase() as ChartTimeframe;
    const provider = (req.query.provider as string) || 'DUKASCOPY';
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string, 10) || 1500), 5000);
    const replayTimeStr = req.query.replayTime as string;
    const beforeTimeStr = req.query.beforeTime as string;
    const afterTimeStr = req.query.afterTime as string;
    const fromStr = req.query.from as string;

    const tfMultiplier = TIMEFRAME_MINUTES[targetTF] || 1;
    const rawLimit = Math.min(limit * tfMultiplier, 10000);

    let rawCandles: any[] = [];

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

    // Resample to requested timeframe if not M1
    const candles = targetTF === 'M1' ? m1Candles : resampleM1Candles(m1Candles, targetTF);

    // Calculate SMA on visible window
    const sma20 = calculateSMA(candles, 20);
    const sma50 = calculateSMA(candles, 50);
    const sma200 = calculateSMA(candles, 200);

    return res.json({
      ok: true,
      data: {
        symbol,
        timeframe: targetTF,
        provider,
        count: candles.length,
        candles,
        indicators: {
          sma20,
          sma50,
          sma200,
        },
      },
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
        return res.json({ ok: true, data: null, message: 'End of available market dataset reached.' });
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

    // Multi-timeframe step forward: fetch raw M1 candles covering next bar
    const rawBars = await prisma.mt5CandleData.findMany({
      where: {
        provider,
        symbol,
        timeframe: 'M1',
        time: { gt: afterTime },
      },
      orderBy: { time: 'asc' },
      take: tfMinutes,
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

    const first = await prisma.mt5CandleData.findFirst({
      where: { provider, symbol, timeframe },
      orderBy: { time: 'asc' },
      select: { time: true },
    });
    const last = await prisma.mt5CandleData.findFirst({
      where: { provider, symbol, timeframe },
      orderBy: { time: 'desc' },
      select: { time: true },
    });

    return res.json({
      ok: true,
      data: {
        dateFrom: first?.time || new Date('2021-08-23T01:00:00Z'),
        dateTo: last?.time || new Date('2026-08-21T02:59:00Z'),
        candleCount: 1768274,
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

    // Min date: 2021-09-01, Max date: 2026-06-01 (leaves plenty of historical + future context)
    const minTimestamp = new Date('2021-09-01T00:00:00Z').getTime();
    const maxTimestamp = new Date('2026-06-01T00:00:00Z').getTime();
    const randomTimestamp = new Date(minTimestamp + Math.random() * (maxTimestamp - minTimestamp));

    // Find nearest valid candle
    const candle = await prisma.mt5CandleData.findFirst({
      where: {
        provider,
        symbol,
        timeframe,
        time: { gte: randomTimestamp },
      },
      orderBy: { time: 'asc' },
    });

    if (!candle) {
      return res.json({
        ok: true,
        data: {
          time: new Date('2025-04-01T04:00:00Z'),
        },
      });
    }

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
        currentTime: start,
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
    const { currentTime, currentBalance, status, drawingsJson } = req.body;

    const updateData: any = {};
    if (currentTime) updateData.currentTime = new Date(currentTime);
    if (currentBalance != null) updateData.currentBalance = parseFloat(currentBalance);
    if (status) updateData.status = status;
    if (drawingsJson !== undefined) updateData.drawingsJson = drawingsJson;

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
    const { side, entryPrice, slPrice, tpPrice, volume, riskAmount, entryTime } = req.body;

    const tradeCount = await prisma.manualBacktestTrade.count({
      where: { sessionId },
    });

    const trade = await prisma.manualBacktestTrade.create({
      data: {
        sessionId,
        tradeNumber: tradeCount + 1,
        side: side as TradeSide,
        entryTime: entryTime ? new Date(entryTime) : new Date(),
        entryPrice: parseFloat(entryPrice),
        slPrice: parseFloat(slPrice),
        tpPrice: parseFloat(tpPrice),
        volume: parseFloat(volume),
        riskAmount: parseFloat(riskAmount),
        status: 'OPEN',
      },
    });

    return res.json({ ok: true, data: trade });
  } catch (error: any) {
    console.error('Error opening manual backtest trade:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/sessions/:id/trades/:tradeId/close', async (req: Request, res: Response) => {
  try {
    const { sessionId, tradeId } = req.params;
    const { exitTime, exitPrice, exitReason } = req.body;

    const trade = await prisma.manualBacktestTrade.findUnique({
      where: { id: tradeId },
    });

    if (!trade) {
      return res.status(404).json({ ok: false, error: 'Trade not found' });
    }

    const numExitPrice = parseFloat(exitPrice);
    const pnl = calculatePnL(trade.side as TradeSide, trade.entryPrice, numExitPrice, trade.volume);
    const rrResult = calculateRR(trade.side as TradeSide, trade.entryPrice, trade.slPrice, numExitPrice);

    const closedTrade = await prisma.manualBacktestTrade.update({
      where: { id: tradeId },
      data: {
        exitTime: exitTime ? new Date(exitTime) : new Date(),
        exitPrice: numExitPrice,
        exitReason: exitReason || 'MANUAL_CLOSE',
        pnl,
        rr: rrResult.rr,
        status: 'CLOSED',
      },
    });

    const session = await prisma.manualBacktestSession.findUnique({
      where: { id: sessionId },
    });

    const newBalance = (session?.currentBalance || 10000) + pnl;

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

export default router;
