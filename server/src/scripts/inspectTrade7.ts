import { prisma } from '../prisma';

async function main() {
  const candles = await prisma.mt5CandleData.findMany({
    where: {
      provider: 'DUKASCOPY',
      symbol: 'XAUUSD',
      timeframe: 'M1',
      time: {
        gte: new Date('2025-04-02T03:20:00.000Z'),
        lte: new Date('2025-04-02T03:25:00.000Z'),
      },
    },
    orderBy: { time: 'asc' },
  });

  console.log('Candles around Trade #7 (TP is 3120.06):');
  candles.forEach(c => {
    console.log(`  Candle ${c.time.toISOString()}: O=${c.open}, H=${c.high}, L=${c.low}, C=${c.close}`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
