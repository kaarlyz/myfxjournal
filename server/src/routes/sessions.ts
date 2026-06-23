import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { parseTradingViewCsv, cleanNumber } from '../utils/csvParser';
import { calculateMetrics } from '../utils/calculations';
import { Trade } from '../shared/types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// GET /api/sessions - List all sessions with summarized metrics
router.get('/', async (req: Request, res: Response) => {
  try {
    const sessions = await prisma.backtestSession.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { trades: true, invalidTrades: true },
        },
      },
    });

    // Attach basic overview data to each session
    const sessionsWithSummaries = await Promise.all(
      sessions.map(async (session) => {
        const trades = await prisma.trade.findMany({
          where: { sessionId: session.id },
        });
        const metrics = calculateMetrics(
          session.initialBalance,
          session.usdIdrRate,
          trades as unknown as Trade[],
          session.balanceCurrency as 'USD' | 'CENT' | 'IDR'
        );

        return {
          ...session,
          tradeCount: session._count.trades,
          invalidTradeCount: session._count.invalidTrades,
          endingBalance: metrics.endingBalance,
          netPnlUsd: metrics.netPnlUsd,
          netPnlPct: metrics.netPnlPct,
          winrate: metrics.winrate,
        };
      })
    );

    return res.json(sessionsWithSummaries);
  } catch (error: any) {
    console.error('Error fetching sessions:', error);
    return res.status(500).json({ error: 'Gagal memuat daftar sesi.' });
  }
});

// GET /api/sessions/:id - Get session details, trades, and full dashboard metrics
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const session = await prisma.backtestSession.findUnique({
      where: { id },
      include: {
        invalidTrades: true,
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Sesi backtest tidak ditemukan.' });
    }

    const trades = await prisma.trade.findMany({
      where: { sessionId: id },
      orderBy: [
        { exitTime: 'asc' },
        { entryTime: 'asc' },
      ],
    });

    const metrics = calculateMetrics(
      session.initialBalance,
      session.usdIdrRate,
      trades as unknown as Trade[],
      session.balanceCurrency as 'USD' | 'CENT' | 'IDR'
    );

    return res.json({
      session,
      trades,
      metrics,
    });
  } catch (error: any) {
    console.error('Error fetching session details:', error);
    return res.status(500).json({ error: 'Gagal memuat detail sesi.' });
  }
});

// POST /api/sessions - Create session manually
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      name,
      sourceMode,
      symbol,
      marketType,
      timeframe,
      initialBalance,
      balanceCurrency,
      usdIdrRate,
      riskMode,
      riskValue,
      notes,
    } = req.body;

    if (!name || !symbol || !marketType || !timeframe || initialBalance === undefined) {
      return res.status(400).json({ error: 'Informasi utama sesi tidak lengkap.' });
    }

    const session = await prisma.backtestSession.create({
      data: {
        name,
        sourceMode: sourceMode || 'MANUAL',
        symbol,
        marketType,
        timeframe,
        initialBalance: parseFloat(initialBalance),
        balanceCurrency: balanceCurrency || 'USD',
        usdIdrRate: parseFloat(usdIdrRate || '16200'),
        riskMode: riskMode || 'NO_R',
        riskValue: parseFloat(riskValue || '0'),
        notes,
      },
    });

    return res.status(201).json(session);
  } catch (error: any) {
    console.error('Error creating session:', error);
    return res.status(500).json({ error: 'Gagal membuat sesi.' });
  }
});

// POST /api/sessions/parse-csv - Parse uploaded CSV file and return list of valid & invalid trades
router.post('/parse-csv', upload.single('csvFile'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File CSV tidak ditemukan.' });
    }

    const csvText = req.file.buffer.toString('utf8');
    const { validTrades, invalidTrades } = parseTradingViewCsv(csvText);
    const dateRange = buildTradeDateRange(validTrades);

    return res.json({
      validTrades,
      invalidTrades,
      totalParsed: validTrades.length + invalidTrades.length,
      validCount: validTrades.length,
      invalidCount: invalidTrades.length,
      ...dateRange,
    });
  } catch (error: any) {
    console.error('Error parsing CSV:', error);
    return res.status(400).json({ error: error.message || 'Gagal memproses file CSV.' });
  }
});

