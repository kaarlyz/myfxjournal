import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { prisma } from '../prisma';
import { logIntegration } from '../utils/logger';
import { notifyTradeLifecycle } from '../services/tradeNotifier';
import { mt5Events } from './mt5-integration';
import { jobOrchestrator } from '../integrations/mt5-sync/jobOrchestrator';
import { defaultStorage } from '../integrations/mt5-sync/sqliteStorage';
import { cacheManager } from '../integrations/mt5-sync/cacheManager';
import { getSettings } from './settings';

const router = Router();

// IP Rate Limiter
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000;
const MAX_REQUESTS_PER_WINDOW = 500; // Raised limit for high-frequency tick uploads

const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  const limitData = rateLimitMap.get(ip)!;
  if (now > limitData.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  limitData.count++;
  if (limitData.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ ok: false, error: 'Too many requests' });
  }

  next();
};

// Bearer Auth Middleware
const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';

    if (!token) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: Missing API Key' });
    }

    const settings = await getSettings(true);
    const masterToken = process.env.WEBHOOK_SECRET || process.env.SECRET_TOKEN || settings.secretToken || 'replayfx_secret_token_123';

    if (token === masterToken) {
      return next();
    }

    // Check terminal-specific API Key
    const terminal = await prisma.mt5Terminal.findFirst({
      where: { apiKey: token },
    });

    if (terminal) {
      (req as any).terminal = terminal;
      return next();
    }

    return res.status(401).json({ ok: false, error: 'Unauthorized: Invalid API Key' });
  } catch (error) {
    next(error);
  }
};

// ── 1. Terminal Authentication & Heartbeat ─────────────────────────

