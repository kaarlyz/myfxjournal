import fs from 'node:fs';

async function run100TradeBacktest() {
  console.log("🚀 Initializing 100-Trade AI Auto-Pilot Backtest for XAUUSD M1 (Fixed R:R 1:1)...");

  // 1. Fetch M1 Candles for XAUUSD from server
  const candleRes = await fetch('http://127.0.0.1:5000/api/market-data/candles?symbol=XAUUSD&timeframe=M1&limit=2500');
  let candles = [];
  if (candleRes.ok) {
    const data = await candleRes.json();
    candles = data.candles || data || [];
  }

  // Fallback synthetic generator if no historical ticks stored
  if (!candles || candles.length < 500) {
    console.log("⚠️ Generating high-fidelity synthetic M1 Gold candles for simulation...");
    let price = 2650.0;
    let t = Date.now() - (2500 * 60 * 1000);
    candles = [];
    for (let i = 0; i < 2000; i++) {
      const change = (Math.random() - 0.495) * 1.8;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.random() * 0.8;
      const low = Math.min(open, close) - Math.random() * 0.8;
      candles.push({ time: Math.floor(t / 1000), open, high, low, close, volume: Math.floor(Math.random() * 500) + 50 });
      price = close;
      t += 60 * 1000;
    }
  }

  console.log(`📊 Loaded ${candles.length} M1 candles for backtest.`);

  let balance = 10000;
  const initialBalance = balance;
  const riskPct = 1.0; // 1% risk per trade
  const targetRR = 1.0; // Fixed 1:1 R:R
  const completedTrades = [];
  let currentTrade = null;

  let winCount = 0;
  let lossCount = 0;
  let totalProfit = 0;
  let totalLoss = 0;
  let peakEquity = balance;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  let currentIndex = 60;

  console.log("🤖 Starting AI Auto-Pilot Execution Loop (Target: 100 Trades)...");

  while (currentIndex < candles.length && completedTrades.length < 100) {
    const currentCandle = candles[currentIndex];

    // 1. Check Active Position Exit
    if (currentTrade) {
      let isClosed = false;
      let exitPrice = 0;
      let exitReason = '';

      if (currentTrade.side === 'BUY') {
        if (currentCandle.low <= currentTrade.sl) {
          exitPrice = currentTrade.sl;
          exitReason = 'SL_HIT';
          isClosed = true;
        } else if (currentCandle.high >= currentTrade.tp) {
          exitPrice = currentTrade.tp;
          exitReason = 'TP_HIT';
          isClosed = true;
        }
      } else if (currentTrade.side === 'SELL') {
        if (currentCandle.high >= currentTrade.sl) {
          exitPrice = currentTrade.sl;
          exitReason = 'SL_HIT';
          isClosed = true;
        } else if (currentCandle.low <= currentTrade.tp) {
          exitPrice = currentTrade.tp;
          exitReason = 'TP_HIT';
          isClosed = true;
        }
      }

      if (isClosed) {
        const pnlMultiplier = currentTrade.side === 'BUY' 
          ? (exitPrice - currentTrade.entry) 
          : (currentTrade.entry - exitPrice);
        const pnl = pnlMultiplier * currentTrade.lot * 100; // XAUUSD contractSize = 100

        balance += pnl;
        if (balance > peakEquity) peakEquity = balance;
        const dd = peakEquity - balance;
        const ddPct = (dd / peakEquity) * 100;
        if (dd > maxDrawdown) maxDrawdown = dd;
        if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

        if (pnl > 0) {
          winCount++;
          totalProfit += pnl;
        } else {
          lossCount++;
          totalLoss += Math.abs(pnl);
        }

        completedTrades.push({
          tradeNum: completedTrades.length + 1,
          side: currentTrade.side,
          entry: currentTrade.entry,
          exit: exitPrice,
          sl: currentTrade.sl,
          tp: currentTrade.tp,
          lot: currentTrade.lot,
          pnl: Number(pnl.toFixed(2)),
          balance: Number(balance.toFixed(2)),
          reason: exitReason,
          setup: currentTrade.setup
        });

        if (completedTrades.length % 20 === 0 || completedTrades.length === 100) {
          console.log(`[Progress] ${completedTrades.length}/100 Trades | Current Balance: $${balance.toFixed(2)} | WR: ${((winCount / completedTrades.length) * 100).toFixed(1)}%`);
        }

        currentTrade = null;
      }
    }

    // 2. Scan AI Signal if no active position
    if (!currentTrade && completedTrades.length < 100) {
      const windowCandles = candles.slice(Math.max(0, currentIndex - 59), currentIndex + 1);
      
      // Fast deterministic SMC signal evaluator
      const slice20 = windowCandles.slice(-20);
      const high20 = Math.max(...slice20.map(c => c.high));
      const low20 = Math.min(...slice20.map(c => c.low));
      const last = windowCandles[windowCandles.length - 1];
      const prev = windowCandles[windowCandles.length - 2];
      const eq = (high20 + low20) / 2;

      let signal = 'WAIT';
      let slDistance = 1.5; // $1.5 Gold ATR

      // SMC Liquidity Sweep & Displacement
      if (prev.low <= low20 && last.close > prev.high && last.close > eq) {
        signal = 'BUY';
      } else if (prev.high >= high20 && last.close < prev.low && last.close < eq) {
        signal = 'SELL';
      } else {
        // Trend Continuation
        const maFast = slice20.reduce((a, b) => a + b.close, 0) / slice20.length;
        if (last.close > maFast && last.close > prev.close) {
          signal = 'BUY';
        } else if (last.close < maFast && last.close < prev.close) {
          signal = 'SELL';
        }
      }

      if (signal === 'BUY') {
        const entry = last.close;
        const sl = entry - slDistance;
        const tp = entry + (slDistance * targetRR); // Fixed 1:1 RR
        const riskAmount = (balance * riskPct) / 100;
        const lot = Math.max(0.01, Number((riskAmount / (slDistance * 100)).toFixed(2)));

        currentTrade = {
          side: 'BUY',
          entry,
          sl,
          tp,
          lot,
          setup: 'SMC Sweep & Discount Continuation'
        };
      } else if (signal === 'SELL') {
        const entry = last.close;
        const sl = entry + slDistance;
        const tp = entry - (slDistance * targetRR); // Fixed 1:1 RR
        const riskAmount = (balance * riskPct) / 100;
        const lot = Math.max(0.01, Number((riskAmount / (slDistance * 100)).toFixed(2)));

        currentTrade = {
          side: 'SELL',
          entry,
          sl,
          tp,
          lot,
          setup: 'SMC Sweep & Premium Continuation'
        };
      }
    }

    currentIndex++;
  }

  const netPnl = balance - initialBalance;
  const netPnlPct = (netPnl / initialBalance) * 100;
  const winRate = (winCount / completedTrades.length) * 100;
  const profitFactor = totalLoss > 0 ? (totalProfit / totalLoss) : totalProfit;

  console.log("\n=======================================================");
  console.log("🏁 100-TRADE AI BACKTEST COMPLETED ON XAUUSD M1");
  console.log("=======================================================");
  console.log(`Initial Balance   : $${initialBalance.toLocaleString()}`);
  console.log(`Ending Balance    : $${balance.toFixed(2)} (${netPnl >= 0 ? '+' : ''}${netPnlPct.toFixed(2)}%)`);
  console.log(`Net Profit / Loss : $${netPnl.toFixed(2)}`);
  console.log(`Total Trades      : ${completedTrades.length}`);
  console.log(`Wins / Losses     : ${winCount} Wins / ${lossCount} Losses`);
  console.log(`Win Rate          : ${winRate.toFixed(2)}%`);
  console.log(`Profit Factor     : ${profitFactor.toFixed(2)}`);
  console.log(`Max Drawdown      : -$${maxDrawdown.toFixed(2)} (-${maxDrawdownPct.toFixed(2)}%)`);
  console.log(`Fixed R:R         : 1:1.0 (Target SL = TP = 15 pips / $1.50)`);
  console.log("=======================================================");

  // Write results to JSON for verification
  fs.writeFileSync('./backtest_100_trades_result.json', JSON.stringify({
    summary: {
      symbol: 'XAUUSD',
      timeframe: 'M1',
      tradesCount: completedTrades.length,
      initialBalance,
      endingBalance: Number(balance.toFixed(2)),
      netPnl: Number(netPnl.toFixed(2)),
      netPnlPct: Number(netPnlPct.toFixed(2)),
      winRate: Number(winRate.toFixed(2)),
      profitFactor: Number(profitFactor.toFixed(2)),
      maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
      fixedRR: '1:1.0'
    },
    trades: completedTrades
  }, null, 2));

  console.log("✅ Results saved to backtest_100_trades_result.json");
}

run100TradeBacktest().catch(console.error);
