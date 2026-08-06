import { prisma } from './src/prisma';
import { MarketAnalyticsService } from './src/services/marketAnalytics';

async function test() {
  const service = new MarketAnalyticsService();
  
  // Get one session
  const session = await prisma.backtestSession.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  
  if (!session) {
    console.log("No sessions found");
    return;
  }
  
  console.log("Testing Session:", session.id);
  
  const trades = await prisma.trade.findMany({
    where: { sessionId: session.id },
    take: 5
  });
  
  console.log(`Found ${trades.length} trades.`);
  
  for (const trade of trades) {
    console.log(`\nTrade ${trade.id} (${trade.symbol})`);
    console.log(`- entryTime: ${trade.entryTime}`);
    console.log(`- entryPrice: ${trade.entryPrice}`);
    console.log(`- slPrice: ${trade.slPrice}`);
    console.log(`- side: ${trade.side}`);
    
    if (!trade.entryTime || !trade.entryPrice || !trade.slPrice || !trade.side) {
      console.log("-> SKIPPED (Missing core entry data or SL)");
      continue;
    }
    
    const baseSymbol = trade.symbol.replace(/[^A-Za-z0-9]/g, '').substring(0, 6).toUpperCase();
    console.log(`- baseSymbol: ${baseSymbol}`);
    
    const catalogItem = await prisma.marketDataCatalog.findFirst({
      where: { symbol: { startsWith: baseSymbol }, dataType: 'CANDLE' },
      orderBy: { timeframe: 'asc' },
    });
    
    if (!catalogItem) {
      console.log(`-> SKIPPED (No catalog found for ${baseSymbol})`);
      continue;
    }
    
    console.log(`- Found Catalog: ${catalogItem.symbol} ${catalogItem.timeframe}`);
    
    const maxEndTime = new Date(trade.entryTime.getTime() + 7 * 24 * 60 * 60 * 1000);
    const candles = await prisma.mt5CandleData.findMany({
      where: {
        symbol: { startsWith: baseSymbol },
        timeframe: catalogItem.timeframe || 'M1',
        time: { gte: trade.entryTime, lte: maxEndTime },
      },
      take: 5
    });
    
    console.log(`- Found ${candles.length} candles starting at ${trade.entryTime}`);
  }
}

test().catch(console.error).finally(() => process.exit(0));