/** Compute a stable dedup fingerprint for a parsed trade */
function computeFingerprint(sessionId: string, vt: any): string {
  const key = [
    sessionId,
    vt.side || '',
    vt.entryTime ? new Date(vt.entryTime).toISOString() : '',
    vt.exitTime  ? new Date(vt.exitTime).toISOString()  : '',
    String(cleanNumber(vt.entryPrice)),
    String(cleanNumber(vt.exitPrice)),
    String(cleanNumber(vt.qty)),
    String(cleanNumber(vt.netPnlUsd)),
    String(vt.tradeNumber ?? ''),
  ].join('|');
  return crypto.createHash('sha256').update(key).digest('hex');
}

/** Helper: build the trades array to insert, computing R-multiple and netPnlIdr correctly */
function buildTradesPayload(
  session: any,
  validTrades: any[],
  riskUsd: number | null,
  importBatchId: string | null = null
) {
  const centScale = session.balanceCurrency === 'CENT' ? 0.01 : 1;

  return (validTrades || []).map((vt: any) => {
    const netPnlRaw = cleanNumber(vt.netPnlUsd);

    // Calculate R-Multiple
    let rMultiple: number | null = null;
    if (riskUsd && riskUsd > 0) {
      // R = actual USD PnL / risk per trade
      rMultiple = (netPnlRaw * centScale) / riskUsd;
    }

    const result = netPnlRaw > 0 ? 'WIN' : netPnlRaw < 0 ? 'LOSS' : 'BE';

    return {
      sessionId: session.id,
      source: 'CSV' as const,
      tradeNumber: vt.tradeNumber,
      symbol: session.symbol,
      timeframe: session.timeframe,
      side: vt.side,
      entryTime: vt.entryTime ? new Date(vt.entryTime) : null,
      exitTime: vt.exitTime ? new Date(vt.exitTime) : null,
      entryPrice: cleanNumber(vt.entryPrice),
      exitPrice: cleanNumber(vt.exitPrice),
      qty: cleanNumber(vt.qty),
      positionValue: cleanNumber(vt.positionValue),
      // Store raw value (cents or USD) — scaling happens at metric calculation time
      netPnlUsd: netPnlRaw,
      netPnlPct: cleanNumber(vt.netPnlPct),
      // IDR = raw * centScale * rate  (correctly converts cents → USD → IDR)
      netPnlIdr: netPnlRaw * centScale * session.usdIdrRate,
      favorableExcursionUsd: cleanNumber(vt.favorableExcursionUsd),
      favorableExcursionPct: cleanNumber(vt.favorableExcursionPct),
      adverseExcursionUsd: cleanNumber(vt.adverseExcursionUsd),
      adverseExcursionPct: cleanNumber(vt.adverseExcursionPct),
      cumulativePnlUsd: cleanNumber(vt.cumulativePnlUsd),
      cumulativePnlPct: cleanNumber(vt.cumulativePnlPct),
      entrySignal: vt.entrySignal,
      exitSignal: vt.exitSignal,
      status: 'CLOSED' as const,
      result,
      rMultiple,
      riskUsd,
      importFingerprint: computeFingerprint(session.id, vt),
      importBatchId,
      importedAt: new Date(),
    };
  });
}

function buildTradeDateRange(validTrades: any[]) {
  const timestamps = (validTrades || [])
    .map((vt: any) => vt.exitTime || vt.closeTime || vt.entryTime || vt.openTime)
    .map((value: any) => value ? new Date(value) : null)
    .filter((date: Date | null): date is Date => !!date && !Number.isNaN(date.getTime()))
    .sort((a: Date, b: Date) => a.getTime() - b.getTime());

  const toKey = (date: Date) => date.toISOString().slice(0, 10);
  return {
    earliestTradeDate: timestamps[0] ? toKey(timestamps[0]) : null,
    latestTradeDate: timestamps[timestamps.length - 1] ? toKey(timestamps[timestamps.length - 1]) : null,
    dateSource: 'CSV_EXIT_TIME_THEN_ENTRY_TIME',
  };
}

