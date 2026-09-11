import * as p from '../integrations/mt5-sync/parquetDataProvider';

async function main() {
  console.log('=== INTEGRATION VERIFICATION: REPLAY STEP & CANDLE DEDUPLICATION ===');

  // 1. Replay window test at historical point
  const hist = await p.getCandles({
    symbol: 'XAUUSD',
    timeframe: 'M1',
    limit: 10,
    replayTime: '2025-04-01T04:00:00.000Z',
  });
  console.log(`[PASS] Historical Replay loaded: ${hist.length} candles`);
  if (hist.length > 0) {
    console.log(`       First: ${hist[0].time.toISOString()} | Last: ${hist[hist.length - 1].time.toISOString()}`);
    console.log(`       Price range: ${hist[0].low} - ${hist[0].high}`);
    if (new Date(hist[hist.length - 1].time).getTime() > new Date('2025-04-01T04:00:00.000Z').getTime()) {
      throw new Error('FAIL: Zero-lookahead breached! Candle after replayTime returned!');
    }
  }

  // 2. Sequential Step Forward Test (strictly monotonic advancing, NO duplicates)
  let prevTime = hist[hist.length - 1].time;
  console.log(`\nBeginning 5-step forward replay from ${prevTime.toISOString()}...`);
  for (let i = 1; i <= 5; i++) {
    const next = await p.getNextCandle({
      symbol: 'XAUUSD',
      timeframe: 'M1',
      afterTime: prevTime,
    });
    if (!next) {
      throw new Error(`FAIL: Step ${i} returned null candle`);
    }
    const curTime = new Date(next.time);
    console.log(`  Step ${i}: ${curTime.toISOString()} | O:${next.open} H:${next.high} L:${next.low} C:${next.close} Vol:${next.tickVolume}`);
    if (curTime.getTime() <= new Date(prevTime).getTime()) {
      throw new Error(`FAIL: Duplicate or backwards candle! prev=${new Date(prevTime).toISOString()} next=${curTime.toISOString()}`);
    }
    prevTime = curTime;
  }
  console.log('[PASS] All 5 sequential steps advanced strictly forward with 0 duplicates!');

  console.log('\n=== ALL INTEGRATION CHECKS PASSED ===');
  setTimeout(() => process.exit(0), 300);
}

main().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