// POST /api/mt5/auth
router.post('/auth', rateLimiter, authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { terminalId, accountNumber, broker, brokerServer, platformVersion, apiKey, balance, equity, leverage, currency } = req.body;

    if (!terminalId) {
      return res.status(400).json({ ok: false, error: 'Missing terminalId' });
    }

    const terminal = await prisma.mt5Terminal.upsert({
      where: { terminalId: String(terminalId) },
      create: {
        terminalId: String(terminalId),
        accountNumber: accountNumber ? String(accountNumber) : null,
        broker: broker ? String(broker) : null,
        brokerServer: brokerServer ? String(brokerServer) : null,
        platformVersion: platformVersion ? String(platformVersion) : null,
        apiKey: apiKey || null,
        status: 'ONLINE',
        lastHeartbeatAt: new Date(),
        balance: balance != null ? Number(balance) : null,
        equity: equity != null ? Number(equity) : null,
        leverage: leverage ? String(leverage) : null,
        currency: currency || 'USD',
      },
      update: {
        accountNumber: accountNumber ? String(accountNumber) : undefined,
        broker: broker ? String(broker) : undefined,
        brokerServer: brokerServer ? String(brokerServer) : undefined,
        platformVersion: platformVersion ? String(platformVersion) : undefined,
        status: 'ONLINE',
        lastHeartbeatAt: new Date(),
        balance: balance != null ? Number(balance) : undefined,
        equity: equity != null ? Number(equity) : undefined,
        leverage: leverage ? String(leverage) : undefined,
      },
    });

    // Automatically upsert TradingAccount for Live Journal sync
    if (accountNumber) {
      await prisma.tradingAccount.upsert({
        where: { id: `mt5-${terminalId}` },
        create: {
          id: `mt5-${terminalId}`,
          name: `${broker || 'MT5'} Account (${accountNumber})`,
          broker: broker || 'MetaTrader 5',
          brokerServer: brokerServer || null,
          accountNumber: String(accountNumber),
          accountType: 'REAL',
          platform: 'MT5',
          currency: currency || 'USD',
          initialBalance: balance || 0,
          currentBalance: balance || 0,
          currentEquity: equity || balance || 0,
          leverage: leverage || '1:100',
          source: 'MT5_AUTO',
          autoCreated: true,
        },
        update: {
          currentBalance: balance != null ? Number(balance) : undefined,
          currentEquity: equity != null ? Number(equity) : undefined,
          lastSnapshotAt: new Date(),
        },
      });
    }

    await logIntegration('MT5', 'TERMINAL_AUTH', 'SUCCESS', `MT5 Terminal #${terminalId} connected`, { terminalId, accountNumber, broker });

    return res.json({
      ok: true,
      message: 'Terminal registered successfully',
      terminal,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/mt5/heartbeat
router.post('/heartbeat', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { terminalId, balance, equity, status } = req.body;
    if (!terminalId) return res.status(400).json({ ok: false, error: 'Missing terminalId' });

    await prisma.mt5Terminal.updateMany({
      where: { terminalId: String(terminalId) },
      data: {
        status: status || 'ONLINE',
        lastHeartbeatAt: new Date(),
        balance: balance != null ? Number(balance) : undefined,
        equity: equity != null ? Number(equity) : undefined,
      },
    });

    return res.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

// GET /api/mt5/terminals
router.get('/terminals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const terminals = await prisma.mt5Terminal.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return res.json({ ok: true, terminals });
  } catch (error) {
    next(error);
  }
});

// ── 2. Live Trade Ingestion & Notification ─────────────────────────

// POST /api/mt5/trades
router.post('/trades', rateLimiter, authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.body;
    const { terminalId, positionId, symbol, side, lot, entryPrice, closePrice, stopLoss, takeProfit, status, profit, openTime } = payload;

    if (!symbol || !side) {
      return res.status(400).json({ ok: false, error: 'Missing symbol or side' });
    }

    // Guard: reject payloads where the EA argument order bug sent trade direction words as the symbol
    const DIRECTION_WORDS = ['BUY', 'SELL', 'OPEN', 'CLOSED'];
    if (DIRECTION_WORDS.includes(String(symbol).toUpperCase())) {
      return res.status(400).json({ ok: false, error: `Invalid symbol value: "${symbol}". Possible EA argument-order mismatch.` });
    }

    // Guard: safe openTime parsing — reject invalid timestamps rather than inserting "Invalid Date"
    let parsedOpenTime: Date = new Date();
    if (openTime) {
      const t = new Date(openTime);
      parsedOpenTime = isNaN(t.getTime()) ? new Date() : t;
    }

    const accountId = `mt5-${terminalId || 'default'}`;

    // Upsert into LiveTrade
    const liveTrade = await prisma.liveTrade.upsert({
      where: { positionId: positionId ? String(positionId) : `temp-${Date.now()}` },
      create: {
        tradingAccountId: accountId,
        source: 'MT5_EA',
        positionId: positionId ? String(positionId) : null,
        symbol: symbol.toUpperCase(),
        side: String(side).toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
        lot: Number(lot || 0.01),
        entryPrice: Number(entryPrice || 0),
        closePrice: closePrice != null ? Number(closePrice) : null,
        stopLoss: stopLoss != null ? Number(stopLoss) : null,
        takeProfit: takeProfit != null ? Number(takeProfit) : null,
        openTime: parsedOpenTime,
        status: status === 'CLOSED' ? 'CLOSED' : 'OPEN',
        profit: profit != null ? Number(profit) : 0,
      },
      update: {
        closePrice: closePrice != null ? Number(closePrice) : undefined,
        stopLoss: stopLoss != null ? Number(stopLoss) : undefined,
        takeProfit: takeProfit != null ? Number(takeProfit) : undefined,
        closeTime: status === 'CLOSED' ? new Date() : undefined,
        status: status === 'CLOSED' ? 'CLOSED' : 'OPEN',
        profit: profit != null ? Number(profit) : undefined,
      },
    });

    // Emit realtime SSE event for Live Journal UI
    mt5Events.emit('trade', {
      type: status === 'CLOSED' ? 'TRADE_CLOSED' : 'TRADE_OPENED',
      trade: liveTrade,
    });

    // Trigger instant Telegram / WhatsApp Notification via reusable tradeNotifier
    notifyTradeLifecycle({
      id: liveTrade.id,
      symbol: liveTrade.symbol,
      side: liveTrade.side,
      lot: liveTrade.lot,
      entryPrice: liveTrade.entryPrice,
      closePrice: liveTrade.closePrice,
      stopLoss: liveTrade.stopLoss,
      takeProfit: liveTrade.takeProfit,
      openTime: liveTrade.openTime,
      closeTime: liveTrade.closeTime,
      profit: liveTrade.profit,
      status: liveTrade.status,
      source: 'MT5_EA',
      positionId: liveTrade.positionId,
      eventType: status === 'CLOSED' ? 'CLOSE' : 'OPEN',
    }).catch(err => console.error('[MT5 Sync] Notification error:', err));

    await logIntegration('MT5', 'LIVE_TRADE_SYNC', 'SUCCESS', `Live Trade ${symbol} ${side} ${status}`, { positionId, symbol, status });

    return res.json({ ok: true, trade: liveTrade });
  } catch (error) {
    next(error);
  }
});

