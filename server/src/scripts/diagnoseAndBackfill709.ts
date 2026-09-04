import { prisma } from '../prisma';

function normalize(val?: string | null): string {
  return (val || '').trim().toLowerCase();
}

async function main() {
  const sessionId = '71d0ff78-d094-4d31-b54d-8cbc9de0ded6';

  // Step 1: Map orders
  const orders = await prisma.mt5Order.findMany({ where: { sessionId } });
  const deals = await prisma.mt5Deal.findMany({ where: { sessionId } });
  const trades = await prisma.trade.findMany({ where: { sessionId }, orderBy: { entryTime: 'asc' } });

  console.log(`Orders: ${orders.length}, Deals: ${deals.length}, Trades: ${trades.length}`);

  // Sample 5 deals to see structure
  const dealSample = deals.slice(0, 8);
  console.log('\nSample deals:');
  dealSample.forEach(d => console.log(JSON.stringify({
    dealId: d.dealId, orderId: d.orderId, type: d.type,
    direction: d.direction, price: d.price, symbol: d.symbol,
    positionId: (d as any).positionId ?? 'N/A',
    volume: d.volume, time: d.time?.toISOString(),
  })));

  // Build order map
  const orderMap = new Map<string, typeof orders[0]>();
  for (const o of orders) {
    if (o.orderId) {
      const cleanId = String(o.orderId).replace(/['"]/g, '').trim();
      if (cleanId) orderMap.set(cleanId, o);
    }
  }

  // Reconstruct entry-exit pairs from deals to get SL/TP
  const openDeals: typeof deals[0][] = [];
  const sorted = deals
    .filter((d) => normalize(d.type) !== 'balance')
    .sort((a, b) => (a.time?.getTime() || 0) - (b.time?.getTime() || 0));

  interface Pair {
    entryDealId: string | null;
    exitDealId: string | null;
    entryOrderId: string | null;
    side: string;
    entryPrice: number | null;
    exitPrice: number | null;
    entryTime: Date | null;
    exitTime: Date | null;
    slPrice: number | null;
    tpPrice: number | null;
  }

  const pairs: Pair[] = [];
  let noEntryOrder = 0;
  let noSLTP = 0;

  for (const deal of sorted) {
    const direction = normalize(deal.direction);
    if (direction === 'in') { openDeals.push(deal); continue; }
    if (direction !== 'out') continue;

    const dealType = normalize(deal.type);
    const expectedEntryType = dealType === 'sell' ? 'buy' : (dealType === 'buy' ? 'sell' : null);

    const matchIndex = openDeals.findIndex((entry) => {
      const entryType = normalize(entry.type);
      const typeMatches = expectedEntryType ? entryType === expectedEntryType : true;
      const symbolMatches = !deal.symbol || !entry.symbol || deal.symbol === entry.symbol;
      const volumeMatches = deal.volume === null || entry.volume === null || deal.volume === entry.volume;
      const positionMatches = (deal as any).positionId && (entry as any).positionId
        ? (deal as any).positionId === (entry as any).positionId
        : true;
      return typeMatches && symbolMatches && volumeMatches && positionMatches;
    });

    const entry = matchIndex >= 0 ? openDeals.splice(matchIndex, 1)[0] : openDeals.shift();
    if (!entry) continue;

    const entryOrderIdClean = entry.orderId ? String(entry.orderId).replace(/['"]/g, '').trim() : '';
    const entryOrder = entryOrderIdClean ? orderMap.get(entryOrderIdClean) : undefined;

    if (!entryOrder) noEntryOrder++;

    const slPrice = (entryOrder?.sl && entryOrder.sl > 0) ? entryOrder.sl : null;
    const tpPrice = (entryOrder?.tp && entryOrder.tp > 0) ? entryOrder.tp : null;

    if (!slPrice || !tpPrice) noSLTP++;

    const isLong = normalize(entry.type) === 'buy';
    pairs.push({
      entryDealId: entry.dealId,
      exitDealId: deal.dealId,
      entryOrderId: entryOrderIdClean,
      side: isLong ? 'LONG' : 'SHORT',
      entryPrice: entry.price,
      exitPrice: deal.price,
      entryTime: entry.time,
      exitTime: deal.time,
      slPrice,
      tpPrice,
    });
  }

  console.log(`\nReconstructed pairs: ${pairs.length}`);
  console.log(`Pairs missing entry order: ${noEntryOrder}`);
  console.log(`Pairs missing SL/TP: ${noSLTP}`);
  console.log(`Pairs with SL+TP: ${pairs.filter(p => p.slPrice && p.tpPrice).length}`);

  // Sample first 5 pairs to verify
  console.log('\nSample pairs:');
  pairs.slice(0, 5).forEach(p => console.log(JSON.stringify(p)));

  // Now match pairs to trades by entryPrice + entryTime + side
  let matched = 0;
  let unmatched = 0;
  const updates: { tradeId: string; slPrice: number; tpPrice: number }[] = [];

  for (const trade of trades) {
    if (!trade.entryTime || !trade.entryPrice) { unmatched++; continue; }

    // Find pair matching by entryTime (within 1 second) and entryPrice and side
    const pairMatch = pairs.find(p =>
      p.side === trade.side &&
      p.entryPrice !== null &&
      Math.abs((p.entryPrice || 0) - trade.entryPrice!) < 0.01 &&
      p.entryTime !== null &&
      Math.abs((p.entryTime?.getTime() || 0) - (trade.entryTime?.getTime() || 0)) < 2000
    );

    if (pairMatch && pairMatch.slPrice && pairMatch.tpPrice) {
      updates.push({ tradeId: trade.id, slPrice: pairMatch.slPrice, tpPrice: pairMatch.tpPrice });
      matched++;
    } else {
      unmatched++;
    }
  }

  console.log(`\nMatched trades with SL/TP: ${matched}`);
  console.log(`Unmatched trades: ${unmatched}`);

  // Apply updates
  if (updates.length > 0) {
    console.log('\nApplying updates to Trade table...');
    for (const u of updates) {
      await prisma.trade.update({
        where: { id: u.tradeId },
        data: { slPrice: u.slPrice, tpPrice: u.tpPrice },
      });
    }
    console.log(`Updated ${updates.length} trades with actual SL/TP.`);
  }

  // Verify
  const afterSLTP = await prisma.trade.count({ where: { sessionId, slPrice: { not: null }, tpPrice: { not: null } } });
  console.log(`\nAfter backfill: ${afterSLTP} / ${trades.length} trades have SL+TP (${((afterSLTP/trades.length)*100).toFixed(1)}%)`);

  await prisma.$disconnect();
}
main().catch(console.error);
