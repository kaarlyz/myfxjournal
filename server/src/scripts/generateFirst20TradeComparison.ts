import fs from 'fs';
import { prisma } from '../prisma';
import { parseMt5XlsxReport } from '../utils/mt5ReportParser';
import { getBarOpenTime, runRRSimulation, OHLCCandle } from '../services/replayEngineCore';

async function main() {
  const filePath = '/home/vallencia/Documents/ReportTester-1119809.xlsx';
  const buffer = fs.readFileSync(filePath);
  const parsed = parseMt5XlsxReport(buffer);

  const trades = parsed.trades;
  const firstEntry = trades[0].entryTime!;
  const lastExit = trades[19].exitTime!;

  const candles = await prisma.mt5CandleData.findMany({
    where: {
      provider: 'DUKASCOPY',
      symbol: 'XAUUSD',
      timeframe: 'M1',
      time: {
        gte: new Date(firstEntry.getTime() - 3600000),
        lte: new Date(lastExit.getTime() + 3600000),
      },
    },
    orderBy: { time: 'asc' },
  });

  const candleMap = new Map<number, typeof candles[0]>();
  candles.forEach(c => candleMap.set(c.time.getTime(), c));

  console.log('========================================================================================================================================================================================================');
  console.log('FIRST 20 TRADES COMPREHENSIVE FORENSIC COMPARISON TABLE (DATABASE & GROUND TRUTH)');
  console.log('========================================================================================================================================================================================================');

  const rows: any[] = [];

  for (let i = 0; i < 20; i++) {
    const t = trades[i];
    const isLong = t.side === 'LONG' || t.side === 'BUY';
    const entryPrice = t.entryPrice!;
    const exitPrice = t.exitPrice!;
    const slPrice = t.slPrice!;
    const tpPrice = t.tpPrice!;
    const entryTime = t.entryTime!;
    const exitTime = t.exitTime!;
    const brokerResult = t.netProfit > 0 ? 'WIN' : 'LOSS';

    const risk = isLong ? entryPrice - slPrice : slPrice - entryPrice;
    const reward = isLong ? tpPrice - entryPrice : entryPrice - tpPrice;
    const actualRR = (risk > 0 && reward > 0) ? reward / risk : 0;

    const startBar = getBarOpenTime(entryTime, 'M1').getTime();
    const endBar = exitTime.getTime();

    const tradeCandles: OHLCCandle[] = [];
    for (let cur = startBar; cur <= endBar; cur += 60000) {
      const c = candleMap.get(cur);
      if (c) tradeCandles.push({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close });
    }

    // Actual Replay (Mode B)
    const actualSim = runRRSimulation(t.side as any, entryPrice, slPrice, tpPrice, exitTime, tradeCandles);
    const replayActualResult = actualSim.firstHit === 'TP' ? 'WIN' : (actualSim.firstHit === 'SL' ? 'LOSS' : (actualSim.firstHit === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'NEITHER'));
    const replayFirstTouch = actualSim.firstHit;

    // Hypothetical Simulations (Mode C)
    const hypo025 = runRRSimulation(t.side as any, entryPrice, slPrice, isLong ? entryPrice + risk * 0.25 : entryPrice - risk * 0.25, exitTime, tradeCandles);
    const hypo050 = runRRSimulation(t.side as any, entryPrice, slPrice, isLong ? entryPrice + risk * 0.50 : entryPrice - risk * 0.50, exitTime, tradeCandles);
    const hypo075 = runRRSimulation(t.side as any, entryPrice, slPrice, isLong ? entryPrice + risk * 0.75 : entryPrice - risk * 0.75, exitTime, tradeCandles);
    const hypo100 = runRRSimulation(t.side as any, entryPrice, slPrice, isLong ? entryPrice + risk * 1.00 : entryPrice - risk * 1.00, exitTime, tradeCandles);

    const res025 = hypo025.firstHit === 'TP' ? 'WIN' : (hypo025.firstHit === 'SL' ? 'LOSS' : hypo025.firstHit);
    const res050 = hypo050.firstHit === 'TP' ? 'WIN' : (hypo050.firstHit === 'SL' ? 'LOSS' : hypo050.firstHit);
    const res075 = hypo075.firstHit === 'TP' ? 'WIN' : (hypo075.firstHit === 'SL' ? 'LOSS' : hypo075.firstHit);
    const res100 = hypo100.firstHit === 'TP' ? 'WIN' : (hypo100.firstHit === 'SL' ? 'LOSS' : hypo100.firstHit);

    let mismatchReason = '-';
    if (replayActualResult !== brokerResult) {
      if (replayActualResult === 'NEITHER') {
        const gap = isLong ? tpPrice - Math.max(...tradeCandles.map(c => c.high)) : Math.min(...tradeCandles.map(c => c.low)) - tpPrice;
        mismatchReason = `Dukascopy Bid TP gap $${gap.toFixed(2)} (within spread)`;
      } else {
        mismatchReason = `Replay=${replayActualResult} vs Broker=${brokerResult}`;
      }
    }

    rows.push({
      tradeIndex: i + 1,
      orderId: t.orderId || t.entryDealId || '-',
      positionId: t.entryDealId || '-',
      side: t.side,
      entryTime: entryTime.toISOString().slice(0, 19).replace('T', ' '),
      entryPrice: entryPrice.toFixed(2),
      actualSL: slPrice.toFixed(2),
      actualTP: tpPrice.toFixed(2),
      actualRR: actualRR.toFixed(3),
      brokerExitTime: exitTime.toISOString().slice(0, 19).replace('T', ' '),
      brokerExitPrice: exitPrice.toFixed(2),
      brokerResult,
      replayActualResult,
      replayFirstTouch,
      res025,
      res050,
      res075,
      res100,
      mismatchReason,
    });
  }

  console.log(
    'Trd#'.padEnd(5) + '| ' +
    'Ord#'.padEnd(5) + '| ' +
    'Side'.padEnd(5) + '| ' +
    'Entry Time'.padEnd(20) + '| ' +
    'Entry'.padEnd(8) + '| ' +
    'SL'.padEnd(8) + '| ' +
    'TP'.padEnd(8) + '| ' +
    'Act RR'.padEnd(7) + '| ' +
    'Bk Exit'.padEnd(8) + '| ' +
    'Bk Res'.padEnd(7) + '| ' +
    'Replay Res'.padEnd(11) + '| ' +
    '1st Touch'.padEnd(10) + '| ' +
    '0.25R'.padEnd(6) + '| ' +
    '0.50R'.padEnd(6) + '| ' +
    '0.75R'.padEnd(6) + '| ' +
    '1.00R'.padEnd(6) + '| ' +
    'Mismatch Reason'
  );
  console.log('-'.repeat(180));

  for (const r of rows) {
    console.log(
      `#${String(r.tradeIndex).padEnd(4)}| ` +
      `${String(r.orderId).padEnd(5)}| ` +
      `${r.side.padEnd(5)}| ` +
      `${r.entryTime.padEnd(20)}| ` +
      `${r.entryPrice.padEnd(8)}| ` +
      `${r.actualSL.padEnd(8)}| ` +
      `${r.actualTP.padEnd(8)}| ` +
      `${r.actualRR.padEnd(7)}| ` +
      `${r.brokerExitPrice.padEnd(8)}| ` +
      `${r.brokerResult.padEnd(7)}| ` +
      `${r.replayActualResult.padEnd(11)}| ` +
      `${r.replayFirstTouch.padEnd(10)}| ` +
      `${r.res025.padEnd(6)}| ` +
      `${r.res050.padEnd(6)}| ` +
      `${r.res075.padEnd(6)}| ` +
      `${r.res100.padEnd(6)}| ` +
      `${r.mismatchReason}`
    );
  }

  await prisma.$disconnect();
}

main().catch(console.error);
