import { prisma } from '../prisma';
import { marketAnalytics } from '../services/marketAnalytics';
import { runUnitTests } from '../services/__tests__/replayMath.test';

async function main() {
  console.log('========================================================================');
  console.log('PHASE 1: RUN AUTOMATED FORMULA & FIXTURE UNIT TESTS');
  console.log('========================================================================');
  const unitTestRes = runUnitTests();
  if (unitTestRes.failed > 0) {
    throw new Error('Unit tests failed!');
  }

  console.log('\n========================================================================');
  console.log('PHASE 2: DEBUG MODE TRACE FOR A SINGLE SELECTED TRADE');
  console.log('========================================================================');
  const sampleTrade = await prisma.trade.findFirst({
    where: {
      symbol: { contains: 'XAU' },
      entryTime: { not: null },
      exitTime: { not: null },
    },
    orderBy: { entryTime: 'asc' },
  });

  if (sampleTrade) {
    await marketAnalytics.runTradeReplayDebug(sampleTrade.id, 1.0, '2.0.0', 'DUKASCOPY', 'M1');
  }

  console.log('\n========================================================================');
  console.log('PHASE 3: BATCH REPLAY VALIDATION (100 XAUUSD TRADES ACROSS DATES)');
  console.log('========================================================================');

  // Select 100 XAUUSD trades across diverse dates
  const trades = await prisma.trade.findMany({
    where: {
      symbol: { contains: 'XAU' },
      entryTime: { not: null },
      exitTime: { not: null },
      status: 'CLOSED',
    },
    orderBy: { entryTime: 'asc' },
    take: 100,
    include: { session: true },
  });

  console.log(`Selected ${trades.length} trades for validation.`);

  let validCount = 0;
  let missingDataCount = 0;
  let priceFeedMismatchCount = 0;
  let calcFailureCount = 0;
  const suspiciousResults: any[] = [];

  console.log('\n| # | Trade ID | Symbol | Side | Entry Time | Exit Time | Entry Px | Exit Px | SL Px | MFE Px | MAE Px | Risk | MFE | MAE | Max RR | Candles | Status | Gap % |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    const res = await marketAnalytics.runTradeReplayPipeline(t, 1.0, '2.0.0', 'DUKASCOPY', 'M1');

    if (res.status === 'VALID') {
      validCount++;
    } else if (res.status === 'MISSING_MARKET_DATA' || res.status === 'SYMBOL_NOT_FOUND') {
      missingDataCount++;
    } else if (res.status === 'PRICE_SCALE_MISMATCH' || res.status === 'INVALID_FEED') {
      priceFeedMismatchCount++;
    } else {
      calcFailureCount++;
    }

    // Check for suspicious anomalies: e.g. negative RR, NaN, or extreme price gap
    if (res.maxPotentialRR !== undefined && (isNaN(res.maxPotentialRR) || res.maxPotentialRR < 0 || res.maxPotentialRR > 100)) {
      suspiciousResults.push({ tradeId: t.id, issue: `Extreme or invalid RR: ${res.maxPotentialRR}`, res });
    }

    const shortId = t.id.slice(0, 8);
    const entryT = t.entryTime?.toISOString().slice(0, 16).replace('T', ' ') || '';
    const exitT = t.exitTime?.toISOString().slice(0, 16).replace('T', ' ') || '';
    const slStr = res.slUsed?.toFixed(2) || 'N/A';
    const mfePxStr = res.mfePrice?.toFixed(2) || 'N/A';
    const maePxStr = res.maePrice?.toFixed(2) || 'N/A';
    const riskStr = res.riskDistance?.toFixed(2) || 'N/A';
    const mfeStr = res.mfeDistance?.toFixed(2) || 'N/A';
    const maeStr = res.maeDistance?.toFixed(2) || 'N/A';
    const rrStr = res.maxPotentialRR !== undefined ? res.maxPotentialRR.toFixed(2) : 'N/A';
    const gapStr = res.priceGapPct !== undefined ? `${res.priceGapPct.toFixed(2)}%` : 'N/A';
    const candlesStr = res.candlesUsed !== undefined ? String(res.candlesUsed) : '0';

    console.log(`| ${i + 1} | ${shortId} | ${t.symbol} | ${t.side} | ${entryT} | ${exitT} | ${t.entryPrice?.toFixed(2)} | ${t.exitPrice?.toFixed(2)} | ${slStr} | ${mfePxStr} | ${maePxStr} | ${riskStr} | ${mfeStr} | ${maeStr} | ${rrStr} | ${candlesStr} | ${res.status} | ${gapStr} |`);
  }

  console.log('\n========================================================================');
  console.log('PHASE 4: FULL SESSION REBUILD TEST (FAST BATCH PIPELINE VERIFICATION)');
  console.log('========================================================================');
  const session = await prisma.backtestSession.findFirst({
    where: { id: '5b6bd31e-f601-4d5f-858d-5bfb0faf8a11' },
    select: { id: true, name: true },
  });

  if (session) {
    const t0 = Date.now();
    console.log(`Executing session replay rebuild for session ${session.id} (${session.name})...`);
    const sessionRes = await marketAnalytics.rebuildSessionReplay(
      session.id,
      1.0,
      '2.0.0',
      'DUKASCOPY',
      'M1'
    );
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`\nSession rebuild completed in ${elapsed}s!`);
    console.log(`Total trades: ${sessionRes.total}`);
    console.log(`VALID trades: ${sessionRes.validCount}`);
    console.log(`INVALID trades: ${sessionRes.invalidCount}`);
    console.log(`Status counts:`, JSON.stringify(sessionRes.statusCounts, null, 2));
  }

  console.log('\n========================================================================');
  console.log('FINAL VALIDATION SUMMARY');
  console.log('========================================================================');
  console.log(`A. Number of trades tested: ${trades.length}`);
  console.log(`B. Number VALID: ${validCount}`);
  console.log(`C. Number MISSING_MARKET_DATA: ${missingDataCount}`);
  console.log(`D. Number PRICE_FEED_MISMATCH: ${priceFeedMismatchCount}`);
  console.log(`E. Number calculation failures: ${calcFailureCount}`);
  console.log(`F. Suspicious results: ${suspiciousResults.length > 0 ? JSON.stringify(suspiciousResults) : 'None'}`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Validation error:', err);
  process.exit(1);
});
