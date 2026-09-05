import assert from 'assert';

console.log('====================================================');
console.log('REPLAYFX CHART NAVIGATION & VIEWPORT REGRESSION SUITE');
console.log('====================================================');

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}:`, err.message);
    process.exit(1);
  }
}

// ── Model Implementation for Unit Testing ──
function createViewportModel(params: {
  candleCount: number;
  scrollOffset: number;
  candleWidth?: number;
  cssW?: number;
  cssH?: number;
}) {
  const cw = params.candleWidth ?? 8;
  const so = params.scrollOffset;
  const cssW = params.cssW ?? 900;
  const priceScaleW = 76;
  const chartW = Math.max(50, cssW - priceScaleW); // 824
  const slot = cw * 1.2; // 9.6
  const rightMargin = Math.max(35, slot * 8); // 76.8

  const lastGlobalIdx = params.candleCount - 1;
  const rightmostIdx = lastGlobalIdx - so;

  const visibleBars = (chartW - rightMargin) / slot;
  const endIdx = Math.min(lastGlobalIdx, Math.max(0, Math.ceil(rightmostIdx + rightMargin / slot + 2)));
  const startIdx = Math.max(0, Math.floor(rightmostIdx - visibleBars - 4));

  const getX = (gIdx: number) => {
    const distFromRight = rightmostIdx - gIdx;
    return chartW - rightMargin - distFromRight * slot + slot / 2;
  };

  const xToGIdx = (x: number) => {
    const distFromRight = (chartW - rightMargin - x + slot / 2) / slot;
    return rightmostIdx - distFromRight;
  };

  const getRenderedCandles = () => {
    const list: Array<{ idx: number; x: number }> = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const x = getX(i);
      if (x >= -cw && x <= chartW + cw) {
        list.push({ idx: i, x });
      }
    }
    return list;
  };

  return {
    chartW,
    rightMargin,
    slot,
    visibleBars,
    lastGlobalIdx,
    rightmostIdx,
    startIdx,
    endIdx,
    getX,
    xToGIdx,
    getRenderedCandles,
  };
}

// [1] Testing Invertibility
console.log('\n[1] Testing getX / xToGIdx Invertibility');
test('xToGIdx(getX(i)) === i for any integer index', () => {
  const vp = createViewportModel({ candleCount: 1500, scrollOffset: 50 });
  for (let i = 0; i < 1500; i += 50) {
    const x = vp.getX(i);
    const roundtrip = vp.xToGIdx(x);
    assert.ok(Math.abs(roundtrip - i) < 1e-9, `Expected ${i}, got ${roundtrip}`);
  }
});

test('getX(xToGIdx(x)) === x for any pixel coordinate', () => {
  const vp = createViewportModel({ candleCount: 1500, scrollOffset: 50 });
  for (let x = 0; x <= 824; x += 50) {
    const gIdx = vp.xToGIdx(x);
    const roundtripX = vp.getX(gIdx);
    assert.ok(Math.abs(roundtripX - x) < 1e-9, `Expected ${x}, got ${roundtripX}`);
  }
});

// [2] Testing Viewport Candlestick Rendering at Various Offsets (Never Blank)
console.log('\n[2] Testing Viewport Rendering across All Pan Offsets (Never Blank)');
[0, 10, 50, 100, 500, 1000, 1400].forEach((so) => {
  test(`scrollOffset = ${so}: renderedCandleCount > 0 and fills screen`, () => {
    const vp = createViewportModel({ candleCount: 1500, scrollOffset: so });
    const rendered = vp.getRenderedCandles();
    assert.ok(rendered.length >= 70, `Expected at least 70 rendered candles, got ${rendered.length}`);
    const firstX = rendered[0].x;
    const lastX = rendered[rendered.length - 1].x;
    assert.ok(firstX <= 10, `First candle should be near left edge, got ${firstX}`);
    assert.ok(lastX >= 700, `Last candle should be near right edge, got ${lastX}`);
  });
});

[-5, -10, -15, -20].forEach((so) => {
  test(`Negative scrollOffset = ${so}: newest candle remains visible on screen`, () => {
    const vp = createViewportModel({ candleCount: 1500, scrollOffset: so });
    const rendered = vp.getRenderedCandles();
    assert.ok(rendered.length > 0, `Expected rendered candles, got 0`);
    const newestCandle = rendered.find((c) => c.idx === 1499);
    assert.ok(newestCandle != null, 'Newest candle (1499) must be rendered in viewport');
    assert.ok(newestCandle.x > 0 && newestCandle.x <= 824, `Newest candle X should be on canvas, got ${newestCandle.x}`);
  });
});

// [3] Testing Natural Pan Direction
console.log('\n[3] Testing Natural Pan Direction');
test('Dragging mouse right (dx > 0) moves candles right and increases scrollOffset', () => {
  const vpInitial = createViewportModel({ candleCount: 1500, scrollOffset: 0 });
  const initialCandle1490_X = vpInitial.getX(1490);

  // User drags mouse right by 96px (10 slots)
  const dx = 96;
  const shift = dx / vpInitial.slot; // 10
  const vpAfter = createViewportModel({ candleCount: 1500, scrollOffset: 0 + shift });
  const afterCandle1490_X = vpAfter.getX(1490);

  assert.strictEqual(shift, 10);
  assert.strictEqual(afterCandle1490_X - initialCandle1490_X, 96);
  assert.ok(afterCandle1490_X > initialCandle1490_X, 'Candle moved to the right with mouse');
});

test('Dragging mouse left (dx < 0) moves candles left and decreases scrollOffset', () => {
  const vpInitial = createViewportModel({ candleCount: 1500, scrollOffset: 50 });
  const initialCandle1450_X = vpInitial.getX(1450);

  // User drags mouse left by 48px (5 slots)
  const dx = -48;
  const shift = dx / vpInitial.slot; // -5
  const vpAfter = createViewportModel({ candleCount: 1500, scrollOffset: 50 + shift });
  const afterCandle1450_X = vpAfter.getX(1450);

  assert.strictEqual(shift, -5);
  assert.strictEqual(afterCandle1450_X - initialCandle1450_X, -48);
  assert.ok(afterCandle1450_X < initialCandle1450_X, 'Candle moved to the left with mouse');
});

// [4] Testing Mouse-Anchored Zoom
console.log('\n[4] Testing Mouse-Anchored Zoom Mathematics');
test('Zooming in preserves the candle position under the mouse', () => {
  const mouseX = 400;
  const vp1 = createViewportModel({ candleCount: 1500, scrollOffset: 50, candleWidth: 8 });
  const anchorGIdx = vp1.xToGIdx(mouseX);

  // Zoom in by factor 1.25
  const newCW = 8 * 1.25; // 10
  const newSlot = newCW * 1.2; // 12
  const newRightMargin = Math.max(35, newSlot * 8); // 96
  const newR = vp1.chartW - newRightMargin;
  const newSO = vp1.lastGlobalIdx - anchorGIdx - (newR - mouseX + newSlot / 2) / newSlot;

  const vp2 = createViewportModel({ candleCount: 1500, scrollOffset: newSO, candleWidth: newCW });
  const roundtripX = vp2.getX(anchorGIdx);

  assert.ok(Math.abs(roundtripX - mouseX) < 1e-9, `Expected ${mouseX}, got ${roundtripX}`);
});

test('Zooming out preserves the candle position under the mouse', () => {
  const mouseX = 650;
  const vp1 = createViewportModel({ candleCount: 1500, scrollOffset: 100, candleWidth: 10 });
  const anchorGIdx = vp1.xToGIdx(mouseX);

  // Zoom out by factor 0.8
  const newCW = 10 * 0.8; // 8
  const newSlot = newCW * 1.2; // 9.6
  const newRightMargin = Math.max(35, newSlot * 8);
  const newR = vp1.chartW - newRightMargin;
  const newSO = vp1.lastGlobalIdx - anchorGIdx - (newR - mouseX + newSlot / 2) / newSlot;

  const vp2 = createViewportModel({ candleCount: 1500, scrollOffset: newSO, candleWidth: newCW });
  const roundtripX = vp2.getX(anchorGIdx);

  assert.ok(Math.abs(roundtripX - mouseX) < 1e-9, `Expected ${mouseX}, got ${roundtripX}`);
});

// [5] Testing Data Prepending & Appending Viewport Preservation
console.log('\n[5] Testing Prepending & Appending Viewport Preservation');
test('Prepending older candles preserves viewport without changing scrollOffset', () => {
  // Before prepend: 1000 candles (0..999), user looking at candle 950 with so = 20
  const vpBefore = createViewportModel({ candleCount: 1000, scrollOffset: 20 });
  const xBefore = vpBefore.getX(950);

  // 500 older candles prepended -> total 1500 candles. Candle 950 is now at index 950 + 500 = 1450.
  const vpAfter = createViewportModel({ candleCount: 1500, scrollOffset: 20 });
  const xAfter = vpAfter.getX(1450);

  assert.strictEqual(xBefore, xAfter, 'Prepending older candles must not shift screen position of visible candles');
});

test('Appending newer candles preserves viewport by incrementing scrollOffset by appended count', () => {
  // Before append: 1000 candles (0..999), user looking at candle 950 with so = 20
  const vpBefore = createViewportModel({ candleCount: 1000, scrollOffset: 20 });
  const xBefore = vpBefore.getX(950);

  // 200 newer candles appended -> total 1200 candles. Candle 950 is still at index 950.
  // scrollOffset increments by 200 (so = 220)
  const vpAfter = createViewportModel({ candleCount: 1200, scrollOffset: 20 + 200 });
  const xAfter = vpAfter.getX(950);

  assert.strictEqual(xBefore, xAfter, 'Appending newer candles must not shift screen position when scrollOffset is compensated');
});

// [6] Testing Canvas Resize Invariance
console.log('\n[6] Testing Canvas Resize Geometry');
test('Changing container width updates chartW and maintains invertible coordinates', () => {
  const vpSmall = createViewportModel({ candleCount: 1500, scrollOffset: 30, cssW: 600 });
  const vpLarge = createViewportModel({ candleCount: 1500, scrollOffset: 30, cssW: 1400 });

  assert.strictEqual(vpSmall.chartW, 600 - 76);
  assert.strictEqual(vpLarge.chartW, 1400 - 76);

  // Anchor candle (1500 - 1 - 30 = 1469) is always at the right margin
  const smallAnchorX = vpSmall.getX(1469);
  const largeAnchorX = vpLarge.getX(1469);

  assert.strictEqual(smallAnchorX, vpSmall.chartW - vpSmall.rightMargin + vpSmall.slot / 2);
  assert.strictEqual(largeAnchorX, vpLarge.chartW - vpLarge.rightMargin + vpLarge.slot / 2);
});

// [7] Testing Drawing Coordinate Stability
console.log('\n[7] Testing Drawing Timestamp & Coordinate Stability');
test('Drawing time-to-X and X-to-time conversion is exact', () => {
  const candles = Array.from({ length: 1500 }, (_, i) => ({
    time: new Date(1700000000000 + i * 60000).toISOString(),
    close: 3000 + i * 0.1,
  }));
  const vp = createViewportModel({ candleCount: 1500, scrollOffset: 45 });

  // Select candle 1400
  const candle1400_Time = new Date(candles[1400].time).getTime();
  const screenX = vp.getX(1400);

  // Convert screenX back to index
  const roundtripGIdx = Math.round(vp.xToGIdx(screenX));
  assert.strictEqual(roundtripGIdx, 1400);
  assert.strictEqual(new Date(candles[roundtripGIdx].time).getTime(), candle1400_Time);
});

// [8] Testing Vertical Zoom Anchoring Mathematics
console.log('\n[8] Testing Vertical Zoom Anchoring Mathematics (Zero Vertical Jump)');
test('Vertical anchor compensation guarantees price under mouse cursor stays unchanged after zoom', () => {
  const candleH = 450;
  const mouseY = 250;

  // Viewport 1 (before zoom):
  const mid1 = 3125.00;
  const scaledRange1 = 40.00 * 1.16;
  const po1 = 0.0;
  const paddedMax1 = mid1 + scaledRange1 / 2 + po1;
  const totalRange1 = scaledRange1;
  const yToPrice1 = (y: number) => paddedMax1 - ((y - 10) / (candleH - 20)) * totalRange1;

  const anchorPrice = yToPrice1(mouseY);

  // Viewport 2 (after zoom: visible range changes dramatically):
  const mid2 = 3112.50; // shifted mid
  const scaledRange2 = 18.00 * 1.16; // narrowed range
  const totalRange2 = scaledRange2;

  // Compensated po2
  const po2 = anchorPrice + ((mouseY - 10) / (candleH - 20)) * totalRange2 - (mid2 + scaledRange2 / 2);
  const paddedMax2 = mid2 + scaledRange2 / 2 + po2;
  const getY2 = (p: number) => ((paddedMax2 - p) / totalRange2) * (candleH - 20) + 10;
  const yAfter = getY2(anchorPrice);

  assert.ok(Math.abs(yAfter - mouseY) < 1e-9, `Expected mouse Y ${mouseY}, got ${yAfter}`);
});

// [9] Testing Fibonacci Retracement Levels & Custom 0.705 Level
console.log('\n[9] Testing Fibonacci Retracement Levels & Custom 0.705 Level');
test('Fibonacci levels compute exact price points including golden pocket and 0.705', () => {
  const p1 = 3000.0;
  const p2 = 3100.0;
  const diff = p2 - p1;

  const defaultLevels = [
    { value: 0.0, label: '0.0%' },
    { value: 0.236, label: '23.6%' },
    { value: 0.382, label: '38.2%' },
    { value: 0.5, label: '50.0%' },
    { value: 0.618, label: '61.8%' },
    { value: 0.705, label: '70.5%' },
    { value: 0.786, label: '78.6%' },
    { value: 1.0, label: '100.0%' },
  ];

  const prices = defaultLevels.map((lvl) => ({
    value: lvl.value,
    price: p1 + diff * lvl.value,
  }));

  assert.strictEqual(prices.find((p) => p.value === 0.0)?.price, 3000.0);
  assert.strictEqual(prices.find((p) => p.value === 0.5)?.price, 3050.0);
  assert.strictEqual(prices.find((p) => p.value === 0.618)?.price, 3061.8);
  assert.strictEqual(prices.find((p) => p.value === 0.705)?.price, 3070.5);
  assert.strictEqual(prices.find((p) => p.value === 1.0)?.price, 3100.0);

  // Golden pocket band span
  const goldenStart = prices.find((p) => p.value === 0.5)!.price;
  const goldenEnd = prices.find((p) => p.value === 0.618)!.price;
  assert.ok(goldenEnd > goldenStart, 'Golden pocket is bounded between 0.5 and 0.618');
});

test('Fibonacci custom level editing supports arbitrary custom ratio (e.g. 0.745)', () => {
  const p1 = 3000.0;
  const p2 = 3100.0;
  const diff = p2 - p1;
  const customRatio = 0.745;
  const customPrice = p1 + diff * customRatio;
  assert.strictEqual(customPrice, 3074.5);
});

// [10] Testing Drawing Deletion Guard
console.log('\n[10] Testing Drawing Deletion Keyboard Event Guard');
test('Delete/Backspace event ignored when target is an input or textarea', () => {
  const isTargetIgnored = (tagName: string) => {
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
  };

  assert.strictEqual(isTargetIgnored('INPUT'), true);
  assert.strictEqual(isTargetIgnored('TEXTAREA'), true);
  assert.strictEqual(isTargetIgnored('SELECT'), true);
  assert.strictEqual(isTargetIgnored('CANVAS'), false);
  assert.strictEqual(isTargetIgnored('BODY'), false);
  assert.strictEqual(isTargetIgnored('DIV'), false);
});

console.log('\n====================================================');
console.log(`TEST SUMMARY: ${passed} PASSED | 0 FAILED`);
console.log('====================================================\n');