// POST /api/sessions/import - Commit parsed trades to database
router.post('/import', async (req: Request, res: Response) => {
  try {
    const {
      sessionDetails,
      importMode, // 'NEW' | 'REPLACE' | 'APPEND' | 'SMART_MERGE'
      existingSessionId,
      validTrades,
      invalidTrades,
      fileName,
    } = req.body;

    if (!importMode) return res.status(400).json({ error: 'Import mode harus ditentukan.' });

    let session: any;

    if (importMode === 'NEW') {
      const { name, symbol, marketType, timeframe, initialBalance, balanceCurrency, usdIdrRate, riskMode, riskValue, notes } = sessionDetails;
      if (!name || !symbol || !marketType || !timeframe || initialBalance === undefined)
        return res.status(400).json({ error: 'Detil sesi baru tidak lengkap.' });

      session = await prisma.backtestSession.create({
        data: {
          name, sourceMode: 'CSV', symbol, marketType, timeframe,
          initialBalance: parseFloat(initialBalance),
          balanceCurrency: balanceCurrency || 'USD',
          usdIdrRate: parseFloat(usdIdrRate || '16200'),
          riskMode: riskMode || 'NO_R',
          riskValue: parseFloat(riskValue || '0'),
          notes,
        },
      });
    } else {
      if (!existingSessionId) return res.status(400).json({ error: 'Sesi tujuan tidak ditentukan.' });
      session = await prisma.backtestSession.findUnique({ where: { id: existingSessionId } });
      if (!session) return res.status(404).json({ error: 'Sesi tujuan tidak ditemukan.' });
    }

    // Count trades before import
    const previousTradeCount = await prisma.trade.count({ where: { sessionId: session.id } });

    if (importMode === 'REPLACE') {
      await prisma.trade.deleteMany({ where: { sessionId: session.id } });
      await prisma.invalidTrade.deleteMany({ where: { sessionId: session.id } });
    }

    // Risk USD
    let riskUsd: number | null = null;
    if (session.riskMode === 'FIXED_USD') riskUsd = session.riskValue;
    else if (session.riskMode === 'FIXED_PCT') {
      const cs = session.balanceCurrency === 'CENT' ? 0.01 : 1;
      riskUsd = (session.initialBalance * cs * session.riskValue) / 100;
    }

    // Create ImportBatch record
    const batch = await (prisma as any).importBatch.create({
      data: {
        sessionId: session.id,
        fileName: fileName || null,
        mode: importMode,
        totalRows: (validTrades?.length || 0) + (invalidTrades?.length || 0),
        validTrades: validTrades?.length || 0,
        insertedTrades: 0,
        skippedDuplicates: 0,
        invalidRows: invalidTrades?.length || 0,
      }
    });

    // Build all trade payloads with fingerprints
    const allPayloads = buildTradesPayload(session, validTrades || [], riskUsd, batch.id);

    let tradesToInsert = allPayloads;
    let skippedDuplicates = 0;

    if (importMode === 'SMART_MERGE') {
      // Fetch existing fingerprints for this session
      const existing = await prisma.trade.findMany({
        where: { sessionId: session.id },
        select: { importFingerprint: true },
      });
      const existingFps = new Set(existing.map(t => t.importFingerprint).filter(Boolean));
      tradesToInsert = allPayloads.filter(t => {
        if (t.importFingerprint && existingFps.has(t.importFingerprint)) {
          skippedDuplicates++;
          return false;
        }
        return true;
      });
    }

    const invalidTradesToCreate = (invalidTrades || []).map((it: any) => ({
      sessionId: session!.id,
      tradeNumber: it.tradeNumber,
      reason: it.reason,
      rawRows: JSON.stringify(it.rawRows),
    }));

    await prisma.$transaction([
      prisma.trade.createMany({ data: tradesToInsert }),
      prisma.invalidTrade.createMany({ data: invalidTradesToCreate }),
    ]);

    // Update batch with real counts
    await (prisma as any).importBatch.update({
      where: { id: batch.id },
      data: { insertedTrades: tradesToInsert.length, skippedDuplicates },
    });

    const newTotalTrades = await prisma.trade.count({ where: { sessionId: session.id } });
    const finalTrades = await prisma.trade.findMany({ where: { sessionId: session.id } });
    const dateRange = buildTradeDateRange(validTrades || []);
    const metrics = calculateMetrics(
      session.initialBalance,
      session.usdIdrRate,
      finalTrades as unknown as Trade[],
      session.balanceCurrency as 'USD' | 'CENT' | 'IDR'
    );

    return res.json({
      ok: true,
      message: 'Data berhasil di-import.',
      mode: importMode,
      sessionId: session.id,
      sessionName: session.name,
      previousTradeCount,
      validTrades: validTrades?.length || 0,
      insertedTrades: tradesToInsert.length,
      skippedDuplicates,
      invalidRows: invalidTrades?.length || 0,
      newTotalTrades,
      winrate: metrics.winrate,
      netPnlUsd: metrics.netPnlUsd,
      netPnlPct: metrics.netPnlPct,
      importBatchId: batch.id,
      ...dateRange,
    });
  } catch (error: any) {
    console.error('Error importing session data:', error);
    return res.status(500).json({ error: 'Gagal mengimpor data sesi: ' + error.message });
  }
});

