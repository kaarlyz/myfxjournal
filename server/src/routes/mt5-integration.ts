import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { getSettings } from './settings';
import { EventEmitter } from 'events';
import { logIntegration } from '../utils/logger';

// Global Event Emitter for SSE
export const mt5Events = new EventEmitter();

const router = Router();

// Simple in-memory rate limiting for webhook
const rateLimitMap = new Map<string, { count: number, resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000;
const MAX_REQUESTS_PER_WINDOW = 100;

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

// Middleware to check secret token
const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const settings = await getSettings(true);
    
    // Priority: process.env.WEBHOOK_SECRET > process.env.SECRET_TOKEN > DB settings.secretToken
    const validToken = process.env.WEBHOOK_SECRET || process.env.SECRET_TOKEN || settings.secretToken;
    
    if (!authHeader || authHeader !== `Bearer ${validToken}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

// GET /api/integrations/mt5/status
router.get('/status', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lastEvent = await prisma.webhookEvent.findFirst({
      where: { source: 'MT5_EA' },
      orderBy: { receivedAt: 'desc' }
    });
    
    return res.json({
      connected: !!lastEvent,
      lastSyncTime: lastEvent ? lastEvent.receivedAt : null
    });
  } catch (error: any) {
    next(error);
  }
});

// POST /api/integrations/mt5/trade-event
router.post('/trade-event', rateLimiter, authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.body;
    
    // 1. Strict Validation
    const requiredFields = ['accountNumber', 'broker', 'symbol', 'dealId', 'positionId', 'eventType', 'side', 'lot', 'price', 'time'];
    const missing = requiredFields.filter(f => payload[f] === undefined);
    
    if (missing.length > 0) {
      return res.status(400).json({ ok: false, error: 'Invalid payload', details: `Missing fields: ${missing.join(', ')}` });
    }

    const { accountNumber, broker, symbol, dealId, positionId, eventType, side, lot, price, time, sl, tp, commission, swap, profit, comment, magicNumber } = payload;

    // 2. Duplicate check using WebhookEvent
    const existingEvent = await prisma.webhookEvent.findUnique({ where: { dealId: String(dealId) } });
    if (existingEvent && eventType !== 'UPDATE') {
      return res.json({ ok: true, message: 'Duplicate event ignored', eventId: existingEvent.id });
    }

    // Record Event
    const event = await prisma.webhookEvent.upsert({
      where: { dealId: String(dealId) },
      update: { payload: JSON.stringify(payload), processed: false },
      create: {
        source: 'MT5_EA',
        eventType: eventType,
        payload: JSON.stringify(payload),
        dealId: String(dealId),
        processed: false
      }
    });

    // 3. Robust Account Matching & Auto-Create
    const accNumStr = String(accountNumber);
    const brokerServerStr = payload.brokerServer || broker;

    let account = null;

    // a. Try accountNumber + brokerServer
    if (payload.brokerServer) {
      account = await prisma.tradingAccount.findFirst({
        where: { accountNumber: accNumStr, brokerServer: String(payload.brokerServer) }
      });
    }

    // b. Try accountNumber + broker
    if (!account) {
      account = await prisma.tradingAccount.findFirst({
        where: { accountNumber: accNumStr, broker: String(broker) }
      });
    }

    // c. Try accountNumber only (if only 1 exists)
    if (!account) {
      const accountsByNumber = await prisma.tradingAccount.findMany({
        where: { accountNumber: accNumStr }
      });
      if (accountsByNumber.length === 1) {
        account = accountsByNumber[0];
      } else if (accountsByNumber.length > 1) {
        // Do not guess. Return warning.
        return res.json({ 
          ok: true, 
          warning: "Multiple accounts matched accountNumber. Trade event saved but not linked.",
          eventId: event.id 
        });
      }
    }

    if (!account) {
      // Auto-create
      account = await prisma.tradingAccount.create({
        data: {
          name: `Auto MT5 ${accNumStr.slice(-4)}`,
          broker: String(broker),
          brokerServer: payload.brokerServer ? String(payload.brokerServer) : null,
          accountNumber: accNumStr,
          accountType: 'REAL',
          platform: 'MT5',
          currency: 'USD',
          initialBalance: 0,
          currentBalance: 0,
          source: 'MT5_AUTO',
          autoCreated: true,
          status: 'Active'
        }
      });
    }

    // 4. Handle LiveTrade based on eventType
    let liveTrade = await prisma.liveTrade.findUnique({
      where: { positionId: String(positionId) }
    });

    // Time parsing logic
    let parsedTime = new Date(); // default to receivedAt
    let rawMt5Time: number | null = null;
    
    // Parse raw time
    if (time !== undefined) {
      if (typeof time === 'number') {
        if (time < 1000000000000) {
          rawMt5Time = time;
        } else {
          rawMt5Time = Math.floor(time / 1000);
        }
      }
    }

    // Determine Display Time (openTime / closeTime)
    // Priority: terminalLocalTime -> receivedAt (default new Date()) -> raw time
    if (payload.terminalLocalTime) {
      const tLocal = payload.terminalLocalTime;
      if (tLocal < 1000000000000) parsedTime = new Date(tLocal * 1000);
      else parsedTime = new Date(tLocal);
    } else {
      // If no terminalLocalTime, rely on receivedAt (which is `new Date()` right now)
      // Exception: If we are backfilling old history, maybe we shouldn't use receivedAt.
      // We can guess it's history if receivedAt is drastically different from rawMt5Time, but for now we default to receivedAt for Live events.
      // If we want to be safe, if rawMt5Time is more than 1 hour old, use rawMt5Time.
      if (rawMt5Time && (Math.floor(Date.now()/1000) - rawMt5Time > 3600)) {
        parsedTime = new Date(rawMt5Time * 1000);
      }
    }

    if (eventType === 'OPEN') {
      if (!liveTrade) {
        liveTrade = await prisma.liveTrade.create({
          data: {
            tradingAccountId: account.id,
            source: 'MT5_EA',
            positionId: String(positionId),
            symbol: String(symbol),
            side: String(side).toUpperCase(),
            lot: parseFloat(lot),
            entryPrice: parseFloat(price),
            stopLoss: sl ? parseFloat(sl) : null,
            takeProfit: tp ? parseFloat(tp) : null,
            openTime: parsedTime,
            rawMt5Time: rawMt5Time,
            status: 'OPEN',
            commission: commission ? parseFloat(commission) : 0,
            swap: swap ? parseFloat(swap) : 0,
            magicNumber: magicNumber ? String(magicNumber) : null,
            notes: comment ? String(comment) : null
          }
        });
      }
    } else if (eventType === 'UPDATE' && liveTrade) {
        liveTrade = await prisma.liveTrade.update({
          where: { positionId: String(positionId) },
          data: {
            stopLoss: sl ? parseFloat(sl) : liveTrade.stopLoss,
            takeProfit: tp ? parseFloat(tp) : liveTrade.takeProfit
          }
        });
    } else if ((eventType === 'CLOSE' || eventType === 'PARTIAL_CLOSE') && liveTrade) {
      // Handle partial close
      const closedLot = parseFloat(lot);
      const remainingLot = liveTrade.lot - closedLot;
      
      const isFullClose = eventType === 'CLOSE' || remainingLot <= 0.001; // floating point safe
      
      liveTrade = await prisma.liveTrade.update({
        where: { positionId: String(positionId) },
        data: {
          lot: isFullClose ? liveTrade.lot : remainingLot,
          closePrice: parseFloat(price),
          closeTime: parsedTime,
          status: isFullClose ? 'CLOSED' : 'OPEN',
          profit: (liveTrade.profit || 0) + (profit ? parseFloat(profit) : 0),
          commission: (liveTrade.commission || 0) + (commission ? parseFloat(commission) : 0),
          swap: (liveTrade.swap || 0) + (swap ? parseFloat(swap) : 0),
        }
      });
    }

    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { processed: true }
    });

    // Emit event for SSE
    mt5Events.emit('trade-update', { type: 'TRADE_EVENT', eventType, accountId: account.id });

    return res.json({ ok: true, message: 'MT5 event received', eventId: event.id, tradeId: liveTrade?.id });
  } catch (error: any) {
    next(error);
  }
});

// POST /api/integrations/mt5/account-snapshot
router.post('/account-snapshot', rateLimiter, authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = req.body;
    
    if (!payload.accountNumber || !payload.broker || payload.balance === undefined) {
      await logIntegration('MT5', 'ACCOUNT_SNAPSHOT', 'ERROR', 'Invalid snapshot payload', payload);
      return res.status(400).json({ ok: false, error: 'Invalid payload', details: 'Missing accountNumber, broker, or balance' });
    }

    const { accountNumber, broker, balance, equity, freeMargin } = payload;

    await prisma.webhookEvent.create({
      data: {
        source: 'MT5_EA',
        eventType: 'ACCOUNT_SNAPSHOT',
        payload: JSON.stringify(payload),
        processed: true
      }
    });

    // Robust matching for snapshot
    const accNumStr = String(accountNumber);
    let account = null;
    let matchStrategy = 'None';

    if (payload.brokerServer) {
      account = await prisma.tradingAccount.findFirst({
        where: { accountNumber: accNumStr, brokerServer: String(payload.brokerServer) }
      });
      if (account) matchStrategy = 'accountNumber + brokerServer';
    }
    
    if (!account) {
      account = await prisma.tradingAccount.findFirst({
        where: { accountNumber: accNumStr, broker: String(broker) }
      });
      if (account) matchStrategy = 'accountNumber + broker';
    }
    
    if (!account) {
      const accountsByNumber = await prisma.tradingAccount.findMany({
        where: { accountNumber: accNumStr }
      });
      if (accountsByNumber.length === 1) {
        account = accountsByNumber[0];
        matchStrategy = 'accountNumber only';
      }
    }

    if (!account) {
      await logIntegration('MT5', 'ACCOUNT_SNAPSHOT', 'WARNING', `No matching account found for snapshot: ${accNumStr}`, payload);
      return res.status(404).json({ ok: false, error: 'No matching account found' });
    }

    // Only update initialBalance if it's currently 0
    const newInitialBalance = account.initialBalance === 0 ? parseFloat(balance) : account.initialBalance;

    const beforeState = { balance: account.currentBalance, equity: account.currentEquity, freeMargin: account.freeMargin };

    try {
      const updatedAccount = await prisma.tradingAccount.update({
        where: { id: account.id },
        data: {
          currentBalance: parseFloat(balance),
          currentEquity: equity !== undefined ? parseFloat(equity) : parseFloat(balance),
          freeMargin: freeMargin !== undefined ? parseFloat(freeMargin) : account.freeMargin,
          initialBalance: newInitialBalance,
          lastSnapshotAt: new Date(),
          brokerServer: payload.brokerServer ? String(payload.brokerServer) : account.brokerServer
        }
      });
      
      const afterState = { balance: updatedAccount.currentBalance, equity: updatedAccount.currentEquity, freeMargin: updatedAccount.freeMargin };

      await logIntegration('MT5', 'ACCOUNT_SNAPSHOT', 'SUCCESS', `Snapshot updated for ${accNumStr}`, {
        accountId: account.id,
        matchStrategy,
        before: beforeState,
        after: afterState
      });

      // Emit event for SSE
      mt5Events.emit('account-snapshot', { 
        type: 'ACCOUNT_SNAPSHOT', 
        accountId: account.id,
        accountNumber: account.accountNumber,
        currentBalance: parseFloat(balance),
        currentEquity: equity !== undefined ? parseFloat(equity) : parseFloat(balance),
        freeMargin: freeMargin !== undefined ? parseFloat(freeMargin) : account.freeMargin,
        lastSnapshotAt: new Date()
      });

      return res.json({ ok: true, message: 'Snapshot received and updated' });
    } catch (updateError: any) {
      await logIntegration('MT5', 'ACCOUNT_SNAPSHOT', 'ERROR', `Prisma update failed for ${accNumStr}`, { error: updateError.message });
      return res.status(500).json({ ok: false, error: 'Database update failed', details: updateError.message });
    }
  } catch (error: any) {
    await logIntegration('MT5', 'ACCOUNT_SNAPSHOT', 'ERROR', 'Unexpected server error', { error: error.message });
    next(error);
  }
});

// POST /api/integrations/mt5/test-event
// Server-side generation of test event, secured with authMiddleware
router.post('/test-event', rateLimiter, authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // We mock a test event here directly into the DB to verify the flow works.
    const fakeDealId = `TEST_${Date.now()}`;
    const fakePositionId = `POS_${Date.now()}`;
    
    // Verify we have a test account
    let account = await prisma.tradingAccount.findFirst({ where: { name: 'Test Integration Account' } });
    if (!account) {
      account = await prisma.tradingAccount.create({
        data: {
          name: 'Test Integration Account',
          broker: 'Test Broker',
          accountNumber: '123456789',
          accountType: 'DEMO',
          currency: 'USD',
          initialBalance: 10000,
          currentBalance: 10000
        }
      });
    }

    const mockPayload = {
      accountNumber: account.accountNumber,
      broker: account.broker,
      symbol: 'XAUUSD',
      dealId: fakeDealId,
      positionId: fakePositionId,
      eventType: 'OPEN',
      side: 'BUY',
      lot: 0.1,
      price: 2000.50,
      sl: 1990.00,
      tp: 2020.00,
      time: Math.floor(Date.now() / 1000),
      magicNumber: '999'
    };

    // Forward the mock payload internally via code to simulate the webhook
    const event = await prisma.webhookEvent.create({
      data: {
        source: 'MT5_EA',
        eventType: 'OPEN',
        payload: JSON.stringify(mockPayload),
        dealId: fakeDealId,
        processed: true
      }
    });

    const liveTrade = await prisma.liveTrade.create({
      data: {
        tradingAccountId: account.id,
        source: 'MT5_EA',
        positionId: fakePositionId,
        symbol: mockPayload.symbol,
        side: mockPayload.side,
        lot: mockPayload.lot,
        entryPrice: mockPayload.price,
        stopLoss: mockPayload.sl,
        takeProfit: mockPayload.tp,
        openTime: new Date(mockPayload.time * 1000),
        status: 'OPEN',
        magicNumber: mockPayload.magicNumber
      }
    });

    return res.json({ ok: true, message: 'Test event injected successfully', tradeId: liveTrade.id });
  } catch (error: any) {
    next(error);
  }
});

export default router;
