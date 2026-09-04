import fs from 'fs';
import { parseMt5XlsxReport } from '../utils/mt5ReportParser';

async function main() {
  const filePath = '/home/vallencia/Documents/ReportTester-1119809.xlsx';
  const buffer = fs.readFileSync(filePath);
  const parsed = parseMt5XlsxReport(buffer);

  console.log('================================================================');
  console.log('GROUND TRUTH AUDIT: ReportTester-1119809.xlsx');
  console.log('================================================================');

  // 1. Order stats
  const totalOrders = parsed.orders.length;
  const filledOrders = parsed.orders.filter(o => o.state?.toLowerCase() === 'filled').length;
  const canceledOrders = parsed.orders.filter(o => o.state?.toLowerCase() === 'canceled').length;

  console.log(`Total Orders:     ${totalOrders}`);
  console.log(`Filled Orders:    ${filledOrders}`);
  console.log(`Canceled Orders:  ${canceledOrders}`);

  // 2. Completed trades
  const completedTrades = parsed.trades;
  console.log(`\nCompleted Trades: ${completedTrades.length}`);

  const tradesWithSL = completedTrades.filter(t => t.slPrice !== null && t.slPrice !== undefined && t.slPrice > 0).length;
  const tradesWithTP = completedTrades.filter(t => t.tpPrice !== null && t.tpPrice !== undefined && t.tpPrice > 0).length;
  const tradesWithBoth = completedTrades.filter(t => t.slPrice && t.tpPrice && t.slPrice > 0 && t.tpPrice > 0).length;

  console.log(`Trades with SL:   ${tradesWithSL} (${((tradesWithSL / completedTrades.length) * 100).toFixed(1)}%)`);
  console.log(`Trades with TP:   ${tradesWithTP} (${((tradesWithTP / completedTrades.length) * 100).toFixed(1)}%)`);
  console.log(`Trades with Both: ${tradesWithBoth} (${((tradesWithBoth / completedTrades.length) * 100).toFixed(1)}%)`);

  // 3. Direction breakdown
  const buyTrades = completedTrades.filter(t => t.side === 'LONG' || t.side === 'BUY').length;
  const sellTrades = completedTrades.filter(t => t.side === 'SHORT' || t.side === 'SELL').length;
  console.log(`\nBUY Trades:       ${buyTrades} (${((buyTrades / completedTrades.length) * 100).toFixed(1)}%)`);
  console.log(`SELL Trades:      ${sellTrades} (${((sellTrades / completedTrades.length) * 100).toFixed(1)}%)`);

  // 4. Broker Realized Win Rate
  const winTrades = completedTrades.filter(t => t.netProfit > 0).length;
  const lossTrades = completedTrades.filter(t => t.netProfit < 0).length;
  const beTrades = completedTrades.filter(t => t.netProfit === 0).length;
  const actualWR = (winTrades / completedTrades.length) * 100;

  console.log(`\nBroker Realized Wins:   ${winTrades}`);
  console.log(`Broker Realized Losses: ${lossTrades}`);
  console.log(`Broker Realized BE:     ${beTrades}`);
  console.log(`Broker Win Rate:        ${actualWR.toFixed(2)}%`);

  // 5. Actual RR Distribution
  const actualRRs: number[] = [];
  for (const t of completedTrades) {
    if (t.entryPrice && t.slPrice && t.tpPrice) {
      const isLong = t.side === 'LONG' || t.side === 'BUY';
      const risk = isLong ? t.entryPrice - t.slPrice : t.slPrice - t.entryPrice;
      const reward = isLong ? t.tpPrice - t.entryPrice : t.entryPrice - t.tpPrice;
      if (risk > 0 && reward > 0) {
        actualRRs.push(reward / risk);
      }
    }
  }

  actualRRs.sort((a, b) => a - b);
  const minRR = actualRRs[0];
  const maxRR = actualRRs[actualRRs.length - 1];
  const sumRR = actualRRs.reduce((a, b) => a + b, 0);
  const avgRR = sumRR / actualRRs.length;
  const medianRR = actualRRs[Math.floor(actualRRs.length / 2)];

  console.log(`\nActual RR Calculation (on ${actualRRs.length} trades with valid SL/TP):`);
  console.log(`Min Actual RR:    ${minRR.toFixed(4)}`);
  console.log(`Average Actual RR:${avgRR.toFixed(4)}`);
  console.log(`Median Actual RR: ${medianRR.toFixed(4)}`);
  console.log(`Max Actual RR:    ${maxRR.toFixed(4)}`);

  // 6. Validation of the 5 requested tests
  console.log('\n================================================================');
  console.log('VERIFICATION OF 5 REQUESTED TESTS FROM PROMPT:');
  console.log('================================================================');

  const testCases = [
    { num: 1, expectedEntry: 3128.03, expectedSL: 3120.21, expectedTP: 3133.86, expectedResult: 'TP' },
    { num: 2, expectedEntry: 3148.13, expectedSL: 3142.65, expectedTP: 3152.05, expectedResult: 'SL' }, // Order 5
    { num: 3, expectedEntry: 3145.68, expectedSL: 3132.86, expectedTP: 3155.28, expectedResult: 'SL' }, // Order 4
    { num: 4, expectedEntry: 3137.80, expectedSL: 3126.24, expectedTP: 3146.47, expectedResult: 'SL' }, // Order 9
    { num: 5, expectedEntry: 3124.12, expectedSL: 3139.14, expectedTP: 3112.91, expectedResult: 'TP' }, // Order 8
  ];

  for (let i = 0; i < 5; i++) {
    const t = completedTrades[i];
    const isLong = t.side === 'LONG' || t.side === 'BUY';
    const risk = (t.entryPrice && t.slPrice) ? (isLong ? t.entryPrice - t.slPrice : t.slPrice - t.entryPrice) : 0;
    const reward = (t.entryPrice && t.tpPrice) ? (isLong ? t.tpPrice - t.entryPrice : t.entryPrice - t.tpPrice) : 0;
    const rr = (risk > 0 && reward > 0) ? reward / risk : 0;
    const res = t.netProfit > 0 ? 'TP' : 'SL';

    console.log(`\nTest #${i + 1}:`);
    console.log(`  Actual Side:   ${t.side}`);
    console.log(`  Entry Price:   ${t.entryPrice}`);
    console.log(`  Exit Price:    ${t.exitPrice}`);
    console.log(`  Actual SL:     ${t.slPrice}`);
    console.log(`  Actual TP:     ${t.tpPrice}`);
    console.log(`  Actual NetPnl: ${t.netProfit}`);
    console.log(`  Result:        ${res}`);
    console.log(`  Actual RR:     ${rr.toFixed(4)} (~0.75)`);
  }
}

main().catch(console.error);
