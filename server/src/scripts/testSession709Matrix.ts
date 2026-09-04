import { prisma } from '../prisma';
import { marketAnalytics } from '../services/marketAnalytics';

async function main() {
  const sessionId = '71d0ff78-d094-4d31-b54d-8cbc9de0ded6';

  console.log('=== RUNNING REPLAY REBUILD FOR 709 SESSION ===');
  const rebuild = await marketAnalytics.rebuildSessionReplay(
    sessionId,
    0.75,
    '2.1.0',
    'DUKASCOPY',
    'M1'
  );
  console.log(`Rebuild complete: Total: ${rebuild.total}, Valid: ${rebuild.validCount}, Invalid: ${rebuild.invalidCount}`);

  console.log('\n=== FETCHING RR SIMULATION MATRIX ===');
  const matrix = await marketAnalytics.getRRSimulation(sessionId);
  console.log('Matrix result:');
  console.table(matrix);

  const validTrades = await prisma.trade.findMany({
    where: { sessionId, replayStatus: 'VALID' },
  });
  const brokerWins = validTrades.filter(t => t.result === 'WIN').length;
  const brokerLosses = validTrades.length - brokerWins;
  const brokerWR = (brokerWins / validTrades.length) * 100;
  console.log(`\nBroker Realized WR (Valid Trades): ${brokerWins}W / ${brokerLosses}L = ${brokerWR.toFixed(2)}%`);
  console.log(`Simulated WR (Actual SL/TP): ${matrix[0]?.winRate.toFixed(2)}% (Wins: ${matrix[0]?.wins}, Losses: ${matrix[0]?.losses})`);

  await prisma.$disconnect();
}

main().catch(console.error);
