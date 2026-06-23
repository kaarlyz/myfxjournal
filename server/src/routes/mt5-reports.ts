import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { debugMt5XlsxReport, parseMt5XlsxReport } from '../utils/mt5ReportParser';
import { parseMt5TesterGraph } from '../utils/mt5TesterGraphParser';
import { analyzeMt5Report } from '../utils/mt5ReportAnalyzer';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 2 },
});
const mt5Upload = upload.fields([
  { name: 'reportFile', maxCount: 1 },
  { name: 'graphFile', maxCount: 1 },
]);

function fileFrom(req: Request, field: string): Express.Multer.File | undefined {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return files?.[field]?.[0];
}

function marketType(symbol?: string | null): string {
  const s = (symbol || '').toUpperCase();
  if (s.includes('XAU') || s.includes('GOLD')) return 'Gold';
  if (s.includes('BTC') || s.includes('ETH')) return 'Crypto';
  if (s.length >= 6) return 'Forex';
  return 'Custom';
}

function previewPayload(parsed: ReturnType<typeof parseMt5XlsxReport>, graphPoints = 0) {
  const analysis = analyzeMt5Report(parsed.summary, [], parsed.trades.map((t) => ({ exitTime: t.exitTime, profit: t.profit })));
  const settingsDetected = Object.keys(parsed.settings).length > 0;
  const resultsDetected = Object.keys(parsed.results).length > 0;
  return {
    summary: {
      ...parsed.summary,
      insertedDeals: parsed.deals.length,
      reconstructedTrades: parsed.trades.length,
      graphPointsImported: graphPoints,
      findingsCount: analysis.findings.length,
    },
    counts: {
      settingsDetected: settingsDetected ? 1 : 0,
      resultsDetected: resultsDetected ? 1 : 0,
      orders: parsed.orders.length,
      deals: parsed.deals.length,
      reconstructedTrades: parsed.trades.length,
      graphPoints,
    },
    reportPreview: {
      parseStatus: settingsDetected && resultsDetected ? 'OK' : 'INCOMPLETE',
      settingsDetected,
      resultsDetected,
      ordersCount: parsed.orders.length,
      dealsCount: parsed.deals.length,
      expertName: parsed.summary.expertName || null,
      symbol: parsed.summary.symbol || null,
      timeframe: parsed.summary.timeframe || null,
      netProfit: parsed.summary.totalNetProfit ?? null,
      profitFactor: parsed.summary.profitFactor ?? null,
      totalTrades: parsed.summary.totalTrades ?? null,
      warnings: parsed.warnings,
    },
    warnings: parsed.warnings,
    analysis,
  };
}

function graphPreviewPayload(graph: ReturnType<typeof parseMt5TesterGraph>) {
  const balances = graph.map((point) => point.balance);
  const equities = graph.map((point) => point.equity);
  const loads = graph.map((point) => point.depositLoad).filter((value): value is number => value !== null && value !== undefined);
  return {
    parseStatus: graph.length ? 'OK' : 'NOT_UPLOADED_OR_EMPTY',
    points: graph.length,
    firstTimestamp: graph[0]?.time ?? null,
    lastTimestamp: graph[graph.length - 1]?.time ?? null,
    minBalance: balances.length ? Math.min(...balances) : null,
    maxBalance: balances.length ? Math.max(...balances) : null,
    minEquity: equities.length ? Math.min(...equities) : null,
    maxEquity: equities.length ? Math.max(...equities) : null,
    maxDepositLoad: loads.length ? Math.max(...loads) : null,
  };
}

function assertMt5PrismaClient() {
  return Boolean((prisma as any).mt5ReportImport?.create);
}

function fingerprint(parts: any[]) {
  return crypto.createHash('sha256').update(parts.map((p) => String(p ?? '')).join('|')).digest('hex');
}

function sqlValue(value: any) {
  return value instanceof Date ? value.toISOString() : value === undefined ? null : value;
}

