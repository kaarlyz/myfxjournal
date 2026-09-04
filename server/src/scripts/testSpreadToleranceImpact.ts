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

  console.log('Testing Replay WR vs Spread / Tolerance on Gold (XAUUSD):');
  console.log('-----------------------------------------------------------------------------');
  console.log('Tolerance (Spread buffer) | Replay Wins | Replay Losses | Replay WR | Agreement vs Broker');
  console.log('-----------------------------------------------------------------------------');

  const tolerances = [0.0, 0.10, 0.15, 0.20, 0.25, 0.30];

  for (const tol of tolerances) {
    let wins = 0;
    let losses = 0;
    let agreements = 0;

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

      // Effective target levels with tolerance:
      // For LONG: TP can be reached at tpPrice - tol (due to broker bid spike), SL at slPrice + tol
      // For SHORT: TP can be reached at tpPrice + tol, SL at slPrice - tol (due to ask spread)
      let firstTouch: 'TP' | 'SL' | 'NEITHER' = 'NEITHER';

      for (let cur = startBar; cur <= endBar; cur += 60000) {
        const c = candleMap.get(cur);
        if (!c) continue;

        let barSlHit = false;
        let barTpHit = false;

        if (isLong) {
          if (c.low <= slPrice) barSlHit = true;
          if (c.high >= (tpPrice - tol)) barTpHit = true;
        } else {
          // For SHORT, ask price reaches SL when Bid >= slPrice - spread
          if (c.high >= (slPrice - tol)) barSlHit = true;
          if (c.low <= (tpPrice + tol)) barTpHit = true;
        }

        if (barTpHit && !barSlHit) { firstTouch = 'TP'; break; }
        if (barSlHit && !barTpHit) { firstTouch = 'SL'; break; }
        if (barSlHit && barTpHit) {
          // If both in 1 bar, check broker exit
          firstTouch = brokerResult === 'WIN' ? 'TP' : 'SL';
          break;
        }
      }

      const simResult = firstTouch === 'TP' ? 'WIN' : (firstTouch === 'SL' ? 'LOSS' : (brokerResult)); // if neither, default to broker exit
      if (firstTouch === 'TP') wins++;
      else if (firstTouch === 'SL') losses++;
      else {
        if (brokerResult === 'WIN') wins++;
        else losses++;
      }

      if (simResult === brokerResult) agreements++;
    }

    const wr = (wins / trades.length) * 100;
    const agr = (agreements / trades.length) * 100;
    console.log(`Tol = $${tol.toFixed(2)}                  | ${wins.toString().padEnd(11)} | ${losses.toString().padEnd(13)} | ${wr.toFixed(2)}%   | ${agreements}/${trades.length} (${agr.toFixed(1)}%)`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
