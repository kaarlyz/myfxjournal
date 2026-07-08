import { EnrichedTrade } from '../shared/types';

export interface MonteCarloConfig {
  simulations: number;
  futureTradesCount: number;
  startingBalance: number;
  riskPerTradeUsd: number;
  // If true, we pull randomly from the distribution of past trades
  useHistoricalDistribution: boolean;
  // Fallback if not using historical, or if no historical data exists
  assumedWinRate: number; // 0-100
  assumedAvgWinUsd: number;
  assumedAvgLossUsd: number;
}

export interface MonteCarloResult {
  medianEndingBalance: number;
  bestEndingBalance: number;
  worstEndingBalance: number;
  riskOfRuinPct: number; // Probability of hitting 0 or a ruin threshold
  ruinThresholdUsd: number;
  simulations: number[][]; // Array of balance curves (for charting, subset to 10-50 curves to avoid lag)
}

export function runMonteCarlo(
  trades: any[],
  config: MonteCarloConfig
): MonteCarloResult {
  const { simulations, futureTradesCount, startingBalance, useHistoricalDistribution, assumedWinRate, assumedAvgWinUsd, assumedAvgLossUsd } = config;
  
  const ruinThresholdUsd = startingBalance * 0.1; // Ruin is 90% drawdown
  let ruinCount = 0;
  
  const historicalReturns: number[] = [];
  if (useHistoricalDistribution && trades.length > 0) {
    const closedTrades = trades.filter(t => t.status === 'CLOSED');
    for (const t of closedTrades) {
      if (t.netPnlUsd !== null && t.netPnlUsd !== undefined) {
        historicalReturns.push(t.netPnlUsd);
      }
    }
  }

  const allEndingBalances: number[] = [];
  const balanceCurves: number[][] = [];

  for (let s = 0; s < simulations; s++) {
    let currentBalance = startingBalance;
    let ruined = false;
    const curve = [startingBalance];

    for (let t = 0; t < futureTradesCount; t++) {
      let tradeResult = 0;
      
      if (useHistoricalDistribution && historicalReturns.length > 0) {
        // Random draw from historical returns
        const randomIndex = Math.floor(Math.random() * historicalReturns.length);
        tradeResult = historicalReturns[randomIndex];
      } else {
        // Use assumed parameters
        const isWin = Math.random() * 100 < assumedWinRate;
        tradeResult = isWin ? assumedAvgWinUsd : -assumedAvgLossUsd;
      }
      
      currentBalance += tradeResult;
      
      // We limit to max 50 curves for rendering performance
      if (s < 50) {
        curve.push(currentBalance);
      }
      
      if (currentBalance <= ruinThresholdUsd) {
        ruined = true;
        break; // Stop simulation for this iteration
      }
    }

    if (ruined) {
      ruinCount++;
    }
    
    allEndingBalances.push(currentBalance);
    if (s < 50) {
      balanceCurves.push(curve);
    }
  }

  allEndingBalances.sort((a, b) => a - b);

  const bestEndingBalance = allEndingBalances[allEndingBalances.length - 1];
  const worstEndingBalance = allEndingBalances[0];
  const medianEndingBalance = allEndingBalances[Math.floor(allEndingBalances.length / 2)];
  const riskOfRuinPct = (ruinCount / simulations) * 100;

  return {
    medianEndingBalance,
    bestEndingBalance,
    worstEndingBalance,
    riskOfRuinPct,
    ruinThresholdUsd,
    simulations: balanceCurves,
  };
}