// POST /api/mt5/history
router.post('/history', rateLimiter, authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { terminalId, deals } = req.body;
    if (!Array.isArray(deals)) {
      return res.status(400).json({ ok: false, error: 'Deals array required' });
    }

    const accountId = `mt5-${terminalId || 'default'}`;
    let insertedCount = 0;

    for (const deal of deals) {
      if (!deal.symbol || !deal.positionId) continue;

      await prisma.liveTrade.upsert({
        where: { positionId: String(deal.positionId) },
        create: {
          tradingAccountId: accountId,
          source: 'MT5_HISTORY',
          positionId: String(deal.positionId),
          symbol: deal.symbol.toUpperCase(),
          side: deal.type === 'BUY' ? 'BUY' : 'SELL',
          lot: Number(deal.volume || 0.01),
          entryPrice: Number(deal.price || 0),
          closePrice: Number(deal.price || 0),
          openTime: deal.time ? new Date(deal.time * 1000) : new Date(),
          closeTime: deal.time ? new Date(deal.time * 1000) : new Date(),
          status: 'CLOSED',
          profit: Number(deal.profit || 0),
          commission: Number(deal.commission || 0),
          swap: Number(deal.swap || 0),
        },
        update: {
          profit: Number(deal.profit || 0),
        },
      });
      insertedCount++;
    }

    await logIntegration('MT5', 'HISTORY_SYNC', 'SUCCESS', `Synced ${insertedCount} historical deals for Terminal #${terminalId}`, { count: insertedCount });

    return res.json({ ok: true, syncedDeals: insertedCount });
  } catch (error) {
    next(error);
  }
});

// ── 3. Chunked Tick & Candle Ingestion ──────────────────────────────

// POST /api/mt5/ticks
router.post('/ticks', rateLimiter, authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ticks, terminalId, jobId } = req.body;
    if (!Array.isArray(ticks) || !ticks.length) {
      return res.status(400).json({ ok: false, error: 'Ticks array required' });
    }

    const count = await defaultStorage.saveTicks(ticks, terminalId);

    if (jobId) {
      const lastTickTime = ticks[ticks.length - 1]?.time;
      await jobOrchestrator.updateJobProgress(jobId, count, lastTickTime);
    }

    await logIntegration('MT5', 'TICK_BATCH', 'SUCCESS', `Saved ${count} tick records`, {
      terminalId: terminalId || null,
      jobId: jobId || null,
      savedTicks: count,
    });

    return res.json({ ok: true, savedTicks: count });
  } catch (error) {
    next(error);
  }
});

