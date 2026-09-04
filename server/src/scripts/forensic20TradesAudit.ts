import fs from 'fs';
import { prisma } from '../prisma';
import { parseMt5XlsxReport } from '../utils/mt5ReportParser';
import { getBarOpenTime, runRRSimulation, OHLCCandle } from '../services/replayEngineCore';

async function main() {
  const filePath = '/home/vallencia/Documents/ReportTester-1119809.xlsx';
  const buffer = fs.readFileSync(filePath);
  const parsed = parseMt5XlsxReport(buffer);

  // Map deals to orders and find comments
  const orders = parsed.orders;
  const deals = parsed.deals;
  const trades = parsed.trades;

  const orderMap = new Map<string, typeof orders[0]>();
  orders.forEach(o => {
    if (o.orderId) {
      orderMap.set(String(o.orderId).trim(), o);
    }
  });

  const dealMap = new Map<string, typeof deals[0]>();
  deals.forEach(d => {
    if (d.dealId) {
      dealMap.set(String(d.dealId).trim(), d);
    }
  });

  // Fetch candles for the first 20 trades
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

  console.log('================================================================================================================================================================');
  console.log('FORENSIC AUDIT OF THE FIRST 20 COMPLETED TRADES: MT5 SOURCE VS DUKASCOPY M1 REPLAY');
  console.log('================================================================================================================================================================');

  interface AuditRow {
    tradeIndex: number;
    orderId: string;
    entryDealId: string;
    exitDealId: string;
    side: 'BUY' | 'SELL';
    entryTime: string;
    entryPrice: number;
    slPrice: number;
    tpPrice: number;
    actualRR: number;
    exitTime: string;
    exitPrice: number;
    brokerResult: 'WIN' | 'LOSS';
    exitComment: string;
    replayFirstTouch: 'TP' | 'SL' | 'INTRABAR_AMBIGUOUS' | 'NEITHER';
    replayResult: 'WIN' | 'LOSS' | 'AMBIGUOUS' | 'NEITHER';
    match: boolean;
    reason: string;
  }

  const rows: AuditRow[] = [];

  for (let i = 0; i < 20; i++) {
    const t = trades[i];
    const isLong = t.side === 'LONG' || t.side === 'BUY';
    const sideLabel: 'BUY' | 'SELL' = isLong ? 'BUY' : 'SELL';

    const entryDeal = t.entryDealId ? dealMap.get(String(t.entryDealId)) : undefined;
    const exitDeal = t.exitDealId ? dealMap.get(String(t.exitDealId)) : undefined;

    const openingOrderId = entryDeal?.orderId || t.orderId || '-';
    const openingOrder = openingOrderId !== '-' ? orderMap.get(String(openingOrderId)) : undefined;

    const entryPrice = t.entryPrice!;
    const exitPrice = t.exitPrice!;
    const slPrice = t.slPrice!;
    const tpPrice = t.tpPrice!;
    const entryTime = t.entryTime!;
    const exitTime = t.exitTime!;
    const brokerResult: 'WIN' | 'LOSS' = t.netProfit > 0 ? 'WIN' : 'LOSS';
    const exitComment = exitDeal?.comment || openingOrder?.comment || '-';

    const risk = isLong ? entryPrice - slPrice : slPrice - entryPrice;
    const reward = isLong ? tpPrice - entryPrice : entryPrice - tpPrice;
    const actualRR = (risk > 0 && reward > 0) ? reward / risk : 0;

    // Slice candles for this trade
    const startBar = getBarOpenTime(entryTime, 'M1').getTime();
    const endBar = exitTime.getTime();

    const tradeCandles: OHLCCandle[] = [];
    for (let cur = startBar; cur <= endBar; cur += 60000) {
      const c = candleMap.get(cur);
      if (c) tradeCandles.push({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close });
    }

    let firstTouch: 'TP' | 'SL' | 'INTRABAR_AMBIGUOUS' | 'NEITHER' = 'NEITHER';
    let maxHigh = entryPrice;
    let minLow = entryPrice;

    for (const c of tradeCandles) {
      if (c.high > maxHigh) maxHigh = c.high;
      if (c.low < minLow) minLow = c.low;

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

    let replayResult: 'WIN' | 'LOSS' | 'AMBIGUOUS' | 'NEITHER';
    if (firstTouch === 'TP') replayResult = 'WIN';
    else if (firstTouch === 'SL') replayResult = 'LOSS';
    else if (firstTouch === 'INTRABAR_AMBIGUOUS') replayResult = 'AMBIGUOUS';
    else replayResult = 'NEITHER';

    let match = false;
    let reason = 'Exact physical match';

    if (replayResult === brokerResult) {
      match = true;
    } else {
      if (replayResult === 'NEITHER') {
        const gapToTP = isLong ? tpPrice - maxHigh : minLow - tpPrice;
        const gapToSL = isLong ? minLow - slPrice : slPrice - maxHigh;
        if (brokerResult === 'WIN') {
          reason = `TP missed on Dukascopy Bid by $${gapToTP.toFixed(2)} (within ECN spread)`;
        } else {
          reason = `SL missed on Dukascopy Bid by $${gapToSL.toFixed(2)} (within ECN ask spread)`;
        }
      } else if (replayResult === 'AMBIGUOUS') {
        reason = 'Intrabar ambiguous: both SL and TP breached in same M1 bar';
      } else {
        reason = `Replay ${replayResult} vs Broker ${brokerResult}`;
      }
    }

    rows.push({
      tradeIndex: i + 1,
      orderId: openingOrderId,
      entryDealId: t.entryDealId || '-',
      exitDealId: t.exitDealId || '-',
      side: sideLabel,
      entryTime: entryTime.toISOString().slice(0, 19).replace('T', ' '),
      entryPrice,
      slPrice,
      tpPrice,
      actualRR,
      exitTime: exitTime.toISOString().slice(0, 19).replace('T', ' '),
      exitPrice,
      brokerResult,
      exitComment,
      replayFirstTouch: firstTouch,
      replayResult,
      match,
      reason,
    });
  }

  // Print Table
  console.log(
    'Trd#'.padEnd(5) + '| ' +
    'Side'.padEnd(5) + '| ' +
    'Entry Price'.padEnd(12) + '| ' +
    'SL Price'.padEnd(9) + '| ' +
    'TP Price'.padEnd(9) + '| ' +
    'Act RR'.padEnd(7) + '| ' +
    'Broker Exit'.padEnd(12) + '| ' +
    'Bk Res'.padEnd(7) + '| ' +
    '1st Touch'.padEnd(10) + '| ' +
    'Replay Res'.padEnd(11) + '| ' +
    'Match?'.padEnd(7) + '| ' +
    'Reason / Exit Comment'
  );
  console.log('-'.repeat(160));

  for (const r of rows) {
    console.log(
      `#${String(r.tradeIndex).padEnd(4)}| ` +
      `${r.side.padEnd(5)}| ` +
      `${r.entryPrice.toFixed(2).padEnd(12)}| ` +
      `${r.slPrice.toFixed(2).padEnd(9)}| ` +
      `${r.tpPrice.toFixed(2).padEnd(9)}| ` +
      `${r.actualRR.toFixed(3).padEnd(7)}| ` +
      `${r.exitPrice.toFixed(2).padEnd(12)}| ` +
      `${r.brokerResult.padEnd(7)}| ` +
      `${r.replayFirstTouch.padEnd(10)}| ` +
      `${r.replayResult.padEnd(11)}| ` +
      `${(r.match ? 'MATCH' : 'MISMATCH').padEnd(7)}| ` +
      `${r.reason} [Comment: "${r.exitComment}"]`
    );
  }

  // Summary Metrics for the 20 Trades
  const total = rows.length;
  const exactMatches = rows.filter(r => r.match).length;
  const mismatches = total - exactMatches;
  const ambiguousCases = rows.filter(r => r.replayFirstTouch === 'INTRABAR_AMBIGUOUS').length;
  const neitherCases = rows.filter(r => r.replayFirstTouch === 'NEITHER').length;

  const brokerWins = rows.filter(r => r.brokerResult === 'WIN').length;
  const brokerLosses = total - brokerWins;
  const brokerWR = (brokerWins / total) * 100;

  const replayWins = rows.filter(r => r.replayResult === 'WIN').length;
  const replayLosses = rows.filter(r => r.replayResult === 'LOSS').length;
  const replayWR_Strict = (replayWins / total) * 100;
  const wrDiff = Math.abs(brokerWR - replayWR_Strict);

  console.log('\n================================================================');
  console.log('METRICS SUMMARY FOR THE FIRST 20 TRADES:');
  console.log('================================================================');
  console.log(`Total Trades Analyzed:          ${total}`);
  console.log(`Exact Broker/Replay Matches:    ${exactMatches} (${((exactMatches / total) * 100).toFixed(1)}%)`);
  console.log(`Mismatches:                     ${mismatches} (${((mismatches / total) * 100).toFixed(1)}%)`);
  console.log(`Ambiguous Cases:                ${ambiguousCases} (${((ambiguousCases / total) * 100).toFixed(1)}%)`);
  console.log(`Neither-Hit Cases:              ${neitherCases} (${((neitherCases / total) * 100).toFixed(1)}%)`);
  console.log(`Broker Win Rate (20 Trades):    ${brokerWins} / ${total} = ${brokerWR.toFixed(1)}%`);
  console.log(`Replay Win Rate (Strict M1):    ${replayWins} / ${total} = ${replayWR_Strict.toFixed(1)}%`);
  console.log(`Win Rate Difference:            ${wrDiff.toFixed(1)} percentage points`);

  await prisma.$disconnect();
}

main().catch(console.error);
