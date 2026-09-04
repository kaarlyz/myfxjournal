import fs from 'fs';
import { prisma } from '../prisma';
import { parseMt5XlsxReport } from '../utils/mt5ReportParser';

async function main() {
  const filePath = '/home/vallencia/Documents/ReportTester-1119809.xlsx';
  const buffer = fs.readFileSync(filePath);
  const parsed = parseMt5XlsxReport(buffer);

  console.log('=== FORENSIC AUDIT STEP 1: PARSED TRADES FROM EXCEL ===');
  console.log(`Parsed ${parsed.trades.length} trades.`);

  // Let's examine the first 10 trades from Excel
  for (let i = 0; i < 10; i++) {
    const t = parsed.trades[i];
    console.log(`Trade #${i+1}: EntryDeal=${t.entryDealId}, ExitDeal=${t.exitDealId}, Side=${t.side}, EntryTime=${t.entryTime?.toISOString()}, ExitTime=${t.exitTime?.toISOString()}, EntryPrice=${t.entryPrice}, ExitPrice=${t.exitPrice}, SL=${t.slPrice}, TP=${t.tpPrice}, NetProfit=${t.netProfit}`);
  }

  // Let's check Dukascopy M1 candle timestamps around the first trade (2025-04-01 04:00:45)
  const firstTradeEntry = parsed.trades[0].entryTime!;
  const firstTradeExit = parsed.trades[0].exitTime!;

  console.log('\n=== FORENSIC AUDIT STEP 2: DUKASCOPY CANDLES FOR TRADE #1 ===');
  console.log(`Trade #1 Window: ${firstTradeEntry.toISOString()} to ${firstTradeExit.toISOString()}`);

  const candlesT1 = await prisma.mt5CandleData.findMany({
    where: {
      provider: 'DUKASCOPY',
      symbol: 'XAUUSD',
      timeframe: 'M1',
      time: {
        gte: new Date('2025-04-01T03:55:00.000Z'),
        lte: new Date('2025-04-01T04:10:00.000Z'),
      },
    },
    orderBy: { time: 'asc' },
  });

  console.log(`Found ${candlesT1.length} candles around Trade #1.`);
  candlesT1.forEach(c => {
    console.log(`  Candle ${c.time.toISOString()}: O=${c.open}, H=${c.high}, L=${c.low}, C=${c.close}`);
  });

  // Let's also check database session trades
  const sessionId = '71d0ff78-d094-4d31-b54d-8cbc9de0ded6';
  const dbTrades = await prisma.trade.findMany({
    where: { sessionId },
    orderBy: { tradeNumber: 'asc' },
    take: 10,
  });

  console.log(`\n=== FORENSIC AUDIT STEP 3: DB TRADES FOR SESSION ===`);
  console.log(`Found ${dbTrades.length} sample DB trades.`);
  dbTrades.forEach(t => {
    console.log(`  DB Trade #${t.tradeNumber}: Side=${t.side}, EntryTime=${t.entryTime?.toISOString()}, ExitTime=${t.exitTime?.toISOString()}, EntryPrice=${t.entryPrice}, ExitPrice=${t.exitPrice}, SL=${t.slPrice}, TP=${t.tpPrice}, Result=${t.result}`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
