import { prisma } from '../prisma';
import { marketAnalytics } from '../services/marketAnalytics';

function normalize(val?: string | null): string {
  return (val || '').trim().toLowerCase();
}

async function main() {
  const sessionId = 'e47d3891-1874-48ca-9534-50e2959e4156';
  const [orders, deals] = await Promise.all([
    prisma.mt5Order.findMany({ where: { sessionId } }),
    prisma.mt5Deal.findMany({ where: { sessionId } }),
  ]);

  console.log(`Loaded ${orders.length} orders, ${deals.length} deals.`);

  const orderMap = new Map<string, typeof orders[0]>();
  for (const o of orders) {
    if (o.orderId) {
      const cleanId = String(o.orderId).replace(/['"]/g, '').trim();
      if (cleanId) orderMap.set(cleanId, o);
    }
  }

  const openDeals: typeof deals = [];
  const sorted = deals
    .filter((deal) => normalize(deal.type) !== 'balance')
    .sort((a, b) => (a.time?.getTime() || 0) - (b.time?.getTime() || 0));

  const reconstructed: any[] = [];

  for (const deal of sorted) {
    const direction = normalize(deal.direction);
    if (direction === 'in') {
      openDeals.push(deal);
      continue;
    }
    if (direction !== 'out') continue;

    const dealType = normalize(deal.type); // 'buy' (closes short) or 'sell' (closes long)
    const expectedEntryType = dealType === 'sell' ? 'buy' : (dealType === 'buy' ? 'sell' : null);

    const matchIndex = openDeals.findIndex((entry) => {
      const entryType = normalize(entry.type);
      const typeMatches = expectedEntryType ? entryType === expectedEntryType : true;
      const symbolMatches = !deal.symbol || !entry.symbol || deal.symbol === entry.symbol;
      const volumeMatches = deal.volume === null || entry.volume === null || deal.volume === entry.volume;
      const positionMatches = deal.positionId && entry.positionId ? deal.positionId === entry.positionId : true;
      return typeMatches && symbolMatches && volumeMatches && positionMatches;
    });

    const entry = matchIndex >= 0 ? openDeals.splice(matchIndex, 1)[0] : openDeals.shift();
    if (!entry) continue;

    const entryOrderIdClean = entry.orderId ? String(entry.orderId).replace(/['"]/g, '').trim() : '';
    const entryOrder = entryOrderIdClean ? orderMap.get(entryOrderIdClean) : undefined;
    const slPrice = (entryOrder?.sl && entryOrder.sl > 0) ? entryOrder.sl : null;
    const tpPrice = (entryOrder?.tp && entryOrder.tp > 0) ? entryOrder.tp : null;

    const commission = (entry.commission || 0) + (deal.commission || 0);
    const swap = (entry.swap || 0) + (deal.swap || 0);
    const profit = (entry.profit || 0) + (deal.profit || 0);
    const netProfit = profit + commission + swap;

    reconstructed.push({
      entryTime: entry.time,
      exitTime: deal.time,
      entryDealId: entry.dealId,
      exitDealId: deal.dealId,
      orderId: deal.orderId || entry.orderId,
      side: normalize(entry.type) === 'sell' ? 'SHORT' : 'LONG',
      entryPrice: entry.price,
      exitPrice: deal.price,
      slPrice,
      tpPrice,
      volume: entry.volume || deal.volume,
      commission,
      swap,
      profit,
      netProfit,
      result: netProfit > 0 ? 'WIN' : (netProfit < 0 ? 'LOSS' : 'BE'),
    });
  }

  console.log(`Reconstructed ${reconstructed.length} trades with exact side matching.`);

  const wins = reconstructed.filter(t => t.result === 'WIN').length;
  const losses = reconstructed.filter(t => t.result === 'LOSS').length;
  console.log(`Reconstructed broker results: ${wins} wins / ${losses} losses -> WR = ${((wins / reconstructed.length) * 100).toFixed(2)}%`);

  // Now replace trades in DB for session with reconstructed trades
  console.log('Replacing trades in DB with accurately paired trades...');
  await prisma.trade.deleteMany({ where: { sessionId } });

  const session = await prisma.backtestSession.findUnique({ where: { id: sessionId } });

  await prisma.trade.createMany({
    data: reconstructed.map((t, index) => ({
      sessionId,
      source: 'MT5_REPORT',
      tradeNumber: index + 1,
      tradeId: t.exitDealId || t.orderId,
      symbol: session?.symbol || 'XAUUSD-ECN',
      timeframe: session?.timeframe || 'H1',
      side: t.side,
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      slPrice: t.slPrice,
      tpPrice: t.tpPrice,
      qty: t.volume,
      netPnlUsd: t.netProfit,
      netPnlIdr: t.netProfit * 16200,
      status: 'CLOSED',
      result: t.result,
      notes: `Entry deal: ${t.entryDealId}, exit deal: ${t.exitDealId}`,
    })),
  });

  console.log('Running replay engine on accurately paired trades...');
  const replayResult = await marketAnalytics.rebuildSessionReplay(sessionId, 0.75, '2.1.0', 'DUKASCOPY', 'M1');
  console.log(`Rebuild complete: Total: ${replayResult.total}, Valid: ${replayResult.validCount}, Invalid: ${replayResult.invalidCount}`);

  const validTrades = await prisma.trade.findMany({
    where: { sessionId, replayStatus: 'VALID' },
  });

  const bWins = validTrades.filter(t => t.result === 'WIN').length;
  const bLosses = validTrades.length - bWins;
  const bWR = (bWins / validTrades.length) * 100;

  let simWins = 0;
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
        simWins++;
      }
    } else {
      if ((t.maxPotentialRR ?? 0) >= 0.75) {
        simWins++;
      }
    }
  }

  const sWR = (simWins / validTrades.length) * 100;
  console.log(`\n=== Final Comparison with Fixed Direction Matching ===`);
  console.log(`Total Valid Replays: ${validTrades.length}`);
  console.log(`Broker Realized: ${bWins} Wins / ${bLosses} Losses -> Win Rate = ${bWR.toFixed(2)}%`);
  console.log(`Simulation (Actual SL/TP): ${simWins} Wins / ${validTrades.length - simWins} Losses -> Win Rate = ${sWR.toFixed(2)}%`);
  console.log(`Gap: ${Math.abs(bWR - sWR).toFixed(2)}%`);

  await prisma.$disconnect();
}

main().catch(console.error);
