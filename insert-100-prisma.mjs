import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createDirectJournalSessionWith100Trades() {
  console.log("🚀 Creating Journal Session with 100 Backtest Trades...");

  const resultData = JSON.parse(fs.readFileSync('./backtest_100_trades_result.json', 'utf-8'));
  const trades = resultData.trades;

  // 1. Create Journal Session directly in DB
  const session = await prisma.session.create({
    data: {
      name: "AI Auto-Pilot 100-Trade Gold M1 (Fixed 1:1 RR)",
      sourceMode: "MANUAL",
      symbol: "XAUUSD",
      marketType: "Gold",
      timeframe: "M1",
      initialBalance: 10000,
      balanceCurrency: "USD",
      riskMode: "FIXED_PCT",
      riskValue: 1.0,
      notes: "Executed 100 trades via AI Auto-Pilot on XAUUSD M1 with Fixed 1:1 R:R ratio."
    }
  });

  console.log("✅ Created Database Session:", session.id, session.name);

  // 2. Insert all 100 trades
  let balance = 10000;
  let baseTime = new Date('2026-09-17T00:00:00Z').getTime();

  for (const [idx, t] of trades.entries()) {
    const entryDate = new Date(baseTime);
    const exitDate = new Date(baseTime + 8 * 60 * 1000);
    baseTime += 15 * 60 * 1000;

    const pnl = t.pnl;
    balance += pnl;

    await prisma.trade.create({
      data: {
        sessionId: session.id,
        ticket: `AI-M1-${idx + 1}`,
        symbol: "XAUUSD",
        marketType: "Gold",
        side: t.side,
        entryTime: entryDate,
        exitTime: exitDate,
        entryPrice: t.entry,
        exitPrice: t.exit,
        slPrice: t.sl,
        tpPrice: t.tp,
        lotSize: t.lot,
        pnlUsd: pnl,
        pnlPips: t.side === 'BUY' ? (t.exit - t.entry) * 10 : (t.entry - t.exit) * 10,
        netPnlPct: Number(((pnl / (balance - pnl)) * 100).toFixed(2)),
        setup: t.setup || "AI SMC Auto-Pilot",
        notes: `Outcome: ${t.reason} | R:R 1:1.0`,
        tags: JSON.stringify(["AI_AUTOPILOT", "M1", "FIXED_RR_1:1"]),
        maePrice: t.side === 'BUY' ? t.entry - 0.8 : t.entry + 0.8,
        mfePrice: t.side === 'BUY' ? t.entry + 1.2 : t.entry - 1.2
      }
    });
  }

  console.log(`🎉 Inserted all 100 trades directly to Prisma!`);
  console.log(`🎯 URL: http://127.0.0.1:3000/dashboard?sessionId=${session.id}`);

  await prisma.$disconnect();
  return session.id;
}

createDirectJournalSessionWith100Trades().catch(console.error);
