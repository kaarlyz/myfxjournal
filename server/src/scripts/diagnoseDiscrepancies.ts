import { prisma } from '../prisma';
import { marketAnalytics } from '../services/marketAnalytics';
import { runRRSimulation } from '../services/replayEngineCore';

async function main() {
  const sessionId = 'e47d3891-1874-48ca-9534-50e2959e4156';
  const trades = await prisma.trade.findMany({
    where: { sessionId, replayStatus: 'VALID' },
    orderBy: { entryTime: 'asc' },
  });

  let brokerWinSimLoss = 0;
  let brokerLossSimWin = 0;
  let matches = 0;

  const samples: any[] = [];

  for (const t of trades) {
    const isLong = t.side === 'LONG' || t.side === 'BUY';
    const entryPrice = t.entryPrice!;
    const slPrice = t.slPrice!;
    const tpPrice = t.tpPrice!;
    const risk = isLong ? entryPrice - slPrice : slPrice - entryPrice;
    const reward = isLong ? tpPrice - entryPrice : entryPrice - tpPrice;
    const actualRR = (risk > 0 && reward > 0) ? reward / risk : 0.75;
    const simWin = (t.maxPotentialRR ?? 0) >= actualRR;
    const brokerWin = t.result === 'WIN';

    if (brokerWin && !simWin) {
      brokerWinSimLoss++;
      if (samples.length < 5) {
        samples.push({
          id: t.id,
          side: t.side,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          slPrice: t.slPrice,
          tpPrice: t.tpPrice,
          entryTime: t.entryTime,
          exitTime: t.exitTime,
          maxPotentialRR: t.maxPotentialRR,
          actualRR,
          netPnlUsd: t.netPnlUsd,
        });
      }
    } else if (!brokerWin && simWin) {
      brokerLossSimWin++;
    } else {
      matches++;
    }
  }

  console.log(`Discrepancy Analysis (Total ${trades.length} trades):`);
  console.log(`- Exact Agreement (Win=Win or Loss=Loss): ${matches} (${((matches / trades.length) * 100).toFixed(1)}%)`);
  console.log(`- Broker WON, but Simulation marked LOSS: ${brokerWinSimLoss}`);
  console.log(`- Broker LOST, but Simulation marked WIN: ${brokerLossSimWin}`);

  console.log(`\nSample trades where Broker WON but Simulation LOST:`);
  for (const s of samples) {
    console.log(s);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
