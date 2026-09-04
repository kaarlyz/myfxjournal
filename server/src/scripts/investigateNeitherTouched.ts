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

  const neitherTrades: any[] = [];

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

    const startBar = getBarOpenTime(entryTime, 'M1').getTime();
    const endBar = exitTime.getTime();

    let slHit = false;
    let tpHit = false;
    let maxHigh = entryPrice;
    let minLow = entryPrice;

    for (let cur = startBar; cur <= endBar; cur += 60000) {
      const c = candleMap.get(cur);
      if (!c) continue;
      if (c.high > maxHigh) maxHigh = c.high;
      if (c.low < minLow) minLow = c.low;

      if (isLong) {
        if (c.low <= slPrice) slHit = true;
        if (c.high >= tpPrice) tpHit = true;
      } else {
        if (c.high >= slPrice) slHit = true;
        if (c.low <= tpPrice) tpHit = true;
      }
    }

    if (!slHit && !tpHit) {
      const diffExitToTP = Math.abs(exitPrice - tpPrice);
      const diffExitToSL = Math.abs(exitPrice - slPrice);
      const mfe = isLong ? maxHigh - entryPrice : entryPrice - minLow;
      const targetDist = Math.abs(tpPrice - entryPrice);
      const gapToTP = targetDist - mfe;

      neitherTrades.push({
        tradeIndex: i + 1,
        side: t.side,
        entryPrice,
        exitPrice,
        slPrice,
        tpPrice,
        brokerResult,
        brokerNetProfit: t.netProfit,
        maxHigh,
        minLow,
        gapToTP,
        diffExitToTP,
        diffExitToSL,
        durationSeconds: Math.round((exitTime.getTime() - entryTime.getTime()) / 1000),
      });
    }
  }

  console.log(`Total Neither Touched trades: ${neitherTrades.length}`);
  const neitherBrokerWins = neitherTrades.filter(t => t.brokerResult === 'WIN').length;
  const neitherBrokerLosses = neitherTrades.length - neitherBrokerWins;
  console.log(`  Broker WINs: ${neitherBrokerWins} (${((neitherBrokerWins/neitherTrades.length)*100).toFixed(1)}%)`);
  console.log(`  Broker LOSSes: ${neitherBrokerLosses} (${((neitherBrokerLosses/neitherTrades.length)*100).toFixed(1)}%)`);

  // Sample 15 of these
  console.log('\nSample 15 Neither Touched trades:');
  neitherTrades.slice(0, 15).forEach(t => {
    console.log(`Trade #${t.tradeIndex} (${t.side}): Entry=${t.entryPrice}, Exit=${t.exitPrice}, SL=${t.slPrice}, TP=${t.tpPrice} | Broker=${t.brokerResult} ($${t.brokerNetProfit}) | MaxHigh=${t.maxHigh}, MinLow=${t.minLow} | GapToTP=${t.gapToTP.toFixed(2)} | DiffExitToTP=${t.diffExitToTP.toFixed(2)} | Dur=${t.durationSeconds}s`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
