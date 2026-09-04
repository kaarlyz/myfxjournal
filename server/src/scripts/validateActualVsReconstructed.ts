import { prisma } from '../prisma';
import {
  inferSLTP,
  runRRSimulation,
  normalizeSymbol,
  getBarOpenTime,
  priceToMicro,
  microToPrice,
  detectPriceDigits,
  OHLCCandle,
} from '../services/replayEngineCore';

async function main() {
  const sessionId = 'e47d3891-1874-48ca-9534-50e2959e4156';

  console.log('Loading trades and candle data for session:', sessionId);
  const trades = await prisma.trade.findMany({
    where: { sessionId },
    orderBy: { entryTime: 'asc' },
  });

  console.log(`Loaded ${trades.length} trades.`);

  // 1. Validate Actual RR Distribution for all 919 trades
  const actualRRs: { tradeId: string; tradeNumber: number; side: string; entryPrice: number; exitPrice: number; slPrice: number; tpPrice: number; rr: number; result: string }[] = [];
  let invalidActualCount = 0;

  for (const t of trades) {
    if (t.entryPrice && t.slPrice && t.tpPrice) {
      const isLong = t.side === 'LONG' || t.side === 'BUY';
      const risk = isLong ? t.entryPrice - t.slPrice : t.slPrice - t.entryPrice;
      const reward = isLong ? t.tpPrice - t.entryPrice : t.entryPrice - t.tpPrice;
      if (risk > 0 && reward > 0) {
        const rr = reward / risk;
        actualRRs.push({
          tradeId: t.id,
          tradeNumber: t.tradeNumber || 0,
          side: t.side,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice || 0,
          slPrice: t.slPrice,
          tpPrice: t.tpPrice,
          rr,
          result: t.result || 'UNKNOWN',
        });
      } else {
        invalidActualCount++;
      }
    } else {
      invalidActualCount++;
    }
  }

  const rrValues = actualRRs.map(a => a.rr).sort((a, b) => a - b);
  const minRR = rrValues[0];
  const maxRR = rrValues[rrValues.length - 1];
  const sumRR = rrValues.reduce((acc, v) => acc + v, 0);
  const avgRR = sumRR / rrValues.length;
  const medianRR = rrValues[Math.floor(rrValues.length / 2)];
  const p25RR = rrValues[Math.floor(rrValues.length * 0.25)];
  const p75RR = rrValues[Math.floor(rrValues.length * 0.75)];
  const p90RR = rrValues[Math.floor(rrValues.length * 0.90)];

  console.log('\n======================================================');
  console.log('ACTUAL RR DISTRIBUTION ACROSS 919 TRADES:');
  console.log('======================================================');
  console.log(`Total trades evaluated: ${trades.length}`);
  console.log(`Trades with valid Actual SL & TP: ${actualRRs.length} (Invalid/Zero: ${invalidActualCount})`);
  console.log(`Min Actual RR:    ${minRR.toFixed(4)}`);
  console.log(`25th Percentile:  ${p25RR.toFixed(4)}`);
  console.log(`Median Actual RR: ${medianRR.toFixed(4)}`);
  console.log(`Average Actual RR: ${avgRR.toFixed(4)}`);
  console.log(`75th Percentile:  ${p75RR.toFixed(4)}`);
  console.log(`90th Percentile:  ${p90RR.toFixed(4)}`);
  console.log(`Max Actual RR:    ${maxRR.toFixed(4)}`);

  // Check outliers (RR < 0.5 or RR > 1.0)
  const outliers = actualRRs.filter(a => a.rr < 0.5 || a.rr > 1.0);
  console.log(`\nOutlier trades (RR < 0.5 or RR > 1.0): ${outliers.length}`);
  outliers.forEach(o => {
    console.log(`  Trade #${o.tradeNumber} (${o.side}): Entry=${o.entryPrice}, SL=${o.slPrice}, TP=${o.tpPrice} -> RR=${o.rr.toFixed(4)}`);
  });

  // 2. Fetch all candles for replay
  console.log('\nLoading Dukascopy M1 candles...');
  const firstEntry = trades[0].entryTime!;
  const lastExit = trades[trades.length - 1].exitTime!;

  const candles = await prisma.mt5CandleData.findMany({
    where: {
      provider: 'DUKASCOPY',
      symbol: 'XAUUSD',
      timeframe: 'M1',
      time: {
        gte: new Date(firstEntry.getTime() - 3600000),
        lte: new Date(lastExit.getTime() + 3600000),
      },
    },
    orderBy: { time: 'asc' },
  });

  console.log(`Loaded ${candles.length} Dukascopy M1 candles.`);

  // Map candles by integer timestamp for fast search
  const candleTimeMap: { time: number; candle: typeof candles[0] }[] = candles.map(c => ({
    time: c.time.getTime(),
    candle: c,
  }));

  function getCandlesForWindow(start: Date, end: Date): OHLCCandle[] {
    const s = start.getTime();
    const e = end.getTime();
    return candles
      .filter(c => c.time.getTime() >= s && c.time.getTime() <= e)
      .map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }));
  }

  // 3. Run Simulations for Mode A, Mode B (0.75), Mode B (0.736)
  interface SimResultTrade {
    trade: typeof trades[0];
    valid: boolean;
    invalidReason?: string;
    // Mode A: Actual
    modeA: {
      slPrice: number;
      tpPrice: number;
      actualRR: number;
      firstHit: string;
      simResult: 'WIN' | 'LOSS';
      simR: number;
      maxPotentialRR: number;
      mfePrice: number;
      maePrice: number;
    } | null;
    // Mode B1: Reconstruct 0.75
    modeB1: {
      slPrice: number;
      tpPrice: number;
      targetRR: number;
      firstHit: string;
      simResult: 'WIN' | 'LOSS';
      simR: number;
      maxPotentialRR: number;
      mfePrice: number;
      maePrice: number;
    } | null;
    // Mode B2: Reconstruct 0.736
    modeB2: {
      slPrice: number;
      tpPrice: number;
      targetRR: number;
      firstHit: string;
      simResult: 'WIN' | 'LOSS';
      simR: number;
      maxPotentialRR: number;
      mfePrice: number;
      maePrice: number;
    } | null;
  }

  const results: SimResultTrade[] = [];

  for (const t of trades) {
    if (!t.entryTime || !t.entryPrice || !t.exitPrice) {
      results.push({ trade: t, valid: false, invalidReason: 'Missing entry/exit price/time', modeA: null, modeB1: null, modeB2: null });
      continue;
    }

    const alignedEntryTime = getBarOpenTime(t.entryTime, 'M1');
    const alignedExitTime = t.exitTime || new Date(t.entryTime.getTime() + 14 * 86400000);

    const tradeCandles = getCandlesForWindow(alignedEntryTime, alignedExitTime);
    if (tradeCandles.length === 0) {
      results.push({ trade: t, valid: false, invalidReason: 'MISSING_MARKET_DATA', modeA: null, modeB1: null, modeB2: null });
      continue;
    }

    const isLong = t.side === 'LONG' || t.side === 'BUY';
    const entryPrice = t.entryPrice;
    const exitPrice = t.exitPrice;

    // --- MODE A (Actual SL/TP Priority) ---
    const sltpA = inferSLTP(t.side as any, entryPrice, exitPrice, t.result, 0.75, t.slPrice, t.tpPrice);
    if (!sltpA) {
      results.push({ trade: t, valid: false, invalidReason: 'NO_SL_INFERABLE', modeA: null, modeB1: null, modeB2: null });
      continue;
    }

    const digitsA = sltpA.priceDigits;
    const entryMicroA = priceToMicro(entryPrice, digitsA);
    const slMicroA = priceToMicro(sltpA.slPrice, digitsA);
    let mfeMicroA = entryMicroA;
    let maeMicroA = entryMicroA;

    for (const c of tradeCandles) {
      const highM = priceToMicro(c.high, digitsA);
      const lowM = priceToMicro(c.low, digitsA);
      if (isLong) {
        if (lowM < maeMicroA) maeMicroA = lowM;
        if (lowM <= slMicroA) break;
        if (highM > mfeMicroA) mfeMicroA = highM;
      } else {
        if (highM > maeMicroA) maeMicroA = highM;
        if (highM >= slMicroA) break;
        if (lowM < mfeMicroA) mfeMicroA = lowM;
      }
    }

    const mfePriceA = microToPrice(mfeMicroA, digitsA);
    const maePriceA = microToPrice(maeMicroA, digitsA);
    const mfeDistA = isLong ? microToPrice(mfeMicroA > entryMicroA ? mfeMicroA - entryMicroA : 0n, digitsA) : microToPrice(entryMicroA > mfeMicroA ? entryMicroA - mfeMicroA : 0n, digitsA);
    const maxPotentialRRA = sltpA.riskDistance > 0 ? mfeDistA / sltpA.riskDistance : 0;

    const simA = runRRSimulation(t.side as any, entryPrice, sltpA.slPrice, sltpA.tpPrice, alignedExitTime, tradeCandles);
    const actualRRA = sltpA.actualRR ?? 0.75;
    const simResultA: 'WIN' | 'LOSS' = (simA.firstHit === 'TP' || (simA.firstHit !== 'SL' && simA.firstHit !== 'AMBIGUOUS' && maxPotentialRRA >= actualRRA)) ? 'WIN' : 'LOSS';
    const simRA = simResultA === 'WIN' ? actualRRA : -1.0;

    // --- MODE B1 (Synthetic Reconstruct RR=0.75) ---
    // Force null for actualSL and actualTP
    const sltpB1 = inferSLTP(t.side as any, entryPrice, exitPrice, t.result, 0.75, null, null);
    if (!sltpB1) {
      results.push({ trade: t, valid: false, invalidReason: 'NO_SL_INFERABLE_B1', modeA: null, modeB1: null, modeB2: null });
      continue;
    }

    const digitsB1 = sltpB1.priceDigits;
    const entryMicroB1 = priceToMicro(entryPrice, digitsB1);
    const slMicroB1 = priceToMicro(sltpB1.slPrice, digitsB1);
    let mfeMicroB1 = entryMicroB1;
    let maeMicroB1 = entryMicroB1;

    for (const c of tradeCandles) {
      const highM = priceToMicro(c.high, digitsB1);
      const lowM = priceToMicro(c.low, digitsB1);
      if (isLong) {
        if (lowM < maeMicroB1) maeMicroB1 = lowM;
        if (lowM <= slMicroB1) break;
        if (highM > mfeMicroB1) mfeMicroB1 = highM;
      } else {
        if (highM > maeMicroB1) maeMicroB1 = highM;
        if (highM >= slMicroB1) break;
        if (lowM < mfeMicroB1) mfeMicroB1 = lowM;
      }
    }

    const mfePriceB1 = microToPrice(mfeMicroB1, digitsB1);
    const maePriceB1 = microToPrice(maeMicroB1, digitsB1);
    const mfeDistB1 = isLong ? microToPrice(mfeMicroB1 > entryMicroB1 ? mfeMicroB1 - entryMicroB1 : 0n, digitsB1) : microToPrice(entryMicroB1 > mfeMicroB1 ? entryMicroB1 - mfeMicroB1 : 0n, digitsB1);
    const maxPotentialRRB1 = sltpB1.riskDistance > 0 ? mfeDistB1 / sltpB1.riskDistance : 0;

    const simB1 = runRRSimulation(t.side as any, entryPrice, sltpB1.slPrice, sltpB1.tpPrice, alignedExitTime, tradeCandles);
    const simResultB1: 'WIN' | 'LOSS' = (simB1.firstHit === 'TP' || (simB1.firstHit !== 'SL' && simB1.firstHit !== 'AMBIGUOUS' && maxPotentialRRB1 >= 0.75)) ? 'WIN' : 'LOSS';
    const simRB1 = simResultB1 === 'WIN' ? 0.75 : -1.0;

    // --- MODE B2 (Synthetic Reconstruct RR=0.736) ---
    const sltpB2 = inferSLTP(t.side as any, entryPrice, exitPrice, t.result, 0.736, null, null);
    if (!sltpB2) {
      results.push({ trade: t, valid: false, invalidReason: 'NO_SL_INFERABLE_B2', modeA: null, modeB1: null, modeB2: null });
      continue;
    }

    const digitsB2 = sltpB2.priceDigits;
    const entryMicroB2 = priceToMicro(entryPrice, digitsB2);
    const slMicroB2 = priceToMicro(sltpB2.slPrice, digitsB2);
    let mfeMicroB2 = entryMicroB2;
    let maeMicroB2 = entryMicroB2;

    for (const c of tradeCandles) {
      const highM = priceToMicro(c.high, digitsB2);
      const lowM = priceToMicro(c.low, digitsB2);
      if (isLong) {
        if (lowM < maeMicroB2) maeMicroB2 = lowM;
        if (lowM <= slMicroB2) break;
        if (highM > mfeMicroB2) mfeMicroB2 = highM;
      } else {
        if (highM > maeMicroB2) maeMicroB2 = highM;
        if (highM >= slMicroB2) break;
        if (lowM < mfeMicroB2) mfeMicroB2 = lowM;
      }
    }

    const mfePriceB2 = microToPrice(mfeMicroB2, digitsB2);
    const maePriceB2 = microToPrice(maeMicroB2, digitsB2);
    const mfeDistB2 = isLong ? microToPrice(mfeMicroB2 > entryMicroB2 ? mfeMicroB2 - entryMicroB2 : 0n, digitsB2) : microToPrice(entryMicroB2 > mfeMicroB2 ? entryMicroB2 - mfeMicroB2 : 0n, digitsB2);
    const maxPotentialRRB2 = sltpB2.riskDistance > 0 ? mfeDistB2 / sltpB2.riskDistance : 0;

    const simB2 = runRRSimulation(t.side as any, entryPrice, sltpB2.slPrice, sltpB2.tpPrice, alignedExitTime, tradeCandles);
    const simResultB2: 'WIN' | 'LOSS' = (simB2.firstHit === 'TP' || (simB2.firstHit !== 'SL' && simB2.firstHit !== 'AMBIGUOUS' && maxPotentialRRB2 >= 0.736)) ? 'WIN' : 'LOSS';
    const simRB2 = simResultB2 === 'WIN' ? 0.736 : -1.0;

    results.push({
      trade: t,
      valid: true,
      modeA: {
        slPrice: sltpA.slPrice,
        tpPrice: sltpA.tpPrice,
        actualRR: actualRRA,
        firstHit: simA.firstHit,
        simResult: simResultA,
        simR: simRA,
        maxPotentialRR: maxPotentialRRA,
        mfePrice: mfePriceA,
        maePrice: maePriceA,
      },
      modeB1: {
        slPrice: sltpB1.slPrice,
        tpPrice: sltpB1.tpPrice,
        targetRR: 0.75,
        firstHit: simB1.firstHit,
        simResult: simResultB1,
        simR: simRB1,
        maxPotentialRR: maxPotentialRRB1,
        mfePrice: mfePriceB1,
        maePrice: maePriceB1,
      },
      modeB2: {
        slPrice: sltpB2.slPrice,
        tpPrice: sltpB2.tpPrice,
        targetRR: 0.736,
        firstHit: simB2.firstHit,
        simResult: simResultB2,
        simR: simRB2,
        maxPotentialRR: maxPotentialRRB2,
        mfePrice: mfePriceB2,
        maePrice: maePriceB2,
      },
    });
  }

  const validList = results.filter(r => r.valid);
  console.log(`\nValid Replays Count: ${validList.length} / ${results.length}`);

  // Helper to compute stats
  function computeStats(rList: { simResult: 'WIN' | 'LOSS'; simR: number }[]) {
    const wins = rList.filter(r => r.simResult === 'WIN').length;
    const losses = rList.filter(r => r.simResult === 'LOSS').length;
    const total = rList.length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;

    let grossProfit = 0;
    let grossLoss = 0;
    let runningR = 0;
    let peakR = 0;
    let maxDd = 0;

    for (const r of rList) {
      if (r.simResult === 'WIN') {
        grossProfit += r.simR;
        runningR += r.simR;
      } else {
        grossLoss += 1.0;
        runningR -= 1.0;
      }
      if (runningR > peakR) peakR = runningR;
      const dd = peakR - runningR;
      if (dd > maxDd) maxDd = dd;
    }

    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 999;
    const avgR = (wins > 0) ? (grossProfit / wins) : 0;
    const expectancy = total > 0 ? (grossProfit - grossLoss) / total : 0;

    return { total, wins, losses, winRate, profitFactor, expectancy, maxDd };
  }

  const statsA = computeStats(validList.map(r => ({ simResult: r.modeA!.simResult, simR: r.modeA!.simR })));
  const statsB1 = computeStats(validList.map(r => ({ simResult: r.modeB1!.simResult, simR: r.modeB1!.simR })));
  const statsB2 = computeStats(validList.map(r => ({ simResult: r.modeB2!.simResult, simR: r.modeB2!.simR })));

  // Broker Stats
  const brokerWins = validList.filter(r => r.trade.result === 'WIN').length;
  const brokerLosses = validList.length - brokerWins;
  const brokerWR = (brokerWins / validList.length) * 100;

  console.log('\n========================================================================================================');
  console.log('SUMMARY COMPARISON MATRIX: MODE A vs MODE B (0.75) vs MODE B (0.736)');
  console.log('========================================================================================================');
  console.log(`Metric                     | Broker (Realized) | Mode A (Actual SL/TP) | Mode B1 (Reconstruct 0.75) | Mode B2 (Reconstruct 0.736)`);
  console.log(`---------------------------+-------------------+-----------------------+----------------------------+-----------------------------`);
  console.log(`Total Valid Replays        | ${validList.length.toString().padEnd(17)} | ${statsA.total.toString().padEnd(21)} | ${statsB1.total.toString().padEnd(26)} | ${statsB2.total.toString().padEnd(27)}`);
  console.log(`Wins / Losses              | ${(brokerWins + ' / ' + brokerLosses).padEnd(17)} | ${(statsA.wins + ' / ' + statsA.losses).padEnd(21)} | ${(statsB1.wins + ' / ' + statsB1.losses).padEnd(26)} | ${(statsB2.wins + ' / ' + statsB2.losses).padEnd(27)}`);
  console.log(`Win Rate                   | ${brokerWR.toFixed(2)}%            | ${statsA.winRate.toFixed(2)}%                | ${statsB1.winRate.toFixed(2)}%                     | ${statsB2.winRate.toFixed(2)}%`);
  console.log(`Profit Factor              | N/A                 | ${statsA.profitFactor.toFixed(3).padEnd(21)} | ${statsB1.profitFactor.toFixed(3).padEnd(26)} | ${statsB2.profitFactor.toFixed(3).padEnd(27)}`);
  console.log(`Expectancy (R per trade)   | N/A                 | ${statsA.expectancy >= 0 ? '+' : ''}${statsA.expectancy.toFixed(3).padEnd(20)} | ${statsB1.expectancy >= 0 ? '+' : ''}${statsB1.expectancy.toFixed(3).padEnd(25)} | ${statsB2.expectancy >= 0 ? '+' : ''}${statsB2.expectancy.toFixed(3).padEnd(26)}`);
  console.log(`Max Drawdown (R)           | N/A                 | -${statsA.maxDd.toFixed(2).padEnd(20)} | -${statsB1.maxDd.toFixed(2).padEnd(25)} | -${statsB2.maxDd.toFixed(2).padEnd(26)}`);
  console.log(`========================================================================================================`);

  // 4. Agreement Analysis between Mode A and Mode B1
  let agreementCountAB1 = 0;
  let diffCountAB1 = 0;
  const diffsAB1: any[] = [];

  for (const r of validList) {
    if (r.modeA!.simResult === r.modeB1!.simResult) {
      agreementCountAB1++;
    } else {
      diffCountAB1++;
      diffsAB1.push(r);
    }
  }

  console.log(`\nAGREEMENT BETWEEN MODE A (Actual) AND MODE B1 (Reconstruct 0.75):`);
  console.log(`- Exact Agreement (Same Win/Loss): ${agreementCountAB1} / ${validList.length} (${((agreementCountAB1 / validList.length) * 100).toFixed(2)}%)`);
  console.log(`- Differing Results:               ${diffCountAB1} / ${validList.length} (${((diffCountAB1 / validList.length) * 100).toFixed(2)}%)`);

  // 5. 30 Representative Trades Table
  console.log('\n========================================================================================================================');
  console.log('SAMPLE OF 30 REPRESENTATIVE TRADES (Agreements & Discrepancies):');
  console.log('========================================================================================================================');

  // Select 15 agreements and 15 disagreements
  const agreements = validList.filter(r => r.modeA!.simResult === r.modeB1!.simResult);
  const selectedAgreements = agreements.slice(0, 15);
  const selectedDiffs = diffsAB1.slice(0, 15);
  const sample30 = [...selectedAgreements, ...selectedDiffs].sort((a, b) => (a.trade.tradeNumber || 0) - (b.trade.tradeNumber || 0));

  for (const s of sample30) {
    const isAgree = s.modeA!.simResult === s.modeB1!.simResult ? 'YES' : 'NO';
    let reason = '-';
    if (isAgree === 'NO') {
      const diffSL = Math.abs(s.modeA!.slPrice - s.modeB1!.slPrice).toFixed(2);
      const diffTP = Math.abs(s.modeA!.tpPrice - s.modeB1!.tpPrice).toFixed(2);
      reason = `Actual SL/TP [${s.modeA!.slPrice}/${s.modeA!.tpPrice}, RR=${s.modeA!.actualRR.toFixed(3)}] differs from Reconstructed [${s.modeB1!.slPrice}/${s.modeB1!.tpPrice}, diffSL=${diffSL}, diffTP=${diffTP}]`;
    }
    console.log(
      `Trade #${String(s.trade.tradeNumber).padEnd(4)} | ` +
      `${s.trade.side.padEnd(5)} | ` +
      `Entry: ${s.trade.entryPrice?.toFixed(2).padEnd(7)} | ` +
      `Exit: ${s.trade.exitPrice?.toFixed(2).padEnd(7)} | ` +
      `Act SL: ${s.modeA!.slPrice.toFixed(2).padEnd(7)} | ` +
      `Act TP: ${s.modeA!.tpPrice.toFixed(2).padEnd(7)} | ` +
      `Act RR: ${s.modeA!.actualRR.toFixed(3)} | ` +
      `Rec SL: ${s.modeB1!.slPrice.toFixed(2).padEnd(7)} | ` +
      `Rec TP: ${s.modeB1!.tpPrice.toFixed(2).padEnd(7)} | ` +
      `ModeA: ${s.modeA!.simResult.padEnd(4)} | ` +
      `ModeB: ${s.modeB1!.simResult.padEnd(4)} | ` +
      `Agree: ${isAgree.padEnd(3)} | ` +
      `${reason}`
    );
  }

  await prisma.$disconnect();
}

main().catch(console.error);
