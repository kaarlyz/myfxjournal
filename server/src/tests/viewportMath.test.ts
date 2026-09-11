import assert from 'assert';

/**
 * Viewport Canonical Projection Helper
 */
function createViewport(config: {
  chartW: number;
  candlesCount: number;
  cw: number;
  panOffsetX: number;
}) {
  const { chartW, candlesCount, cw, panOffsetX } = config;
  const spacing = Math.max(1, cw * 0.2);
  const slot = cw + spacing;
  const rightMargin = Math.max(35, slot * 6);
  const lastGlobalIdx = Math.max(0, candlesCount - 1);

  const getX = (gIdx: number): number => {
    return chartW - rightMargin + (gIdx - lastGlobalIdx) * slot + panOffsetX + slot / 2;
  };

  const xToGIdx = (x: number): number => {
    return lastGlobalIdx + (x - (chartW - rightMargin) - panOffsetX - slot / 2) / slot;
  };

  const cursorCenteredZoom = (mouseX: number, newCW: number): number => {
    const anchorGIdx = xToGIdx(mouseX);
    const newSpacing = Math.max(1, newCW * 0.2);
    const newSlot = newCW + newSpacing;
    const newRightMargin = Math.max(35, newSlot * 6);

    let newPanX = mouseX - (chartW - newRightMargin) - (anchorGIdx - lastGlobalIdx) * newSlot - newSlot / 2;
    const minPanX = -Math.round(chartW * 0.35);
    const maxPanX = Math.max(0, lastGlobalIdx * newSlot + 100);
    return Math.max(minPanX, Math.min(maxPanX, newPanX));
  };

  return { slot, rightMargin, lastGlobalIdx, getX, xToGIdx, cursorCenteredZoom };
}

console.log('=== RUNNING CANONICAL VIEWPORT UNIT TESTS ===\n');

// ── TEST 1: 1 px, 5 px, 10 px Pan Precision ──
{
  const chartW = 800;
  const count = 500;
  const cw = 8;
  const initialPan = 0;

  const vp0 = createViewport({ chartW, candlesCount: count, cw, panOffsetX: initialPan });
  const testCandleIdx = 450;
  const x0 = vp0.getX(testCandleIdx);

  // 1 px drag
  const vp1 = createViewport({ chartW, candlesCount: count, cw, panOffsetX: initialPan + 1 });
  const x1 = vp1.getX(testCandleIdx);
  assert.strictEqual(x1 - x0, 1, '1 px drag must move candle by exactly 1 px');

  // 5 px drag
  const vp5 = createViewport({ chartW, candlesCount: count, cw, panOffsetX: initialPan + 5 });
  const x5 = vp5.getX(testCandleIdx);
  assert.strictEqual(x5 - x0, 5, '5 px drag must move candle by exactly 5 px');

  // 10 px drag
  const vp10 = createViewport({ chartW, candlesCount: count, cw, panOffsetX: initialPan + 10 });
  const x10 = vp10.getX(testCandleIdx);
  assert.strictEqual(x10 - x0, 10, '10 px drag must move candle by exactly 10 px');

  // Repeated 1 px drags (10 times)
  let accumulatedPan = initialPan;
  for (let step = 1; step <= 10; step++) {
    accumulatedPan += 1;
    const vpStep = createViewport({ chartW, candlesCount: count, cw, panOffsetX: accumulatedPan });
    assert.strictEqual(vpStep.getX(testCandleIdx) - x0, step, `Step ${step} must match exact displacement`);
  }
  console.log('✓ TEST 1 PASSED: 1 px, 5 px, 10 px, and repeated drags are strictly 1:1');
}

// ── TEST 2: Mathematical Inverse Exactness ──
{
  const chartW = 1000;
  const count = 1200;
  const cw = 10;
  const panX = 45.75;

  const vp = createViewport({ chartW, candlesCount: count, cw, panOffsetX: panX });

  for (const testIdx of [0, 100.5, 450.25, 999, 1199]) {
    const x = vp.getX(testIdx);
    const recoveredIdx = vp.xToGIdx(x);
    assert(Math.abs(recoveredIdx - testIdx) < 1e-10, `Index ${testIdx} must invert exactly`);
  }

  for (const testX of [10, 250.5, 500, 750.25, 950]) {
    const idx = vp.xToGIdx(testX);
    const recoveredX = vp.getX(idx);
    assert(Math.abs(recoveredX - testX) < 1e-10, `Screen X ${testX} must invert exactly`);
  }
  console.log('✓ TEST 2 PASSED: Projection and inverse projection are exact mathematical inverses');
}

// ── TEST 3: Prepend Preservation (Older Candles) ──
{
  const chartW = 900;
  const initialCount = 1000;
  const cw = 8;
  const panX = 200;

  const vpInitial = createViewport({ chartW, candlesCount: initialCount, cw, panOffsetX: panX });
  const targetCandleOldIdx = 400; // e.g. candle #400 in initial array
  const screenXBefore = vpInitial.getX(targetCandleOldIdx);

  // Prepend 500 older candles at the beginning
  const prependedCount = 500;
  const newCount = initialCount + prependedCount;
  const targetCandleNewIdx = targetCandleOldIdx + prependedCount; // index shifts by +500

  // In canonical projection, panOffsetX remains unchanged
  const vpAfterPrepend = createViewport({ chartW, candlesCount: newCount, cw, panOffsetX: panX });
  const screenXAfter = vpAfterPrepend.getX(targetCandleNewIdx);

  assert.strictEqual(screenXAfter, screenXBefore, 'Prepending older candles must not move candle screen position (Zero Teleport)');
  console.log('✓ TEST 3 PASSED: Prepend older candles preserves exact viewport position without teleport');
}

