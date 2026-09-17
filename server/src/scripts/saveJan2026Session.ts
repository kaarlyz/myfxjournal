import fs from 'node:fs';
import { prisma } from '../prisma';

async function importJan2026Results() {
  console.log("🚀 Saving Jan 2026 AI Auto-Pilot Session to Database...");

  const data = JSON.parse(fs.readFileSync('/home/vallencia/Documents/myfxjournal/ai_jan_2026_100_trades_result.json', 'utf-8'));
  const summary = data.summary;
  const trades = data.trades;

  const session = await prisma.backtestSession.create({
    data: {
      name: "MurplyFX AI Copilot - Jan 2026 (100 Trades Fixed 1:1 RR)",
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
      notes: "AI Auto-Pilot execution from 2026-01-05 on XAUUSD M1 with Fixed 1:1 R:R."
    }
  });

  const tradesData = trades.map((t: any) => ({
    sessionId: session.id,
    source: 'MANUAL',
    tradeNumber: t.tradeNumber,
    symbol: 'XAUUSD',
    timeframe: 'M1',
    side: t.side,
    entryTime: new Date(t.entryTime),
    exitTime: new Date(t.exitTime),
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    slPrice: t.slPrice,
    tpPrice: t.tpPrice,
    qty: t.lotSize,
    positionValue: t.lotSize * 100 * t.entryPrice,
    netPnlUsd: t.pnlUsd,
    netPnlPct: t.pnlPct,
    netPnlIdr: t.pnlUsd * 16350,
    durationMinutes: 15,
    setupTag: t.setupName,
    mistakeTag: 'No Mistake',
    emotionTag: 'Calm',
    confidenceRating: 5,
    status: 'CLOSED',
    result: t.result,
    rMultiple: t.result === 'WIN' ? 1.0 : -1.0,
    plannedRR: 1.0,
    maxPotentialRR: 1.0,
    mfePrice: t.tpPrice,
    maePrice: t.slPrice
  }));

  await prisma.trade.createMany({ data: tradesData });
  console.log(`✅ Database Session Saved: ${session.id}`);
}

importJan2026Results().catch(console.error);
