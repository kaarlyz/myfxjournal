/**
 * ReplayFX Journal — Profit & PnL Mathematical Audit Suite
 * 
 * Tests exact XAUUSD contract specifications:
 * - Contract size: 100 troy ounces per lot
 * - PnL = (Exit - Entry) * Volume * ContractSize for LONG
 * - PnL = (Entry - Exit) * Volume * ContractSize for SHORT
 * - Precision: 2 decimal places (cents)
 * - Validation of position sizing and Risk:Reward ratios
 */

import {
  calculatePnL,
  calculatePositionSize,
  calculateRR,
  calculateTPFromRR,
  evaluateCandleHit,
  calculateBacktestStats,
  BacktestCandle,
  BacktestTradeRecord,
  XAUUSD_CONTRACT_SIZE,
} from '../services/backtestEngine';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    process.exit(1);
  } else {
    console.log(`  [PASS] ${message}`);
  }
}

function runProfitAudit() {
  console.log('===========================================================');
  console.log('REPLAYFX JOURNAL: PROFIT & PNL MATHEMATICAL AUDIT SUITE');
  console.log('===========================================================\n');

  // ── [1] Contract Specification Verification ──
  console.log('[1] Testing Contract Specifications');
  assert(XAUUSD_CONTRACT_SIZE === 100, 'XAUUSD contract size is strictly 100 oz / lot');

  // ── [2] Required Prompt Test Cases (0.10 Lot) ──
  console.log('\n[2] Testing Core Specification Test Cases (0.10 Lot, 100 oz Contract)');
  
  // LONG PROFIT: Entry 3000, Exit 3010, Lot 0.10 -> Expected: +$100.00
  const longProfit = calculatePnL('LONG', 3000, 3010, 0.10, 100);
  assert(longProfit === 100.00, `LONG Profit: Entry 3000, Exit 3010, 0.10 lot = +$100.00 (got ${longProfit})`);

  // LONG LOSS: Entry 3000, Exit 2990, Lot 0.10 -> Expected: -$100.00
  const longLoss = calculatePnL('LONG', 3000, 2990, 0.10, 100);
  assert(longLoss === -100.00, `LONG Loss: Entry 3000, Exit 2990, 0.10 lot = -$100.00 (got ${longLoss})`);

  // SHORT PROFIT: Entry 3000, Exit 2990, Lot 0.10 -> Expected: +$100.00
  const shortProfit = calculatePnL('SHORT', 3000, 2990, 0.10, 100);
  assert(shortProfit === 100.00, `SHORT Profit: Entry 3000, Exit 2990, 0.10 lot = +$100.00 (got ${shortProfit})`);

  // SHORT LOSS: Entry 3000, Exit 3010, Lot 0.10 -> Expected: -$100.00
  const shortLoss = calculatePnL('SHORT', 3000, 3010, 0.10, 100);
  assert(shortLoss === -100.00, `SHORT Loss: Entry 3000, Exit 3010, 0.10 lot = -$100.00 (got ${shortLoss})`);

  // ── [3] Fractional Lot Scaling: 0.01 Lot (Micro) ──
  console.log('\n[3] Testing Micro Lot Scaling (0.01 Lot = $1/point)');
  const microLongProfit = calculatePnL('LONG', 3000, 3005.50, 0.01, 100);
  assert(microLongProfit === 5.50, `0.01 lot +5.50 pts = +$5.50 (got ${microLongProfit})`);

  const microLongLoss = calculatePnL('LONG', 3000, 2992.25, 0.01, 100);
  assert(microLongLoss === -7.75, `0.01 lot -7.75 pts = -$7.75 (got ${microLongLoss})`);

  const microShortProfit = calculatePnL('SHORT', 3000, 2994.20, 0.01, 100);
  assert(microShortProfit === 5.80, `0.01 lot SHORT +5.80 pts = +$5.80 (got ${microShortProfit})`);

  const microShortLoss = calculatePnL('SHORT', 3000, 3008.30, 0.01, 100);
  assert(microShortLoss === -8.30, `0.01 lot SHORT -8.30 pts = -$8.30 (got ${microShortLoss})`);

  // ── [4] Standard Lot Scaling: 1.00 Lot (Standard = $100/point) ──
  console.log('\n[4] Testing Standard Lot Scaling (1.00 Lot = $100/point)');
  const stdLongProfit = calculatePnL('LONG', 3000, 3020, 1.00, 100);
  assert(stdLongProfit === 2000.00, `1.00 lot +20.00 pts = +$2,000.00 (got ${stdLongProfit})`);

  const stdLongLoss = calculatePnL('LONG', 3000, 2985, 1.00, 100);
  assert(stdLongLoss === -1500.00, `1.00 lot -15.00 pts = -$1,500.00 (got ${stdLongLoss})`);

  const stdShortProfit = calculatePnL('SHORT', 3000, 2975, 1.00, 100);
  assert(stdShortProfit === 2500.00, `1.00 lot SHORT +25.00 pts = +$2,500.00 (got ${stdShortProfit})`);

  const stdShortLoss = calculatePnL('SHORT', 3000, 3012, 1.00, 100);
  assert(stdShortLoss === -1200.00, `1.00 lot SHORT -12.00 pts = -$1,200.00 (got ${stdShortLoss})`);

  // ── [5] Position Sizing with Risk Management ──
  console.log('\n[5] Testing Position Sizing from Account Balance & Risk %');
  const calculatedLot1 = calculatePositionSize(10000, 1.0, 3000, 2990, 100);
  assert(calculatedLot1 === 0.10, `Balance $10,000, 1% risk ($100), 10 pts risk = 0.10 lot (got ${calculatedLot1})`);

  const calculatedLot2 = calculatePositionSize(25000, 2.0, 3000, 2995, 100);
  assert(calculatedLot2 === 1.00, `Balance $25,000, 2% risk ($500), 5 pts risk = 1.00 lot (got ${calculatedLot2})`);

  const calculatedLotMin = calculatePositionSize(100, 1.0, 3000, 2900, 100);
  assert(calculatedLotMin === 0.01, `Extremely small balance/risk clamps to 0.01 lot (got ${calculatedLotMin})`);

  // ── [6] Risk-to-Reward (RR) Calculations ──
  console.log('\n[6] Testing Risk-to-Reward (RR) Calculations');
  const longRR = calculateRR('LONG', 3000, 2990, 3020);
  assert(longRR.isValid && longRR.rr === 2.00, `LONG RR: Entry 3000, SL 2990, TP 3020 = 1:2.00 (got ${longRR.rr})`);

  const shortRR = calculateRR('SHORT', 3000, 3010, 2980);
  assert(shortRR.isValid && shortRR.rr === 2.00, `SHORT RR: Entry 3000, SL 3010, TP 2980 = 1:2.00 (got ${shortRR.rr})`);

  const targetTPLong = calculateTPFromRR('LONG', 3000, 2990, 2.5);
  assert(targetTPLong === 3025.00, `Target TP for LONG with RR 2.5 and 10 pts risk = 3025.00 (got ${targetTPLong})`);

  const targetTPShort = calculateTPFromRR('SHORT', 3000, 3010, 3.0);
  assert(targetTPShort === 2970.00, `Target TP for SHORT with RR 3.0 and 10 pts risk = 2970.00 (got ${targetTPShort})`);

  // Invalid Crossing Detection:
  const invalidLongSL = calculateRR('LONG', 3000, 3005, 3020);
  assert(!invalidLongSL.isValid, 'LONG with SL above Entry is invalid');

  const invalidLongTP = calculateRR('LONG', 3000, 2990, 2995);
  assert(!invalidLongTP.isValid, 'LONG with TP below Entry is invalid');

  const invalidShortSL = calculateRR('SHORT', 3000, 2990, 2970);
  assert(!invalidShortSL.isValid, 'SHORT with SL below Entry is invalid');

  const invalidShortTP = calculateRR('SHORT', 3000, 3010, 3015);
  assert(!invalidShortTP.isValid, 'SHORT with TP above Entry is invalid');

  // ── [7] Candle Evaluation: SL Hit, TP Hit, Intrabar Ambiguity ──
  console.log('\n[7] Testing Candle Evaluation (SL, TP, and Intrabar Ambiguity)');
  const tradeLong = { side: 'LONG' as const, entryPrice: 3000, slPrice: 2990, tpPrice: 3020 };

  const candleTP: BacktestCandle = {
    time: new Date(),
    open: 3005,
    high: 3022,
    low: 3002,
    close: 3018,
  };
  const hitTPResult = evaluateCandleHit(tradeLong, candleTP);
  assert(hitTPResult.type === 'TP' && hitTPResult.exitPrice === 3020, 'Candle hitting TP evaluates to TP at 3020');

  const candleSL: BacktestCandle = {
    time: new Date(),
    open: 2995,
    high: 2998,
    low: 2988,
    close: 2991,
  };
  const hitSLResult = evaluateCandleHit(tradeLong, candleSL);
  assert(hitSLResult.type === 'SL' && hitSLResult.exitPrice === 2990, 'Candle hitting SL evaluates to SL at 2990');

  const candleAmbiguous: BacktestCandle = {
    time: new Date(),
    open: 3000,
    high: 3025,
    low: 2985,
    close: 3002,
  };
  const hitAmbiguousResult = evaluateCandleHit(tradeLong, candleAmbiguous);
  assert(hitAmbiguousResult.type === 'INTRABAR_AMBIGUOUS', 'Candle touching both SL and TP flagged as INTRABAR_AMBIGUOUS');

  // ── [8] Session Statistics Verification ──
  console.log('\n[8] Testing Session Statistics & Balance Aggregation');
  const mockTrades: BacktestTradeRecord[] = [
    {
      id: 'trade-1',
      tradeNumber: 1,
      side: 'LONG',
      entryPrice: 3000,
      entryTime: new Date('2025-01-01T10:00:00Z'),
      slPrice: 2990,
      tpPrice: 3020,
      exitPrice: 3020,
      exitTime: new Date('2025-01-01T10:30:00Z'),
      exitReason: 'TP',
      volume: 0.10,
      riskAmount: 100,
      pnl: 200.00,
      rr: 2.00,
      status: 'CLOSED',
    },
    {
      id: 'trade-2',
      tradeNumber: 2,
      side: 'SHORT',
      entryPrice: 3015,
      entryTime: new Date('2025-01-01T11:00:00Z'),
      slPrice: 3025,
      tpPrice: 2995,
      exitPrice: 3025,
      exitTime: new Date('2025-01-01T11:15:00Z'),
      exitReason: 'SL',
      volume: 0.10,
      riskAmount: 100,
      pnl: -100.00,
      rr: -1.00,
      status: 'CLOSED',
    },
  ];

  const stats = calculateBacktestStats(mockTrades, 10000);
  assert(stats.initialBalance === 10000, 'Initial balance is $10,000');
  assert(stats.currentBalance === 10100, `Current balance is $10,100 (got ${stats.currentBalance})`);
  assert(stats.netPnl === 100.00, `Net PnL is +$100 (got ${stats.netPnl})`);
  assert(stats.totalTrades === 2, `Total trades is 2 (got ${stats.totalTrades})`);
  assert(stats.wins === 1 && stats.losses === 1, '1 Win and 1 Loss');
  assert(stats.winRate === 50.0, `Win rate is 50.0% (got ${stats.winRate})`);

  console.log('\n===========================================================');
  console.log('PROFIT AUDIT: ALL TESTS PASSED STRICTLY AND CORRECTLY');
  console.log('===========================================================');
}

runProfitAudit();
