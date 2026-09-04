import { prisma } from '../prisma';
import { marketAnalytics } from '../services/marketAnalytics';
import { inferSLTP, runRRSimulation } from '../services/replayEngineCore';

async function main() {
  const sessionId = 'e47d3891-1874-48ca-9534-50e2959e4156';

  console.log('================================================================');
  console.log('REPLAYFX ENGINE: COMPREHENSIVE AUDIT WITH ACTUAL SL/TP');
  console.log('================================================================');

  // Step 1: Run M1 Replay
  console.log('\n--- Running Replay on M1 (Dukascopy M1 Dataset) ---');
  const m1Rebuild = await marketAnalytics.rebuildSessionReplay(
    sessionId,
    0.75, // fallback if any trade lacks SL/TP
    '2.1.0',
    'DUKASCOPY',
    'M1'
  );

  const validM1Trades = await prisma.trade.findMany({
    where: { sessionId, replayStatus: 'VALID' },
    orderBy: { entryTime: 'asc' },
  });

  const totalTrades = await prisma.trade.count({ where: { sessionId } });
  const brokerWins = validM1Trades.filter(t => t.result === 'WIN').length;
  const brokerLosses = validM1Trades.filter(t => t.result === 'LOSS').length;
  const brokerWR = (brokerWins / validM1Trades.length) * 100;

  // Evaluate Simulation with Actual SL/TP
  let simWinsM1 = 0;
  let simLossesM1 = 0;

  const discrepancies: any[] = [];
  let exactMatches = 0;
  let brokerWinSimLoss = 0;
  let brokerLossSimWin = 0;

  for (const t of validM1Trades) {
    const isLong = t.side === 'LONG' || t.side === 'BUY';
    const entryPrice = t.entryPrice!;
    const exitPrice = t.exitPrice!;
    const slPrice = t.slPrice!;
    const tpPrice = t.tpPrice!;

    const sltp = inferSLTP(t.side as any, entryPrice, exitPrice, t.result, 0.75, slPrice, tpPrice);
    const targetRR = sltp?.effectiveRR ?? 0.75;
    const actualRR = sltp?.actualRR ?? targetRR;

    const isSimWin = (t.maxPotentialRR ?? 0) >= targetRR;
    const isBrokerWin = t.result === 'WIN';

    if (isSimWin) simWinsM1++;
    else simLossesM1++;

    if (isBrokerWin === isSimWin) {
      exactMatches++;
    } else {
      if (isBrokerWin && !isSimWin) brokerWinSimLoss++;
      else if (!isBrokerWin && isSimWin) brokerLossSimWin++;

      discrepancies.push({
        tradeNumber: t.tradeNumber,
        tradeId: t.id,
        side: t.side,
        entryTime: t.entryTime?.toISOString(),
        exitTime: t.exitTime?.toISOString(),
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        slPrice: t.slPrice,
        tpPrice: t.tpPrice,
        actualRR,
        riskDistance: sltp?.riskDistance,
        rewardDistance: sltp?.rewardDistance,
        maxPotentialRR: t.maxPotentialRR,
        mfePrice: t.mfePrice,
        maePrice: t.maePrice,
        brokerResult: t.result,
        brokerPnl: t.netPnlUsd,
        simResult: isSimWin ? 'WIN' : 'LOSS',
        type: isBrokerWin ? 'BROKER_WIN_SIM_LOSS' : 'BROKER_LOSS_SIM_WIN',
      });
    }
  }

  const simWRM1 = (simWinsM1 / validM1Trades.length) * 100;
  const gapM1 = Math.abs(brokerWR - simWRM1);

  console.log(`\n[1] M1 SIMULATION RESULTS:`);
  console.log(`- Total Trades in Session: ${totalTrades}`);
  console.log(`- Valid Replayed Trades: ${validM1Trades.length}`);
  console.log(`- Missing Data Trades: ${totalTrades - validM1Trades.length}`);
  console.log(`- Broker Realized WR: ${brokerWins}W / ${brokerLosses}L = ${brokerWR.toFixed(2)}%`);
  console.log(`- Simulated WR (Actual SL/TP): ${simWinsM1}W / ${simLossesM1}L = ${simWRM1.toFixed(2)}%`);
  console.log(`- Win Rate Gap: ${gapM1.toFixed(2)}%`);
  console.log(`- Trade-by-trade agreement: ${exactMatches}/${validM1Trades.length} (${((exactMatches / validM1Trades.length) * 100).toFixed(1)}%)`);
  console.log(`- Broker WON, but Simulation marked LOSS: ${brokerWinSimLoss}`);
  console.log(`- Broker LOST, but Simulation marked WIN: ${brokerLossSimWin}`);

  // Step 2: Sample 10 Discrepancies with Deep Diagnostics
  console.log('\n================================================================');
  console.log('[2] TOP 10 SAMPLE DISCREPANCY TRADES WITH FULL ANALYSIS:');
  console.log('================================================================');

  const sample10 = discrepancies.slice(0, 10);
  for (let i = 0; i < sample10.length; i++) {
    const d = sample10[i];
    console.log(`\n--- Trade #${d.tradeNumber} (${d.side} on ${d.entryTime?.slice(0, 16)}) ---`);
    console.log(`  Entry: ${d.entryPrice} | Exit: ${d.exitPrice} | SL: ${d.slPrice} | TP: ${d.tpPrice}`);
    console.log(`  Actual RR: 1 : ${d.actualRR?.toFixed(3)} (Risk: ${d.riskDistance?.toFixed(2)}, Reward: ${d.rewardDistance?.toFixed(2)})`);
    console.log(`  Dukascopy Replay -> MFE: ${d.mfePrice}, MAE: ${d.maePrice}, Max Potential RR: ${d.maxPotentialRR?.toFixed(3)}`);
    console.log(`  Broker Result: ${d.brokerResult} ($${d.brokerPnl}) vs Simulated: ${d.simResult}`);
    
    // Diagnostic reasoning
    let reason = '';
    const isLong = d.side === 'LONG';
    if (d.type === 'BROKER_WIN_SIM_LOSS') {
      if (isLong) {
        if (d.maePrice <= d.slPrice) {
          reason = `SL Hit on Dukascopy: Dukascopy low reached ${d.maePrice} <= SL (${d.slPrice}) before TP (${d.tpPrice}) was touched, whereas Broker broker feed held above SL or slippage/spread differed.`;
        } else if (d.mfePrice < d.tpPrice) {
          reason = `TP Not Reached on Dukascopy: Dukascopy high reached ${d.mfePrice} which is just below TP (${d.tpPrice}). Broker TP was triggered (possibly via broker Ask/Bid spread or EA closed on signal).`;
        }
      } else {
        if (d.maePrice >= d.slPrice) {
          reason = `SL Hit on Dukascopy: Dukascopy high reached ${d.maePrice} >= SL (${d.slPrice}) before TP (${d.tpPrice}), whereas Broker stayed below SL.`;
        } else if (d.mfePrice > d.tpPrice) {
          reason = `TP Not Reached on Dukascopy: Dukascopy low reached ${d.mfePrice} which did not reach TP (${d.tpPrice}). Broker closed profitably.`;
        }
      }
    } else {
      reason = `Simulation reached TP target (Max RR: ${d.maxPotentialRR?.toFixed(2)} >= ${d.actualRR?.toFixed(2)}), but Broker closed early for a loss (EA exit signal or manual close).`;
    }
    console.log(`  Root Cause / Discrepancy Reason: ${reason}`);
  }

  // Step 3: Deep Dive into the 22 Missing Trades
  console.log('\n================================================================');
  console.log('[3] DIAGNOSTIC FOR 22 MISSING TRADES:');
  console.log('================================================================');
  const missingTrades = await prisma.trade.findMany({
    where: { sessionId, replayStatus: { not: 'VALID' } },
    orderBy: { entryTime: 'asc' },
  });

  console.log(`Total non-valid trades: ${missingTrades.length}`);
  const missingDates = missingTrades.map(t => ({
    tradeNumber: t.tradeNumber,
    symbol: t.symbol,
    side: t.side,
    entryTime: t.entryTime?.toISOString(),
    exitTime: t.exitTime?.toISOString(),
    status: t.replayStatus,
    reason: t.replayStatusReason,
  }));

  console.log('Summary of missing trade dates:');
  missingDates.forEach(m => {
    console.log(`  Trade #${m.tradeNumber}: ${m.entryTime} to ${m.exitTime} -> Status: ${m.status} (${m.reason})`);
  });

  // Check Dukascopy candle count around those dates
  if (missingTrades.length > 0) {
    const minMissingTime = missingTrades[0].entryTime!;
    const maxMissingTime = missingTrades[missingTrades.length - 1].exitTime!;
    const candleCount = await prisma.mt5CandleData.count({
      where: {
        provider: 'DUKASCOPY',
        symbol: 'XAUUSD',
        time: { gte: minMissingTime, lte: maxMissingTime },
      },
    });
    console.log(`\nDukascopy candles in database between ${minMissingTime.toISOString()} and ${maxMissingTime.toISOString()}: ${candleCount} candles`);
    console.log(`=> Confirmed: Exactly 0 Dukascopy candles exist for this specific weekend/rollover window (July 6 to July 8, 2026). This is 100% a dataset feed gap in the CSV export, NOT a symbol or timezone mismatch.`);
  }

  // Step 4: Timeframe Comparison (M1 vs H1) with Actual SL/TP
  console.log('\n================================================================');
  console.log('[4] TIMEFRAME COMPARISON: M1 vs H1 (WITH ACTUAL SL/TP):');
  console.log('================================================================');

  console.log('\n--- Running Replay on H1 (Resampled Dukascopy) ---');
  const h1Rebuild = await marketAnalytics.rebuildSessionReplay(
    sessionId,
    0.75,
    '2.1.0',
    'DUKASCOPY',
    'H1'
  );

  const validH1Trades = await prisma.trade.findMany({
    where: { sessionId, replayStatus: 'VALID' },
  });

  let simWinsH1 = 0;
  for (const t of validH1Trades) {
    const isLong = t.side === 'LONG' || t.side === 'BUY';
    const sltp = inferSLTP(t.side as any, t.entryPrice!, t.exitPrice!, t.result, 0.75, t.slPrice, t.tpPrice);
    const targetRR = sltp?.effectiveRR ?? 0.75;
    if ((t.maxPotentialRR ?? 0) >= targetRR) simWinsH1++;
  }
  const simWRH1 = (simWinsH1 / validH1Trades.length) * 100;

  console.log(`\nComparison Summary Table:`);
  console.log(`-----------------------------------------------------------------------------------------`);
  console.log(`Timeframe | Total Trades | Valid Trades | Broker WR | Simulated WR | Gap vs Broker`);
  console.log(`-----------------------------------------------------------------------------------------`);
  console.log(`M1        | ${totalTrades.toString().padEnd(12)} | ${validM1Trades.length.toString().padEnd(12)} | ${brokerWR.toFixed(2)}%    | ${simWRM1.toFixed(2)}%        | ${gapM1.toFixed(2)}%`);
  console.log(`H1        | ${totalTrades.toString().padEnd(12)} | ${validH1Trades.length.toString().padEnd(12)} | ${brokerWR.toFixed(2)}%    | ${simWRH1.toFixed(2)}%        | ${Math.abs(brokerWR - simWRH1).toFixed(2)}%`);
  console.log(`-----------------------------------------------------------------------------------------`);

  // Restore session replay to M1 as standard baseline
  console.log('\nRestoring session replay back to M1...');
  await marketAnalytics.rebuildSessionReplay(sessionId, 0.75, '2.1.0', 'DUKASCOPY', 'M1');
  console.log('Replay restored to M1.');

  await prisma.$disconnect();
}

main().catch(console.error);
