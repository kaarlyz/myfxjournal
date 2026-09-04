import fs from 'fs';
import crypto from 'crypto';
import readline from 'readline';
import { prisma } from '../prisma';

async function main() {
  console.log('================================================================');
  console.log('STEP 1: DUKASCOPY CSV FILE & DATABASE DATASET VALIDATION');
  console.log('================================================================');

  const csvPath = '/home/vallencia/Downloads/QuantDataManager/export/2026.8.22XAUUSD_dukascopy-M1-No Session.csv';
  
  if (!fs.existsSync(csvPath)) {
    console.error(`ERROR: File not found at ${csvPath}`);
    return;
  }

  const stat = fs.statSync(csvPath);
  console.log(`Absolute File Path: ${csvPath}`);
  console.log(`File Size:          ${stat.size} bytes (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);

  // Calculate SHA256
  console.log('Calculating SHA256 checksum...');
  const hash = crypto.createHash('sha256');
  const fileStream = fs.createReadStream(csvPath);
  
  await new Promise((resolve, reject) => {
    fileStream.on('data', chunk => hash.update(chunk));
    fileStream.on('end', () => resolve(null));
    fileStream.on('error', reject);
  });
  const sha256 = hash.digest('hex');
  console.log(`SHA256:             ${sha256}`);

  // Count lines and find min/max dates in CSV
  console.log('Scanning CSV lines and date range...');
  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath),
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  let firstDataLine = '';
  let lastDataLine = '';

  for await (const line of rl) {
    if (line.trim().length === 0) continue;
    lineCount++;
    if (lineCount === 2) firstDataLine = line; // line 1 is header
    lastDataLine = line;
  }

  const totalCandlesCsv = lineCount - 1; // subtract header
  console.log(`Total Candles in CSV: ${totalCandlesCsv.toLocaleString()}`);
  console.log(`First Candle Row:   ${firstDataLine}`);
  console.log(`Last Candle Row:    ${lastDataLine}`);

  // Database verification
  console.log('\n--- Checking Mt5CandleData in Database ---');
  const dbTotal = await prisma.mt5CandleData.count({
    where: { provider: 'DUKASCOPY', symbol: 'XAUUSD', timeframe: 'M1' },
  });
  const dbMin = await prisma.mt5CandleData.findFirst({
    where: { provider: 'DUKASCOPY', symbol: 'XAUUSD', timeframe: 'M1' },
    orderBy: { time: 'asc' },
    select: { time: true, open: true, high: true, low: true, close: true },
  });
  const dbMax = await prisma.mt5CandleData.findFirst({
    where: { provider: 'DUKASCOPY', symbol: 'XAUUSD', timeframe: 'M1' },
    orderBy: { time: 'desc' },
    select: { time: true, open: true, high: true, low: true, close: true },
  });

  console.log(`Total DUKASCOPY M1 Candles in SQLite: ${dbTotal.toLocaleString()}`);
  console.log(`DB Min Timestamp:  ${dbMin?.time.toISOString()}`);
  console.log(`DB Max Timestamp:  ${dbMax?.time.toISOString()}`);

  console.log('\n================================================================');
  console.log('STEP 2: TIMEFRAME & METADATA AUDIT');
  console.log('================================================================');

  const sessionId = '71d0ff78-d094-4d31-b54d-8cbc9de0ded6';
  const session = await prisma.backtestSession.findUnique({ where: { id: sessionId } });

  console.log(`Session Name:               ${session?.name}`);
  console.log(`Session Symbol (Metadata):  ${session?.symbol}`);
  console.log(`Session Timeframe (Metadata): ${session?.timeframe}`);

  const sampleTrade = await prisma.trade.findFirst({ where: { sessionId } });
  console.log(`Trade Symbol (in DB):       ${sampleTrade?.symbol}`);
  console.log(`Trade Timeframe (in DB):    ${sampleTrade?.timeframe}`);
  console.log(`Replay Engine TF Used:      M1 (raw Dukascopy M1 candles from Mt5CandleData)`);

  await prisma.$disconnect();
}

main().catch(console.error);
