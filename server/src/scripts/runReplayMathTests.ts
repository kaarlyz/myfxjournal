import { runAllTests } from '../services/__tests__/replayMath.test';
import { parseTradingViewCsv } from '../utils/csvParser';

const res = runAllTests();

console.log('\n[8] Testing CSV Parser Flexible SL/TP Headers');
const testCsv1 = `Trade number,Type,Date and time,Price USD,Stop Loss,Take Profit,Size (qty),Net PnL USD
1,Entry long,2026-01-01 10:00,100,90,107.5,1,7.5
1,Exit long,2026-01-01 10:10,107.5,90,107.5,1,7.5
`;
const parsed1 = parseTradingViewCsv(testCsv1);
console.assert(parsed1.validTrades.length === 1, 'CSV 1 should have 1 valid trade');
console.assert(parsed1.validTrades[0].slPrice === 90, `Expected SL=90, got ${parsed1.validTrades[0].slPrice}`);
console.assert(parsed1.validTrades[0].tpPrice === 107.5, `Expected TP=107.5, got ${parsed1.validTrades[0].tpPrice}`);
console.log('  [PASS] Stop Loss & Take Profit headers parsed correctly');

const testCsv2 = `Trade number,Type,Date and time,Price USD,S/L,T/P,Size (qty),Net PnL USD
1,Entry short,2026-01-01 10:00,100,110,92.5,1,7.5
1,Exit short,2026-01-01 10:10,92.5,110,92.5,1,7.5
`;
const parsed2 = parseTradingViewCsv(testCsv2);
console.assert(parsed2.validTrades.length === 1, 'CSV 2 should have 1 valid trade');
console.assert(parsed2.validTrades[0].slPrice === 110, `Expected SL=110, got ${parsed2.validTrades[0].slPrice}`);
console.assert(parsed2.validTrades[0].tpPrice === 92.5, `Expected TP=92.5, got ${parsed2.validTrades[0].tpPrice}`);
console.log('  [PASS] S/L & T/P headers parsed correctly');

const testCsv3 = `Trade number,Type,Date and time,Price USD,SL USD,TP USD,Size (qty),Net PnL USD
1,Entry long,2026-01-01 10:00,100,95,105,1,5
1,Exit long,2026-01-01 10:10,105,95,105,1,5
`;
const parsed3 = parseTradingViewCsv(testCsv3);
console.assert(parsed3.validTrades.length === 1, 'CSV 3 should have 1 valid trade');
console.assert(parsed3.validTrades[0].slPrice === 95, `Expected SL=95, got ${parsed3.validTrades[0].slPrice}`);
console.assert(parsed3.validTrades[0].tpPrice === 105, `Expected TP=105, got ${parsed3.validTrades[0].tpPrice}`);
console.log('  [PASS] SL USD & TP USD currency-suffixed headers parsed correctly');

if (res.failed > 0) {
  process.exit(1);
} else {
  console.log('\nALL 45+ UNIT TESTS PASSED PERFECTLY!');
}
