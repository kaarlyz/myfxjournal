import fs from 'fs';
import { prisma } from '../prisma';
import { parseMt5XlsxReport } from '../utils/mt5ReportParser';
import { getBarOpenTime } from '../services/replayEngineCore';

async function main() {
  const filePath = '/home/vallencia/Documents/ReportTester-1119809.xlsx';
  const buffer = fs.readFileSync(filePath);
  const parsed = parseMt5XlsxReport(buffer);

  const trades = parsed.trades;
  const firstEntry = trades[0].entryTime!;
  const lastExit = trades[trades.length - 1].exitTime!;

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

  console.log('================================================================');
  console.log('STEP 3: DEEP AUDIT OF THE 144 "NEITHER" TRADES');
  console.log('================================================================');

  interface NeitherTradeDetail {
    tradeNumber: number;
    tradeId: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    exitPrice: number;
    slPrice: number;
    tpPrice: number;
    actualRR: number;
    brokerResult: 'WIN' | 'LOSS';
    brokerNetProfit: number;
    entryTime: Date;
    exitTime: Date;
    dukascopyHigh: number;
    dukascopyLow: number;
    tpGap: number; // For LONG: TP - High; For SHORT: Low - TP
    slGap: number; // For LONG: Low - SL; For SHORT: SL - High
    exitCandleTime: string;
    exitCandleOpen: number;
    exitCandleHigh: number;
    exitCandleLow: number;
    exitCandleClose: number;
    exitPriceInsideExitCandle: boolean;
    exitOnLastReplayCandle: boolean;
    candleCount: number;
  }

  const neitherTrades: NeitherTradeDetail[] = [];
  const allReplayedTrades: any[] = [];

  for (let i = 0; i < trades.length; i++) {
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

    const tradeCandles: typeof candles = [];
    let slHit = false;
    let tpHit = false;
    let firstTouch: 'TP' | 'SL' | 'INTRABAR_AMBIGUOUS' | 'NEITHER' = 'NEITHER';

    let dukascopyHigh = entryPrice;
    let dukascopyLow = entryPrice;

    for (let cur = startBar; cur <= endBar; cur += 60000) {
      const c = candleMap.get(cur);
      if (!c) continue;
      tradeCandles.push(c);

      if (c.high > dukascopyHigh) dukascopyHigh = c.high;
      if (c.low < dukascopyLow) dukascopyLow = c.low;

      let barSl = false;
      let barTp = false;

      if (isLong) {
        if (c.low <= slPrice) barSl = true;
        if (c.high >= tpPrice) barTp = true;
      } else {
        if (c.high >= slPrice) barSl = true;
        if (c.low <= tpPrice) barTp = true;
      }

      if (firstTouch === 'NEITHER') {
        if (barSl && barTp) {
          firstTouch = 'INTRABAR_AMBIGUOUS';
          break;
        } else if (barTp) {
          firstTouch = 'TP';
          break;
        } else if (barSl) {
          firstTouch = 'SL';
          break;
        }
      }
    }

    allReplayedTrades.push({
      tradeNumber: i + 1,
      brokerResult,
      firstTouch,
    });

    if (firstTouch === 'NEITHER') {
      const tpGap = isLong ? tpPrice - dukascopyHigh : dukascopyLow - tpPrice;
      const slGap = isLong ? dukascopyLow - slPrice : slPrice - dukascopyHigh;

      const exitBarTime = getBarOpenTime(exitTime, 'M1').getTime();
      const exitCandle = candleMap.get(exitBarTime) || tradeCandles[tradeCandles.length - 1];

      const exitPriceInside = exitCandle ? (exitPrice >= exitCandle.low && exitPrice <= exitCandle.high) : false;
      const exitOnLast = tradeCandles.length > 0 && exitCandle ? exitCandle.time.getTime() === tradeCandles[tradeCandles.length - 1].time.getTime() : false;

      neitherTrades.push({
        tradeNumber: i + 1,
        tradeId: `T#${i+1}_Deal${t.entryDealId}`,
        side: isLong ? 'LONG' : 'SHORT',
        entryPrice,
        exitPrice,
        slPrice,
        tpPrice,
        actualRR,
        brokerResult,
        brokerNetProfit: t.netProfit,
        entryTime,
        exitTime,
        dukascopyHigh,
        dukascopyLow,
        tpGap,
        slGap,
        exitCandleTime: exitCandle ? exitCandle.time.toISOString() : 'N/A',
        exitCandleOpen: exitCandle?.open || 0,
        exitCandleHigh: exitCandle?.high || 0,
        exitCandleLow: exitCandle?.low || 0,
        exitCandleClose: exitCandle?.close || 0,
        exitPriceInsideExitCandle: exitPriceInside,
        exitOnLastReplayCandle: exitOnLast,
        candleCount: tradeCandles.length,
      });
    }
  }

  // 1. Total counts
  const totalNeither = neitherTrades.length;
  const neitherBuy = neitherTrades.filter(t => t.side === 'LONG').length;
  const neitherSell = neitherTrades.filter(t => t.side === 'SHORT').length;
  const neitherWin = neitherTrades.filter(t => t.brokerResult === 'WIN').length;
  const neitherLoss = neitherTrades.filter(t => t.brokerResult === 'LOSS').length;

  console.log(`Total NEITHER Trades: ${totalNeither} (${((totalNeither / trades.length) * 100).toFixed(2)}% of 709 trades)`);
  console.log(`  - BUY (LONG) Trades:  ${neitherBuy} (${((neitherBuy / totalNeither) * 100).toFixed(1)}%)`);
  console.log(`  - SELL (SHORT) Trades: ${neitherSell} (${((neitherSell / totalNeither) * 100).toFixed(1)}%)`);
  console.log(`  - Broker Realized WIN: ${neitherWin} (${((neitherWin / totalNeither) * 100).toFixed(1)}%)`);
  console.log(`  - Broker Realized LOSS: ${neitherLoss} (${((neitherLoss / totalNeither) * 100).toFixed(1)}%)`);

  // 2. Statistical distributions
  function getStats(arr: number[]) {
    const sorted = [...arr].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / sorted.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    return { min, median, avg, max };
  }

  // Stats for WIN trades (how close did Dukascopy High/Low get to TP?)
  const winTpGaps = neitherTrades.filter(t => t.brokerResult === 'WIN').map(t => t.tpGap);
  const lossSlGaps = neitherTrades.filter(t => t.brokerResult === 'LOSS').map(t => t.slGap);

  const winTpStats = getStats(winTpGaps);
  const lossSlStats = getStats(lossSlGaps);

  console.log('\n--- TP Gap Statistics for Broker WIN Trades (TP - Dukascopy M1 Max Extent) ---');
  console.log(`  Min TP Gap:    $${winTpStats.min.toFixed(3)}`);
  console.log(`  Median TP Gap: $${winTpStats.median.toFixed(3)}`);
  console.log(`  Avg TP Gap:    $${winTpStats.avg.toFixed(3)}`);
  console.log(`  Max TP Gap:    $${winTpStats.max.toFixed(3)}`);

  console.log('\n--- SL Gap Statistics for Broker LOSS Trades (Dukascopy M1 Extent - SL) ---');
  console.log(`  Min SL Gap:    $${lossSlStats.min.toFixed(3)}`);
  console.log(`  Median SL Gap: $${lossSlStats.median.toFixed(3)}`);
  console.log(`  Avg SL Gap:    $${lossSlStats.avg.toFixed(3)}`);
  console.log(`  Max SL Gap:    $${lossSlStats.max.toFixed(3)}`);

  // Exit candle checks
  const insideExitCandleCount = neitherTrades.filter(t => t.exitPriceInsideExitCandle).length;
  const exitOnLastCandleCount = neitherTrades.filter(t => t.exitOnLastReplayCandle).length;

  console.log('\n--- Exit Candle Physical Validity Checks ---');
  console.log(`  Trades where Broker Exit Price is inside Dukascopy Exit Candle [Low, High]: ${insideExitCandleCount} / ${totalNeither} (${((insideExitCandleCount/totalNeither)*100).toFixed(1)}%)`);
  console.log(`  Trades where Exit occurred on the exact last candle of Replay Window:        ${exitOnLastCandleCount} / ${totalNeither} (${((exitOnLastCandleCount/totalNeither)*100).toFixed(1)}%)`);

  // Sample 20 NEITHER trades
  console.log('\n========================================================================================================================');
  console.log('SAMPLE OF 20 "NEITHER" TRADES WITH DETAILED OHLC METRICS:');
  console.log('========================================================================================================================');

  // Select evenly spaced 20 trades from the 144
  const step = Math.floor(neitherTrades.length / 20);
  const sample20 = [];
  for (let i = 0; i < 20; i++) {
    sample20.push(neitherTrades[Math.min(i * step, neitherTrades.length - 1)]);
  }

  console.log(
    'Trade'.padEnd(6) + '| ' +
    'Side'.padEnd(5) + '| ' +
    'Entry'.padEnd(8) + '| ' +
    'SL'.padEnd(8) + '| ' +
    'TP'.padEnd(8) + '| ' +
    'Bk Exit'.padEnd(8) + '| ' +
    'Bk Res'.padEnd(7) + '| ' +
    'Duk High'.padEnd(9) + '| ' +
    'Duk Low'.padEnd(9) + '| ' +
    'Gap SL'.padEnd(8) + '| ' +
    'Gap TP'.padEnd(8) + '| ' +
    'Exit Candle Time'.padEnd(21) + '| ' +
    'Classification'
  );
  console.log('-'.repeat(140));

  for (const t of sample20) {
    let classification = '';
    if (t.brokerResult === 'WIN') {
      if (t.tpGap <= 0.30) classification = `TP missed by $${t.tpGap.toFixed(2)} (within spread)`;
      else classification = `TP missed by $${t.tpGap.toFixed(2)} (broker early close/signal)`;
    } else {
      if (t.slGap <= 0.30) classification = `SL missed by $${t.slGap.toFixed(2)} (within spread)`;
      else classification = `Early EA signal exit (exit $${Math.abs(t.exitPrice - t.entryPrice).toFixed(2)} from entry)`;
    }

    console.log(
      `#${String(t.tradeNumber).padEnd(5)}| ` +
      `${t.side.padEnd(5)}| ` +
      `${t.entryPrice.toFixed(2).padEnd(8)}| ` +
      `${t.slPrice.toFixed(2).padEnd(8)}| ` +
      `${t.tpPrice.toFixed(2).padEnd(8)}| ` +
      `${t.exitPrice.toFixed(2).padEnd(8)}| ` +
      `${t.brokerResult.padEnd(7)}| ` +
      `${t.dukascopyHigh.toFixed(2).padEnd(9)}| ` +
      `${t.dukascopyLow.toFixed(2).padEnd(9)}| ` +
      `${('$' + t.slGap.toFixed(2)).padEnd(8)}| ` +
      `${('$' + t.tpGap.toFixed(2)).padEnd(8)}| ` +
      `${t.exitCandleTime.slice(0, 19).padEnd(21)}| ` +
      `${classification}`
    );
  }

  await prisma.$disconnect();
}

main().catch(console.error);