// PATCH /api/sessions/:id - Update session metadata (name, notes, symbol, etc.)
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      symbol,
      marketType,
      timeframe,
      initialBalance,
      balanceCurrency,
      usdIdrRate,
      riskMode,
      riskValue,
      notes,
    } = req.body;

    const session = await prisma.backtestSession.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
    }

    const updated = await prisma.backtestSession.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(symbol !== undefined && { symbol }),
        ...(marketType !== undefined && { marketType }),
        ...(timeframe !== undefined && { timeframe }),
        ...(initialBalance !== undefined && { initialBalance: parseFloat(initialBalance) }),
        ...(balanceCurrency !== undefined && { balanceCurrency }),
        ...(usdIdrRate !== undefined && { usdIdrRate: parseFloat(usdIdrRate) }),
        ...(riskMode !== undefined && { riskMode }),
        ...(riskValue !== undefined && { riskValue: parseFloat(riskValue) }),
        ...(notes !== undefined && { notes }),
      },
    });

    return res.json(updated);
  } catch (error: any) {
    console.error('Error updating session:', error);
    return res.status(500).json({ error: 'Gagal memperbarui sesi.' });
  }
});

// POST /api/sessions/:id/update-csv - Re-upload CSV for an existing session (replaces trades)
router.post('/:id/update-csv', upload.single('csvFile'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const mode = (req.query.mode as string) || 'REPLACE'; // 'REPLACE' | 'APPEND'

    if (!req.file) {
      return res.status(400).json({ error: 'File CSV tidak ditemukan.' });
    }

    const session = await prisma.backtestSession.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
    }

    const csvText = req.file.buffer.toString('utf8');
    const { validTrades, invalidTrades } = parseTradingViewCsv(csvText);
    const dateRange = buildTradeDateRange(validTrades);

    if (mode === 'REPLACE') {
      await prisma.trade.deleteMany({ where: { sessionId: id } });
      await prisma.invalidTrade.deleteMany({ where: { sessionId: id } });
    }

    // Determine Risk USD
    let riskUsd: number | null = null;
    if (session.riskMode === 'FIXED_USD') {
      riskUsd = session.riskValue;
    } else if (session.riskMode === 'FIXED_PCT') {
      const centScale = session.balanceCurrency === 'CENT' ? 0.01 : 1;
      const balanceUsd = session.initialBalance * centScale;
      riskUsd = (balanceUsd * session.riskValue) / 100;
    }

    const tradesToCreate = buildTradesPayload(session, validTrades, riskUsd, null);
    const invalidTradesToCreate = invalidTrades.map((it) => ({
      sessionId: id,
      tradeNumber: it.tradeNumber,
      reason: it.reason,
      rawRows: JSON.stringify(it.rawRows),
    }));

    await prisma.$transaction([
      prisma.trade.createMany({ data: tradesToCreate }),
      prisma.invalidTrade.createMany({ data: invalidTradesToCreate }),
    ]);

    return res.json({
      message: 'CSV berhasil di-update.',
      sessionId: id,
      importedValid: tradesToCreate.length,
      importedInvalid: invalidTradesToCreate.length,
      validCount: validTrades.length,
      invalidCount: invalidTrades.length,
      ...dateRange,
    });
  } catch (error: any) {
    console.error('Error updating CSV:', error);
    return res.status(500).json({ error: 'Gagal memperbarui data CSV: ' + error.message });
  }
});

