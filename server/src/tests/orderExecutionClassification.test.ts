import {
  getEffectiveOrderType,
  getSymbolPriceTolerance,
  evaluatePendingOrderTrigger,
} from '../services/backtestEngine';

let pass = 0;
let fail = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${expected}`);
    console.error(`    received: ${actual}`);
    fail++;
  }
}

// ---------------------------------------------------------------------------
// getSymbolPriceTolerance
// ---------------------------------------------------------------------------
console.log('\n[tolerance]');
assert('XAUUSD tolerance = 0.02', getSymbolPriceTolerance('XAUUSD'), 0.02);
assert('EURUSD tolerance = 0.0001', getSymbolPriceTolerance('EURUSD'), 0.0001);
assert('US30 tolerance = 0.1', getSymbolPriceTolerance('US30'), 0.1);
assert('unknown falls back to forex', getSymbolPriceTolerance('AUDNZD'), 0.0001);

// ---------------------------------------------------------------------------
// SELL direction
// ---------------------------------------------------------------------------
console.log('\n[SELL classification]');

{
  const r = getEffectiveOrderType({ direction: 'SELL', entryPrice: 4000, marketPrice: 4000, symbol: 'XAUUSD' });
  assert('SELL at market → MARKET_SELL', r.orderType, 'MARKET_SELL');
  assert('SELL at market → isPending false', r.isPending, false);
}

{
  const r = getEffectiveOrderType({ direction: 'SELL', entryPrice: 4500, marketPrice: 4000, symbol: 'XAUUSD' });
  assert('SELL entry 4500, market 4000 → SELL_LIMIT', r.orderType, 'SELL_LIMIT');
  assert('SELL_LIMIT → isPending true', r.isPending, true);
}

{
  const r = getEffectiveOrderType({ direction: 'SELL', entryPrice: 3500, marketPrice: 4000, symbol: 'XAUUSD' });
  assert('SELL entry 3500, market 4000 → SELL_STOP', r.orderType, 'SELL_STOP');
  assert('SELL_STOP → isPending true', r.isPending, true);
}

// ---------------------------------------------------------------------------
// BUY direction
// ---------------------------------------------------------------------------
console.log('\n[BUY classification]');

{
  const r = getEffectiveOrderType({ direction: 'BUY', entryPrice: 4000, marketPrice: 4000, symbol: 'XAUUSD' });
  assert('BUY at market → MARKET_BUY', r.orderType, 'MARKET_BUY');
  assert('BUY at market → isPending false', r.isPending, false);
}

{
  const r = getEffectiveOrderType({ direction: 'BUY', entryPrice: 3500, marketPrice: 4000, symbol: 'XAUUSD' });
  assert('BUY entry 3500, market 4000 → BUY_LIMIT', r.orderType, 'BUY_LIMIT');
  assert('BUY_LIMIT → isPending true', r.isPending, true);
}

{
  const r = getEffectiveOrderType({ direction: 'BUY', entryPrice: 4500, marketPrice: 4000, symbol: 'XAUUSD' });
  assert('BUY entry 4500, market 4000 → BUY_STOP', r.orderType, 'BUY_STOP');
  assert('BUY_STOP → isPending true', r.isPending, true);
}

// ---------------------------------------------------------------------------
// Tolerance boundary
// ---------------------------------------------------------------------------
console.log('\n[tolerance boundary]');

{
  const r = getEffectiveOrderType({ direction: 'SELL', entryPrice: 4000.01, marketPrice: 4000, symbol: 'XAUUSD' });
  assert('SELL 4000.01 vs 4000 (within tol) → MARKET_SELL', r.orderType, 'MARKET_SELL');
}

{
  const r = getEffectiveOrderType({ direction: 'SELL', entryPrice: 4000.02, marketPrice: 4000, symbol: 'XAUUSD' });
  assert('SELL 4000.02 vs 4000 (at boundary) → MARKET_SELL', r.orderType, 'MARKET_SELL');
}

{
  const r = getEffectiveOrderType({ direction: 'SELL', entryPrice: 4000.03, marketPrice: 4000, symbol: 'XAUUSD' });
  assert('SELL 4000.03 vs 4000 (over boundary) → SELL_LIMIT', r.orderType, 'SELL_LIMIT');
}

// ---------------------------------------------------------------------------
// Forex tolerance
// ---------------------------------------------------------------------------
console.log('\n[forex tolerance]');

{
  const r = getEffectiveOrderType({ direction: 'BUY', entryPrice: 1.10001, marketPrice: 1.10000, symbol: 'EURUSD' });
  assert('BUY 1.10001 vs 1.10000 (within forex tol) → MARKET_BUY', r.orderType, 'MARKET_BUY');
}

{
  const r = getEffectiveOrderType({ direction: 'BUY', entryPrice: 1.09800, marketPrice: 1.10000, symbol: 'EURUSD' });
  assert('BUY 1.09800 vs 1.10000 (far below) → BUY_LIMIT', r.orderType, 'BUY_LIMIT');
}

// ---------------------------------------------------------------------------
// evaluatePendingOrderTrigger
// ---------------------------------------------------------------------------
console.log('\n[pending trigger]');

const baseOrder = {
  id: 'test-1',
  sessionId: 'sess-1',
  side: 'SELL' as const,
  orderType: 'SELL_LIMIT' as const,
  entryPrice: 4200,
  slPrice: 4250,
  tpPrice: 4100,
  lotSize: 1,
  riskAmount: 100,
  symbol: 'XAUUSD',
  openTime: '2024-01-01T00:00:00Z',
  openCandleIndex: 0,
};

{
  const candle = { open: 4150, high: 4210, low: 4145, close: 4155, time: 0, volume: 100 };
  assert('SELL_LIMIT candle.high >= entry → triggered', evaluatePendingOrderTrigger(baseOrder, candle), true);
}

{
  const candle = { open: 4150, high: 4195, low: 4145, close: 4155, time: 0, volume: 100 };
  assert('SELL_LIMIT candle.high < entry → not triggered', evaluatePendingOrderTrigger(baseOrder, candle), false);
}

{
  const buyOrder = { ...baseOrder, side: 'BUY' as const, orderType: 'BUY_LIMIT' as const, entryPrice: 3900 };
  const candle = { open: 3950, high: 3960, low: 3895, close: 3940, time: 0, volume: 100 };
  assert('BUY_LIMIT candle.low <= entry → triggered', evaluatePendingOrderTrigger(buyOrder, candle), true);
}

{
  const buyOrder = { ...baseOrder, side: 'BUY' as const, orderType: 'BUY_LIMIT' as const, entryPrice: 3900 };
  const candle = { open: 3950, high: 3960, low: 3910, close: 3940, time: 0, volume: 100 };
  assert('BUY_LIMIT candle.low > entry → not triggered', evaluatePendingOrderTrigger(buyOrder, candle), false);
}

// ---------------------------------------------------------------------------
// REGRESSION: drag-to-pending
// ---------------------------------------------------------------------------
console.log('\n[REGRESSION: drag-to-pending]');

{
  const r = getEffectiveOrderType({
    direction: 'SELL',
    entryPrice: 4500,
    marketPrice: 4000,
    symbol: 'XAUUSD',
    requestedCategory: 'MARKET',
  });
  assert('Drag SELL entry 4500 (market=4000, was MARKET) → SELL_LIMIT', r.orderType, 'SELL_LIMIT');
  assert('isPending = true → pending order on confirm', r.isPending, true);
}

{
  const r = getEffectiveOrderType({
    direction: 'BUY',
    entryPrice: 3500,
    marketPrice: 4000,
    symbol: 'XAUUSD',
    requestedCategory: 'MARKET',
  });
  assert('Drag BUY entry 3500 (market=4000, was MARKET) → BUY_LIMIT', r.orderType, 'BUY_LIMIT');
  assert('isPending = true', r.isPending, true);
}

// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
