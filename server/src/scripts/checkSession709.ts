import { prisma } from '../prisma';
async function main() {
  const sessionId = '71d0ff78-d094-4d31-b54d-8cbc9de0ded6';
  const total = await prisma.trade.count({ where: { sessionId } });
  const withSLTP = await prisma.trade.count({ where: { sessionId, slPrice: { not: null }, tpPrice: { not: null } } });
  const withNone = await prisma.trade.count({ where: { sessionId, slPrice: null, tpPrice: null } });

  console.log('=== 709-TRADE SESSION SL/TP COVERAGE ===');
  console.log(`Total Trades: ${total}`);
  console.log(`With Both SL+TP: ${withSLTP} (${((withSLTP/total)*100).toFixed(1)}%)`);
  console.log(`Neither SL nor TP: ${withNone} (${((withNone/total)*100).toFixed(1)}%)`);

  const sample = await prisma.trade.findMany({
    where: { sessionId },
    orderBy: { tradeNumber: 'asc' },
    take: 8,
    select: { tradeNumber: true, side: true, entryPrice: true, exitPrice: true, slPrice: true, tpPrice: true, result: true, replayStatus: true, maxPotentialRR: true },
  });
  console.log('\nFirst 8 trades:');
  sample.forEach(t => console.log(JSON.stringify(t)));

  const replayStats = await prisma.trade.groupBy({
    by: ['replayStatus'],
    where: { sessionId },
    _count: { id: true },
  });
  console.log('\nReplay status:');
  replayStats.forEach(r => console.log(`  ${r.replayStatus}: ${r._count.id}`));

  const orderCount = await prisma.mt5Order.count({ where: { sessionId } });
  const orderSampleRaw = await prisma.mt5Order.findMany({ where: { sessionId }, take: 5 });
  console.log(`\nMt5Order records: ${orderCount}`);
  orderSampleRaw.forEach(o => console.log(JSON.stringify({ orderId: o.orderId, type: o.type, price: o.price, sl: o.sl, tp: o.tp })));

  const dealCount = await prisma.mt5Deal.count({ where: { sessionId } });
  console.log(`Mt5Deal records: ${dealCount}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
