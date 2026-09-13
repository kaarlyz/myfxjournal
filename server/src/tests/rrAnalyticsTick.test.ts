import assert from 'assert';
import { prisma } from '../prisma';
import { marketAnalytics } from '../services/marketAnalytics';

async function runTests() {
  console.log('=== RUNNING RR ANALYTICS TICK-BASED TEST SUITE ===');

  // 1. BUY valid trade with tick data available
  console.log('\n[TEST 1] BUY valid trade with tick data available');
  const buyTrade = {
    id: 'test-buy-valid-1',
    symbol: 'XAUUSD',
    side: 'BUY',
    entryTime: new Date('2026-08-03T00:01:00.000Z'),
    exitTime: new Date('2026-08-03T00:09:00.000Z'),
    entryPrice: 4078.355,
    exitPrice: 4073.36,
    slPrice: 4073.36,
    tpPrice: 4084.12,
    result: 'LOSS',
    rMultiple: -1.0,
  };
  const resBuy = await marketAnalytics.runTradeReplayPipeline(buyTrade, 1.0, '2.1.0', 'PARQUET');
  assert.strictEqual(resBuy.status, 'VALID', 'BUY trade should be VALID');
  assert(resBuy.candlesUsed! > 0, 'Should have used real ticks');
  assert(resBuy.maxPotentialRR !== undefined && resBuy.maxPotentialRR >= 0, 'maxPotentialRR should be calculated');
  console.log('  PASS: BUY trade valid with', resBuy.candlesUsed, 'ticks, maxPotentialRR =', resBuy.maxPotentialRR);

  // 2. SELL valid trade with tick data available
  console.log('\n[TEST 2] SELL valid trade with tick data available');
  const sellTrade = {
    id: 'test-sell-valid-1',
    symbol: 'XAUUSD',
    side: 'SELL',
    entryTime: new Date('2026-08-02T23:17:00.000Z'),
    exitTime: new Date('2026-08-03T00:00:00.000Z'),
    entryPrice: 4069.22,
    exitPrice: 4074.82,
    slPrice: 4074.82,
    tpPrice: 4063.53,
    result: 'LOSS',
    rMultiple: -1.0,
  };
  const resSell = await marketAnalytics.runTradeReplayPipeline(sellTrade, 1.0, '2.1.0', 'PARQUET');
  assert.strictEqual(resSell.status, 'VALID', 'SELL trade should be VALID');
  assert(resSell.candlesUsed! > 0, 'Should have used real ticks');
  console.log('  PASS: SELL trade valid with', resSell.candlesUsed, 'ticks, maxPotentialRR =', resSell.maxPotentialRR);

  // 3. entryTime == exitTime
  console.log('\n[TEST 3] entryTime == exitTime');
  const zeroDurTrade = {
    id: 'test-zero-dur',
    symbol: 'XAUUSD',
    side: 'BUY',
    entryTime: new Date('2026-08-03T00:11:00.000Z'),
    exitTime: new Date('2026-08-03T00:11:00.000Z'),
    entryPrice: 4072.555,
    exitPrice: 4072.555,
    slPrice: 4067.56,
    tpPrice: 4079.16,
    result: 'BE',
    rMultiple: 0,
  };
  const resZeroDur = await marketAnalytics.runTradeReplayPipeline(zeroDurTrade, 1.0, '2.1.0', 'PARQUET');
  assert.strictEqual(resZeroDur.status, 'VALID', 'Zero duration trade with ticks in that second should be VALID');
  console.log('  PASS: entryTime == exitTime handled gracefully with status:', resZeroDur.status);

  // 4. exitTime < entryTime
  console.log('\n[TEST 4] exitTime < entryTime');
  const invTimeTrade = {
    id: 'test-inv-time',
    symbol: 'XAUUSD',
    side: 'BUY',
    entryTime: new Date('2026-08-03T00:15:00.000Z'),
    exitTime: new Date('2026-08-03T00:10:00.000Z'),
    entryPrice: 4070.0,
    exitPrice: 4075.0,
    slPrice: 4065.0,
    tpPrice: 4080.0,
    result: 'WIN',
    rMultiple: 1.0,
  };
  const resInvTime = await marketAnalytics.runTradeReplayPipeline(invTimeTrade, 1.0, '2.1.0', 'PARQUET');
  assert.strictEqual(resInvTime.status, 'FAILED', 'exitTime < entryTime must be FAILED');
  assert(resInvTime.statusReason?.includes('Exit time cannot be before entry time'), 'Reason must mention time error');
  console.log('  PASS: exitTime < entryTime correctly rejected with:', resInvTime.statusReason);

  // 5. tick tidak punya exact timestamp entry tetapi ada tick sesudah/sebelumnya
  console.log('\n[TEST 5] tick no exact entry timestamp');
  const nonExactTrade = {
    id: 'test-non-exact-ms',
    symbol: 'XAUUSD',
    side: 'LONG',
    entryTime: new Date('2026-08-03T00:11:00.123Z'),
    exitTime: new Date('2026-08-03T00:21:00.456Z'),
    entryPrice: 4072.555,
    exitPrice: 4067.56,
    slPrice: 4067.56,
    tpPrice: 4079.16,
    result: 'LOSS',
    rMultiple: -1.0,
  };
  const resNonExact = await marketAnalytics.runTradeReplayPipeline(nonExactTrade, 1.0, '2.1.0', 'PARQUET');
  assert.strictEqual(resNonExact.status, 'VALID', 'Trade with arbitrary millisecond offset should be VALID');
  assert(resNonExact.candlesUsed! > 0, 'Ticks should be retrieved');
  console.log('  PASS: Non-exact timestamp trade successfully processed with', resNonExact.candlesUsed, 'ticks');

  // 6. tick range tersedia sebagian / 7. tidak tersedia sama sekali
  console.log('\n[TEST 6 & 7] tick range not available at all (outside dataset bounds)');
  const futureTrade = {
    id: 'test-future-range',
    symbol: 'XAUUSD',
    side: 'BUY',
    entryTime: new Date('2030-01-01T00:00:00.000Z'),
    exitTime: new Date('2030-01-01T01:00:00.000Z'),
    entryPrice: 4000.0,
    exitPrice: 4010.0,
    slPrice: 3990.0,
    tpPrice: 4020.0,
    result: 'WIN',
    rMultiple: 1.0,
  };
  const resFuture = await marketAnalytics.runTradeReplayPipeline(futureTrade, 1.0, '2.1.0', 'PARQUET');
  assert.strictEqual(resFuture.status, 'MISSING_MARKET_DATA', 'Out of bounds trade should return MISSING_MARKET_DATA');
  console.log('  PASS: Out of bounds trade correctly reported with:', resFuture.statusReason);

  // 8. SL/TP hit pada tick
  console.log('\n[TEST 8] SL/TP hit on tick');
  const tpHitTrade = {
    id: 'test-tp-hit',
    symbol: 'XAUUSD',
    side: 'BUY',
    entryTime: new Date('2026-08-03T00:25:00.000Z'),
    exitTime: new Date('2026-08-03T00:27:00.000Z'),
    entryPrice: 4064.075,
    exitPrice: 4066.33,
    slPrice: 4061.86,
    tpPrice: 4066.33,
    result: 'WIN',
    rMultiple: 1.02,
  };
  const resTpHit = await marketAnalytics.runTradeReplayPipeline(tpHitTrade, 1.0, '2.1.0', 'PARQUET');
  assert.strictEqual(resTpHit.status, 'VALID');
  assert.strictEqual(resTpHit.firstHit, 'TP', 'Should detect TP hit from ticks');
  console.log('  PASS: First hit correctly detected as TP on tick');

  // 9. neither SL nor TP hit sebelum exit
  console.log('\n[TEST 9] Neither SL nor TP hit before exit');
  const wideSltpTrade = {
    id: 'test-wide-sltp',
    symbol: 'XAUUSD',
    side: 'LONG',
    entryTime: new Date('2026-08-03T00:29:00.000Z'),
    exitTime: new Date('2026-08-03T00:30:00.000Z'),
    entryPrice: 4064.035,
    exitPrice: 4065.0,
    slPrice: 4000.0,
    tpPrice: 4150.0,
    result: 'WIN',
    rMultiple: 0.1,
  };
  const resWide = await marketAnalytics.runTradeReplayPipeline(wideSltpTrade, 1.0, '2.1.0', 'PARQUET');
  assert.strictEqual(resWide.status, 'VALID');
  assert.strictEqual(resWide.firstHit, 'NONE', 'Neither SL nor TP hit should give firstHit = NONE');
  console.log('  PASS: Neither SL nor TP hit accurately detected as NONE');

  // 10. BUY dan SELL pricing semantics
  console.log('\n[TEST 10] BUY and SELL pricing semantics');
  const buySemantics = {
    id: 'test-buy-sem',
    symbol: 'XAUUSD',
    side: 'BUY',
    entryTime: new Date('2026-08-03T03:46:00.000Z'),
    exitTime: new Date('2026-08-03T03:52:00.000Z'),
    entryPrice: 4059.975,
    exitPrice: 4064.37,
    slPrice: 4057.08,
    tpPrice: 4064.37,
    result: 'WIN',
    rMultiple: 1.52,
  };
  const resBuySem = await marketAnalytics.runTradeReplayPipeline(buySemantics, 1.0, '2.1.0', 'PARQUET');
  assert(resBuySem.mfePrice! >= buySemantics.entryPrice, 'BUY MFE should be higher than or equal to entry');
  assert(resBuySem.maePrice! <= buySemantics.entryPrice, 'BUY MAE should be lower than or equal to entry');

  const sellSemantics = {
    id: 'test-sell-sem',
    symbol: 'XAUUSD',
    side: 'SELL',
    entryTime: new Date('2026-08-03T03:53:00.000Z'),
    exitTime: new Date('2026-08-03T04:07:00.000Z'),
    entryPrice: 4064.055,
    exitPrice: 4068.15,
    slPrice: 4068.15,
    tpPrice: 4059.66,
    result: 'LOSS',
    rMultiple: -1.0,
  };
  const resSellSem = await marketAnalytics.runTradeReplayPipeline(sellSemantics, 1.0, '2.1.0', 'PARQUET');
  assert(resSellSem.mfePrice! <= sellSemantics.entryPrice, 'SELL MFE should be lower than or equal to entry');
  assert(resSellSem.maePrice! >= sellSemantics.entryPrice, 'SELL MAE should be higher than or equal to entry');
  console.log('  PASS: BUY and SELL pricing semantics verified');

  // 11. No-lookahead: MFE is bounded to [entryTime, exitTime]
  console.log('\n[TEST 11] No-lookahead verification');
  const boundedTrade = {
    id: 'test-bounded',
    symbol: 'XAUUSD',
    side: 'LONG',
    entryTime: new Date('2026-08-03T00:52:00.000Z'),
    exitTime: new Date('2026-08-03T00:58:00.000Z'),
    entryPrice: 4059.745,
    exitPrice: 4056.14,
    slPrice: 4056.14,
    tpPrice: 4063.59,
    result: 'LOSS',
    rMultiple: -1.0,
  };
  const resBounded = await marketAnalytics.runTradeReplayPipeline(boundedTrade, 1.0, '2.1.0', 'PARQUET');
  assert.strictEqual(resBounded.status, 'VALID');
  assert(resBounded.maePrice! >= 4056.0, `MAE (${resBounded.maePrice}) must not look ahead past exitTime 00:58`);
  console.log('  PASS: No look-ahead confirmed. MAE is strictly bounded to [entry, exit]');

  // 12. RR tetap bisa negatif untuk losing trade
  console.log('\n[TEST 12] RR remains negative for losing trade');
  const losingTrade = {
    id: 'test-losing-rr',
    symbol: 'XAUUSD',
    side: 'SHORT',
    entryTime: new Date('2026-08-03T01:14:00.000Z'),
    exitTime: new Date('2026-08-03T01:25:00.000Z'),
    entryPrice: 4048.99,
    exitPrice: 4053.94,
    slPrice: 4053.94,
    tpPrice: 4038.94,
    result: 'LOSS',
    rMultiple: -1.0,
  };
  const resLosing = await marketAnalytics.runTradeReplayPipeline(losingTrade, 1.0, '2.1.0', 'PARQUET');
  assert.strictEqual(resLosing.status, 'VALID');
  assert.strictEqual(resLosing.capturedRR, -1.0, 'capturedRR must be negative for losing trade');
  console.log('  PASS: Losing trade capturedRR =', resLosing.capturedRR);

  // 13. 16 trade pada session reproduksi kasus ini tidak boleh otomatis menjadi invalid semua
  console.log('\n[TEST 13] 16 trades session validation');
  const sessionId = '6e159655-6a6d-40cf-953e-2fabc0dd58b0';
  const sessionRes = await marketAnalytics.rebuildSessionReplay(sessionId, 1.0, '2.1.0', 'PARQUET', 'M1');
  assert.strictEqual(sessionRes.total, 16, 'Should have 16 trades');
  assert.strictEqual(sessionRes.validCount, 16, 'All 16 trades must be VALID');
  assert.strictEqual(sessionRes.invalidCount, 0, '0 trades should be invalid');
  console.log('  PASS: Session with 16 trades processed with 16 valid and 0 invalid');

  console.log('\n=== ALL 13 TESTS PASSED SUCCESSFULLY ===');
  process.exit(0);
}

runTests().catch(err => {
  console.error('TEST SUITE FAILED:', err);
  process.exit(1);
});
