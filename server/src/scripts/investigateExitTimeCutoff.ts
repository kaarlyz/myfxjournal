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
  const lastExit = trades[trades.length - 1].exitTime!;

  console.log('Loading full candle dataset for session range...');
  const candles = await prisma.mt5CandleData.findMany({
    where: {
      provider: 'DUKASCOPY',
      symbol: 'XAUUSD',
      timeframe: 'M1',
      time: {
        gte: new Date(firstEntry.getTime() - 3600000),
        lte: new Date(lastExit.getTime() + 14 * 86400000), // extend 14 days past last trade
      },
    },
    orderBy: { time: 'asc' },
  });

  const candleMap = new Map<number, typeof candles[0]>();
  candles.forEach(c => candleMap.set(c.time.getTime(), c));
  console.log(`Loaded ${candles.length} candles.`);

  const rrTargets = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];

  console.log('\n====================================================================================================');
  console.log('COMPARISON: CUTOFF AT OLD EXIT_TIME (Current Bug) vs FULL FORWARD REPLAY (Until TP or SL Hit)');
  console.log('====================================================================================================');
  console.log('Target RR | Constrained to Old ExitTime (BUG) | Full Forward Replay (Until SL or TP Hit) | Expected Theoretical');
  console.log('----------------------------------------------------------------------------------------------------');

  for (const targetRR of rrTargets) {
    let winsConstrained = 0;
    let winsFullForward = 0;
    let slHitsFullForward = 0;
    let totalValid = 0;

    for (let i = 0; i < trades.length; i++) {
      const t = trades[i];
      if (!t.entryPrice || !t.slPrice || !t.entryTime || !t.exitTime) continue;
      const isLong = t.side === 'LONG' || t.side === 'BUY';
      const entryPrice = t.entryPrice;
      const actualSL = t.slPrice;
      const risk = isLong ? entryPrice - actualSL : actualSL - entryPrice;
      if (risk <= 0) continue;

      totalValid++;
      const hypotheticalTP = isLong ? entryPrice + risk * targetRR : entryPrice - risk * targetRR;

      const startBar = getBarOpenTime(t.entryTime, 'M1').getTime();
      const oldEndBar = t.exitTime.getTime();
      const maxForwardEndBar = startBar + 14 * 86400000; // allow up to 14 days for hypothetical target to be hit

      // 1. Constrained replay (stopped at old exitTime)
      let cur = startBar;
      while (cur <= oldEndBar) {
        const c = candleMap.get(cur);
        if (c) {
          if (isLong) {
            if (c.low <= actualSL) break; // SL hit
            if (c.high >= hypotheticalTP) { winsConstrained++; break; } // TP hit
          } else {
            if (c.high >= actualSL) break;
            if (c.low <= hypotheticalTP) { winsConstrained++; break; }
          }
        }
        cur += 60000;
      }

      // 2. Full Forward replay (position stays open until hypothetical TP OR actual SL is hit!)
      cur = startBar;
      while (cur <= maxForwardEndBar) {
        const c = candleMap.get(cur);
        if (c) {
          if (isLong) {
            if (c.low <= actualSL) { slHitsFullForward++; break; } // SL hit first
            if (c.high >= hypotheticalTP) { winsFullForward++; break; } // TP hit first
          } else {
            if (c.high >= actualSL) { slHitsFullForward++; break; }
            if (c.low <= hypotheticalTP) { winsFullForward++; break; }
          }
        }
        cur += 60000;
      }
    }

    const wrConstrained = (winsConstrained / totalValid) * 100;
    const wrFullForward = (winsFullForward / totalValid) * 100;
    const theoreticalWR = (1 / (1 + targetRR)) * 100; // Zero-alpha benchmark (random walk: 1 / (1+RR))

    console.log(
      `1 : ${targetRR.toFixed(2).padEnd(5)} | ` +
      `${winsConstrained.toString().padEnd(4)} / ${totalValid} (${wrConstrained.toFixed(2)}%)`.padEnd(35) + ' | ' +
      `${winsFullForward.toString().padEnd(4)} / ${totalValid} (${wrFullForward.toFixed(2)}%)`.padEnd(42) + ' | ' +
      `~${theoreticalWR.toFixed(1)}%`
    );
  }

  await prisma.$disconnect();
}

main().catch(console.error);