function insertRaw(table: string, data: Record<string, any>) {
  const columns = Object.keys(data);
  const placeholders = columns.map(() => '?').join(', ');
  return prisma.$executeRawUnsafe(
    `INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
    ...columns.map((c) => sqlValue(data[c]))
  );
}

async function findMt5Report(sessionId: string) {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    'SELECT * FROM "Mt5ReportImport" WHERE "sessionId" = ? ORDER BY "importedAt" DESC LIMIT 1',
    sessionId
  );
  return rows[0] || null;
}

router.post('/preview', mt5Upload, async (req: Request, res: Response) => {
  try {
    const reportFile = fileFrom(req, 'reportFile');
    const graphFile = fileFrom(req, 'graphFile');
    if (!reportFile) return res.status(400).json({ error: 'File report MT5 wajib diupload.' });
    if (!reportFile.originalname.toLowerCase().endsWith('.xlsx')) {
      return res.status(400).json({ error: 'Saat ini report yang didukung adalah .xlsx.' });
    }

    const parsed = parseMt5XlsxReport(reportFile.buffer);
    const graph = graphFile ? parseMt5TesterGraph(graphFile.buffer) : [];
    const analysis = analyzeMt5Report(
      parsed.summary,
      graph,
      parsed.trades.map((t) => ({ exitTime: t.exitTime, profit: t.profit }))
    );

    return res.json({
      ...previewPayload(parsed, graph.length),
      fileName: reportFile.originalname,
      graphFileName: graphFile?.originalname || null,
      graphPreview: graphPreviewPayload(graph),
      analysis,
    });
  } catch (error: any) {
    console.error('MT5 preview error:', error);
    return res.status(400).json({ error: error.message || 'Gagal parsing report MT5.' });
  }
});

router.post('/debug-parse', mt5Upload, async (req: Request, res: Response) => {
  try {
    const reportFile = fileFrom(req, 'reportFile');
    if (!reportFile) return res.status(400).json({ error: 'File report MT5 wajib diupload.' });

    return res.json({
      fileName: reportFile.originalname,
      ...debugMt5XlsxReport(reportFile.buffer),
    });
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Gagal membaca debug parser MT5.',
    });
  }
});

router.post('/import', mt5Upload, async (req: Request, res: Response) => {
  try {
    const hasMt5Delegates = assertMt5PrismaClient();
    const reportFile = fileFrom(req, 'reportFile');
    const graphFile = fileFrom(req, 'graphFile');
    if (!reportFile) return res.status(400).json({ error: 'File report MT5 wajib diupload.' });

    const parsed = parseMt5XlsxReport(reportFile.buffer);
    const graph = graphFile ? parseMt5TesterGraph(graphFile.buffer) : [];
    if (!Object.keys(parsed.settings).length || !Object.keys(parsed.results).length) {
      return res.status(400).json({
        ok: false,
        error: 'Strategy Tester report metrics were not detected. Import is disabled until Settings and Results are detected.',
        preview: {
          ...previewPayload(parsed, graph.length),
          graphPreview: graphPreviewPayload(graph),
        },
      });
    }
    const s = parsed.summary;
    const warnings = [
      ...parsed.warnings,
      ...(graphFile ? [] : ['No tester graph file uploaded']),
    ];
    const analysis = analyzeMt5Report(s, graph, parsed.trades.map((t) => ({ exitTime: t.exitTime, profit: t.netProfit })));

    const sessionName = req.body.sessionName?.trim() || `MT5 ${s.expertName || 'EA'} ${s.symbol || ''}`.trim();
    const session = await prisma.backtestSession.create({
      data: {
        name: sessionName,
        sourceMode: 'MT5_REPORT',
        symbol: s.symbol || 'UNKNOWN',
        marketType: marketType(s.symbol),
        timeframe: s.timeframe || 'UNKNOWN',
        initialBalance: s.initialDeposit || 0,
        balanceCurrency: (s.currency || 'USD').toUpperCase().includes('IDR') ? 'IDR' : 'USD',
        usdIdrRate: Number(req.body.usdIdrRate || 16200),
        riskMode: 'NO_R',
        riskValue: 0,
        notes: `MT5 Strategy Tester import: ${s.expertName || 'EA'} ${s.periodStart ? new Date(s.periodStart).toISOString().slice(0, 10) : ''} - ${s.periodEnd ? new Date(s.periodEnd).toISOString().slice(0, 10) : ''}`.trim(),
      },
    });

    const reportImport = {
      id: crypto.randomUUID(),
      ...{
        sessionId: session.id,
        fileName: reportFile.originalname,
        graphFileName: graphFile?.originalname || null,
        expertName: s.expertName,
        symbol: s.symbol,
        timeframe: s.timeframe,
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        initialDeposit: s.initialDeposit,
        currency: s.currency,
        leverage: s.leverage,
        totalNetProfit: s.totalNetProfit,
        grossProfit: s.grossProfit,
        grossLoss: s.grossLoss,
        profitFactor: s.profitFactor,
        expectedPayoff: s.expectedPayoff,
        recoveryFactor: s.recoveryFactor,
        sharpeRatio: s.sharpeRatio,
        totalTrades: s.totalTrades,
        totalDeals: s.totalDeals,
        winrate: s.winrate,
        profitTrades: s.profitTrades,
        lossTrades: s.lossTrades,
        shortTrades: s.shortTrades,
        shortWinrate: s.shortWinrate,
        longTrades: s.longTrades,
        longWinrate: s.longWinrate,
        balanceDrawdownMax: s.balanceDrawdownMax,
        balanceDrawdownPct: s.balanceDrawdownPct,
        equityDrawdownMax: s.equityDrawdownMax,
        equityDrawdownPct: s.equityDrawdownPct,
        largestProfitTrade: s.largestProfitTrade,
        largestLossTrade: s.largestLossTrade,
        averageProfitTrade: s.averageProfitTrade,
        averageLossTrade: s.averageLossTrade,
        maxConsecutiveWins: s.maxConsecutiveWins,
        maxConsecutiveLosses: s.maxConsecutiveLosses,
        averageConsecutiveWins: s.averageConsecutiveWins,
        averageConsecutiveLosses: s.averageConsecutiveLosses,
        zScore: s.zScore,
        ahpr: s.ahpr,
        ghpr: s.ghpr,
        finalBalance: s.finalBalance,
        findingsCount: analysis.findings.length,
        rawInputs: JSON.stringify(parsed.settings.Inputs || parsed.settings.inputs || null),
        rawSettings: JSON.stringify(parsed.settings),
        rawResults: JSON.stringify(parsed.results),
        rawOrders: JSON.stringify(parsed.orders.map((o) => o.raw)),
        rawDeals: JSON.stringify(parsed.deals.map((d) => d.raw)),
        warnings: JSON.stringify(warnings),
      },
    };
    if (hasMt5Delegates) {
      await (prisma as any).mt5ReportImport.create({ data: reportImport });
    } else {
      await insertRaw('Mt5ReportImport', reportImport);
    }

    const tx: any[] = [];
    if (parsed.orders.length) {
      const rows = parsed.orders.map((o) => ({
        id: crypto.randomUUID(),
        sessionId: session.id,
        reportImportId: reportImport.id,
        openTime: o.openTime,
        orderId: o.orderId,
        symbol: o.symbol,
        type: o.type,
        volume: o.volume,
        price: o.price,
        sl: o.sl,
        tp: o.tp,
        closeTime: o.closeTime,
        state: o.state,
        comment: o.comment,
      }));
      if (hasMt5Delegates) tx.push(
      (prisma as any).mt5Order.createMany({
        data: rows,
      })
      );
      else tx.push(...rows.map((row) => insertRaw('Mt5Order', row)));
    }
    if (parsed.deals.length) {
      const rows = parsed.deals.map((d) => ({
        id: crypto.randomUUID(),
        sessionId: session.id,
        reportImportId: reportImport.id,
        time: d.time,
        dealId: d.dealId,
        symbol: d.symbol,
        type: d.type,
        direction: d.direction,
        positionId: d.positionId,
        volume: d.volume,
        price: d.price,
        orderId: d.orderId,
        commission: d.commission,
        swap: d.swap,
        profit: d.profit,
        balance: d.balance,
        comment: d.comment,
      }));
      if (hasMt5Delegates) tx.push(
      (prisma as any).mt5Deal.createMany({
        data: rows,
      })
      );
      else tx.push(...rows.map((row) => insertRaw('Mt5Deal', row)));
    }
    if (graph.length) {
      const rows = graph.map((p) => ({
        id: crypto.randomUUID(),
        sessionId: session.id,
        reportImportId: reportImport.id,
        time: p.time,
        balance: p.balance,
        equity: p.equity,
        depositLoad: p.depositLoad,
      }));
      if (hasMt5Delegates) tx.push(
      (prisma as any).mt5EquityPoint.createMany({
        data: rows,
      })
      );
      else tx.push(...rows.map((row) => insertRaw('Mt5EquityPoint', row)));
    }
    if (parsed.trades.length) tx.push(
      prisma.trade.createMany({
        data: parsed.trades.map((t, index) => ({
          sessionId: session.id,
          source: 'MT5_REPORT',
          tradeNumber: index + 1,
          tradeId: t.exitDealId || t.orderId,
          symbol: s.symbol || 'UNKNOWN',
          timeframe: s.timeframe || 'UNKNOWN',
          side: t.side,
          entryTime: t.entryTime,
          exitTime: t.exitTime,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          qty: t.volume,
          netPnlUsd: t.netProfit,
          netPnlIdr: t.netProfit * Number(req.body.usdIdrRate || 16200),
          status: 'CLOSED',
          result: t.netProfit > 0 ? 'WIN' : t.netProfit < 0 ? 'LOSS' : 'BE',
          notes: [
            `MT5 reconstructed trade. Entry deal: ${t.entryDealId || '-'}, exit deal: ${t.exitDealId || '-'}`,
            `Commission: ${t.commission}, swap: ${t.swap}, gross profit: ${t.profit}`,
            t.warning || '',
          ].filter(Boolean).join(' | '),
          importFingerprint: fingerprint([session.id, reportImport.id, t.entryDealId, t.exitDealId, t.entryTime?.toISOString(), t.exitTime?.toISOString(), t.volume, t.netProfit]),
          importBatchId: reportImport.id,
          importedAt: new Date(),
        })),
      })
    );
    if (analysis.findings.length) {
      const rows = analysis.findings.map((f) => ({
        id: crypto.randomUUID(),
        sessionId: session.id,
        reportImportId: reportImport.id,
        severity: f.severity,
        title: f.title,
        explanation: f.explanation,
        suggestedFix: f.suggestedFix,
      }));
      if (hasMt5Delegates) tx.push(
      (prisma as any).mt5ReportFinding.createMany({
        data: rows,
      })
      );
      else tx.push(...rows.map((row) => insertRaw('Mt5ReportFinding', row)));
    }
    if (tx.length) await prisma.$transaction(tx);

    return res.status(201).json({
      ok: true,
      message: 'MT5 report imported successfully',
      sessionId: session.id,
      reportImportId: reportImport.id,
      sessionName: session.name,
      summary: {
        ...s,
        insertedDeals: parsed.deals.length,
        reconstructedTrades: parsed.trades.length,
        graphPointsImported: graph.length,
        verdict: analysis.rating.label,
        findingsCount: analysis.findings.length,
      },
      analysis,
      imported: {
        orders: parsed.orders.length,
        deals: parsed.deals.length,
        equityPoints: graph.length,
        reconstructedTrades: parsed.trades.length,
        findings: analysis.findings.length,
      },
      warnings,
    });
  } catch (error: any) {
    console.error('MT5 import error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Gagal import report MT5.',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

router.get('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const hasMt5Delegates = assertMt5PrismaClient();
    const report = hasMt5Delegates
      ? await (prisma as any).mt5ReportImport.findFirst({ where: { sessionId }, orderBy: { importedAt: 'desc' } })
      : await findMt5Report(sessionId);
    if (!report) return res.status(404).json({ error: 'MT5 report untuk sesi ini tidak ditemukan.' });

    const [session, deals, orders, equityPoints, findings, trades] = await Promise.all([
      prisma.backtestSession.findUnique({ where: { id: sessionId } }),
      hasMt5Delegates ? (prisma as any).mt5Deal.findMany({ where: { reportImportId: report.id }, orderBy: { time: 'asc' } }) : prisma.$queryRawUnsafe<any[]>('SELECT * FROM "Mt5Deal" WHERE "reportImportId" = ? ORDER BY "time" ASC', report.id),
      hasMt5Delegates ? (prisma as any).mt5Order.findMany({ where: { reportImportId: report.id }, orderBy: { openTime: 'asc' } }) : prisma.$queryRawUnsafe<any[]>('SELECT * FROM "Mt5Order" WHERE "reportImportId" = ? ORDER BY "openTime" ASC', report.id),
      hasMt5Delegates ? (prisma as any).mt5EquityPoint.findMany({ where: { reportImportId: report.id }, orderBy: { time: 'asc' } }) : prisma.$queryRawUnsafe<any[]>('SELECT * FROM "Mt5EquityPoint" WHERE "reportImportId" = ? ORDER BY "time" ASC', report.id),
      hasMt5Delegates ? (prisma as any).mt5ReportFinding.findMany({ where: { reportImportId: report.id }, orderBy: { createdAt: 'asc' } }) : prisma.$queryRawUnsafe<any[]>('SELECT * FROM "Mt5ReportFinding" WHERE "reportImportId" = ? ORDER BY "createdAt" ASC', report.id),
      prisma.trade.findMany({ where: { sessionId }, orderBy: { exitTime: 'asc' } }),
    ]);

    const summary = {
      expertName: report.expertName,
      symbol: report.symbol,
      timeframe: report.timeframe,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      initialDeposit: report.initialDeposit,
      currency: report.currency,
      leverage: report.leverage,
      totalNetProfit: report.totalNetProfit,
      grossProfit: report.grossProfit,
      grossLoss: report.grossLoss,
      profitFactor: report.profitFactor,
      expectedPayoff: report.expectedPayoff,
      recoveryFactor: report.recoveryFactor,
      sharpeRatio: report.sharpeRatio,
      totalTrades: report.totalTrades,
      totalDeals: report.totalDeals,
      winrate: report.winrate,
      profitTrades: report.profitTrades,
      lossTrades: report.lossTrades,
      shortTrades: report.shortTrades,
      shortWinrate: report.shortWinrate,
      longTrades: report.longTrades,
      longWinrate: report.longWinrate,
      balanceDrawdownMax: report.balanceDrawdownMax,
      balanceDrawdownPct: report.balanceDrawdownPct,
      equityDrawdownMax: report.equityDrawdownMax,
      equityDrawdownPct: report.equityDrawdownPct,
      largestProfitTrade: report.largestProfitTrade,
      largestLossTrade: report.largestLossTrade,
      averageProfitTrade: report.averageProfitTrade,
      averageLossTrade: report.averageLossTrade,
      maxConsecutiveWins: report.maxConsecutiveWins,
      maxConsecutiveLosses: report.maxConsecutiveLosses,
      averageConsecutiveWins: report.averageConsecutiveWins,
      averageConsecutiveLosses: report.averageConsecutiveLosses,
      zScore: report.zScore,
      ahpr: report.ahpr,
      ghpr: report.ghpr,
      finalBalance: report.finalBalance,
    };

    const analysis = analyzeMt5Report(
      summary,
      equityPoints.map((p: any) => ({ time: p.time, balance: p.balance, equity: p.equity, depositLoad: p.depositLoad })),
      trades.map((t: any) => ({ exitTime: t.exitTime, profit: t.netPnlUsd }))
    );

    return res.json({
      session,
      report,
      summary,
      analysis: { ...analysis, findings: findings.length ? findings : analysis.findings },
      deals,
      orders,
      equityPoints,
      findings,
      trades,
      raw: {
        settings: report.rawSettings ? JSON.parse(report.rawSettings) : {},
        results: report.rawResults ? JSON.parse(report.rawResults) : {},
        orders: report.rawOrders ? JSON.parse(report.rawOrders) : [],
        deals: report.rawDeals ? JSON.parse(report.rawDeals) : [],
        warnings: report.warnings ? JSON.parse(report.warnings) : [],
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error.message || 'Gagal memuat dashboard MT5.',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

export default router;
