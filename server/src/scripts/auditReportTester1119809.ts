import fs from 'fs';
import { parseMt5XlsxReport } from '../utils/mt5ReportParser';

async function main() {
  const filePath = '/home/vallencia/Documents/ReportTester-1119809.xlsx';
  console.log(`Reading file: ${filePath}`);
  const buffer = fs.readFileSync(filePath);
  console.log(`Buffer size: ${buffer.length} bytes`);

  const parsed = parseMt5XlsxReport(buffer);

  console.log('\n=== PARSE SUMMARY ===');
  console.log(`Symbol: ${parsed.summary.symbol}`);
  console.log(`Timeframe: ${parsed.summary.timeframe}`);
  console.log(`Total Orders Parsed: ${parsed.orders.length}`);
  console.log(`Total Deals Parsed: ${parsed.deals.length}`);
  console.log(`Total Reconstructed Trades: ${parsed.trades.length}`);

  // Count order states
  const orderStates: Record<string, number> = {};
  parsed.orders.forEach(o => {
    const s = o.state || 'UNKNOWN';
    orderStates[s] = (orderStates[s] || 0) + 1;
  });
  console.log('\nOrder States:', orderStates);

  // Check SL/TP on orders
  const ordersWithSL = parsed.orders.filter(o => o.sl && o.sl > 0).length;
  const ordersWithTP = parsed.orders.filter(o => o.tp && o.tp > 0).length;
  const ordersWithBoth = parsed.orders.filter(o => o.sl && o.sl > 0 && o.tp && o.tp > 0).length;
  console.log(`Orders with SL: ${ordersWithSL}`);
  console.log(`Orders with TP: ${ordersWithTP}`);
  console.log(`Orders with Both SL+TP: ${ordersWithBoth}`);

  // Check SL/TP on reconstructed trades
  const tradesWithSL = parsed.trades.filter(t => t.slPrice && t.slPrice > 0).length;
  const tradesWithTP = parsed.trades.filter(t => t.tpPrice && t.tpPrice > 0).length;
  const tradesWithBoth = parsed.trades.filter(t => t.slPrice && t.slPrice > 0 && t.tpPrice && t.tpPrice > 0).length;
  console.log(`\nReconstructed Trades with SL: ${tradesWithSL}`);
  console.log(`Reconstructed Trades with TP: ${tradesWithTP}`);
  console.log(`Reconstructed Trades with Both: ${tradesWithBoth}`);

  // Inspect first 10 orders
  console.log('\nFirst 10 Orders:');
  parsed.orders.slice(0, 10).forEach(o => {
    console.log(`Order #${o.orderId}: Type=${o.type}, Price=${o.price}, SL=${o.sl}, TP=${o.tp}, State=${o.state}, Comment=${o.comment}`);
  });

  // Inspect first 10 reconstructed trades
  console.log('\nFirst 10 Reconstructed Trades:');
  parsed.trades.slice(0, 10).forEach((t, i) => {
    const isLong = t.side === 'LONG';
    const risk = (t.entryPrice && t.slPrice) ? (isLong ? t.entryPrice - t.slPrice : t.slPrice - t.entryPrice) : 0;
    const reward = (t.entryPrice && t.tpPrice) ? (isLong ? t.tpPrice - t.entryPrice : t.entryPrice - t.tpPrice) : 0;
    const rr = (risk > 0 && reward > 0) ? reward / risk : 0;
    console.log(`Trade #${i + 1}: ${t.side} | Entry=${t.entryPrice} | Exit=${t.exitPrice} | SL=${t.slPrice} | TP=${t.tpPrice} | NetProfit=${t.netProfit} | RR=${rr.toFixed(3)} | EntryDeal=${t.entryDealId} | ExitDeal=${t.exitDealId}`);
  });
}

main().catch(console.error);
