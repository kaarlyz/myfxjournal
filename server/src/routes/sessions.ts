import { Router, Request, Response } from 'express';
import multer from 'multer';
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

    return res.json({
      validTrades,
      invalidTrades,
      totalParsed: validTrades.length + invalidTrades.length,
      validCount: validTrades.length,
      invalidCount: invalidTrades.length,
    });
  } catch (error: any) {
    console.error('Error parsing CSV:', error);
    return res.status(400).json({ error: error.message || 'Gagal memproses file CSV.' });
  }
});

/** Helper: build the trades array to insert, computing R-multiple and netPnlIdr correctly */
function buildTradesPayload(
  session: any,
  validTrades: any[],
  riskUsd: number | null
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
    };
  });
}

// POST /api/sessions/import - Commit parsed trades to database (create session, replace or append)
router.post('/import', async (req: Request, res: Response) => {
  try {
    const {
      sessionDetails,
      importMode, // 'NEW' | 'REPLACE' | 'APPEND'
      existingSessionId,
      validTrades,
      invalidTrades,
    } = req.body;

    if (!importMode) {
      return res.status(400).json({ error: 'Import mode harus ditentukan.' });
    }

    let session;
    if (importMode === 'NEW') {
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
      } = sessionDetails;

      if (!name || !symbol || !marketType || !timeframe || initialBalance === undefined) {
        return res.status(400).json({ error: 'Detil sesi baru tidak lengkap.' });
      }

      session = await prisma.backtestSession.create({
        data: {
          name,
          sourceMode: 'CSV',
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
    } else {
      if (!existingSessionId) {
        return res.status(400).json({ error: 'Sesi tujuan tidak ditentukan.' });
      }

      session = await prisma.backtestSession.findUnique({
        where: { id: existingSessionId },
      });

      if (!session) {
        return res.status(404).json({ error: 'Sesi tujuan tidak ditemukan.' });
      }

      if (importMode === 'REPLACE') {
        // Delete existing trades & invalid trades in this session
        await prisma.trade.deleteMany({ where: { sessionId: session.id } });
        await prisma.invalidTrade.deleteMany({ where: { sessionId: session.id } });
      }
    }

    // Determine Risk USD for R calculations
    let riskUsd: number | null = null;
    if (session.riskMode === 'FIXED_USD') {
      riskUsd = session.riskValue;
    } else if (session.riskMode === 'FIXED_PCT') {
      const centScale = session.balanceCurrency === 'CENT' ? 0.01 : 1;
      const balanceUsd = session.initialBalance * centScale;
      riskUsd = (balanceUsd * session.riskValue) / 100;
    }

    // Process valid trades
    const tradesToCreate = buildTradesPayload(session, validTrades, riskUsd);

    // Process invalid trades
    const invalidTradesToCreate = (invalidTrades || []).map((it: any) => ({
      sessionId: session!.id,
      tradeNumber: it.tradeNumber,
      reason: it.reason,
      rawRows: JSON.stringify(it.rawRows),
    }));

    // Perform database insertion in transaction
    await prisma.$transaction([
      prisma.trade.createMany({ data: tradesToCreate }),
      prisma.invalidTrade.createMany({ data: invalidTradesToCreate }),
    ]);

    return res.json({
      message: 'Data berhasil di-import.',
      sessionId: session.id,
      importedValid: tradesToCreate.length,
      importedInvalid: invalidTradesToCreate.length,
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

    const tradesToCreate = buildTradesPayload(session, validTrades, riskUsd);
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

export default router;
