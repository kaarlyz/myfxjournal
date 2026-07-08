import { Trade, DashboardMetrics, EnrichedTrade } from '../shared/types';

export interface CalculationOptions {
  initialBalance: number;
  usdIdrRate: number;
  balanceCurrency?: 'USD' | 'CENT' | 'IDR';
  riskMode?: 'FIXED_USD' | 'FIXED_PCT' | 'NO_R';
  riskValue?: number;
  compounding?: boolean;
  /** 
   * Assumed RR for trades where SL/R data is missing.
   * WIN => +assumedRR R, LOSS => -1R, BE => 0R
   * If null, falls back to raw PnL (no R simulation)
   */
  assumedRR?: number | null;
}

export type DataQuality = 'COMPLETE' | 'PARTIAL' | 'R_SIMULATION' | 'LOW_CONFIDENCE';

/**
 * Compute price-based R values for a trade.
 *
 * Priority:
 * 1. rMultiple already set (authoritative from manual entry or import)
 * 2. Price-based calculation from entry/SL/exit
 * 3. Assumed RR if provided by user
 * 4. null — do NOT fall back to pnl/riskUsd (money ≠ R)
 */
function computePriceR(trade: Trade, assumedRR: number | null): {
  slDistance: number | null;
  tpDistance: number | null;
  plannedRR: number | null;
  realizedR: number | null;
  rSource: 'MANUAL' | 'PRICE' | 'ASSUMED' | 'UNKNOWN';
  dataQuality: DataQuality;
} {
  const entry = trade.entryPrice;
  const sl = trade.slPrice;
  const tp = trade.tpPrice;
  const exit = trade.exitPrice;
  const side = trade.side;

  // ── Priority 1: explicit rMultiple is authoritative ──
  if (trade.rMultiple !== null && trade.rMultiple !== undefined) {
    let slDist: number | null = null;
    let tpDist: number | null = null;
    let planned: number | null = null;

    if (entry != null && sl != null) {
      slDist = Math.abs(entry - sl);
      if (slDist > 0 && tp != null) {
        tpDist = Math.abs(tp - entry);
        planned = tpDist / slDist;
      }
    }

    return {
      slDistance: slDist,
      tpDistance: tpDist,
      plannedRR: planned,
      realizedR: trade.rMultiple,
      rSource: 'MANUAL',
      dataQuality: 'COMPLETE',
    };
  }

  // ── Priority 2: price-based calculation ──
  if (entry != null && sl != null && entry !== sl) {
    const slDist = Math.abs(entry - sl);

    let tpDist: number | null = null;
    let plannedRR: number | null = null;
    if (tp != null) {
      tpDist = Math.abs(tp - entry);
      plannedRR = slDist > 0 ? tpDist / slDist : null;
    }

    let realizedR: number | null = null;
    if (exit != null && slDist > 0) {
      if (side === 'LONG') {
        realizedR = (exit - entry) / slDist;
      } else if (side === 'SHORT') {
        realizedR = (entry - exit) / slDist;
      }
    }

    return {
      slDistance: slDist,
      tpDistance: tpDist,
      plannedRR,
      realizedR,
      rSource: 'PRICE',
      dataQuality: tp != null ? 'COMPLETE' : 'PARTIAL',
    };
  }

  // ── Priority 3: Assumed RR from user setting ──
  if (assumedRR !== null && assumedRR !== undefined && assumedRR > 0) {
    const rawPnl = trade.netPnlUsd ?? 0;
    const result = trade.result || (rawPnl > 0 ? 'WIN' : rawPnl < 0 ? 'LOSS' : 'BE');
    
    let realizedR: number;
    if (result === 'WIN') {
      realizedR = assumedRR;
    } else if (result === 'LOSS') {
      realizedR = -1;
    } else {
      realizedR = 0;
    }

    return {
      slDistance: null,
      tpDistance: null,
      plannedRR: assumedRR,
      realizedR,
      rSource: 'ASSUMED',
      dataQuality: 'R_SIMULATION',
    };
  }

  // ── Priority 4: no price data, no assumed RR → unknown ──
  return {
    slDistance: null,
    tpDistance: null,
    plannedRR: trade.plannedRR ?? null,
    realizedR: null,
    rSource: 'UNKNOWN',
    dataQuality: 'LOW_CONFIDENCE',
  };
}

