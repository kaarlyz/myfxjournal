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

  console.log('Loading candles for all 709 trades...');
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

  console.log(`Loaded ${candles.length} candles.`);

  // Prepare trade candle lists
  const tradeCandleLists: { trade: typeof trades[0]; tradeCandles: OHLCCandle[]; isLong: boolean; entryPrice: number; actualSL: number; risk: number }[] = [];

  for (const t of trades) {
    if (!t.entryPrice || !t.slPrice || !t.tpPrice || !t.entryTime || !t.exitTime) continue;
    const isLong = t.side === 'LONG' || t.side === 'BUY';
    const entryPrice = t.entryPrice;
    const actualSL = t.slPrice;
    const risk = isLong ? entryPrice - actualSL : actualSL - entryPrice;
    if (risk <= 0) continue;

    const startBar = getBarOpenTime(t.entryTime, 'M1').getTime();
    const endBar = t.exitTime.getTime();

    const tradeCandles: OHLCCandle[] = [];
    for (let cur = startBar; cur <= endBar; cur += 60000) {
      const c = candleMap.get(cur);
      if (c) tradeCandles.push({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close });
    }

    if (tradeCandles.length > 0) {
      tradeCandleLists.push({ trade: t, tradeCandles, isLong, entryPrice, actualSL, risk });
    }
  }

  console.log(`Ready to simulate on ${tradeCandleLists.length} valid trades with actual SL.`);

  const rrTargets = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 8.0, 10.0];

  console.log('\n========================================================================================');
  console.log('MODE C: TRUE HYPOTHETICAL TARGET RR SIMULATION (CHRONOLOGICAL CANDLE TRAVERSAL)');
  console.log('========================================================================================');
  console.log('Target RR | TP Hits (W) | SL Hits (L) | Ambiguous | Neither | Total | Simulated WR | Expectancy');
  console.log('----------------------------------------------------------------------------------------');

  for (const targetRR of rrTargets) {
    let tpHits = 0;
    let slHits = 0;
    let ambiguous = 0;
    let neither = 0;

    for (const item of tradeCandleLists) {
      const { trade, tradeCandles, isLong, entryPrice, actualSL, risk } = item;
      const hypotheticalTP = isLong
        ? entryPrice + risk * targetRR
        : entryPrice - risk * targetRR;

      const sim = runRRSimulation(
        trade.side as any,
        entryPrice,
        actualSL,
        hypotheticalTP,
        trade.exitTime!,
        tradeCandles
      );

      if (sim.firstHit === 'TP') tpHits++;
      else if (sim.firstHit === 'SL') slHits++;
      else if (sim.firstHit === 'AMBIGUOUS') ambiguous++;
      else neither++;
    }

    const totalDecided = tpHits + slHits;
    const totalAll = tradeCandleLists.length;
    // Strict WR on decided trades
    const winRateDecided = totalDecided > 0 ? (tpHits / totalDecided) * 100 : 0;
    // WR over all trades (neither counted as non-win)
    const winRateAll = (tpHits / totalAll) * 100;
    const expectancy = (winRateDecided / 100) * targetRR - (1 - winRateDecided / 100) * 1.0;

    console.log(
      `1 : ${targetRR.toFixed(2).padEnd(5)} | ` +
      `${tpHits.toString().padEnd(11)} | ` +
      `${slHits.toString().padEnd(11)} | ` +
      `${ambiguous.toString().padEnd(9)} | ` +
      `${neither.toString().padEnd(7)} | ` +
      `${totalAll.toString().padEnd(5)} | ` +
      `${winRateDecided.toFixed(2)}% (${winRateAll.toFixed(1)}%) | ` +
      `${expectancy >= 0 ? '+' : ''}${expectancy.toFixed(2)}R`
    );
  }

  await prisma.$disconnect();
}

main().catch(console.error);