// DELETE /api/sessions/:id - Delete a session and its associated trades (Cascaded)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const session = await prisma.backtestSession.findUnique({ where: { id } });
    if (!session) {
      return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
    }

    await prisma.backtestSession.delete({ where: { id } });

    return res.json({ message: 'Sesi berhasil dihapus.' });
  } catch (error: any) {
    console.error('Error deleting session:', error);
    return res.status(500).json({ error: 'Gagal menghapus sesi.' });
  }
});

// POST /api/sessions/:id/quick-log
router.post('/:id/quick-log', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const session = await prisma.backtestSession.findUnique({ where: { id } });
    if (!session) return res.status(404).json({ error: 'Sesi tidak ditemukan.' });

    const { mode, result, side, entryPrice, exitPrice, lot, riskPerTrade, rr, profit, notes, setupTag } = req.body;
    const normalizedResult = result || (Number(profit) > 0 ? 'WIN' : Number(profit) < 0 ? 'LOSS' : 'BE');
    if (!normalizedResult || !['WIN', 'LOSS', 'BE'].includes(normalizedResult)) {
      return res.status(400).json({ error: 'result harus WIN, LOSS, atau BE.' });
    }

    let riskUsd: number | null = riskPerTrade !== undefined && riskPerTrade !== '' ? parseFloat(String(riskPerTrade)) : null;
    if ((riskUsd === null || Number.isNaN(riskUsd)) && session.riskMode === 'FIXED_USD') riskUsd = session.riskValue;
    else if (session.riskMode === 'FIXED_PCT') {
      const cs = session.balanceCurrency === 'CENT' ? 0.01 : 1;
      riskUsd = (session.initialBalance * cs * session.riskValue) / 100;
    }

    const rrValue = rr !== undefined && rr !== '' ? parseFloat(String(rr)) : null;
    let pnl = profit !== undefined && profit !== '' ? parseFloat(String(profit)) : 0;
    if (mode === 'FAST_R' || profit === undefined || profit === '') {
      if (normalizedResult === 'WIN') pnl = (riskUsd || 0) * (rrValue || 1);
      else if (normalizedResult === 'LOSS') pnl = -(riskUsd || 0);
      else pnl = 0;
    }
    const rMultiple = riskUsd && riskUsd > 0 ? pnl / riskUsd : rrValue;
    const centScale = session.balanceCurrency === 'CENT' ? 0.01 : 1;
    const now = new Date();
    const normalizedSide = side === 'SELL' || side === 'SHORT' ? 'SHORT' : 'LONG';

    const trade = await prisma.trade.create({
      data: {
        sessionId: id,
        source: 'QUICK_LOG',
        symbol: session.symbol,
        timeframe: session.timeframe,
        side: normalizedSide,
        status: 'CLOSED',
        result: normalizedResult,
        entryPrice: entryPrice !== undefined && entryPrice !== '' ? parseFloat(String(entryPrice)) : null,
        exitPrice: exitPrice !== undefined && exitPrice !== '' ? parseFloat(String(exitPrice)) : null,
        qty: lot !== undefined && lot !== '' ? parseFloat(String(lot)) : null,
        netPnlUsd: pnl,
        netPnlIdr: pnl * centScale * session.usdIdrRate,
        rMultiple: rMultiple !== undefined && rMultiple !== null && !Number.isNaN(rMultiple) ? rMultiple : null,
        riskUsd,
        notes: notes || null,
        setupTag: setupTag || null,
        entryTime: now,
        exitTime: now,
      }
    });

    const trades = await prisma.trade.findMany({ where: { sessionId: id } });
    const metrics = calculateMetrics(
      session.initialBalance,
      session.usdIdrRate,
      trades as unknown as Trade[],
      session.balanceCurrency as 'USD' | 'CENT' | 'IDR'
    );

    return res.status(201).json({
      ok: true,
      trade,
      summary: {
        ...metrics,
        tradeCount: trades.length,
        netPnl: metrics.netPnlUsd,
        winrate: metrics.winrate,
      }
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/sessions/:id/import-batches
router.get('/:id/import-batches', async (req: Request, res: Response) => {
  try {
    const batches = await (prisma as any).importBatch.findMany({
      where: { sessionId: req.params.id },
      orderBy: { importedAt: 'desc' },
    });
    return res.json(batches);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
