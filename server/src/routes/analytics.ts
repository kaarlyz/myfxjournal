import { Router, Request, Response } from 'express';
import { marketAnalytics } from '../services/marketAnalytics';

const router = Router();

// POST /api/analytics/session/:sessionId/rebuild-replay
// Replaces clear-replay / analyze. Atomically invalidates, re-analyzes, and persists immutable TradeReplayAnalysis rows.
router.post('/session/:sessionId/rebuild-replay', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const backtestRR = parseFloat(req.body?.backtestRR) || 1.0;
    const engineVersion = req.body?.engineVersion || '2.0.0';
    const marketDataSource = req.body?.marketDataSource || (req.query?.marketDataSource as string) || undefined;
    const timeframe = req.body?.timeframe || (req.query?.timeframe as string) || 'M1';

    const result = await marketAnalytics.rebuildSessionReplay(
      sessionId,
      backtestRR,
      engineVersion,
      marketDataSource,
      timeframe
    );
    return res.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('[Analytics] rebuildSessionReplay error:', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Failed to rebuild session replay.',
      code: 'ANALYTICS_FAILED',
    });
  }
});

// Alias for backward compatibility: POST /api/analytics/session/:sessionId/analyze
router.post('/session/:sessionId/analyze', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const backtestRR = parseFloat(req.body?.backtestRR) || 1.0;
    const engineVersion = req.body?.engineVersion || '2.0.0';
    const marketDataSource = req.body?.marketDataSource || (req.query?.marketDataSource as string) || undefined;
    const timeframe = req.body?.timeframe || (req.query?.timeframe as string) || 'M1';

    const result = await marketAnalytics.rebuildSessionReplay(
      sessionId,
      backtestRR,
      engineVersion,
      marketDataSource,
      timeframe
    );
    return res.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('[Analytics] analyze endpoint error:', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Failed to analyze session.',
      code: 'ANALYTICS_FAILED',
    });
  }
});

// POST /api/analytics/trade/:tradeId/replay
// Replays a single trade against market data
router.post('/trade/:tradeId/replay', async (req: Request, res: Response) => {
  try {
    const { tradeId } = req.params;
    const backtestRR = parseFloat(req.body?.backtestRR) || 1.0;
    const engineVersion = req.body?.engineVersion || '2.0.0';
    const marketDataSource = req.body?.marketDataSource || (req.query?.marketDataSource as string) || undefined;
    const timeframe = req.body?.timeframe || (req.query?.timeframe as string) || 'M1';

    const result = await marketAnalytics.runTradeReplayPipeline(
      tradeId,
      backtestRR,
      engineVersion,
      marketDataSource,
      timeframe
    );
    return res.json({ ok: true, result });
  } catch (error: any) {
    console.error('[Analytics] trade replay error:', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Failed to run trade replay.',
      code: 'ANALYTICS_FAILED',
    });
  }
});

// GET /api/analytics/session/:sessionId/rr-simulation
// Returns simulation matrix generated ONLY from VALID trades
router.get('/session/:sessionId/rr-simulation', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const data = await marketAnalytics.getRRSimulation(sessionId);
    return res.json({ ok: true, data, hasData: data.length > 0 });
  } catch (error: any) {
    console.error('[Analytics] getRRSimulation error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get RR simulation.', code: 'ANALYTICS_FAILED' });
  }
});

// GET /api/analytics/session/:sessionId/validation-summary
// Returns broker vs replay validation comparison summary (no replay re-run)
router.get('/session/:sessionId/validation-summary', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const summary = await marketAnalytics.getReplayValidationSummary(sessionId);
    if (!summary) {
      return res.json({ ok: true, data: null, hasData: false });
    }
    return res.json({ ok: true, data: summary, hasData: true });
  } catch (error: any) {
    console.error('[Analytics] validation-summary error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get validation summary.', code: 'ANALYTICS_FAILED' });
  }
});

// GET /api/analytics/session/:sessionId/replay-progress
// Returns real-time in-memory replay progress (poll every ~500ms while analyzing)
router.get('/session/:sessionId/replay-progress', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const progress = marketAnalytics.getReplayProgress(sessionId);
  if (!progress) {
    return res.json({ ok: true, progress: null });
  }
  return res.json({ ok: true, progress });
});

// GET /api/analytics/session/:sessionId/replay-history
// Returns immutable historical replay analysis records for a session
router.get('/session/:sessionId/replay-history', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const history = await marketAnalytics.getSessionReplayHistory(sessionId);
    return res.json({ ok: true, history });
  } catch (error: any) {
    console.error('[Analytics] replay-history error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get replay history.', code: 'ANALYTICS_FAILED' });
  }
});

// GET /api/analytics/trade/:tradeId/replay-history
// Returns immutable historical replay analysis records for a single trade
router.get('/trade/:tradeId/replay-history', async (req: Request, res: Response) => {
  try {
    const { tradeId } = req.params;
    const history = await marketAnalytics.getTradeReplayHistory(tradeId);
    return res.json({ ok: true, history });
  } catch (error: any) {
    console.error('[Analytics] trade replay-history error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get trade replay history.', code: 'ANALYTICS_FAILED' });
  }
});

// GET /api/analytics/session/:sessionId/coverage
// Returns candle coverage info for the session's symbol
router.get('/session/:sessionId/coverage', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { prisma } = await import('../prisma');
    const session = await prisma.backtestSession.findUnique({
      where: { id: sessionId },
      select: { symbol: true },
    });
    if (!session) return res.status(404).json({ ok: false, error: 'Session not found' });

    const provider = (req.query?.provider as string) || undefined;
    const coverage = await marketAnalytics.getCandleCoverage(session.symbol, provider);
    return res.json({ ok: true, coverage });
  } catch (error: any) {
    console.error('[Analytics] coverage error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get coverage.', code: 'ANALYTICS_FAILED' });
  }
});

// GET /api/analytics/session/:sessionId/per-trade-report
// Returns paginated per-trade diagnostic table
router.get('/session/:sessionId/per-trade-report', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const limit = parseInt(req.query?.limit as string) || 1000;
    const offset = parseInt(req.query?.offset as string) || 0;
    const status = (req.query?.status as string) || undefined;
    const marketDataSource = (req.query?.marketDataSource as string) || 'DUKASCOPY';
    const backtestRR = parseFloat(req.query?.backtestRR as string) || 1.0;
    const timeframe = (req.query?.timeframe as string) || 'M1';

    const report = await marketAnalytics.getPerTradeReport(sessionId, {
      limit,
      offset,
      status,
      marketDataSource,
      backtestRR,
      timeframe,
    });
    return res.json({ ok: true, ...report });
  } catch (error: any) {
    console.error('[Analytics] per-trade-report error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get per-trade report.', code: 'ANALYTICS_FAILED' });
  }
});

// POST /api/analytics/session/:sessionId/timeframe-comparison
// Runs simulation for M1, M5, M15, H1 and returns comparison metrics
router.post('/session/:sessionId/timeframe-comparison', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const backtestRR = parseFloat(req.body?.backtestRR) || 1.0;
    const marketDataSource = req.body?.marketDataSource || 'DUKASCOPY';

    const comparison = await marketAnalytics.getTimeframeComparison(sessionId, backtestRR, marketDataSource);
    return res.json({ ok: true, comparison });
  } catch (error: any) {
    console.error('[Analytics] timeframe-comparison error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to run timeframe comparison.', code: 'ANALYTICS_FAILED' });
  }
});

export default router;
