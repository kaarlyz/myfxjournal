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
      where: whereClause
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
    
    // Quick account balance update calculation
    let currentBalance = 0;
    if (accountId) {
      const account = await prisma.tradingAccount.findUnique({ where: { id: String(accountId) } });
      if (account) {
        currentBalance = account.initialBalance + netPnl;
        // Optionally update it in DB, but better done on trade save
      }
    }

    return res.json({
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
      currentBalance
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

    // Update account balance
    if (trade.profit !== null) {
      await prisma.tradingAccount.update({
        where: { id: trade.tradingAccountId },
        data: {
          currentBalance: {
            increment: trade.profit
          }
        }
      });
    }

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
    
    // Check if trade had profit to reverse balance
    const trade = await prisma.liveTrade.findUnique({ where: { id }});
    if (trade && trade.profit !== null) {
      await prisma.tradingAccount.update({
        where: { id: trade.tradingAccountId },
        data: {
          currentBalance: {
            decrement: trade.profit
          }
        }
      });
    }

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
