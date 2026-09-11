import { prisma } from '../../prisma';
import { marketAnalytics } from '../marketAnalytics';

export async function runTradingViewReplayAudit() {
  console.log('========================================================================');
  console.log('AUTOMATED TEST SUITE: TRADINGVIEW XAUUSD DUKASCOPY REPLAY PIPELINE');
  console.log('========================================================================');

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, detail?: any) {
    if (condition) {
      console.log(`  [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${name}`, detail !== undefined ? detail : '');
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Symbol normalization (XAUUSD, XAUUSDc, XAUUSD-ECN -> XAUUSD)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 1: Symbol Normalization ---');
  const s1 = (marketAnalytics as any).normalizeSymbol('XAUUSDc');
  const s2 = (marketAnalytics as any).normalizeSymbol('XAUUSD-ECN');
  const s3 = (marketAnalytics as any).normalizeSymbol('XAUUSD');
  assert('XAUUSDc normalizes to XAUUSD', s1 === 'XAUUSD', s1);
  assert('XAUUSD-ECN normalizes to XAUUSD', s2 === 'XAUUSD', s2);
  assert('XAUUSD normalizes to XAUUSD', s3 === 'XAUUSD', s3);

  // --------------------------------------------------------------------------
  // TEST 2: Provider selection & No silent MT5 fallback
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: Provider Selection & Strict Enforcement ---');
  const fakeTrade = {
    id: 'test-trade-provider',
    symbol: 'XAUUSD',
    side: 'LONG',
    entryPrice: 3350,
    exitPrice: 3360,
    entryTime: new Date('2025-08-11T18:00:00.000Z'),
    exitTime: new Date('2025-08-11T18:10:00.000Z'),
    result: 'WIN',
  };

  const resDukascopy = await marketAnalytics.runTradeReplayPipeline(fakeTrade, 1.0, '2.0.0', 'DUKASCOPY', 'M1');
  assert('Dukascopy provider explicitly selected', resDukascopy.provider === 'DUKASCOPY', resDukascopy.provider);

  const resNonExistent = await marketAnalytics.runTradeReplayPipeline(fakeTrade, 1.0, '2.0.0', 'NON_EXISTENT', 'M1');
  assert('Non-existent provider returns MISSING_MARKET_DATA (no silent fallback)', resNonExistent.status === 'MISSING_MARKET_DATA', resNonExistent.status);

  // --------------------------------------------------------------------------
  // TEST 3: UTC Timestamp & Interval Alignment
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: UTC Timestamp & Interval Alignment ---');
  const sampleTime = new Date('2025-08-11T18:01:34.567Z');
  const aligned = marketAnalytics.entryBarStart(sampleTime, 'M1');
  assert('Aligned seconds & ms are zero in UTC', aligned.getUTCSeconds() === 0 && aligned.getUTCMilliseconds() === 0);
  assert('Aligned time matches exact minute bar', aligned.toISOString() === '2025-08-11T18:01:00.000Z', aligned.toISOString());

  // --------------------------------------------------------------------------
  // TEST 4: Respecting 0-duration trades (Never scanning 14 days in future)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: 0-duration trade candle bounding ---');
  const zeroDurTrade = {
    id: 'test-zero-dur',
    symbol: 'XAUUSD',
    side: 'LONG',
    entryPrice: 3352.955,
    exitPrice: 3353.802,
    entryTime: new Date('2025-08-11T18:01:00.000Z'),
    exitTime: new Date('2025-08-11T18:01:00.000Z'),
    result: 'WIN',
  };
  const resZeroDur = await marketAnalytics.runTradeReplayPipeline(zeroDurTrade, 1.0, '2.0.0', 'DUKASCOPY', 'M1');
  assert('Zero-duration trade scans exactly 1 candle (not 13,801)', resZeroDur.candlesUsed === 1, resZeroDur.candlesUsed);

  // --------------------------------------------------------------------------
  // TEST 5: Intended RR 1:0.5 Synthetic SL/TP Formula
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: Synthetic SL / TP Formula Verification ---');
  // For WIN trade: entry 100, exit 105 (tpDist = 5). For intended RR 1:0.5 (Reward = 0.5 * Risk):
  // slDistance = tpDist / 0.5 = 10. Long SL = 90.
  const inferredSLLong = marketAnalytics.inferSL({ entryPrice: 100, exitPrice: 105, side: 'LONG', result: 'WIN' }, 0.5);
  assert('LONG WIN intended 1:0.5 SL = entry - 2*tpDist', inferredSLLong === 90, inferredSLLong);

  // For SHORT WIN trade: entry 100, exit 95 (tpDist = 5). Intended 1:0.5 SL = 110.
  const inferredSLShort = marketAnalytics.inferSL({ entryPrice: 100, exitPrice: 95, side: 'SHORT', result: 'WIN' }, 0.5);
  assert('SHORT WIN intended 1:0.5 SL = entry + 2*tpDist', inferredSLShort === 110, inferredSLShort);

  // --------------------------------------------------------------------------
  // TEST 6: Weekend Gap (Forex Market Closed) = MISSING_MARKET_DATA
  // Zero-duration trade on Saturday 2025-08-09 — confirmed 0 ticks in parquet.
  // Zero-duration queryEndTime = entry + 1min → window stays strictly in Saturday.
  // --------------------------------------------------------------------------
  console.log('\n--- Test 6: Rollover Missing Market Data Detection ---');
  const rolloverTrade = {
    id: 'test-rollover',
    symbol: 'XAUUSD',
    side: 'SHORT',
    entryPrice: 3320.0,
    exitPrice: 3320.0,
    entryTime: new Date('2025-08-09T10:00:00.000Z'),
    exitTime: new Date('2025-08-09T10:00:00.000Z'),
    result: 'LOSS',
  };
  const resRollover = await marketAnalytics.runTradeReplayPipeline(rolloverTrade, 0.5, '2.0.0', 'DUKASCOPY', 'M1');
  assert('Weekend gap (Saturday zero-duration) returns MISSING_MARKET_DATA', resRollover.status === 'MISSING_MARKET_DATA', resRollover.status);

  // --------------------------------------------------------------------------
  // TEST 7: Intrabar Ambiguity / Conservative SL Hit
  // --------------------------------------------------------------------------
  console.log('\n--- Test 7: Intrabar Excursion & SL Stop ---');
  // Long trade with SL at 95. Candle reaches Low 94 (SL hit) and High 120.
  // Excursion must stop tracking upon SL breach.
  const { calculateExcursionAndRR } = await import('./replayMath.test');
  const ambigRes = calculateExcursionAndRR(
    { side: 'LONG', entryPrice: 100, exitPrice: 95, slPrice: 95 },
    [{ time: new Date(), open: 100, high: 120, low: 94, close: 94 }]
  );
  assert('SL breach is flagged', ambigRes.slHit === true);

  console.log('\n========================================================================');
  console.log(`AUDIT TEST SUMMARY: ${passed + failed} TOTAL | ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================');

  return { passed, failed, total: passed + failed };
}

if (require.main === module) {
  runTradingViewReplayAudit().then(res => {
    process.exit(res.failed === 0 ? 0 : 1);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
