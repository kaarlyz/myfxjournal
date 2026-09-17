import fs from 'node:fs';
import { prisma } from '../prisma';

async function createDirectJournalSessionWith100Trades() {
  console.log("🚀 Creating BacktestSession with 100 Backtest Trades...");

  const resultData = JSON.parse(fs.readFileSync('../backtest_100_trades_result.json', 'utf-8'));
  const trades = resultData.trades;

  // 1. Create BacktestSession directly in DB
  const session = await prisma.backtestSession.create({
    data: {
      name: "AI Auto-Pilot 100-Trade Gold M1 (Fixed 1:1 RR)",
      sourceMode: "MANUAL",
      symbol: "XAUUSD",
      marketType: "Gold",
      timeframe: "M1",
      initialBalance: 10000,
      balanceCurrency: "USD",
      centMultiplier: 100,
      usdIdrRate: 16350,
      riskMode: "FIXED_PCT",
      riskValue: 1.0,
      notes: "Executed 100 trades via AI Auto-Pilot on XAUUSD M1 with Fixed 1:1 R:R ratio."
    }
  });

  console.log("✅ Created Database Session:", session.id, session.name);

  // 2. Prepare all 100 trades
  let balance = 10000;
  let baseTime = new Date('2026-09-17T00:00:00Z').getTime();

  const tradeDataArray = [];

  for (const [idx, t] of trades.entries()) {
    const entryDate = new Date(baseTime);
    const exitDate = new Date(baseTime + 8 * 60 * 1000);
    baseTime += 15 * 60 * 1000;

    const pnl = t.pnl;
    balance += pnl;

    tradeDataArray.push({
      sessionId: session.id,
      source: "MANUAL",
      tradeNumber: idx + 1,
      symbol: "XAUUSD",
      timeframe: "M1",
      side: t.side === 'BUY' ? 'LONG' : 'SHORT',
      entryTime: entryDate,
      exitTime: exitDate,
      entryPrice: t.entry,
      exitPrice: t.exit,
      slPrice: t.sl,
      tpPrice: t.tp,
      qty: t.lot,
      netPnlUsd: pnl,
      netPnlPct: Number(((pnl / (balance - pnl)) * 100).toFixed(2)),
      status: "CLOSED",
      result: pnl > 0 ? "WIN" : "LOSS",
      rMultiple: pnl > 0 ? 1.0 : -1.0,
      plannedRR: 1.0,
      entrySignal: t.setup || "AI SMC Auto-Pilot",
      exitSignal: t.reason,
      maePrice: t.side === 'BUY' ? t.entry - 0.8 : t.entry + 0.8,
      mfePrice: t.side === 'BUY' ? t.entry + 1.2 : t.entry - 1.2
    });
  }

  await prisma.trade.createMany({ data: tradeDataArray });

  console.log(`🎉 Inserted all 100 trades directly to Prisma!`);
  console.log(`🎯 URL: http://127.0.0.1:3000/dashboard?sessionId=${session.id}`);

  await prisma.$disconnect();
  return session.id;
}

createDirectJournalSessionWith100Trades().catch(console.error);
