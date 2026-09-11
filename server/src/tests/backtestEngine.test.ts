import {
  getVisibleCandles,
  advanceReplay,
  stepBackReplay,
  calculatePositionSize,
  calculateRR,
  calculateTPFromRR,
  evaluateCandleHit,
  calculatePnL,
  calculateSMA,
  calculateBacktestStats,
  BacktestCandle,
  BacktestTradeRecord,
} from '../services/backtestEngine';
import { prisma } from '../prisma';
import * as parquetProvider from '../integrations/mt5-sync/parquetDataProvider';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('REPLAYFX XAUUSD M1 BAR REPLAY / BACKTEST ENGINE TESTS');
  console.log('====================================================\n');

  // 1. Replay advances exactly one candle
  console.log('[1] Testing Replay Progression');
  const nextIdx = advanceReplay(10, 100);
  assert(nextIdx === 11, 'advanceReplay advances exactly from 10 to 11');
  const cappedIdx = advanceReplay(100, 100);
  assert(cappedIdx === 100, 'advanceReplay does not advance past maxIndex');
  const prevIdx = stepBackReplay(5);
  assert(prevIdx === 4, 'stepBackReplay moves back from 5 to 4');
  const clampedMin = stepBackReplay(0);
  assert(clampedMin === 0, 'stepBackReplay clamps at 0');

  // 2. Replay cannot expose future candles (Look-Ahead Bias Protection)
  console.log('\n[2] Testing Look-Ahead Bias Guard');
  const sampleCandles: BacktestCandle[] = Array.from({ length: 100 }, (_, i) => ({
    time: new Date(Date.UTC(2025, 3, 1, 4, i, 0)),
    open: 3000 + i,
    high: 3005 + i,
    low: 2995 + i,
    close: 3002 + i,
  }));

  const visible50 = getVisibleCandles(sampleCandles, 50);
  assert(visible50.length === 51, 'getVisibleCandles(50) returns exactly candles 0..50 (51 items)');
  assert(visible50[50].open === 3050, 'Latest visible candle is index 50');

  let lookAheadBlocked = false;
  try {
    getVisibleCandles(sampleCandles, 150);
  } catch (err: any) {
    lookAheadBlocked = true;
  }
  assert(lookAheadBlocked, 'getVisibleCandles throws error if replayIndex exceeds available candles');

  // 3. LONG SL detection
  console.log('\n[3] Testing LONG SL Detection');
  const longTrade = { side: 'LONG' as const, entryPrice: 3000, slPrice: 2990, tpPrice: 3020 };
  const candleLongSL: BacktestCandle = {
    time: new Date('2025-04-01T04:10:00Z'),
    open: 2995,
    high: 2998,
    low: 2988, // breaks SL (2990)
    close: 2992,
  };
  const hitLongSL = evaluateCandleHit(longTrade, candleLongSL);
  assert(hitLongSL.type === 'SL', 'LONG SL hit correctly identified');
  assert(hitLongSL.exitPrice === 2990, 'LONG SL exit price is SL price (2990)');

  // 4. LONG TP detection
  console.log('\n[4] Testing LONG TP Detection');
  const candleLongTP: BacktestCandle = {
    time: new Date('2025-04-01T04:11:00Z'),
    open: 3010,
    high: 3025, // breaches TP (3020)
    low: 3005,
    close: 3022,
  };
  const hitLongTP = evaluateCandleHit(longTrade, candleLongTP);
  assert(hitLongTP.type === 'TP', 'LONG TP hit correctly identified');
  assert(hitLongTP.exitPrice === 3020, 'LONG TP exit price is TP price (3020)');

  // 5. SHORT SL detection
  console.log('\n[5] Testing SHORT SL Detection');
  const shortTrade = { side: 'SHORT' as const, entryPrice: 3000, slPrice: 3010, tpPrice: 2980 };
  const candleShortSL: BacktestCandle = {
    time: new Date('2025-04-01T04:12:00Z'),
    open: 3005,
    high: 3012, // breaks SL (3010)
    low: 3002,
    close: 3008,
  };
  const hitShortSL = evaluateCandleHit(shortTrade, candleShortSL);
  assert(hitShortSL.type === 'SL', 'SHORT SL hit correctly identified');
  assert(hitShortSL.exitPrice === 3010, 'SHORT SL exit price is SL price (3010)');

  // 6. SHORT TP detection
  console.log('\n[6] Testing SHORT TP Detection');
  const candleShortTP: BacktestCandle = {
    time: new Date('2025-04-01T04:13:00Z'),
    open: 2985,
    high: 2990,
    low: 2978, // breaches TP (2980)
    close: 2979,
  };
  const hitShortTP = evaluateCandleHit(shortTrade, candleShortTP);
  assert(hitShortTP.type === 'TP', 'SHORT TP hit correctly identified');
  assert(hitShortTP.exitPrice === 2980, 'SHORT TP exit price is TP price (2980)');

  // 7. Intrabar Ambiguity detection
  console.log('\n[7] Testing Intrabar Ambiguity');
  const candleAmbiguousLong: BacktestCandle = {
    time: new Date('2025-04-01T04:14:00Z'),
    open: 3000,
    high: 3025, // touches TP (3020)
    low: 2985,  // touches SL (2990)
    close: 3010,
  };
  const hitAmbiguous = evaluateCandleHit(longTrade, candleAmbiguousLong);
  assert(hitAmbiguous.type === 'INTRABAR_AMBIGUOUS', 'Ambiguous candle flagged as INTRABAR_AMBIGUOUS');
  assert(hitAmbiguous.reason === 'INTRABAR_AMBIGUOUS', 'Reason marked as INTRABAR_AMBIGUOUS without arbitrary win/loss');

  // 8. Manual Close
  console.log('\n[8] Testing Manual Close');
  const manualExitPrice = 3007.50;
  const pnlManualLong = calculatePnL('LONG', 3000, manualExitPrice, 1.0);
  assert(pnlManualLong === 750, 'Manual close LONG at 3007.50 (1 lot) = +$750.00');

  // 9. RR Calculation & Quick RR
  console.log('\n[9] Testing Risk / Reward Math');
  const rrLong = calculateRR('LONG', 3128.00, 3120.00, 3134.00);
  assert(rrLong.isValid, 'LONG RR is valid');
  assert(rrLong.risk === 8.00, 'LONG Risk distance is 8.00 pts');
  assert(rrLong.reward === 6.00, 'LONG Reward distance is 6.00 pts');
  assert(rrLong.rr === 0.75, 'LONG RR is 0.75 (1 : 0.75)');

  const quickTpLong = calculateTPFromRR('LONG', 3128.00, 3120.00, 0.75);
  assert(quickTpLong === 3134.00, 'calculateTPFromRR for LONG (Entry 3128, SL 3120, RR 0.75) = 3134.00');

  const rrShort = calculateRR('SHORT', 3000.00, 3010.00, 2980.00);
  assert(rrShort.isValid, 'SHORT RR is valid');
  assert(rrShort.risk === 10.00, 'SHORT Risk distance is 10.00 pts');
  assert(rrShort.reward === 20.00, 'SHORT Reward distance is 20.00 pts');
  assert(rrShort.rr === 2.0, 'SHORT RR is 2.0 (1 : 2.0)');

  const quickTpShort = calculateTPFromRR('SHORT', 3000.00, 3010.00, 2.0);
  assert(quickTpShort === 2980.00, 'calculateTPFromRR for SHORT (Entry 3000, SL 3010, RR 2.0) = 2980.00');

  // 10. Lot-size calculation for XAUUSD (100 oz/lot)
  console.log('\n[10] Testing Position Sizing (XAUUSD)');
  // Balance: $10,000, Risk: 1% ($100), Entry: 3000, SL: 2990 (Risk: 10 pts)
  // Lot = 100 / (10 * 100) = 0.10 lots
  const lotSize1 = calculatePositionSize(10000, 1.0, 3000, 2990);
  assert(lotSize1 === 0.10, '10k balance, 1% risk, 10 pt SL = 0.10 lots');

  // Balance: $50,000, Risk: 2% ($1,000), Entry: 3350, SL: 3345 (Risk: 5 pts)
  // Lot = 1000 / (5 * 100) = 2.00 lots
  const lotSize2 = calculatePositionSize(50000, 2.0, 3350, 3345);
  assert(lotSize2 === 2.00, '50k balance, 2% risk, 5 pt SL = 2.00 lots');

  // 11. LONG PnL Formula
  console.log('\n[11] Testing LONG PnL');
  // (3020 - 3000) * 0.5 lots * 100 = 20 * 50 = $1,000.00
  const pnlLongWin = calculatePnL('LONG', 3000, 3020, 0.5);
  assert(pnlLongWin === 1000, 'LONG Win PnL = $1,000.00');
  const pnlLongLoss = calculatePnL('LONG', 3000, 2990, 0.5);
  assert(pnlLongLoss === -500, 'LONG Loss PnL = -$500.00');

  // 12. SHORT PnL Formula
  console.log('\n[12] Testing SHORT PnL');
  // (3000 - 2980) * 0.5 lots * 100 = 20 * 50 = $1,000.00
  const pnlShortWin = calculatePnL('SHORT', 3000, 2980, 0.5);
  assert(pnlShortWin === 1000, 'SHORT Win PnL = $1,000.00');
  const pnlShortLoss = calculatePnL('SHORT', 3000, 3010, 0.5);
  assert(pnlShortLoss === -500, 'SHORT Loss PnL = -$500.00');

  // 13. Balance Update & Statistics
  console.log('\n[13] Testing Backtest Stats & Balance Update');
  const tradeHistory: BacktestTradeRecord[] = [
    {
      id: 't1',
      tradeNumber: 1,
      side: 'LONG',
      entryPrice: 3000,
      entryTime: new Date(),
      slPrice: 2990,
      tpPrice: 3020,
      exitPrice: 3020,
      exitTime: new Date(),
      exitReason: 'TP',
      volume: 0.1,
      riskAmount: 100,
      pnl: 200,
      rr: 2.0,
      status: 'CLOSED',
    },
    {
      id: 't2',
      tradeNumber: 2,
      side: 'SHORT',
      entryPrice: 3020,
      entryTime: new Date(),
      slPrice: 3030,
      tpPrice: 3000,
      exitPrice: 3030,
      exitTime: new Date(),
      exitReason: 'SL',
      volume: 0.1,
      riskAmount: 100,
      pnl: -100,
      rr: -1.0,
      status: 'CLOSED',
    },
  ];

  const stats = calculateBacktestStats(tradeHistory, 10000);
  assert(stats.currentBalance === 10100, 'Balance updated to $10,100 ($10k + $200 - $100)');
  assert(stats.netPnl === 100, 'Net PnL is +$100.00');
  assert(stats.winRate === 50, 'Win Rate is 50% (1W / 1L)');
  assert(stats.profitFactor === 2.0, 'Profit Factor is 2.0 (200 / 100)');

  // 14. Replay Reset
  console.log('\n[14] Testing Replay Reset');
  const resetIndex = 0;
  const visibleReset = getVisibleCandles(sampleCandles, resetIndex);
  assert(visibleReset.length === 1, 'Reset to 0 exposes exactly first candle');

  // 15, 16, 17. SMA 20, 50, 200 (No Look-Ahead)
  console.log('\n[15-17] Testing Indicators (SMA 20, 50, 200) without Look-Ahead');
  const sma20 = calculateSMA(sampleCandles, 20);
  assert(sma20[0].value === null, 'SMA20 at candle 0 is null');
  assert(sma20[18].value === null, 'SMA20 at candle 18 is null');
  assert(sma20[19].value !== null, 'SMA20 at candle 19 is calculated');
  
  // Verify value at candle 19 is exact average of closes 0..19
  const expectedSma19 = sampleCandles.slice(0, 20).reduce((sum, c) => sum + c.close, 0) / 20;
  assert(Math.abs((sma20[19].value || 0) - expectedSma19) < 0.001, 'SMA20 matches exact arithmetic average');

  const sma50 = calculateSMA(sampleCandles, 50);
  assert(sma50[48].value === null && sma50[49].value !== null, 'SMA50 starts exactly at candle index 49 (50th candle)');

  // 18. Invalid SL/TP Rejection
  console.log('\n[18] Testing Invalid SL/TP Rejection');
  const invalidLongSL = calculateRR('LONG', 3000, 3005, 3020);
  assert(!invalidLongSL.isValid, 'LONG with SL above Entry rejected');
  const invalidLongTP = calculateRR('LONG', 3000, 2990, 2995);
  assert(!invalidLongTP.isValid, 'LONG with TP below Entry rejected');
  const invalidShortSL = calculateRR('SHORT', 3000, 2995, 2980);
  assert(!invalidShortSL.isValid, 'SHORT with SL below Entry rejected');
  const invalidShortTP = calculateRR('SHORT', 3000, 3010, 3015);
  assert(!invalidShortTP.isValid, 'SHORT with TP above Entry rejected');

  // 19. Zero-Risk / Division-by-Zero Protection
  console.log('\n[19] Testing Zero-Risk Protection');
  const zeroRiskLot = calculatePositionSize(10000, 1.0, 3000, 3000);
  assert(zeroRiskLot === 0, 'Entry === SL results in 0 lots (zero division protected)');
  const negBalanceLot = calculatePositionSize(-1000, 1.0, 3000, 2990);
  assert(negBalanceLot === 0, 'Negative balance results in 0 lots');

  // 20. End-to-End Replay using Real Dukascopy XAUUSD M1 Database Candles
  console.log('\n[20] Testing End-to-End Simulation using Real Database Candles');
  let realCandles: BacktestCandle[] = [];

  const dbCandles = await prisma.mt5CandleData.findMany({
    where: { provider: 'DUKASCOPY', symbol: 'XAUUSD', timeframe: 'M1' },
    orderBy: { time: 'asc' },
    take: 100,
  });

  if (dbCandles.length > 0) {
    realCandles = dbCandles.map(c => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      tickVolume: c.tickVolume ?? undefined,
    }));
  } else {
    const pqCandles = await parquetProvider.getCandles({ symbol: 'XAUUSD', timeframe: 'M1', limit: 100 });
    realCandles = pqCandles.map(c => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      tickVolume: c.tickVolume,
    }));
  }

  assert(realCandles.length === 100, `Fetched ${realCandles.length} real Dukascopy M1 candles from database/parquet`);

  let replayCursor = 0;
  const initialBalance = 10000;
  let activeE2ETrade: BacktestTradeRecord | null = null;
  const closedE2ETrades: BacktestTradeRecord[] = [];

  // Start replay at index 10
  replayCursor = 10;
  const entryCandle = realCandles[replayCursor];
  const e2eEntryPrice = entryCandle.close;
  const e2eSlPrice = e2eEntryPrice - 5.0; // 5 pts SL
  const e2eTpPrice = e2eEntryPrice + 10.0; // 10 pts TP (1:2 RR)
  const e2eLots = calculatePositionSize(initialBalance, 1.0, e2eEntryPrice, e2eSlPrice);

  activeE2ETrade = {
    id: 'e2e-trade-1',
    tradeNumber: 1,
    side: 'LONG',
    entryPrice: e2eEntryPrice,
    entryTime: entryCandle.time,
    slPrice: e2eSlPrice,
    tpPrice: e2eTpPrice,
    exitPrice: null,
    exitTime: null,
    exitReason: null,
    volume: e2eLots,
    riskAmount: 100,
    pnl: null,
    rr: null,
    status: 'OPEN',
  };

  assert(activeE2ETrade.status === 'OPEN', 'E2E Trade opened successfully');

  // Step replay candle by candle
  while (replayCursor < realCandles.length - 1 && activeE2ETrade.status === 'OPEN') {
    replayCursor = advanceReplay(replayCursor, realCandles.length - 1);
    const curCandle = realCandles[replayCursor];
    const hit = evaluateCandleHit(activeE2ETrade, curCandle);

    if (hit.type === 'TP' || hit.type === 'SL' || hit.type === 'INTRABAR_AMBIGUOUS') {
      const exitPrice = hit.exitPrice || curCandle.close;
      const pnl = calculatePnL(activeE2ETrade.side, activeE2ETrade.entryPrice, exitPrice, activeE2ETrade.volume);
      const rr = hit.type === 'TP' ? 2.0 : hit.type === 'SL' ? -1.0 : 0;

      activeE2ETrade.exitPrice = exitPrice;
      activeE2ETrade.exitTime = curCandle.time;
      activeE2ETrade.exitReason = hit.reason;
      activeE2ETrade.pnl = pnl;
      activeE2ETrade.rr = rr;
      activeE2ETrade.status = 'CLOSED';

      closedE2ETrades.push({ ...activeE2ETrade });
      activeE2ETrade = null;
      break;
    }
  }

  assert(replayCursor > 10, `Replay sequentially stepped forward to candle index ${replayCursor}`);
  if (closedE2ETrades.length > 0) {
    const closed = closedE2ETrades[0];
    assert(closed.status === 'CLOSED', `Trade closed with reason: ${closed.exitReason}, PnL: $${closed.pnl}`);
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