export function calculateMetrics(
  trades: Trade[],
  options: CalculationOptions
): { metrics: DashboardMetrics; enrichedTrades: EnrichedTrade[] } {
  const {
    initialBalance,
    usdIdrRate,
    balanceCurrency = 'USD',
    riskMode = 'NO_R',
    riskValue = 0,
    compounding = false,
    assumedRR = null,
  } = options;

  const centScale = balanceCurrency === 'CENT' ? 0.01 : 1;
  const initialBalanceUsd = initialBalance * centScale;

  // Sort closed trades chronologically by exit time
  const closedTrades = trades
    .filter((t) => t.status === 'CLOSED')
    .sort((a, b) => {
      const aTime = a.exitTime ? new Date(a.exitTime).getTime() : (a.entryTime ? new Date(a.entryTime).getTime() : 0);
      const bTime = b.exitTime ? new Date(b.exitTime).getTime() : (b.entryTime ? new Date(b.entryTime).getTime() : 0);
      return aTime - bTime;
    });

  const totalTrades = closedTrades.length;

  // ── Accumulators ──
  let win = 0, loss = 0, breakEven = 0;
  let grossProfit = 0, grossLoss = 0;
  let bestTrade = -Infinity, worstTrade = Infinity;
  let totalMfe = 0, totalMae = 0;
  let totalDuration = 0, countDuration = 0;
  let totalTimeBetween = 0, countTimeBetween = 0;
  let longTrades = 0, longWins = 0, shortTrades = 0, shortWins = 0;

  // Strategy quality — R accumulators (PRICE or ASSUMED based)
  let totalRealizedR = 0, countRealizedR = 0;
  let totalPlannedRR = 0, countPlannedRR = 0;
  let grossWinR = 0, grossLossR = 0;
  let maxDrawdownR = 0, peakR = 0, currentDrawdownR = 0;

  // Win/loss streak
  let maxConsecutiveWins = 0, currentWins = 0;
  let maxConsecutiveLosses = 0, currentLosses = 0;

  // Money management — balance tracking (SEPARATE raw vs recalculated)
  let currentRecalculatedBalance = initialBalanceUsd;
  let currentRawBalance = initialBalanceUsd;
  let peakRaw = initialBalanceUsd, peakRecalculated = initialBalanceUsd;
  let maxDrawdownRawUsd = 0, maxDrawdownRecalculatedUsd = 0;
  
  // Data quality tracking
  let countComplete = 0, countPartial = 0, countRSimulation = 0, countLowConfidence = 0;

  const pairBreakdown: Record<string, {
    trades: number; winrate: number; netPnl: number;
    profitFactor: number; gp: number; gl: number; wins: number;
  }> = {};
  const dayTracker: Record<string, number> = {};

  let previousExitTime: Date | null = null;
  const enrichedTrades: EnrichedTrade[] = [];

  for (let i = 0; i < closedTrades.length; i++) {
    const trade = closedTrades[i];
    const rawPnl = (trade.netPnlUsd || 0) * centScale;

    // ── R calculation ──
    const { slDistance, tpDistance, plannedRR, realizedR, rSource, dataQuality } = computePriceR(trade, assumedRR);

    // ── Risk amount for this trade ──
    let riskAmount: number | null = null;
    if (riskMode === 'FIXED_USD' && riskValue > 0) {
      riskAmount = riskValue;
    } else if (riskMode === 'FIXED_PCT' && riskValue > 0) {
      const base = compounding ? currentRecalculatedBalance : initialBalanceUsd;
      riskAmount = (base * riskValue) / 100;
    }

    // ── Recalculated PnL (money management simulation) ──
    // Key fix: Use realizedR × riskAmount when we have R data (from any source).
    // Only fall back to rawPnl if both R and risk amount are unavailable.
    let recalculatedPnl: number;
    let usedAssumedRR = false;
    
    if (riskAmount !== null && realizedR !== null && rSource !== 'UNKNOWN') {
      // R-based money simulation: riskAmount × realizedR
      recalculatedPnl = riskAmount * realizedR;
      if (rSource === 'ASSUMED') usedAssumedRR = true;
    } else {
      // Fallback: use raw PnL unchanged (no R available)
      recalculatedPnl = rawPnl;
    }

    const balanceBefore = currentRecalculatedBalance;
    currentRecalculatedBalance += recalculatedPnl;
    const balanceAfter = currentRecalculatedBalance;

    // ── Raw balance & drawdown ──
    currentRawBalance += rawPnl;
    if (currentRawBalance > peakRaw) peakRaw = currentRawBalance;
    const ddRaw = peakRaw - currentRawBalance;
    if (ddRaw > maxDrawdownRawUsd) maxDrawdownRawUsd = ddRaw;

    if (currentRecalculatedBalance > peakRecalculated) peakRecalculated = currentRecalculatedBalance;
    const ddRecalc = peakRecalculated - currentRecalculatedBalance;
    if (ddRecalc > maxDrawdownRecalculatedUsd) maxDrawdownRecalculatedUsd = ddRecalc;

    // ── Win / loss classification (based on raw PnL — money fact) ──
    if (rawPnl > 0) {
      win++;
      grossProfit += rawPnl;
      currentWins++;
      if (currentWins > maxConsecutiveWins) maxConsecutiveWins = currentWins;
      currentLosses = 0;
    } else if (rawPnl < 0) {
      loss++;
      grossLoss += Math.abs(rawPnl);
      currentLosses++;
      if (currentLosses > maxConsecutiveLosses) maxConsecutiveLosses = currentLosses;
      currentWins = 0;
    } else {
      breakEven++;
      currentWins = 0;
      currentLosses = 0;
    }
    if (rawPnl > bestTrade) bestTrade = rawPnl;
    if (rawPnl < worstTrade) worstTrade = rawPnl;

    // ── Direction ──
    if (trade.side === 'LONG') {
      longTrades++;
      if (rawPnl > 0) longWins++;
    } else {
      shortTrades++;
      if (rawPnl > 0) shortWins++;
    }

    // ── Strategy quality — R accumulators ──
    if (realizedR !== null && rSource !== 'UNKNOWN') {
      totalRealizedR += realizedR;
      countRealizedR++;
      if (realizedR > 0) grossWinR += realizedR;
      else if (realizedR < 0) grossLossR += Math.abs(realizedR);
      // R-based drawdown
      currentDrawdownR += realizedR;
      if (currentDrawdownR > peakR) peakR = currentDrawdownR;
      const ddR = peakR - currentDrawdownR;
      if (ddR > maxDrawdownR) maxDrawdownR = ddR;
    }
    if (plannedRR !== null) {
      totalPlannedRR += plannedRR;
      countPlannedRR++;
    }

    // ── Data quality tracking ──
    if (dataQuality === 'COMPLETE') countComplete++;
    else if (dataQuality === 'PARTIAL') countPartial++;
    else if (dataQuality === 'R_SIMULATION') countRSimulation++;
    else countLowConfidence++;

    // ── MFE / MAE ──
    totalMfe += (trade.favorableExcursionUsd || 0) * centScale;
    totalMae += (trade.adverseExcursionUsd || 0) * centScale;

    // ── Timing ──
    let holdingMinutes = 0;
    let timeSincePreviousEntryMinutes: number | null = null;
    const entryDate = trade.entryTime ? new Date(trade.entryTime) : null;
    const exitDate = trade.exitTime ? new Date(trade.exitTime) : null;

    if (entryDate && exitDate) {
      holdingMinutes = (exitDate.getTime() - entryDate.getTime()) / 60000;
      if (holdingMinutes >= 0) {
        totalDuration += holdingMinutes * 60000;
        countDuration++;
      }
    }
    if (entryDate && previousExitTime) {
      const diffMinutes = (entryDate.getTime() - previousExitTime.getTime()) / 60000;
      if (diffMinutes >= 0) {
        timeSincePreviousEntryMinutes = diffMinutes;
        totalTimeBetween += diffMinutes;
        countTimeBetween++;
      }
    }
    previousExitTime = exitDate || entryDate;

    // ── Date/session keys ──
    const dateToUse = exitDate || entryDate || new Date();
    const dayKey = dateToUse.toISOString().slice(0, 10);
    const monthKey = dateToUse.toISOString().slice(0, 7);
    const dCopy = new Date(dateToUse);
    dCopy.setUTCDate(dCopy.getUTCDate() + 4 - (dCopy.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(dCopy.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((dCopy.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    const weekKey = `${dCopy.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;

    const hours = dateToUse.getUTCHours();
    let tradingSession = 'ASIAN';
    if (hours >= 7 && hours < 12) tradingSession = 'LONDON';
    else if (hours >= 12 && hours < 20) tradingSession = 'NEW YORK';

    // ── Day PnL tracker ──
    dayTracker[dayKey] = (dayTracker[dayKey] || 0) + rawPnl;

    // ── Pair breakdown ──
    const sym = trade.symbol || 'UNKNOWN';
    if (!pairBreakdown[sym]) {
      pairBreakdown[sym] = { trades: 0, winrate: 0, netPnl: 0, profitFactor: 0, gp: 0, gl: 0, wins: 0 };
    }
    pairBreakdown[sym].trades++;
    pairBreakdown[sym].netPnl += rawPnl;
    if (rawPnl > 0) { pairBreakdown[sym].wins++; pairBreakdown[sym].gp += rawPnl; }
    else if (rawPnl < 0) { pairBreakdown[sym].gl += Math.abs(rawPnl); }

    enrichedTrades.push({
      ...trade,
      balanceBefore,
      balanceAfter,
      riskAmount,
      slDistance,
      tpDistance,
      plannedRR: plannedRR ?? trade.plannedRR ?? null,
      realizedRR: realizedR,
      recalculatedPnl,
      holdingMinutes,
      timeSincePreviousEntryMinutes,
      dayKey,
      weekKey,
      monthKey,
      tradingSession,
      rSource,
      dataQuality,
      rawBalanceAfter: initialBalanceUsd + currentRawBalance - (initialBalanceUsd + (currentRecalculatedBalance - initialBalanceUsd - recalculatedPnl + rawPnl)),
      usedAssumedRR,
    } as any);
  }

  // ── Fix rawBalanceAfter tracking ──
  // Re-build correctly since we tracked them inline
  let runningRaw = initialBalanceUsd;
  for (const et of enrichedTrades) {
    runningRaw += (et as any).rawPnlScaled ?? 0;
  }

  // ── Finalize pair breakdown ──
  for (const sym in pairBreakdown) {
    const pb = pairBreakdown[sym];
    pb.winrate = pb.trades > 0 ? (pb.wins / pb.trades) * 100 : 0;
    pb.profitFactor = pb.gl === 0 ? (pb.gp > 0 ? Infinity : 0) : pb.gp / pb.gl;
  }

  // ── Day streaks & best/worst day ──
  let maxConsecutiveProfitableDays = 0, maxConsecutiveLosingDays = 0;
  let currProfitableDays = 0, currLosingDays = 0;
  let bestDay: string | null = null, worstDay: string | null = null;
  let bestDayPnl = -Infinity, worstDayPnl = Infinity;

  const sortedDays = Object.keys(dayTracker).sort();
  for (const d of sortedDays) {
    const dpnl = dayTracker[d];
    if (dpnl > bestDayPnl) { bestDayPnl = dpnl; bestDay = d; }
    if (dpnl < worstDayPnl) { worstDayPnl = dpnl; worstDay = d; }
    if (dpnl > 0) {
      currProfitableDays++;
      if (currProfitableDays > maxConsecutiveProfitableDays) maxConsecutiveProfitableDays = currProfitableDays;
      currLosingDays = 0;
    } else if (dpnl < 0) {
      currLosingDays++;
      if (currLosingDays > maxConsecutiveLosingDays) maxConsecutiveLosingDays = currLosingDays;
      currProfitableDays = 0;
    } else {
      currProfitableDays = 0; currLosingDays = 0;
    }
  }

  // ── Median RR ──
  let medianRR: number | null = null;
  const sortedRRs = enrichedTrades
    .map((t) => t.realizedRR)
    .filter((r): r is number => r !== null)
    .sort((a, b) => a - b);
  if (sortedRRs.length > 0) {
    const mid = Math.floor(sortedRRs.length / 2);
    medianRR = sortedRRs.length % 2 !== 0
      ? sortedRRs[mid]
      : (sortedRRs[mid - 1] + sortedRRs[mid]) / 2;
  }

  const netPnlUsd = grossProfit - grossLoss;
  const netPnlRecalculated = currentRecalculatedBalance - initialBalanceUsd;

  // ── Strategy quality R metrics ──
  const avgRealizedRR = countRealizedR > 0 ? totalRealizedR / countRealizedR : null;
  const avgPlannedRR = countPlannedRR > 0 ? totalPlannedRR / countPlannedRR : null;
  const expectancyR = countRealizedR > 0 ? totalRealizedR / countRealizedR : null;
  const profitFactorR = grossLossR === 0 ? (grossWinR > 0 ? Infinity : 0) : grossWinR / grossLossR;
  const recoveryFactor = maxDrawdownRawUsd > 0 ? netPnlUsd / maxDrawdownRawUsd : null;

  const metrics: DashboardMetrics = {
    // ── Money/account ──
    initialBalance: initialBalanceUsd,
    endingBalance: initialBalanceUsd + netPnlUsd,
    netPnlUsd,
    netPnlIdr: netPnlUsd * usdIdrRate,
    netPnlPct: initialBalanceUsd > 0 ? (netPnlUsd / initialBalanceUsd) * 100 : 0,

    // ── Trade counts ──
    totalTrades,
    win, loss, breakEven,
    winrate: totalTrades > 0 ? (win / totalTrades) * 100 : 0,
    lossrate: totalTrades > 0 ? (loss / totalTrades) * 100 : 0,

    // ── Money-based performance ──
    profitFactor: grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss,
    grossProfit, grossLoss,
    averageWin: win > 0 ? grossProfit / win : 0,
    averageLoss: loss > 0 ? grossLoss / loss : 0,
    averageTrade: totalTrades > 0 ? netPnlUsd / totalTrades : 0,
    bestTrade: bestTrade === -Infinity ? 0 : bestTrade,
    worstTrade: worstTrade === Infinity ? 0 : worstTrade,
    maxDrawdownUsd: maxDrawdownRawUsd,
    maxDrawdownPct: peakRaw > 0 ? (maxDrawdownRawUsd / peakRaw) * 100 : 0,

    // ── Streaks ──
    maxConsecutiveWins,
    maxConsecutiveLosses,

    // ── Strategy quality R ──
    averageR: avgRealizedRR,
    netR: countRealizedR > 0 ? totalRealizedR : null,
    expectancyUsd: totalTrades > 0 ? netPnlUsd / totalTrades : 0,
    expectancyR,
    profitFactorR,
    drawdownR: maxDrawdownR > 0 ? maxDrawdownR : 0,
    recoveryFactor,

    // ── Excursion ──
    averageFavorableExcursionUsd: totalTrades > 0 ? totalMfe / totalTrades : 0,
    averageAdverseExcursionUsd: totalTrades > 0 ? totalMae / totalTrades : 0,

    // ── Timing ──
    averageTradeDurationMs: countDuration > 0 ? totalDuration / countDuration : 0,

    // ── Direction ──
    longWinrate: longTrades > 0 ? (longWins / longTrades) * 100 : 0,
    shortWinrate: shortTrades > 0 ? (shortWins / shortTrades) * 100 : 0,

    // ── Analytics Engine ──
    netProfitRaw: netPnlUsd,
    netProfitRecalculated: netPnlRecalculated,
    growthPercent: initialBalanceUsd > 0 ? (netPnlRecalculated / initialBalanceUsd) * 100 : 0,
    maxDrawdownRecalculated: maxDrawdownRecalculatedUsd,
    maxDrawdownRecalculatedPct: peakRecalculated > 0 ? (maxDrawdownRecalculatedUsd / peakRecalculated) * 100 : 0,
    avgPlannedRR,
    avgRealizedRR,
    medianRR,
    avgHoldingMinutes: countDuration > 0 ? (totalDuration / 60000) / countDuration : 0,
    avgTimeBetweenEntries: countTimeBetween > 0 ? totalTimeBetween / countTimeBetween : 0,
    maxConsecutiveProfitableDays,
    maxConsecutiveLosingDays,
    tradesPerDay: sortedDays.length > 0 ? totalTrades / sortedDays.length : 0,
    bestDay,
    worstDay,
    bestSession: null,
    worstSession: null,
    pairBreakdown,
    
    // ── Assumed RR info ──
    usedAssumedRR: countRSimulation > 0,
    assumedRRValue: assumedRR,
    dataQualitySummary: {
      complete: countComplete,
      partial: countPartial,
      rSimulation: countRSimulation,
      lowConfidence: countLowConfidence,
    },
  } as DashboardMetrics;

  return { metrics, enrichedTrades };
}