// POST /api/mt5/candles
router.post('/candles', rateLimiter, authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { candles, terminalId, jobId } = req.body;
    if (!Array.isArray(candles) || !candles.length) {
      return res.status(400).json({ ok: false, error: 'Candles array required' });
    }

    const count = await defaultStorage.saveCandles(candles, terminalId);

    if (jobId) {
      const lastCandleTime = candles[candles.length - 1]?.time;
      await jobOrchestrator.updateJobProgress(jobId, count, lastCandleTime);
    }

    await logIntegration('MT5', 'CANDLE_BATCH', 'SUCCESS', `Saved ${count} candle records`, {
      terminalId: terminalId || null,
      jobId: jobId || null,
      savedCandles: count,
    });

    return res.json({ ok: true, savedCandles: count });
  } catch (error) {
    next(error);
  }
});

// ── 4. Task Distribution & Job Management ──────────────────────────

// GET /api/mt5/tasks/next (EA Task Pull Protocol)
router.get('/tasks/next', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const terminalId = req.query.terminalId ? String(req.query.terminalId) : 'default';
    const task = await jobOrchestrator.getNextTaskForTerminal(terminalId);

    await logIntegration('MT5', 'TASK_FETCH', 'INFO', `Terminal ${terminalId} requested next task`, {
      terminalId,
      hasTask: !!task,
      taskId: task?.taskId,
    });

    return res.json({ ok: true, hasTask: !!task, task });
  } catch (error) {
    next(error);
  }
});

// POST /api/mt5/jobs/create (Frontend Download Request)
router.post('/jobs/create', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol, dataType, timeframe, dateFrom, dateTo, terminalId } = req.body;

    if (!symbol || !dataType || !dateFrom || !dateTo) {
      return res.status(400).json({ ok: false, error: 'Missing required parameters: symbol, dataType, dateFrom, dateTo' });
    }

    const result = await jobOrchestrator.createJob({
      symbol: String(symbol),
      dataType: dataType as any,
      timeframe: timeframe ? String(timeframe) : undefined,
      dateFrom: new Date(dateFrom),
      dateTo: new Date(dateTo),
      terminalId: terminalId ? String(terminalId) : undefined,
      allowSynthetic: req.body.allowSynthetic === true,
    });

    if (result.error) {
      return res.status(400).json({
        ok: false,
        error: result.error,
        code: result.code,
        message: result.message,
        job: result.job,
        gaps: result.gaps,
      });
    }

    return res.json({ ok: true, job: result.job, gaps: result.gaps });
  } catch (error) {
    next(error);
  }
});

// GET /api/mt5/jobs
router.get('/jobs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobs = await prisma.mt5SyncJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return res.json({ ok: true, jobs });
  } catch (error) {
    next(error);
  }
});

// POST /api/mt5/jobs/:id/action
router.post('/jobs/:id/action', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // PAUSE, RESUME, CANCEL

    const statusMap: Record<string, any> = {
      PAUSE: 'PAUSED',
      RESUME: 'RUNNING',
      CANCEL: 'CANCELLED',
    };

    const newStatus = statusMap[action];
    if (!newStatus) return res.status(400).json({ ok: false, error: 'Invalid action' });

    const job = await jobOrchestrator.setJobStatus(id, newStatus);
    return res.json({ ok: true, job });
  } catch (error) {
    next(error);
  }
});

// ── 5. Catalog & Direct EA Download ────────────────────────────────

// GET /api/mt5/catalog
router.get('/catalog', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.marketDataCatalog.findMany({
      orderBy: { lastSyncedAt: 'desc' },
    });
    
    // Fix TypeError: Do not know how to serialize a BigInt
    const serializedItems = items.map(item => ({
      ...item,
      tickCount: Number(item.tickCount),
      candleCount: Number(item.candleCount),
      fileSizeBytes: Number(item.fileSizeBytes)
    }));
    
    return res.json({ ok: true, catalog: serializedItems });
  } catch (error) {
    next(error);
  }
});

// GET /api/mt5/download-ea (1-Click Direct EA File Download)
router.get('/download-ea', (req: Request, res: Response) => {
  const filePath = path.join(__dirname, '../integrations/mt5-sync/ReplayFX_LiveSync.mq5');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, error: 'EA file not found' });
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ReplayFX_LiveSync.mq5"');
  return res.sendFile(filePath);
});

export default router;
