import fs from 'fs';
import { prisma } from '../prisma';
import { parseMt5XlsxReport } from '../utils/mt5ReportParser';
import { getBarOpenTime, priceToMicro, microToPrice } from '../services/replayEngineCore';

async function main() {
  const filePath = '/home/vallencia/Documents/ReportTester-1119809.xlsx';
  const buffer = fs.readFileSync(filePath);
  const parsed = parseMt5XlsxReport(buffer);

  console.log('================================================================');
  console.log('COMPREHENSIVE FORENSIC AUDIT: 709 TRADES (DUKASCOPY M1)');
  console.log('================================================================');

  const trades = parsed.trades;
  console.log(`Total trades in report: ${trades.length}`);

  // Fetch all candles covering the whole range
  const firstEntry = trades[0].entryTime!;
  const lastExit = trades[trades.length - 1].exitTime!;

  console.log(`Date Range: ${firstEntry.toISOString()} to ${lastExit.toISOString()}`);

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

  console.log(`Loaded ${candles.length} Dukascopy M1 candles.`);

  // Create an efficient lookup structure for candles
  const candleMap = new Map<number, typeof candles[0]>();
  candles.forEach(c => candleMap.set(c.time.getTime(), c));

  interface TradeAuditResult {
    tradeIndex: number;
    side: string;
    entryTime: string;
    exitTime: string;
    entryPrice: number;
    exitPrice: number;
    slPrice: number;
    tpPrice: number;
    actualRR: number;
    brokerResult: 'WIN' | 'LOSS';
    brokerNetProfit: number;
    candleCount: number;
    firstSLTouchTime: string | null;
    firstTPTouchTime: string | null;
    firstTouch: 'TP' | 'SL' | 'INTRABAR_AMBIGUOUS' | 'NEITHER';
    replayResult: 'WIN' | 'LOSS' | 'AMBIGUOUS' | 'EXIT_AT_MARKET';
    match: boolean;
    mfePrice: number;
    maePrice: number;
    mfeDistance: number;
    maeDistance: number;
    maxPotentialRR: number;
    discrepancyCategory?: string;
  }

  const auditResults: TradeAuditResult[] = [];

  let exactMatches = 0;
  let intrabarAmbiguousCount = 0;
  let ambiguousBrokerWin = 0;
  let ambiguousBrokerLoss = 0;
  let earlySlDukascopy = 0; // Dukascopy hit SL while broker won
  let missedTpDukascopy = 0; // Dukascopy didn't reach TP while broker won
  let prematureLossBroker = 0; // Broker took loss before Dukascopy SL
  let missingCandlesCount = 0;

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

    // Align timestamps
    const startBar = getBarOpenTime(entryTime, 'M1').getTime();
    const endBar = exitTime.getTime();

    // Collect candles for this trade window
    const tradeCandles: typeof candles = [];
    for (let cur = startBar; cur <= endBar; cur += 60000) {
      const c = candleMap.get(cur);
      if (c) tradeCandles.push(c);
    }

    if (tradeCandles.length === 0) {
      missingCandlesCount++;
      auditResults.push({
        tradeIndex: i + 1,
        side: t.side,
        entryTime: entryTime.toISOString(),
        exitTime: exitTime.toISOString(),
        entryPrice,
        exitPrice,
        slPrice,
        tpPrice,
        actualRR,
        brokerResult,
        brokerNetProfit: t.netProfit,
        candleCount: 0,
        firstSLTouchTime: null,
        firstTPTouchTime: null,
        firstTouch: 'NEITHER',
        replayResult: 'EXIT_AT_MARKET',
        match: false,
        mfePrice: entryPrice,
        maePrice: entryPrice,
        mfeDistance: 0,
        maeDistance: 0,
        maxPotentialRR: 0,
        discrepancyCategory: 'MISSING_CANDLES',
      });
      continue;
    }

    let firstSLTouchTime: string | null = null;
    let firstTPTouchTime: string | null = null;
    let firstTouch: 'TP' | 'SL' | 'INTRABAR_AMBIGUOUS' | 'NEITHER' = 'NEITHER';

    let mfePrice = entryPrice;
    let maePrice = entryPrice;
    let slHitBeforeTP = false;
    let tpHitBeforeSL = false;
    let bothInSameBar = false;

    for (const c of tradeCandles) {
      const cTimeStr = c.time.toISOString();
      let barSlHit = false;
      let barTpHit = false;

      if (isLong) {
        if (c.low <= maePrice) maePrice = c.low;
        if (c.high >= mfePrice) mfePrice = c.high;

        if (c.low <= slPrice) barSlHit = true;
        if (c.high >= tpPrice) barTpHit = true;
      } else {
        if (c.high >= maePrice) maePrice = c.high;
        if (c.low <= mfePrice) mfePrice = c.low;

        if (c.high >= slPrice) barSlHit = true;
        if (c.low <= tpPrice) barTpHit = true;
      }

      if (barSlHit && !firstSLTouchTime) firstSLTouchTime = cTimeStr;
      if (barTpHit && !firstTPTouchTime) firstTPTouchTime = cTimeStr;

      if (firstTouch === 'NEITHER') {
        if (barSlHit && barTpHit) {
          firstTouch = 'INTRABAR_AMBIGUOUS';
          bothInSameBar = true;
          break;
        } else if (barTpHit) {
          firstTouch = 'TP';
          tpHitBeforeSL = true;
          break;
        } else if (barSlHit) {
          firstTouch = 'SL';
          slHitBeforeTP = true;
          break;
        }
      }
    }

    const mfeDistance = isLong ? Math.max(0, mfePrice - entryPrice) : Math.max(0, entryPrice - mfePrice);
    const maeDistance = isLong ? Math.max(0, entryPrice - maePrice) : Math.max(0, maePrice - entryPrice);
    const maxPotentialRR = risk > 0 ? mfeDistance / risk : 0;

    let replayResult: 'WIN' | 'LOSS' | 'AMBIGUOUS' | 'EXIT_AT_MARKET';
    if (firstTouch === 'TP') replayResult = 'WIN';
    else if (firstTouch === 'SL') replayResult = 'LOSS';
    else if (firstTouch === 'INTRABAR_AMBIGUOUS') replayResult = 'AMBIGUOUS';
    else replayResult = 'EXIT_AT_MARKET';

    let match = false;
    let discrepancyCategory = 'MATCH';

    if (replayResult === brokerResult) {
      match = true;
      exactMatches++;
    } else {
      if (firstTouch === 'INTRABAR_AMBIGUOUS') {
        intrabarAmbiguousCount++;
        if (brokerResult === 'WIN') ambiguousBrokerWin++;
        else ambiguousBrokerLoss++;
        discrepancyCategory = 'INTRABAR_AMBIGUOUS';
      } else if (brokerResult === 'WIN' && replayResult === 'LOSS') {
        earlySlDukascopy++;
        discrepancyCategory = 'DUKASCOPY_SL_BEFORE_TP';
      } else if (brokerResult === 'WIN' && replayResult === 'EXIT_AT_MARKET') {
        missedTpDukascopy++;
        discrepancyCategory = 'DUKASCOPY_TP_NOT_REACHED';
      } else if (brokerResult === 'LOSS' && replayResult === 'WIN') {
        prematureLossBroker++;
        discrepancyCategory = 'BROKER_EARLY_EXIT_OR_SLIPPAGE';
      } else {
        discrepancyCategory = 'OTHER_DISCREPANCY';
      }
    }

    auditResults.push({
      tradeIndex: i + 1,
      side: t.side,
      entryTime: entryTime.toISOString(),
      exitTime: exitTime.toISOString(),
      entryPrice,
      exitPrice,
      slPrice,
      tpPrice,
      actualRR,
      brokerResult,
      brokerNetProfit: t.netProfit,
      candleCount: tradeCandles.length,
      firstSLTouchTime,
      firstTPTouchTime,
      firstTouch,
      replayResult,
      match,
      mfePrice,
      maePrice,
      mfeDistance,
      maeDistance,
      maxPotentialRR,
      discrepancyCategory,
    });
  }

  // Summary statistics
  const total = auditResults.length;
  const brokerWins = auditResults.filter(r => r.brokerResult === 'WIN').length;
  const brokerLosses = total - brokerWins;
  const brokerWR = (brokerWins / total) * 100;

  const replayWins = auditResults.filter(r => r.replayResult === 'WIN').length;
  const replayLosses = auditResults.filter(r => r.replayResult === 'LOSS').length;
  const replayAmbiguous = auditResults.filter(r => r.replayResult === 'AMBIGUOUS').length;
  const replayExitMarket = auditResults.filter(r => r.replayResult === 'EXIT_AT_MARKET').length;

  const nonAmbiguousReplays = replayWins + replayLosses;
  const replayWR_Strict = (replayWins / total) * 100;
  const replayWR_ExclAmbiguous = nonAmbiguousReplays > 0 ? (replayWins / nonAmbiguousReplays) * 100 : 0;
  // If ambiguous resolved favorably (like broker):
  const replayWR_Optimistic = ((replayWins + ambiguousBrokerWin) / total) * 100;

  console.log('\n================================================================');
  console.log('AUDIT REPORT SUMMARY:');
  console.log('================================================================');
  console.log(`GROUND TRUTH:`);
  console.log(`  Total Trades:           ${total}`);
  console.log(`  Broker Realized Wins:   ${brokerWins} (${brokerWR.toFixed(2)}%)`);
  console.log(`  Broker Realized Losses: ${brokerLosses} (${(100 - brokerWR).toFixed(2)}%)`);

  console.log(`\nREPLAY (Sequential Bar-by-Bar on Dukascopy M1):`);
  console.log(`  Replay Wins (TP touched first):     ${replayWins} (${replayWR_Strict.toFixed(2)}%)`);
  console.log(`  Replay Losses (SL touched first):   ${replayLosses} (${((replayLosses / total) * 100).toFixed(2)}%)`);
  console.log(`  Intrabar Ambiguous (Both in 1 bar): ${replayAmbiguous} (${((replayAmbiguous / total) * 100).toFixed(2)}%)`);
  console.log(`    - of which Broker WON:            ${ambiguousBrokerWin}`);
  console.log(`    - of which Broker LOST:           ${ambiguousBrokerLoss}`);
  console.log(`  Neither Touched (Exit at Market):   ${replayExitMarket} (${((replayExitMarket / total) * 100).toFixed(2)}%)`);

  console.log(`\nDIFFERENCE & BREAKDOWN:`);
  console.log(`  Broker WR:                          ${brokerWR.toFixed(2)}%`);
  console.log(`  Strict Replay WR:                   ${replayWR_Strict.toFixed(2)}%`);
  console.log(`  Gap (Percentage Points):            ${Math.abs(brokerWR - replayWR_Strict).toFixed(2)}%`);
  console.log(`  Trade-by-Trade Agreement:           ${exactMatches} / ${total} (${((exactMatches / total) * 100).toFixed(2)}%)`);
  console.log(`  Intrabar Ambiguity Cases:           ${intrabarAmbiguousCount} (${((intrabarAmbiguousCount / total) * 100).toFixed(2)}%)`);
  console.log(`  Dukascopy Wick touched SL before TP:${earlySlDukascopy}`);
  console.log(`  Broker closed early / slippage:     ${prematureLossBroker}`);
  console.log(`  Missing Candle Windows:             ${missingCandlesCount}`);

  // Table of first 20 trades
  console.log('\n========================================================================================================================');
  console.log('AUDIT TABLE: FIRST 20 TRADES DETAILED AUDIT');
  console.log('========================================================================================================================');

  console.log(
    'Trade'.padEnd(6) + '| ' +
    'Side'.padEnd(5) + '| ' +
    'Entry'.padEnd(8) + '| ' +
    'SL'.padEnd(8) + '| ' +
    'TP'.padEnd(8) + '| ' +
    'Broker Res'.padEnd(11) + '| ' +
    'Replay Res'.padEnd(11) + '| ' +
    'First Touch'.padEnd(12) + '| ' +
    'First SL Touch'.padEnd(21) + '| ' +
    'First TP Touch'.padEnd(21) + '| ' +
    'Match?'.padEnd(7) + '| ' +
    'Category'
  );
  console.log('-'.repeat(140));

  for (let i = 0; i < 20; i++) {
    const r = auditResults[i];
    console.log(
      `#${String(r.tradeIndex).padEnd(5)}| ` +
      `${r.side.padEnd(5)}| ` +
      `${r.entryPrice.toFixed(2).padEnd(8)}| ` +
      `${r.slPrice.toFixed(2).padEnd(8)}| ` +
      `${r.tpPrice.toFixed(2).padEnd(8)}| ` +
      `${r.brokerResult.padEnd(11)}| ` +
      `${r.replayResult.padEnd(11)}| ` +
      `${r.firstTouch.padEnd(12)}| ` +
      `${(r.firstSLTouchTime ? r.firstSLTouchTime.slice(11, 19) : '-').padEnd(21)}| ` +
      `${(r.firstTPTouchTime ? r.firstTPTouchTime.slice(11, 19) : '-').padEnd(21)}| ` +
      `${(r.match ? 'YES' : 'NO').padEnd(7)}| ` +
      `${r.discrepancyCategory}`
    );
  }

  await prisma.$disconnect();
}

main().catch(console.error);
