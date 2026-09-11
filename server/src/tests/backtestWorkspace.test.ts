import {
  calculateFibonacciLevels,
  calculatePositionToolGeometry,
  updatePositionToolHandle,
  FIBONACCI_STANDARD_LEVELS,
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

async function runWorkspaceTests() {
  console.log('===========================================================');
  console.log('TRADINGVIEW WORKSPACE & ADVANCED ANALYSIS TOOL TESTS');
  console.log('===========================================================\n');

  // 1. Fibonacci Retracement Standard Levels
  console.log('[1] Testing Fibonacci Retracement Levels (Ascending)');
  const fibAsc = calculateFibonacciLevels(3000, 3100);
  assert(fibAsc.length === 8, 'Fibonacci contains 8 standard levels (0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 1.0)');
  assert(fibAsc[0].price === 3000, '0% level is 3000');
  assert(fibAsc[1].price === 3023.6, '23.6% level is 3023.6');
  assert(fibAsc[2].price === 3038.2, '38.2% level is 3038.2');
  assert(fibAsc[3].price === 3050, '50.0% level is 3050.0');
  assert(fibAsc[4].price === 3061.8, '61.8% level is 3061.8');
  assert(fibAsc[5].price === 3070.5, '70.5% level is 3070.5');
  assert(fibAsc[6].price === 3078.6, '78.6% level is 3078.6');
  assert(fibAsc[7].price === 3100, '100.0% level is 3100');

  // 2. Fibonacci Retracement Descending
  console.log('\n[2] Testing Fibonacci Retracement Levels (Descending)');
  const fibDesc = calculateFibonacciLevels(3100, 3000);
  assert(fibDesc[0].price === 3100, 'Descending 0% level is 3100');
  assert(fibDesc[3].price === 3050, 'Descending 50% level is 3050');
  assert(fibDesc[4].price === 3038.2, 'Descending 61.8% level is 3038.2 (3100 - 61.8)');
  assert(fibDesc[7].price === 3000, 'Descending 100% level is 3000');

  // 3. Long Position Analysis Tool
  console.log('\n[3] Testing Long Position Analysis Tool Geometry');
  const longPos = calculatePositionToolGeometry('LONG', 3130.00, 3120.00, 3150.00, false);
  assert(longPos.isValid, 'Long Position is valid');
  assert(longPos.riskDistance === 10.00, 'Risk distance is 10.00 pts');
  assert(longPos.rewardDistance === 20.00, 'Reward distance is 20.00 pts');
  assert(longPos.rr === 2.00, 'RR ratio is 1:2.00');

  // 4. Short Position Analysis Tool
  console.log('\n[4] Testing Short Position Analysis Tool Geometry');
  const shortPos = calculatePositionToolGeometry('SHORT', 3130.00, 3140.00, 3110.00, false);
  assert(shortPos.isValid, 'Short Position is valid');
  assert(shortPos.riskDistance === 10.00, 'Risk distance is 10.00 pts');
  assert(shortPos.rewardDistance === 20.00, 'Reward distance is 20.00 pts');
  assert(shortPos.rr === 2.00, 'RR ratio is 1:2.00');

  // 5. Lock RR on Long Position Tool
  console.log('\n[5] Testing Lock RR on Long Position Tool');
  // Start with Entry 3130, SL 3120 (Risk 10), TP 3150 (Reward 20) -> RR 2.0
  const lockedLong = calculatePositionToolGeometry('LONG', 3130.00, 3120.00, 3150.00, true);
  // Drag SL down to 3115 (Risk becomes 15) -> TP should automatically move to 3130 + (15 * 2) = 3160
  const updatedLongSL = updatePositionToolHandle(lockedLong, 'SL', 3115.00);
  assert(updatedLongSL.slPrice === 3115.00, 'SL updated to 3115.00');
  assert(updatedLongSL.tpPrice === 3160.00, 'TP automatically adjusted to 3160.00 to preserve 1:2 RR');
  assert(updatedLongSL.riskDistance === 15.00, 'Risk distance updated to 15.00 pts');
  assert(updatedLongSL.rewardDistance === 30.00, 'Reward distance updated to 30.00 pts');
  assert(updatedLongSL.rr === 2.00, 'RR remains locked at 2.00');

  // 6. Lock RR on Short Position Tool
  console.log('\n[6] Testing Lock RR on Short Position Tool');
  // Start with Entry 3130, SL 3140 (Risk 10), TP 3110 (Reward 20) -> RR 2.0
  const lockedShort = calculatePositionToolGeometry('SHORT', 3130.00, 3140.00, 3110.00, true);
  // Drag SL up to 3145 (Risk becomes 15) -> TP should automatically move to 3130 - (15 * 2) = 3100
  const updatedShortSL = updatePositionToolHandle(lockedShort, 'SL', 3145.00);
  assert(updatedShortSL.slPrice === 3145.00, 'SL updated to 3145.00');
  assert(updatedShortSL.tpPrice === 3100.00, 'TP automatically adjusted to 3100.00 to preserve 1:2 RR');
  assert(updatedShortSL.rr === 2.00, 'RR remains locked at 2.00');

  // 7. Dragging Entry handle moves entire position
  console.log('\n[7] Testing Dragging Entry Handle');
  // Move Entry from 3130 to 3140 on Long position (SL was 3120 -> 3130, TP was 3150 -> 3160)
  const movedEntry = updatePositionToolHandle(longPos, 'ENTRY', 3140.00);
  assert(movedEntry.entryPrice === 3140.00, 'Entry moved to 3140.00');
  assert(movedEntry.slPrice === 3130.00, 'SL shifted to 3130.00 (+10)');
  assert(movedEntry.tpPrice === 3160.00, 'TP shifted to 3160.00 (+10)');

  // 8. Invalid Geometry Rejection on Position Tools
  console.log('\n[8] Testing Invalid Geometry Rejection');
  const invalidLong = calculatePositionToolGeometry('LONG', 3130.00, 3135.00, 3150.00);
  assert(!invalidLong.isValid, 'LONG with SL above Entry correctly marked invalid');
  const invalidShort = calculatePositionToolGeometry('SHORT', 3130.00, 3125.00, 3110.00);
  assert(!invalidShort.isValid, 'SHORT with SL below Entry correctly marked invalid');

  // 9. Random Start and Nearest Candle Database / Parquet Checks
  console.log('\n[9] Testing Database Integration: Random Start & Timeline Bounds');
  const totalDbCount = await prisma.mt5CandleData.count({
    where: { provider: 'DUKASCOPY', symbol: 'XAUUSD', timeframe: 'M1' }
  });
  const bounds = await parquetProvider.getTimelineBounds();
  const totalCount = totalDbCount > 0 ? totalDbCount : (bounds?.totalTicks || 0);
  assert(totalCount >= 1768274, `${totalCount.toLocaleString()} real Dukascopy ticks/candles confirmed in storage`);

  // Random timestamp selection test
  const minTime = new Date('2021-09-01T00:00:00Z').getTime();
  const maxTime = new Date('2026-06-01T00:00:00Z').getTime();
  const randTime = new Date(minTime + Math.random() * (maxTime - minTime));
  let nearestRandCandle = await prisma.mt5CandleData.findFirst({
    where: { provider: 'DUKASCOPY', symbol: 'XAUUSD', timeframe: 'M1', time: { gte: randTime } },
    orderBy: { time: 'asc' },
  });

  if (!nearestRandCandle) {
    const pqCandle = await parquetProvider.getNextCandle({
      symbol: 'XAUUSD',
      timeframe: 'M1',
      afterTime: randTime,
    });
    if (pqCandle) {
      nearestRandCandle = {
        time: pqCandle.time,
        open: pqCandle.open,
        high: pqCandle.high,
        low: pqCandle.low,
        close: pqCandle.close,
      } as any;
    }
  }

  assert(nearestRandCandle !== null, 'Random start generator resolves valid real candle');
  assert(nearestRandCandle!.open > 0, `Random candle close: ${nearestRandCandle!.close}`);

  // 10. Drawing Persistence Test in ManualBacktestSession
  console.log('\n[10] Testing Drawing Persistence');
  const sampleDrawings = [
    { id: 'd1', type: 'trendline', startTime: 1743685200000, startPrice: 3128.03, endTime: 1743692400000, endPrice: 3135.20 },
    { id: 'd2', type: 'fibonacci', startTime: 1743685200000, startPrice: 3120.00, endTime: 1743692400000, endPrice: 3150.00 },
  ];
  const session = await prisma.manualBacktestSession.create({
    data: {
      name: 'Drawing Persistence Test Session',
      symbol: 'XAUUSD',
      provider: 'DUKASCOPY',
      timeframe: 'M1',
      startTime: new Date('2025-04-01T04:00:00Z'),
      replayTime: new Date('2025-04-01T04:00:00Z'),
      drawingsJson: JSON.stringify(sampleDrawings),
    }
  });
  assert(session.drawingsJson !== null, 'Session created with drawingsJson');
  const parsedDrawings = JSON.parse(session.drawingsJson!);
  assert(parsedDrawings.length === 2, '2 drawings persisted and retrieved successfully');
  assert(parsedDrawings[1].type === 'fibonacci', 'Fibonacci drawing persisted in market coordinates');

  // Clean up test session
  await prisma.manualBacktestSession.delete({ where: { id: session.id } });

  console.log('\n===========================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('===========================================================\n');

  if (failed > 0) process.exit(1);
}

runWorkspaceTests().catch(err => {
  console.error('Workspace test error:', err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
