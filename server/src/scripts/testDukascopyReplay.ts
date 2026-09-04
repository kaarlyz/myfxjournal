import { prisma } from '../prisma';
import { marketAnalytics } from '../services/marketAnalytics';

async function runTests() {
  console.log('====================================================');
  console.log('TEST 1: Verify MarketDataCatalog for DUKASCOPY');
  console.log('====================================================');
  const catalog = await prisma.marketDataCatalog.findFirst({
    where: { provider: 'DUKASCOPY', symbol: 'XAUUSD', dataType: 'CANDLE' },
  });

  console.log('Catalog ID:', catalog?.id);
  console.log('Provider:', catalog?.provider);
  console.log('Broker:', catalog?.broker);
  console.log('Symbol:', catalog?.symbol);
  console.log('Timeframe:', catalog?.timeframe);
  console.log('Data Source Type:', catalog?.dataSourceType);
  console.log('Candle Count:', catalog?.candleCount?.toLocaleString());
  console.log('Date Range:', catalog?.dateFrom?.toISOString(), 'to', catalog?.dateTo?.toISOString());
  console.log('Download Status:', catalog?.downloadStatus);

  console.log('\n====================================================');
  console.log('TEST 2: End-to-End Single Trade Replay with Dukascopy M1');
  console.log('====================================================');

  // Find a trade in DB with XAUUSD in range
  const targetTrade = await prisma.trade.findFirst({
    where: {
      symbol: { contains: 'XAU' },
      entryTime: { not: null },
      exitTime: { not: null },
    },
    orderBy: { entryTime: 'asc' },
    include: { session: true },
  });

  if (!targetTrade) {
    console.log('No XAU trade found in DB');
    return;
  }

  console.log('Target Trade ID:', targetTrade.id);
  console.log('Symbol:', targetTrade.symbol);
  console.log('Side:', targetTrade.side);
  console.log('Entry Price:', targetTrade.entryPrice);
  console.log('Exit Price:', targetTrade.exitPrice);
  console.log('Entry Time:', targetTrade.entryTime?.toISOString());
  console.log('Exit Time:', targetTrade.exitTime?.toISOString());
  console.log('SL Price (if set):', targetTrade.slPrice);
  console.log('Result:', targetTrade.result);

  // Run replay with explicit Dukascopy market data source
  const replayResult = await marketAnalytics.runTradeReplayPipeline(
    targetTrade.id,
    1.0,
    '2.0.0',
    'DUKASCOPY'
  );

  console.log('\n--- REPLAY EXECUTION OUTPUT ---');
  console.log('Status:', replayResult.status);
  console.log('Status Reason:', replayResult.statusReason);
  console.log('Provider Used:', replayResult.provider);
  console.log('Broker Used:', replayResult.broker);
  console.log('Timeframe Selected:', replayResult.timeframe);
  console.log('Candles Scanned:', replayResult.candlesUsed);
  console.log('SL Used:', replayResult.slUsed);
  console.log('MFE Price:', replayResult.mfePrice);
  console.log('MAE Price:', replayResult.maePrice);
  console.log('Max Potential RR:', replayResult.maxPotentialRR?.toFixed(2));
  console.log('Captured RR:', replayResult.capturedRR);
  console.log('Exit Efficiency:', replayResult.exitEfficiency ? `${replayResult.exitEfficiency.toFixed(1)}%` : 'N/A');
  console.log('Aligned Entry Time:', replayResult.alignedEntryTime?.toISOString());
  console.log('Aligned Exit Time:', replayResult.alignedExitTime?.toISOString());
  console.log('Candle Price Min in Window:', replayResult.candlePriceMin);
  console.log('Candle Price Max in Window:', replayResult.candlePriceMax);
  console.log('Price Gap %:', replayResult.priceGapPct !== undefined ? `${replayResult.priceGapPct.toFixed(3)}%` : 'N/A');

  console.log('\n====================================================');
  console.log('TEST 3: Session Rebuild Replay with Dukascopy Source');
  console.log('====================================================');
  const session = await prisma.backtestSession.findFirst({
    where: { trades: { some: { symbol: { contains: 'XAU' } } } },
    select: { id: true, name: true },
  });

  if (session) {
    console.log(`Rebuilding session: ${session.name} (${session.id}) with DUKASCOPY...`);
    const sessionResult = await marketAnalytics.rebuildSessionReplay(
      session.id,
      1.0,
      '2.0.0',
      'DUKASCOPY'
    );
    console.log('Total Trades Processed:', sessionResult.total);
    console.log('VALID Replays:', sessionResult.validCount);
    console.log('INVALID Replays:', sessionResult.invalidCount);
    console.log('Status Counts:', JSON.stringify(sessionResult.statusCounts, null, 2));

    // Show sample of first 3 valid trades
    const validSample = sessionResult.results.filter(r => r.status === 'VALID').slice(0, 3);
    console.log('\n--- SAMPLE VALID REPLAY RESULTS ---');
    for (const v of validSample) {
      console.log(`Trade ${v.tradeId} | TF: ${v.timeframe} | Candles: ${v.candlesUsed} | MFE: ${v.mfePrice} | MAE: ${v.maePrice} | MaxRR: ${v.maxPotentialRR?.toFixed(2)} | Gap: ${v.priceGapPct?.toFixed(3)}%`);
    }
  }

  console.log('\n====================================================');
  console.log('TEST 4: Non-existent Provider / Synthetic Refusal Test');
  console.log('====================================================');
  const nonExistentResult = await marketAnalytics.runTradeReplayPipeline(
    targetTrade.id,
    1.0,
    '2.0.0',
    'NON_EXISTENT_FEED'
  );
  console.log('Requesting NON_EXISTENT_FEED status:', nonExistentResult.status);
  console.log('Reason:', nonExistentResult.statusReason);
}

runTests().then(() => process.exit(0)).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
