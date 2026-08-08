const { PrismaClient } = require('@prisma/client');
const { replayCache } = require('./dist/modules/rr-analysis/ReplayCache');
const prisma = new PrismaClient();
(async () => {
  const sessionId = '793f1ca0-392b-44d5-a372-7904a41aef9f';
  const tradeId = 'dd2caabd-190e-4109-bd04-7a08c2382b31';
  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    select: { id: true, symbol: true, side: true, entryTime: true, exitTime: true, entryPrice: true, exitPrice: true, slPrice: true, result: true }
  });
  const results = replayCache.get(sessionId) || [];
  const match = results.find((item) => item.tradeId === tradeId);
  const points = match?.replayPoints ?? [];
  const beforeExit = points.filter((point) => point.timestamp <= trade.exitTime);
  const afterExit = points.filter((point) => point.timestamp > trade.exitTime);
  const highestBeforeExit = beforeExit.reduce((best, point) => point.price > best.price ? point : best, beforeExit[0] || { price: trade.entryPrice, timestamp: trade.entryTime });
  const highestAfterExit = afterExit.reduce((best, point) => point.price > best.price ? point : best, null);
  console.log(JSON.stringify({ trade, match: match ? { maxRR: match.maxRR, maxRRTime: match.maxRRTime, maxRRPrice: match.maxRRPrice, capturedRR: match.capturedRR, potentialRRLost: match.potentialRRLost, replaySource: match.replaySource, dataQuality: match.dataQuality } : null, highestBeforeExit, highestAfterExit, beforeExitCount: beforeExit.length, afterExitCount: afterExit.length, firstPoint: points[0], lastPoint: points[points.length - 1] }, null, 2));
  await prisma.$disconnect();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
