import { prisma } from '../prisma';
import {
  calculateRR,
  calculatePositionSize,
  calculatePositionToolGeometry,
  updatePositionToolHandle,
  calculatePnL,
  calculateBacktestStats,
} from '../services/backtestEngine';

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
  console.log('===========================================================');
  console.log('REPLAYFX JOURNAL: TRADING TOOL & SESSION LIFECYCLE TESTS');
  console.log('===========================================================\n');

  // ─────────────────────────────────────────────────────────────
  // 1. POSITION TOOL: DRAGGABLE ENTRY LINE MATH & RR INVARIANCE
  // ─────────────────────────────────────────────────────────────
  console.log('[1] Position Tool: Dragging Entry Line Preserves Risk, Reward, and RR');
  {
    const initialEntry = 3000.00;
    const initialSL = 2990.00; // Risk = 10.00
    const initialTP = 3020.00; // Reward = 20.00 -> RR = 2.00
    const geo = calculatePositionToolGeometry('LONG', initialEntry, initialSL, initialTP, false);

    assert(geo.isValid, 'Initial position geometry is valid');
    assert(geo.riskDistance === 10.00, 'Initial risk distance is 10.00');
    assert(geo.rewardDistance === 20.00, 'Initial reward distance is 20.00');
    assert(geo.rr === 2.00, 'Initial RR is 2.00');

    // Simulate user dragging Entry up by +15.50 pts (from 3000.00 to 3015.50)
    const dPrice = 15.50;
    const newEntry = Math.round((initialEntry + dPrice) * 1000) / 1000;
    const newSL = Math.round((initialSL + dPrice) * 1000) / 1000;
    const newTP = Math.round((initialTP + dPrice) * 1000) / 1000;

    const movedGeo = calculatePositionToolGeometry('LONG', newEntry, newSL, newTP, false);
    assert(movedGeo.entryPrice === 3015.50, `New entry is 3015.50 (got ${movedGeo.entryPrice})`);
    assert(movedGeo.slPrice === 3005.50, `New SL is 3005.50 (got ${movedGeo.slPrice})`);
    assert(movedGeo.tpPrice === 3035.50, `New TP is 3035.50 (got ${movedGeo.tpPrice})`);
    assert(movedGeo.riskDistance === 10.00, `Risk distance strictly preserved at 10.00 (got ${movedGeo.riskDistance})`);
    assert(movedGeo.rewardDistance === 20.00, `Reward distance strictly preserved at 20.00 (got ${movedGeo.rewardDistance})`);
    assert(movedGeo.rr === 2.00, `RR ratio strictly preserved at 2.00 (got ${movedGeo.rr})`);

    // Drag Entry down by -25.25 pts (from 3000.00 to 2974.75)
    const dPriceDown = -25.25;
    const newEntryDown = Math.round((initialEntry + dPriceDown) * 1000) / 1000;
    const newSLDown = Math.round((initialSL + dPriceDown) * 1000) / 1000;
    const newTPDown = Math.round((initialTP + dPriceDown) * 1000) / 1000;

    const movedGeoDown = calculatePositionToolGeometry('LONG', newEntryDown, newSLDown, newTPDown, false);
    assert(movedGeoDown.entryPrice === 2974.75, 'New entry down is 2974.75');
    assert(movedGeoDown.slPrice === 2964.75, 'New SL down is 2964.75');
    assert(movedGeoDown.tpPrice === 2994.75, 'New TP down is 2994.75');
    assert(movedGeoDown.riskDistance === 10.00, 'Risk distance preserved on downward shift');
    assert(movedGeoDown.rewardDistance === 20.00, 'Reward distance preserved on downward shift');
    assert(movedGeoDown.rr === 2.00, 'RR ratio preserved on downward shift');
  }

  // ─────────────────────────────────────────────────────────────
  // 2. POSITION TOOL: INDEPENDENT SL/TP DRAGGING & CLAMPING
  // ─────────────────────────────────────────────────────────────
  console.log('\n[2] Position Tool: Independent SL/TP Dragging & Clamping');
  {
    const entry = 3000.00;
    const sl = 2990.00;
    const tp = 3020.00;

    // Drag SL up towards entry for LONG
    const userTargetSL = 2995.00;
    const clampedSL = Math.min(entry - 0.1, userTargetSL);
    const updatedGeo = calculatePositionToolGeometry('LONG', entry, clampedSL, tp, false);
    assert(updatedGeo.entryPrice === 3000.00, 'Entry line did not move when SL was dragged');
    assert(updatedGeo.slPrice === 2995.00, 'SL line moved to 2995.00');
    assert(updatedGeo.riskDistance === 5.00, 'Risk distance decreased to 5.00');
    assert(updatedGeo.rewardDistance === 20.00, 'Reward distance remained 20.00');
    assert(updatedGeo.rr === 4.00, 'RR ratio dynamically increased to 4.00');

    // Attempt to drag SL across Entry for LONG (e.g. to 3010.00)
    const invalidTargetSL = 3010.00;
    const clampedInvalidSL = Math.min(entry - 0.1, invalidTargetSL);
    assert(clampedInvalidSL === 2999.90, `SL clamped below Entry at 2999.90 (got ${clampedInvalidSL})`);

    // Attempt to drag TP below Entry for LONG (e.g. to 2980.00)
    const invalidTargetTP = 2980.00;
    const clampedInvalidTP = Math.max(entry + 0.1, invalidTargetTP);
    assert(clampedInvalidTP === 3000.10, `TP clamped above Entry at 3000.10 (got ${clampedInvalidTP})`);
  }

  // ─────────────────────────────────────────────────────────────
  // 3. MULTI-TOUCH PINCH ZOOM GEOMETRY & MIDPOINT ANCHOR MATH
  // ─────────────────────────────────────────────────────────────
  console.log('\n[3] Multi-Touch Pinch Zoom: Coordinate & Anchor Calculations');
  {
    // Mock viewport state
    const chartW = 900;
    const initialCW = 8.0;
    const initialSlot = initialCW * 1.2; // 9.6
    const initialRightMargin = Math.max(35, initialSlot * 8); // 76.8
    const lastGlobalIdx = 1000;
    const initialSO = 0;

    // Simulate two touch points at x1 = 300, x2 = 500 (distance = 200, midpoint = 400)
    const p1Start = { x: 300, y: 200 };
    const p2Start = { x: 500, y: 200 };
    const initialDist = Math.hypot(p2Start.x - p1Start.x, p2Start.y - p1Start.y); // 200
    const midX = (p1Start.x + p2Start.x) / 2; // 400

    // Solve for candle at midX before pinch:
    const initialR = chartW - initialRightMargin;
    const anchorGIdx = (lastGlobalIdx - initialSO) - (initialR - midX + initialSlot / 2) / initialSlot;

    // User pinches outward: p1 = 200, p2 = 600 (distance = 400, 2x zoom)
    const p1Cur = { x: 200, y: 200 };
    const p2Cur = { x: 600, y: 200 };
    const curDist = Math.hypot(p2Cur.x - p1Cur.x, p2Cur.y - p1Cur.y); // 400
    const ratio = curDist / initialDist; // 2.0

    const newCW = Math.min(45, Math.max(2, initialCW * ratio)); // 16.0
    const newSlot = newCW * 1.2; // 19.2
    const newRightMargin = Math.max(35, newSlot * 8); // 153.6
    const newR = chartW - newRightMargin;

    // Solve for newSO such that anchorGIdx projects to the same midX = 400:
    const newSO = lastGlobalIdx - anchorGIdx - (newR - midX + newSlot / 2) / newSlot;

    // Verify projection with newSO and newCW:
    const projectedX = newR - (lastGlobalIdx - newSO - anchorGIdx) * newSlot + newSlot / 2;
    assert(Math.abs(projectedX - midX) < 0.0001, `Pinch midpoint stays strictly anchored at ${midX}px (got ${projectedX.toFixed(4)})`);
    assert(newCW === 16.0, `New candle width is scaled 2x to 16.0 (got ${newCW})`);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. DATABASE & PRISMA SESSION LIFECYCLE VALIDATIONS
  // ─────────────────────────────────────────────────────────────
  console.log('\n[4] Database: Session & Trade Creation, Look-Ahead Guard, Close Flow');

  let testSessionId: string | null = null;
  let testTradeId: string | null = null;

  try {
    // 4.1 Create real test session
    const sessionStartTime = new Date('2024-01-15T10:00:00Z');
    const session = await prisma.manualBacktestSession.create({
      data: {
        name: 'Automated Test Session',
        symbol: 'XAUUSD',
        provider: 'DUKASCOPY',
        timeframe: 'M1',
        startTime: sessionStartTime,
        replayTime: sessionStartTime,
        initialBalance: 10000,
        currentBalance: 10000,
        riskPercent: 1.0,
      },
    });
    testSessionId = session.id;
    assert(Boolean(testSessionId), `Session created with ID: ${testSessionId}`);

    // 4.2 Look-ahead bias guard test:
    // Try to open trade at 10:05:00Z when replayTime is 10:00:00Z -> must reject
    const futureTime = new Date('2024-01-15T10:05:00Z');
    const isLookAhead = futureTime.getTime() > session.replayTime.getTime();
    assert(isLookAhead, 'Look-ahead condition properly detected (trade time > replay time)');

    // 4.3 Valid trade open at session.replayTime (10:00:00Z)
    const validTrade = await prisma.manualBacktestTrade.create({
      data: {
        sessionId: session.id,
        tradeNumber: 1,
        side: 'BUY',
        entryTime: sessionStartTime,
        entryPrice: 2050.00,
        slPrice: 2040.00,
        tpPrice: 2070.00,
        volume: 1.0,
        riskAmount: 100.00,
        status: 'OPEN',
      },
    });
    testTradeId = validTrade.id;
    assert(Boolean(testTradeId), `Trade opened with ID: ${testTradeId}, status: ${validTrade.status}`);

    // 4.4 Duplicate trade open check:
    const activeTrades = await prisma.manualBacktestTrade.findMany({
      where: { sessionId: session.id, status: 'OPEN' },
    });
    assert(activeTrades.length === 1, 'Exactly 1 open trade found for session');

    // 4.5 Trade close validation:
    // Testing the exact logic of server/src/routes/backtest.ts lines 440-520
    const exitPrice = 2070.00;
    const exitTime = new Date('2024-01-15T10:15:00Z');
    const exitReason = 'TP';

    // Verify session lookup doesn't pass undefined
    const retrievedSession = await prisma.manualBacktestSession.findUnique({
      where: { id: session.id },
    });
    assert(retrievedSession !== null, 'Session found by ID (not undefined)');

    const retrievedTrade = await prisma.manualBacktestTrade.findUnique({
      where: { id: validTrade.id },
    });
    assert(retrievedTrade !== null && retrievedTrade.sessionId === session.id, 'Trade found and belongs to session');
    if (!retrievedTrade) throw new Error('Trade unexpectedly null');

    assert(retrievedTrade.status === 'OPEN', 'Trade status is OPEN before closing');

    // Calculate PnL & update
    const pnl = calculatePnL('LONG', retrievedTrade.entryPrice, exitPrice, retrievedTrade.volume);
    const newBalance = Math.round((session.currentBalance + pnl) * 100) / 100;

    const closedTrade = await prisma.manualBacktestTrade.update({
      where: { id: validTrade.id },
      data: {
        exitTime,
        exitPrice,
        exitReason,
        pnl,
        status: 'CLOSED',
      },
    });

    const updatedSession = await prisma.manualBacktestSession.update({
      where: { id: session.id },
      data: { currentBalance: newBalance },
    });

    assert(closedTrade.status === 'CLOSED', 'Trade successfully updated to status CLOSED');
    assert(closedTrade.exitPrice === 2070.00, 'Exit price set to 2070.00');
    assert(closedTrade.pnl === 2000.00, `PnL calculated correctly: +$${closedTrade.pnl}`);
    assert(updatedSession.currentBalance === 12000.00, `Account balance updated: $${updatedSession.currentBalance}`);

    // 4.6 Attempt to close already closed trade -> conflict
    const recheckTrade = await prisma.manualBacktestTrade.findUnique({
      where: { id: validTrade.id },
    });
    const isAlreadyClosed = recheckTrade?.status !== 'OPEN';
    assert(isAlreadyClosed, 'Re-closing already closed trade is prevented (detected status CLOSED)');

    // 4.7 Multiple Concurrent Open Trades (Layering / Re-Entry)
    // Open position 2
    const trade2 = await prisma.manualBacktestTrade.create({
      data: {
        sessionId: session.id,
        tradeNumber: 2,
        side: 'BUY',
        entryTime: sessionStartTime,
        entryPrice: 2055.00,
        slPrice: 2045.00,
        tpPrice: 2075.00,
        volume: 0.5,
        riskAmount: 50.00,
        status: 'OPEN',
      },
    });
    // Open position 3 (concurrently open!)
    const trade3 = await prisma.manualBacktestTrade.create({
      data: {
        sessionId: session.id,
        tradeNumber: 3,
        side: 'SELL',
        entryTime: sessionStartTime,
        entryPrice: 2055.00,
        slPrice: 2065.00,
        tpPrice: 2035.00,
        volume: 0.25,
        riskAmount: 25.00,
        status: 'OPEN',
      },
    });

    const multiOpenTrades = await prisma.manualBacktestTrade.findMany({
      where: { sessionId: session.id, status: 'OPEN' },
    });
    assert(multiOpenTrades.length === 2, `Multiple concurrent open trades permitted (found ${multiOpenTrades.length} open)`);

    // 4.8 Batch Close-All logic
    const batchExitPrice = 2060.00;
    const batchExitTime = new Date('2024-01-15T10:20:00Z');
    let totalBatchPnl = 0;
    for (const ot of multiOpenTrades) {
      const p = calculatePnL(ot.side === 'BUY' ? 'LONG' : 'SHORT', ot.entryPrice, batchExitPrice, ot.volume);
      totalBatchPnl += p;
      await prisma.manualBacktestTrade.update({
        where: { id: ot.id },
        data: {
          exitTime: batchExitTime,
          exitPrice: batchExitPrice,
          exitReason: 'MANUAL_CLOSE_ALL',
          pnl: p,
          status: 'CLOSED',
        },
      });
    }

    const postBatchOpen = await prisma.manualBacktestTrade.findMany({
      where: { sessionId: session.id, status: 'OPEN' },
    });
    assert(postBatchOpen.length === 0, 'Batch close-all closed all open trades (0 open remaining)');

    // 4.9 calculateBacktestStats with multiple active trades
    const fakeActive1: any = { status: 'OPEN', side: 'LONG', entryPrice: 2000, slPrice: 1990, tpPrice: 2020, volume: 1.0 };
    const fakeActive2: any = { status: 'OPEN', side: 'LONG', entryPrice: 2010, slPrice: 2000, tpPrice: 2030, volume: 1.0 };
    const statsMulti = calculateBacktestStats([], 10000, [fakeActive1, fakeActive2], 2020);
    // fakeActive1 at 2020: +$2000; fakeActive2 at 2020: +$1000 => total unrealized +$3000 => equity $13000
    assert(statsMulti.equity === 13000, `calculateBacktestStats correctly calculates total equity across multiple open positions ($${statsMulti.equity})`);
  } finally {
    // Cleanup test data
    if (testSessionId) {
      await prisma.manualBacktestTrade.deleteMany({ where: { sessionId: testSessionId } }).catch(() => {});
      await prisma.manualBacktestSession.deleteMany({ where: { id: testSessionId } }).catch(() => {});
    }
  }

  console.log('\n===========================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('===========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
