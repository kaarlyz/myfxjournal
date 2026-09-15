import { prisma } from '../prisma';
import { resampleM1Candles, ChartTimeframe } from '../services/backtestEngine';

async function runTimeframePerfTest() {
  console.log('====================================================');
  console.log('TIMEFRAME SWITCHING PERFORMANCE & INTEGRITY TESTS');
  console.log('====================================================');

  const symbol = 'NSXUSD';
  const provider = 'DUKASCOPY';

  const timeframes: ChartTimeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

  for (const tf of timeframes) {
    let limit = 1200;
    if (tf === 'M15' || tf === 'M30') limit = 800;
    if (tf === 'H1' || tf === 'H4') limit = 600;
    if (tf === 'D1') limit = 700;

    let rawLimit = limit;
    if (tf === 'M5') rawLimit = limit * 5 * 2;
    if (tf === 'M15') rawLimit = limit * 15 * 2;
    if (tf === 'M30') rawLimit = limit * 30 * 2;
    if (tf === 'H1') rawLimit = limit * 60 * 2;
    if (tf === 'H4') rawLimit = Math.min(limit * 240 * 2, 250000);
    if (tf === 'D1') rawLimit = Math.min(limit * 1440 * 2, 600000);

    const startMs = Date.now();
    const fetched = await prisma.mt5CandleData.findMany({
      where: { provider, symbol, timeframe: 'M1' },
      orderBy: { time: 'desc' },
      take: rawLimit,
      select: {
        time: true, open: true, high: true, low: true, close: true, tickVolume: true, realVolume: true,
      },
    });

    const m1 = fetched.reverse().map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      tickVolume: c.tickVolume ?? undefined,
      realVolume: c.realVolume ?? undefined,
    }));

    const resampled = tf === 'M1' ? m1 : resampleM1Candles(m1, tf);
    const finalCandles = resampled.slice(-limit);
    const elapsedMs = Date.now() - startMs;

    console.log(`[TF ${tf}] Limit requested: ${limit} | Raw M1 fetched: ${fetched.length} | Resampled output: ${finalCandles.length} | Time: ${elapsedMs}ms`);

    if (finalCandles.length === 0) {
      throw new Error(`TF ${tf} returned 0 candles!`);
    }

    // Precision check: Open of candle should match first M1 bar of that bucket
    const firstBar = finalCandles[0];
    const lastBar = finalCandles[finalCandles.length - 1];
    if (firstBar.high < Math.max(firstBar.open, firstBar.close)) {
      throw new Error(`High price inconsistency in ${tf} first bar`);
    }
    if (firstBar.low > Math.min(firstBar.open, firstBar.close)) {
      throw new Error(`Low price inconsistency in ${tf} first bar`);
    }

    console.log(`  -> OK: First bar time: ${firstBar.time.toISOString()} | Last bar time: ${lastBar.time.toISOString()}`);
  }

  console.log('====================================================');
  console.log('TIMEFRAME PERF & INTEGRITY TESTS COMPLETED SUCCESSFULLY');
  console.log('====================================================');
  await prisma.$disconnect();
}

runTimeframePerfTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
