import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';

const router = Router();

// GET /api/live-trades
router.get('/', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    
    const whereClause = accountId ? { tradingAccountId: String(accountId) } : {};
    
    const trades = await prisma.liveTrade.findMany({
      where: whereClause,
      orderBy: { openTime: 'desc' }
    });
    
    return res.json(trades);
  } catch (error: any) {
    console.error('Error fetching live trades:', error);
    return res.status(500).json({ error: 'Gagal memuat daftar live trade.' });
  }
});

// GET /api/live-trades/summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    const whereClause = accountId ? { tradingAccountId: String(accountId) } : {};
    
    const trades = await prisma.liveTrade.findMany({
      where: whereClause,
      orderBy: { openTime: 'asc' }
    });
    
    const closedTrades = trades.filter(t => t.closeTime !== null);
    
    const totalTrades = closedTrades.length;
    const winningTrades = closedTrades.filter(t => (t.profit || 0) > 0).length;
    const losingTrades = closedTrades.filter(t => (t.profit || 0) < 0).length;
    const breakEvenTrades = closedTrades.filter(t => (t.profit || 0) === 0).length;
    
    const winrate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    
    const grossProfit = closedTrades.filter(t => (t.profit || 0) > 0).reduce((sum, t) => sum + (t.profit || 0), 0);
    const grossLoss = closedTrades.filter(t => (t.profit || 0) < 0).reduce((sum, t) => sum + Math.abs(t.profit || 0), 0);
    
    const netPnl = grossProfit - grossLoss;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0);
    
    const averageWin = winningTrades > 0 ? grossProfit / winningTrades : 0;
    const averageLoss = losingTrades > 0 ? grossLoss / losingTrades : 0;
    const bestTrade = closedTrades.reduce((best, t) => Math.max(best, t.profit || 0), 0);
    const worstTrade = closedTrades.reduce((worst, t) => Math.min(worst, t.profit || 0), 0);
    const totalLots = trades.reduce((sum, t) => sum + (t.lot || 0), 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayPnl = closedTrades
      .filter(t => new Date(t.closeTime || t.openTime) >= today)
      .reduce((sum, t) => sum + (t.profit || 0), 0);
    
    // Fetch account info for true balance/equity
    let currentBalance = 0;
    let currentEquity = null;
    let freeMargin = null;
    let accountName = '';
    let account: any = null;
    
    if (accountId) {
      account = await prisma.tradingAccount.findUnique({ where: { id: String(accountId) } });
      if (account) {
        currentBalance = account.currentBalance;
        currentEquity = account.currentEquity;
        freeMargin = account.freeMargin;
        accountName = account.name;
      }
    }

    const dailyMap = new Map<string, number>();
    closedTrades.forEach(t => {
      const key = new Date(t.closeTime || t.openTime).toISOString().slice(0, 10);
      dailyMap.set(key, (dailyMap.get(key) || 0) + (t.profit || 0));
    });
    const dailyPnl = Array.from(dailyMap.entries()).map(([date, pnl]) => ({ date, pnl }));

    let cumulative = 0;
    const equityCurve = closedTrades.map(t => {
      cumulative += t.profit || 0;
      return {
        time: t.closeTime || t.openTime,
        equity: (account?.currentBalance ?? currentBalance ?? 0) + cumulative,
        balance: (account?.currentBalance ?? currentBalance ?? 0) + cumulative,
        pnl: cumulative,
      };
    });

    const symbolPerformance = Object.values(trades.reduce((acc: any, t: any) => {
      const key = t.symbol || 'UNKNOWN';
      if (!acc[key]) acc[key] = { symbol: key, trades: 0, pnl: 0, lots: 0 };
      acc[key].trades += 1;
      acc[key].pnl += t.profit || 0;
      acc[key].lots += t.lot || 0;
      return acc;
    }, {}));

    const sidePerformance = ['BUY', 'SELL'].map(side => {
      const sideTrades = trades.filter(t => t.side === side);
      return {
        side,
        trades: sideTrades.length,
        pnl: sideTrades.reduce((sum, t) => sum + (t.profit || 0), 0),
        lots: sideTrades.reduce((sum, t) => sum + (t.lot || 0), 0),
      };
    });

    const nestedSummary = {
      balance: currentBalance,
      equity: currentEquity ?? currentBalance,
      freeMargin: freeMargin ?? 0,
      floatingPnl: (currentEquity ?? currentBalance) - currentBalance,
      netPnl,
      todayPnl,
      openTrades: trades.filter(t => t.closeTime === null).length,
      closedTrades: totalTrades,
      winrate,
      profitFactor,
      averageWin,
      averageLoss,
      bestTrade,
      worstTrade,
      maxDrawdown: 0,
      totalLots,
    };

    return res.json({
      account,
      summary: nestedSummary,
      charts: {
        equityCurve,
        dailyPnl,
        symbolPerformance,
        sidePerformance,
        pnlDistribution: closedTrades.map(t => ({ id: t.id, pnl: t.profit || 0 })),
      },
      totalTrades,
      winningTrades,
      losingTrades,
      breakEvenTrades,
      winrate,
      grossProfit,
      grossLoss,
      netPnl,
      profitFactor,
      averageWin,
      averageLoss,
      bestTrade,
      worstTrade,
      totalLots,
      todayPnl,
      currentBalance,
      currentEquity,
      freeMargin,
      accountName
    });
  } catch (error: any) {
    console.error('Error fetching live trades summary:', error);
    return res.status(500).json({ error: 'Gagal memuat ringkasan live trade.' });
  }
});

