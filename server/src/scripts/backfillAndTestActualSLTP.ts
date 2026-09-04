import { prisma } from '../prisma';
import { marketAnalytics } from '../services/marketAnalytics';
import { inferSLTP } from '../services/replayEngineCore';

async function main() {
  const sessionId = 'e47d3891-1874-48ca-9534-50e2959e4156';

  console.log('=== Step 1: Loading Orders, Deals, and Trades ===');
  const [orders, deals, trades] = await Promise.all([
    prisma.mt5Order.findMany({ where: { sessionId } }),
    prisma.mt5Deal.findMany({ where: { sessionId } }),
    prisma.trade.findMany({ where: { sessionId }, orderBy: { entryTime: 'asc' } }),
  ]);

  console.log(`Found ${orders.length} orders, ${deals.length} deals, ${trades.length} trades.`);

  // Build clean order map
  const orderMap = new Map<string, typeof orders[0]>();
  for (const o of orders) {
    if (o.orderId) {
      const cleanId = String(o.orderId).replace(/['"]/g, '').trim();
      if (cleanId) orderMap.set(cleanId, o);
    }
  }

  // Match trades with entry deals
  const openDeals: typeof deals = [];
  const sortedDeals = deals
    .filter(d => (d.type || '').toLowerCase() !== 'balance')
    .sort((a, b) => (a.time?.getTime() || 0) - (b.time?.getTime() || 0));

  let updatedCount = 0;
  const updates: Array<{ id: string; slPrice: number | null; tpPrice: number | null }> = [];

  for (const deal of sortedDeals) {
    const dir = (deal.direction || '').toLowerCase();
    if (dir === 'in') {
      openDeals.push(deal);
      continue;
    }
    if (dir !== 'out') continue;

    const matchIdx = openDeals.findIndex(e =>
      (!deal.symbol || !e.symbol || deal.symbol === e.symbol) &&
      (deal.volume === null || e.volume === null || deal.volume === e.volume)
    );
    const entryDeal = matchIdx >= 0 ? openDeals.splice(matchIdx, 1)[0] : openDeals.shift();
    if (!entryDeal) continue;

    const entryOrderIdClean = entryDeal.orderId ? String(entryDeal.orderId).replace(/['"]/g, '').trim() : '';
    const entryOrder = entryOrderIdClean ? orderMap.get(entryOrderIdClean) : undefined;
    const slPrice = (entryOrder?.sl && entryOrder.sl > 0) ? entryOrder.sl : null;
    const tpPrice = (entryOrder?.tp && entryOrder.tp > 0) ? entryOrder.tp : null;

    const exitDealClean = deal.dealId ? String(deal.dealId).replace(/['"]/g, '').trim() : '';
    const trade = trades.find(t =>
      (t.tradeId && String(t.tradeId).replace(/['"]/g, '').trim() === exitDealClean) ||
      (t.entryTime?.getTime() === entryDeal.time?.getTime() && t.exitTime?.getTime() === deal.time?.getTime())
    );

    if (trade && (slPrice !== null || tpPrice !== null)) {
      updates.push({ id: trade.id, slPrice, tpPrice });
      updatedCount++;
    }
  }

  console.log(`Matched ${updatedCount} trades with actual SL/TP from Mt5Orders!`);

  for (const u of updates) {
    await prisma.trade.update({
      where: { id: u.id },
      data: { slPrice: u.slPrice, tpPrice: u.tpPrice },
    });
  }
  console.log('Database updated successfully with actual SL and TP!');

  const updatedTrades = await prisma.trade.findMany({ where: { sessionId } });
  const bothCount = updatedTrades.filter(t => (t.slPrice ?? 0) > 0 && (t.tpPrice ?? 0) > 0).length;
  console.log(`Trades with BOTH valid actual SL & TP: ${bothCount} / ${updatedTrades.length}`);

  // Calculate actual RR distribution
  const actualRRs: number[] = [];
  for (const t of updatedTrades) {
    if (t.entryPrice && t.slPrice && t.tpPrice) {
      const isLong = t.side === 'LONG' || t.side === 'BUY';
      const risk = isLong ? t.entryPrice - t.slPrice : t.slPrice - t.entryPrice;
      const reward = isLong ? t.tpPrice - t.entryPrice : t.entryPrice - t.tpPrice;
      if (risk > 0 && reward > 0) {
        actualRRs.push(reward / risk);
      }
    }
  }
  if (actualRRs.length > 0) {
    const avgRR = actualRRs.reduce((a, b) => a + b, 0) / actualRRs.length;
    console.log(`Average Actual RR: ${avgRR.toFixed(4)} (min: ${Math.min(...actualRRs).toFixed(4)}, max: ${Math.max(...actualRRs).toFixed(4)})`);
    console.log(`First 10 Actual RRs:`, actualRRs.slice(0, 10).map(r => r.toFixed(3)));
  }

  console.log('\n=== Step 2: Running Replay Analysis on Session ===');
  const result = await marketAnalytics.rebuildSessionReplay(sessionId, 0.75, '2.1.0', 'DUKASCOPY', 'M1');
  console.log(`Rebuild complete: Total: ${result.total}, Valid: ${result.validCount}, Invalid: ${result.invalidCount}`);

  const validTrades = await prisma.trade.findMany({
    where: { sessionId, replayStatus: 'VALID' },
  });

  const brokerWins = validTrades.filter(t => t.result === 'WIN').length;
  const brokerLosses = validTrades.length - brokerWins;
  const brokerWR = (brokerWins / validTrades.length) * 100;

  let simWinsActual = 0;
  let simLossesActual = 0;

  for (const t of validTrades) {
    const isLong = t.side === 'LONG' || t.side === 'BUY';
    const entryPrice = t.entryPrice!;
    const slPrice = t.slPrice;
    const tpPrice = t.tpPrice;

    if (slPrice && tpPrice) {
      const risk = isLong ? entryPrice - slPrice : slPrice - entryPrice;
      const reward = isLong ? tpPrice - entryPrice : entryPrice - tpPrice;
      const actualRR = (risk > 0 && reward > 0) ? reward / risk : 0.75;
      if ((t.maxPotentialRR ?? 0) >= actualRR) {
        simWinsActual++;
      } else {
        simLossesActual++;
      }
    } else {
      if ((t.maxPotentialRR ?? 0) >= 0.75) {
        simWinsActual++;
      } else {
        simLossesActual++;
      }
    }
  }

  const simWR = (simWinsActual / validTrades.length) * 100;
  console.log(`\n=== Final Comparison ===`);
  console.log(`Total Valid Replays: ${validTrades.length}`);
  console.log(`Broker Realized: ${brokerWins} Wins / ${brokerLosses} Losses -> Win Rate = ${brokerWR.toFixed(2)}%`);
  console.log(`Simulation (Actual SL/TP): ${simWinsActual} Wins / ${simLossesActual} Losses -> Win Rate = ${simWR.toFixed(2)}%`);
  console.log(`Gap: ${Math.abs(brokerWR - simWR).toFixed(2)}%`);

  await prisma.$disconnect();
}

main().catch(console.error);
