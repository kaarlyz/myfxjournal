import { prisma } from '../prisma';
import { marketAnalytics } from '../services/marketAnalytics';

async function main() {
  const sessionId = '71d0ff78-d094-4d31-b54d-8cbc9de0ded6';

  console.log('Rebuilding session replay with unconstrained MFE tracking...');
  const rebuild = await marketAnalytics.rebuildSessionReplay(
    sessionId,
    0.75,
    '2.1.0',
    'DUKASCOPY',
    'M1'
  );
  console.log(`Rebuild complete: Total: ${rebuild.total}, Valid: ${rebuild.validCount}, Invalid: ${rebuild.invalidCount}`);

  console.log('\n=== FETCHING NEW RR SIMULATION MATRIX ===');
  const matrix = await marketAnalytics.getRRSimulation(sessionId);
  console.log('Matrix result:');
  console.table(matrix);

  await prisma.$disconnect();
}

main().catch(console.error);