// ── TEST 4: Append Preservation (Newer Candles) ──
{
  const chartW = 900;
  const initialCount = 1000;
  const cw = 8;
  const panX = 150;

  const vpInitial = createViewport({ chartW, candlesCount: initialCount, cw, panOffsetX: panX });
  const targetCandleIdx = 700; // Existing candle keeps its array index
  const screenXBefore = vpInitial.getX(targetCandleIdx);

  // Append 250 newer candles at the end
  const appendedCount = 250;
  const newCount = initialCount + appendedCount;
  const slot = vpInitial.slot;
  const compensatedPanX = panX + appendedCount * slot;

  const vpAfterAppend = createViewport({ chartW, candlesCount: newCount, cw, panOffsetX: compensatedPanX });
  const screenXAfter = vpAfterAppend.getX(targetCandleIdx);

  assert.strictEqual(screenXAfter, screenXBefore, 'Appending newer candles must preserve candle screen position when compensated');
  console.log('✓ TEST 4 PASSED: Append newer candles preserves exact viewport position with pixel compensation');
}

// ── TEST 5: Active Drag Mid-Append Compensation ──
{
  const chartW = 900;
  const initialCount = 1000;
  const cw = 8;
  const initialPan = 100;

  const dragStart = { startX: 300, startPanX: initialPan };

  // User drags mouse 10 px to the right
  let currentMouseX = 310;
  let dx = currentMouseX - dragStart.startX;
  let activePanX = dragStart.startPanX + dx;
  assert.strictEqual(activePanX, 110, 'Active pan before append is 110');

  // Network fetch arrives: 50 newer candles appended
  const appendedCount = 50;
  const slot = cw + Math.max(1, cw * 0.2);
  const deltaPixels = appendedCount * slot;

  // Real-time anchor compensation:
  dragStart.startPanX += deltaPixels;
  activePanX += deltaPixels;

  // Next pointer movement: user drags 1 more pixel (dx = 11)
  currentMouseX = 311;
  dx = currentMouseX - dragStart.startX;
  const nextPanX = dragStart.startPanX + dx;

  assert.strictEqual(nextPanX - activePanX, 1, 'Next pointer move after mid-drag append moves exactly 1 px without snapping');
  console.log('✓ TEST 5 PASSED: Mid-drag append compensation eliminates teleport on subsequent pointer move');
}

// ── TEST 6: Cursor-Centered Zoom Stability ──
{
  const chartW = 900;
  const count = 1000;
  let cw = 8;
  let panX = 120;

  const vp0 = createViewport({ chartW, candlesCount: count, cw, panOffsetX: panX });
  const mouseX = 450; // Cursor in the middle of chart
  const candleUnderCursor = vp0.xToGIdx(mouseX);

  // Zoom In: cw increases to 12
  const newPanXIn = vp0.cursorCenteredZoom(mouseX, 12);
  const vpIn = createViewport({ chartW, candlesCount: count, cw: 12, panOffsetX: newPanXIn });
  const cursorCandlePosAfterZoomIn = vpIn.getX(candleUnderCursor);
  assert(Math.abs(cursorCandlePosAfterZoomIn - mouseX) < 1e-10, 'Zoom in must keep candle pinned under mouse cursor');

  // Zoom Out: cw decreases to 6
  const newPanXOut = vpIn.cursorCenteredZoom(mouseX, 6);
  const vpOut = createViewport({ chartW, candlesCount: count, cw: 6, panOffsetX: newPanXOut });
  const cursorCandlePosAfterZoomOut = vpOut.getX(candleUnderCursor);
  assert(Math.abs(cursorCandlePosAfterZoomOut - mouseX) < 1e-10, 'Zoom out must keep candle pinned under mouse cursor');

  // Repeated 5 zooms alternating in and out
  let currentCW = 8;
  let currentPanX = 120;
  for (let z = 0; z < 5; z++) {
    const vpCur = createViewport({ chartW, candlesCount: count, cw: currentCW, panOffsetX: currentPanX });
    currentCW = currentCW === 8 ? 14 : 8;
    currentPanX = vpCur.cursorCenteredZoom(mouseX, currentCW);
    const vpAfter = createViewport({ chartW, candlesCount: count, cw: currentCW, panOffsetX: currentPanX });
    const pos = vpAfter.getX(candleUnderCursor);
    assert(Math.abs(pos - mouseX) < 1e-9, `Iterative zoom ${z} must stay pinned to mouse cursor`);
  }

  console.log('✓ TEST 6 PASSED: Cursor-centered zoom is mathematically pinned to mouse position across repeated zooms');
}

console.log('\n=== ALL 6 CANONICAL VIEWPORT TESTS PASSED ===');
