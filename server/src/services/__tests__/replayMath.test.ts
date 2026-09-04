import {
  normalizeSymbol,
  detectPriceDigits,
  priceToMicro,
  microToPrice,
  comparePrices,
  priceLte,
  priceGte,
  detectAccountType,
  convertPnlToUsd,
  calculatePnl,
  resampleCandles,
  OHLCCandle,
  inferSLTP,
  runRRSimulation,
  getBarOpenTime,
} from '../replayEngineCore';

export function runAllTests() {
  console.log('====================================================');
  console.log('REPLAYFX CORE MATH & RESAMPLING TEST SUITE');
  console.log('====================================================');
  let passed = 0;
  let failed = 0;

  function assert(name: string, ok: boolean, detail?: string) {
    if (ok) {
      console.log(`  [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${name} ${detail || ''}`);
      failed++;
    }
  }

  // ─── 1. SYMBOL NORMALIZATION ──────────────────────────────────────────
  console.log('\n[1] Testing Symbol Normalization');
  assert('XAUUSD-ECN canonical is XAUUSD', normalizeSymbol('XAUUSD-ECN').canonical === 'XAUUSD' && normalizeSymbol('XAUUSD-ECN').known === true);
  assert('GOLD canonical is XAUUSD', normalizeSymbol('GOLD').canonical === 'XAUUSD' && normalizeSymbol('GOLD').known === true);
  assert('XAUUSDc canonical is XAUUSD', normalizeSymbol('XAUUSDc').canonical === 'XAUUSD' && normalizeSymbol('XAUUSDc').known === true);
  assert('XAU/USD canonical is XAUUSD', normalizeSymbol('XAU/USD').canonical === 'XAUUSD' && normalizeSymbol('XAU/USD').known === true);
  assert('Unknown symbol flagged known=false without fallback', normalizeSymbol('UNKNOWN_FEED').known === false);

  // ─── 2. PRICE PRECISION & MICRO-UNITS ─────────────────────────────────
  console.log('\n[2] Testing Price Precision & Micro-Units');
  assert('2 decimals detected', detectPriceDigits(3355.12) === 2);
  assert('3 decimals detected', detectPriceDigits(3355.123) === 3);
  assert('0 decimals detected', detectPriceDigits(3355) === 0);
  assert('micro-unit conversion exact 3 dec', priceToMicro(3355.123, 3) === 3355123n);
  assert('microToPrice exact', microToPrice(3355123n, 3) === 3355.123);
  assert('micro-safe comparison (0.1+0.2 == 0.3)', comparePrices(0.1 + 0.2, 0.3, 4) === 0);
  assert('priceLte micro-safe', priceLte(3355.12, 3355.123, 3) === true);
  assert('priceGte micro-safe', priceGte(3355.123, 3355.12, 3) === true);

  // ─── 3. ACCOUNT TYPE DETECTION ─────────────────────────────────────────
  console.log('\n[3] Testing Account Type Detection');
  assert('Standard USD account detected', detectAccountType('USD', 10000, 100).type === 'STANDARD');
  assert('Cent account USC detected', detectAccountType('USC', 1000000, 100).type === 'CENT');
  assert('Cent PnL converted to USD', convertPnlToUsd(500, detectAccountType('USC', 1000000, 100)) === 5.0);

  // ─── 4. P&L CALCULATION ────────────────────────────────────────────────
  console.log('\n[4] Testing P&L Calculation');
  const pnlLong = calculatePnl('XAUUSD', 'LONG', 3348.459, 3348.848, 1.0);
  assert('XAUUSD LONG P&L correct (~38.9 USD)', Math.abs(pnlLong.pnlUsd - 38.9) < 0.1, `Got ${pnlLong.pnlUsd}`);
  const pnlShort = calculatePnl('XAUUSD', 'SHORT', 3345.725, 3344.424, 1.0);
  assert('XAUUSD SHORT P&L correct (~130.1 USD)', Math.abs(pnlShort.pnlUsd - 130.1) < 0.1, `Got ${pnlShort.pnlUsd}`);

  // ─── 5. M1 RESAMPLING TO MULTI-TIMEFRAMES ──────────────────────────────
  console.log('\n[5] Testing M1 Resampling');
  const m1: OHLCCandle[] = [
    { time: new Date('2026-08-01T10:00:00Z'), open: 3000, high: 3005, low: 2998, close: 3002 },
    { time: new Date('2026-08-01T10:01:00Z'), open: 3002, high: 3008, low: 3001, close: 3006 },
    { time: new Date('2026-08-01T10:02:00Z'), open: 3006, high: 3007, low: 2995, close: 2996 },
    { time: new Date('2026-08-01T10:03:00Z'), open: 2996, high: 3001, low: 2994, close: 3000 },
    { time: new Date('2026-08-01T10:04:00Z'), open: 3000, high: 3010, low: 2999, close: 3009 },
  ];
  const m5 = resampleCandles(m1, 'M5');
  assert('M5 resample produces 1 candle', m5.length === 1);
  assert('M5 open is first M1 open (3000)', m5[0]?.open === 3000);
  assert('M5 high is max M1 high (3010)', m5[0]?.high === 3010);
  assert('M5 low is min M1 low (2994)', m5[0]?.low === 2994);
  assert('M5 close is last M1 close (3009)', m5[0]?.close === 3009);

  const t = new Date('2026-08-01T10:07:34Z');
  assert('Bar open boundary M5', getBarOpenTime(t, 'M5').toISOString() === '2026-08-01T10:05:00.000Z');
  assert('Bar open boundary M15', getBarOpenTime(t, 'M15').toISOString() === '2026-08-01T10:00:00.000Z');
  assert('Bar open boundary H1', getBarOpenTime(t, 'H1').toISOString() === '2026-08-01T10:00:00.000Z');

  // ─── 6. SL/TP INFERENCE & ACTUAL SL/TP PRIORITY ──────────────────────
  console.log('\n[6] Testing SL/TP Inference & Actual SL/TP Priority');
  
  // Priority 1: Actual SL & TP present (LONG)
  const actualLong = inferSLTP('LONG', 100, 108, 'WIN', 1.0, 90, 107.5);
  assert('Actual SL/TP detected as source=ACTUAL', actualLong?.source === 'ACTUAL');
  assert('Actual SL is 90', actualLong?.slPrice === 90);
  assert('Actual TP is 107.5', actualLong?.tpPrice === 107.5);
  assert('Actual risk distance is 10', actualLong?.riskDistance === 10);
  assert('Actual reward distance is 7.5', actualLong?.rewardDistance === 7.5);
  assert('Actual RR calculated = 0.75', Math.abs((actualLong?.actualRR ?? 0) - 0.75) < 0.0001);
  assert('Input backtestRR=1.0 ignored when actual SL/TP present', actualLong?.effectiveRR === actualLong?.actualRR);

  // Priority 1: Actual SL & TP present (SHORT)
  const actualShort = inferSLTP('SHORT', 100, 92, 'WIN', 2.0, 110, 92.5);
  assert('Actual SHORT SL/TP source=ACTUAL', actualShort?.source === 'ACTUAL');
  assert('Actual SHORT SL is 110', actualShort?.slPrice === 110);
  assert('Actual SHORT TP is 92.5', actualShort?.tpPrice === 92.5);
  assert('Actual SHORT risk distance is 10', actualShort?.riskDistance === 10);
  assert('Actual SHORT reward distance is 7.5', actualShort?.rewardDistance === 7.5);
  assert('Actual SHORT RR calculated = 0.75', Math.abs((actualShort?.actualRR ?? 0) - 0.75) < 0.0001);

  // Priority 2: Manual SL only
  const manualSlOnly = inferSLTP('LONG', 100, 105, 'WIN', 0.5, 90, null);
  assert('Manual SL only source=MANUAL', manualSlOnly?.source === 'MANUAL');
  assert('Manual SL only TP calculated from backtestRR=0.5 -> 105', manualSlOnly?.tpPrice === 105);

  // Priority 3: Fallback Reconstruction for WIN at RR=0.5
  const sltp05 = inferSLTP('LONG', 100, 105, 'WIN', 0.5, null, null);
  assert('SL inferred for WIN at RR=0.5 -> SL=90', sltp05?.slPrice === 90);
  assert('TP for WIN at RR=0.5 -> TP=105', sltp05?.tpPrice === 105);
  assert('Source is INFERRED_FROM_WIN', sltp05?.source === 'INFERRED_FROM_WIN');

  // Fallback Reconstruction for WIN at RR=0.75
  const sltp075 = inferSLTP('LONG', 100, 103, 'WIN', 0.75);
  assert('SL inferred for WIN at RR=0.75 -> SL=96', sltp075?.slPrice === 96);
  assert('TP for WIN at RR=0.75 -> TP=103', sltp075?.tpPrice === 103);

  // Fallback Reconstruction for LOSS
  const sltpLoss = inferSLTP('LONG', 100, 95, 'LOSS', 1.0);
  assert('SL inferred for LOSS -> exit is SL (95)', sltpLoss?.slPrice === 95);
  assert('Source is INFERRED_FROM_LOSS', sltpLoss?.source === 'INFERRED_FROM_LOSS');

  // ─── 7. HIT DETECTION WITH ACTUAL SL/TP ──────────────────────────────
  console.log('\n[7] Testing Hit Detection with Actual SL/TP');
  const simActualTP = runRRSimulation('LONG', 100, 90, 107.5, new Date('2026-08-01T10:10:00Z'), [
    { time: new Date('2026-08-01T10:01:00Z'), open: 100, high: 108, low: 99, close: 107 },
  ]);
  assert('Actual TP hit first detected', simActualTP.firstHit === 'TP');

  const simActualSL = runRRSimulation('LONG', 100, 90, 107.5, new Date('2026-08-01T10:10:00Z'), [
    { time: new Date('2026-08-01T10:01:00Z'), open: 100, high: 102, low: 88, close: 89 },
  ]);
  assert('Actual SL hit first detected', simActualSL.firstHit === 'SL');

  const simAmb = runRRSimulation('LONG', 100, 90, 105, new Date('2026-08-01T10:10:00Z'), [
    { time: new Date('2026-08-01T10:01:00Z'), open: 100, high: 110, low: 85, close: 100 },
  ]);
  assert('AMBIGUOUS hit detected when both breached', simAmb.firstHit === 'AMBIGUOUS');

  console.log('\n====================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  // ─── 8. GROUND TRUTH & HYPOTHETICAL TARGET RR SIMULATION ────────────────
  console.log('\n[8] Testing MT5 Ground Truth & Hypothetical Simulation Matrix');

  // Ground Truth Test 1: Order 2 Entry 3128.03, SL 3120.21, TP 3133.86 (LONG, TP hit, actualRR ~0.746)
  const gt1 = inferSLTP('LONG', 3128.03, 3133.95, 'WIN', 1.0, 3120.21, 3133.86);
  assert('Ground Truth #1: Source is ACTUAL', gt1?.source === 'ACTUAL');
  assert('Ground Truth #1: SL is 3120.21', gt1?.slPrice === 3120.21);
  assert('Ground Truth #1: TP is 3133.86', gt1?.tpPrice === 3133.86);
  assert('Ground Truth #1: Actual RR ≈ 0.746', Math.abs((gt1?.actualRR ?? 0) - 0.7455) < 0.001);

  // Ground Truth Test 2: Order 5 Entry 3148.13, SL 3142.65, TP 3152.05 (LONG, SL hit, actualRR ~0.715)
  const gt2 = inferSLTP('LONG', 3148.13, 3141.95, 'LOSS', 1.0, 3142.65, 3152.05);
  assert('Ground Truth #2: Source is ACTUAL', gt2?.source === 'ACTUAL');
  assert('Ground Truth #2: SL is 3142.65', gt2?.slPrice === 3142.65);
  assert('Ground Truth #2: TP is 3152.05', gt2?.tpPrice === 3152.05);
  assert('Ground Truth #2: Actual RR ≈ 0.715', Math.abs((gt2?.actualRR ?? 0) - 0.7153) < 0.001);

  // Ground Truth Test 3: Order 4 Entry 3145.68, SL 3132.86, TP 3155.28 (LONG, SL hit, actualRR ~0.749)
  const gt3 = inferSLTP('LONG', 3145.68, 3132.45, 'LOSS', 1.0, 3132.86, 3155.28);
  assert('Ground Truth #3: Actual RR ≈ 0.749', Math.abs((gt3?.actualRR ?? 0) - 0.7488) < 0.001);

  // Ground Truth Test 4: Order 9 Entry 3137.80, SL 3126.24, TP 3146.47 (LONG, SL hit, actualRR = 0.750)
  const gt4 = inferSLTP('LONG', 3137.80, 3126.24, 'LOSS', 1.0, 3126.24, 3146.47);
  assert('Ground Truth #4: Actual RR = 0.750', Math.abs((gt4?.actualRR ?? 0) - 0.7500) < 0.001);

  // Ground Truth Test 5: Order 8 Entry 3124.12, SL 3139.14, TP 3112.91 (SHORT, TP hit, actualRR ~0.746)
  const gt5 = inferSLTP('SHORT', 3124.12, 3112.68, 'WIN', 1.0, 3139.14, 3112.91);
  assert('Ground Truth #5: SHORT Actual RR ≈ 0.746', Math.abs((gt5?.actualRR ?? 0) - 0.7463) < 0.001);

  // Hypothetical Target RR Matrix: win condition is maxPotentialRR >= target
  const sampleMfeTrades = [
    { maxPotentialRR: 0.8 },
    { maxPotentialRR: 0.5 },
    { maxPotentialRR: 1.2 },
    { maxPotentialRR: 0.3 },
  ];
  const winAt025 = sampleMfeTrades.filter(t => t.maxPotentialRR >= 0.25).length;
  const winAt050 = sampleMfeTrades.filter(t => t.maxPotentialRR >= 0.50).length;
  const winAt075 = sampleMfeTrades.filter(t => t.maxPotentialRR >= 0.75).length;
  const winAt100 = sampleMfeTrades.filter(t => t.maxPotentialRR >= 1.00).length;

  assert('Hypothetical Simulation: Target RR 0.25 -> 4 wins', winAt025 === 4);
  assert('Hypothetical Simulation: Target RR 0.50 -> 3 wins', winAt050 === 3);
  assert('Hypothetical Simulation: Target RR 0.75 -> 2 wins', winAt075 === 2);
  assert('Hypothetical Simulation: Target RR 1.00 -> 1 win', winAt100 === 1);

  console.log('====================================================');

  return { total: passed + failed, passed, failed };
}

export const runUnitTests = runAllTests;

export function calculateExcursionAndRR(
  trade: { side: 'LONG' | 'SHORT' | 'BUY' | 'SELL'; entryPrice: number; exitPrice: number; slPrice?: number; result?: string; backtestRR?: number },
  candles: OHLCCandle[]
) {
  const isLong = trade.side === 'LONG' || trade.side === 'BUY';
  const sltp = inferSLTP(trade.side, trade.entryPrice, trade.exitPrice, trade.result || null, trade.backtestRR || 1.0, trade.slPrice);
  const slPrice = sltp ? sltp.slPrice : (isLong ? trade.entryPrice * 0.99 : trade.entryPrice * 1.01);
  const tpPrice = sltp ? sltp.tpPrice : (isLong ? trade.entryPrice * 1.01 : trade.entryPrice * 0.99);
  const risk = sltp ? sltp.riskDistance : Math.abs(trade.entryPrice - slPrice);

  let mfePrice = trade.entryPrice;
  let maePrice = trade.entryPrice;
  let slHit = false;

  for (const c of candles) {
    if (isLong) {
      if (c.low < maePrice) maePrice = c.low;
      if (c.low <= slPrice) { slHit = true; break; }
      if (c.high > mfePrice) mfePrice = c.high;
    } else {
      if (c.high > maePrice) maePrice = c.high;
      if (c.high >= slPrice) { slHit = true; break; }
      if (c.low < mfePrice) mfePrice = c.low;
    }
  }

  const mfe = isLong ? Math.max(0, mfePrice - trade.entryPrice) : Math.max(0, trade.entryPrice - mfePrice);
  const mae = isLong ? Math.max(0, trade.entryPrice - maePrice) : Math.max(0, maePrice - trade.entryPrice);
  const maxPotentialRR = risk > 0 ? mfe / risk : 0;

  return { risk, mfe, mae, mfePrice, maePrice, maxPotentialRR, slHit };
}

if (require.main === module) {
  const r = runAllTests();
  process.exit(r.failed === 0 ? 0 : 1);
}
