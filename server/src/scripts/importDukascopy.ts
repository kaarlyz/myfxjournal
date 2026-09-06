import { dukascopyImporter } from '../integrations/dukascopy/dukascopyImporter';

async function main() {
  const filePath = process.argv[2];
  const symbol = (process.argv[3] || 'XAUUSD').toUpperCase();

  if (!filePath) {
    throw new Error('Usage: ts-node src/scripts/importDukascopy.ts <csvPath> [symbol]');
  }

  console.log(`Starting/resuming Dukascopy ${symbol} M1 import from:`, filePath);

  let lastReport = Date.now();
  const result = await dukascopyImporter.importCsv({
    filePath,
    symbol,
    timeframe: 'M1',
    batchSize: 10000,
    onProgress: (processed, inserted) => {
      const now = Date.now();
      if (now - lastReport > 2000) {
        console.log(`[Import Progress] Read: ${processed.toLocaleString()} lines | Saved: ${inserted.toLocaleString()} candles`);
        lastReport = now;
      }
    },
  });

  console.log('\n=== DUKASCOPY IMPORT COMPLETE ===');
  console.log('Provider:', result.provider);
  console.log('Symbol:', result.symbol);
  console.log('Timeframe:', result.timeframe);
  console.log('Total lines read:', result.totalLinesRead.toLocaleString());
  console.log('Total candles in DB:', result.insertedCount.toLocaleString());
  console.log('Date range:', result.dateFrom?.toISOString(), 'to', result.dateTo?.toISOString());
  console.log('Catalog ID:', result.catalogId);
  console.log('Duration:', (result.durationMs / 1000).toFixed(2), 'seconds');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
