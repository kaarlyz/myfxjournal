import { prisma } from '../prisma';
import { marketAnalytics } from '../services/marketAnalytics';

async function main() {
  console.log('================================================================');
  console.log('REPLAYFX COMPREHENSIVE AUDIT & INVESTIGATION SCRIPT');
  console.log('================================================================');

  // 1. Locate the target session
  const targetSession = await prisma.backtestSession.findFirst({
    where: {
      OR: [
        { id: 'e47d3891-1874-48ca-9534-50e2959e4156' },
        { symbol: { contains: 'XAUUSD' } },
      ],
    },
    include: {
      _count: { select: { trades: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!targetSession) {
    console.error('Target session not found.');
    return;
  }

  const sessionId = targetSession.id;
  console.log(`Target Session: ${targetSession.name} (${sessionId})`);
  console.log(`Symbol: ${targetSession.symbol} | Total Trades: ${targetSession._count.trades}`);

  // 2. Run Rebuild at RR = 0.50
  console.log('\n>>> Running Rebuild with Backtest RR = 0.50 (Dukascopy M1)...');
  const res05 = await marketAnalytics.rebuildSessionReplay(
    sessionId,
    0.5,
    '2.1.0',
    'DUKASCOPY',
    'M1'
  );

  const valid05 = res05.results.filter(r => r.status === 'VALID');
  const wins05 = valid05.filter(r => (r.maxPotentialRR ?? 0) >= 0.5).length;
  const wr05 = valid05.length > 0 ? (wins05 / valid05.length) * 100 : 0;
  console.log(`RR 0.50 Result: ${res05.valid} Valid, ${res05.invalid} Invalid | Win Rate = ${wr05.toFixed(2)}% (${wins05} W / ${valid05.length - wins05} L)`);

  // 3. Run Rebuild at RR = 0.75
  console.log('\n>>> Running Rebuild with Backtest RR = 0.75 (Dukascopy M1)...');
  const res075 = await marketAnalytics.rebuildSessionReplay(
    sessionId,
    0.75,
    '2.1.0',
    'DUKASCOPY',
    'M1'
  );

  const valid075 = res075.results.filter(r => r.status === 'VALID');
  const wins075 = valid075.filter(r => (r.maxPotentialRR ?? 0) >= 0.75).length;
  const wr075 = valid075.length > 0 ? (wins075 / valid075.length) * 100 : 0;
  console.log(`RR 0.75 Result: ${res075.valid} Valid, ${res075.invalid} Invalid | Win Rate = ${wr075.toFixed(2)}% (${wins075} W / ${valid075.length - wins075} L)`);

  // 4. Detailed analysis of the 22 MISSING trades
  console.log('\n================================================================');
  console.log('DETAILED DIAGNOSTIC: 22 MISSING TRADES');
  console.log('================================================================');

  const missingResults = res05.results.filter(r => r.status === 'MISSING_MARKET_DATA');
  console.log(`Found ${missingResults.length} trades with status MISSING_MARKET_DATA:`);

  const missingTradeDetails = await prisma.trade.findMany({
    where: { id: { in: missingResults.map(r => r.tradeId) } },
    orderBy: { entryTime: 'asc' },
  });

  for (let i = 0; i < missingTradeDetails.length; i++) {
    const t = missingTradeDetails[i];
    const dayOfWeek = t.entryTime ? new Date(t.entryTime).toLocaleDateString('en-US', { weekday: 'short' }) : 'N/A';
    console.log(
      `[${i + 1}] TradeID: ${t.id.slice(0, 8)}... | ${t.symbol} ${t.side} | ` +
      `Entry: ${t.entryTime?.toISOString()} (${dayOfWeek}) -> Exit: ${t.exitTime?.toISOString()} | ` +
      `Price: ${t.entryPrice} -> ${t.exitPrice} | Result: ${t.result}`
    );
  }

  // 5. Multi-Timeframe Comparison Matrix
  console.log('\n================================================================');
  console.log('MULTI-TIMEFRAME COMPARISON MATRIX (RR = 0.50)');
  console.log('================================================================');
  const tfComp = await marketAnalytics.getTimeframeComparison(sessionId, 0.5, 'DUKASCOPY');
  console.table(tfComp);

  // 6. Generate 30 Sample Trades Table
  console.log('\n================================================================');
  console.log('SAMPLE 30 VALID TRADES DIAGNOSTIC TABLE');
  console.log('================================================================');
  const report = await marketAnalytics.getPerTradeReport(sessionId, {
    limit: 30,
    marketDataSource: 'DUKASCOPY',
    backtestRR: 0.5,
  });

  console.log(JSON.stringify(report.trades.slice(0, 30), null, 2));

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