// POST /api/live-trades
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    
    if (!data.tradingAccountId || !data.symbol || !data.side || data.lot === undefined || data.entryPrice === undefined || !data.openTime) {
      return res.status(400).json({ error: 'Data trade tidak lengkap.' });
    }

    const trade = await prisma.liveTrade.create({
      data: {
        tradingAccountId: data.tradingAccountId,
        source: data.source || 'MANUAL',
        positionId: data.positionId,
        symbol: data.symbol,
        side: data.side,
        lot: parseFloat(data.lot),
        entryPrice: parseFloat(data.entryPrice),
        stopLoss: data.stopLoss ? parseFloat(data.stopLoss) : null,
        takeProfit: data.takeProfit ? parseFloat(data.takeProfit) : null,
        closePrice: data.closePrice ? parseFloat(data.closePrice) : null,
        openTime: new Date(data.openTime),
        closeTime: data.closeTime ? new Date(data.closeTime) : null,
        commission: data.commission ? parseFloat(data.commission) : 0,
        swap: data.swap ? parseFloat(data.swap) : 0,
        profit: data.profit ? parseFloat(data.profit) : null,
        profitCurrency: data.profitCurrency,
        riskMoney: data.riskMoney ? parseFloat(data.riskMoney) : null,
        riskPercent: data.riskPercent ? parseFloat(data.riskPercent) : null,
        rMultiple: data.rMultiple ? parseFloat(data.rMultiple) : null,
        strategyTag: data.strategyTag,
        emotionTag: data.emotionTag,
        mistakeTag: data.mistakeTag,
        notes: data.notes,
        followedPlan: data.followedPlan,
        screenshots: data.screenshots ? JSON.stringify(data.screenshots) : null,
      }
    });

    // Removed: Account balance must only be updated from account-snapshot

    return res.json(trade);
  } catch (error: any) {
    console.error('Error creating live trade:', error);
    return res.status(500).json({ error: 'Gagal menyimpan trade.' });
  }
});

// DELETE /api/live-trades/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Removed: Account balance must only be updated from account-snapshot

    await prisma.liveTrade.delete({
      where: { id }
    });
    
    return res.json({ message: 'Trade berhasil dihapus.' });
  } catch (error: any) {
    console.error('Error deleting live trade:', error);
    return res.status(500).json({ error: 'Gagal menghapus trade.' });
  }
});

export default router;
