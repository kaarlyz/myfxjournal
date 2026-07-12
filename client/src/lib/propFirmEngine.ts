
export interface PropFirmConfig {
  accountSize: number;
  targetProfitPct: number;
  maxDailyDrawdownPct: number;
  maxTotalDrawdownPct: number;
  payoutSplitPct: number; // e.g., 80 for 80% to trader
  minTradingDays: number;
}

export interface PropFirmResult {
  currentBalance: number;
  netProfit: number;
  netProfitPct: number;
  targetProfitAmount: number;
  remainingTarget: number;
  passedTarget: boolean;

  maxDailyDrawdownUsd: number;
  maxDailyDrawdownPct: number;
  dailyDrawdownLimit: number;
  failedDailyDrawdown: boolean;

  maxTotalDrawdownUsd: number;
  maxTotalDrawdownPct: number;
  totalDrawdownLimit: number;
  failedTotalDrawdown: boolean;

  tradingDaysCount: number;
  passedMinDays: boolean;

  status: 'PASSED' | 'FAILED' | 'IN_PROGRESS';
  readinessScore: number;
  readinessLabel: 'Prop Ready' | 'Potential' | 'Needs More Data' | 'Not Ready';
  estimatedPayout: number | null; // null if not passed or if challenge
}

export const PRESET_THE5ERS_10K: PropFirmConfig = {
  accountSize: 10000,
  targetProfitPct: 10,
  maxDailyDrawdownPct: 5,
  maxTotalDrawdownPct: 10,
  payoutSplitPct: 80,
  minTradingDays: 3,
};

export const PRESET_FTMO_100K: PropFirmConfig = {
  accountSize: 100000,
  targetProfitPct: 10,
  maxDailyDrawdownPct: 5,
  maxTotalDrawdownPct: 10,
  payoutSplitPct: 80,
  minTradingDays: 4,
};

export function simulatePropFirm(
  trades: any[],
  config: PropFirmConfig,
  useSimulationMode: boolean,
  riskPerTradePct: number = 1
): PropFirmResult {
  const { accountSize, targetProfitPct, maxDailyDrawdownPct, maxTotalDrawdownPct, payoutSplitPct, minTradingDays } = config;

  let currentBalance = accountSize;
  let peakBalance = accountSize;
  let maxTotalDrawdownUsd = 0;
  
  // Daily drawdown tracking
  // In prop firms, daily DD is usually calculated based on the starting balance of the day
  let maxDailyDrawdownUsd = 0;
  let currentDayStartBalance = accountSize;
  let currentDayKey = '';
  
  let failedDailyDrawdown = false;
  let failedTotalDrawdown = false;

  const tradingDays = new Set<string>();

  // Filter closed trades and sort by date
  const sortedTrades = [...trades]
    .filter(t => t.status === 'CLOSED')
    .sort((a, b) => {
      const aTime = a.exitTime ? new Date(a.exitTime).getTime() : 0;
      const bTime = b.exitTime ? new Date(b.exitTime).getTime() : 0;
      return aTime - bTime;
    });

  for (const trade of sortedTrades) {
    if (!trade.dayKey) continue;
    tradingDays.add(trade.dayKey);

    // Reset daily start balance if day changes
    if (trade.dayKey !== currentDayKey) {
      currentDayKey = trade.dayKey;
      currentDayStartBalance = currentBalance;
    }

    // Determine PnL for this trade relative to the prop account
    let tradePnl = 0;
    const riskAmount = accountSize * (riskPerTradePct / 100);
    
    if (useSimulationMode && trade.realizedRR !== null) {
      tradePnl = riskAmount * trade.realizedRR;
    } else {
      // Otherwise, we scale the raw PnL by the ratio of (Prop Account / Original Account)
      // Let's use the R multiple if available, otherwise assume riskPerTradePct for wins, riskPerTradePct for loss based on raw PnL direction.
      if (trade.realizedRR !== null) {
        tradePnl = riskAmount * trade.realizedRR;
      } else {
        const raw = trade.netPnlUsd || 0;
        if (raw > 0) tradePnl = riskAmount; // Win
        else if (raw < 0) tradePnl = -riskAmount; // Loss
        else tradePnl = 0;
      }
    }

    currentBalance += tradePnl;
    
    // Update peak for total drawdown
    if (currentBalance > peakBalance) {
      peakBalance = currentBalance;
    }

    // Calculate drawdowns
    const currentTotalDrawdown = peakBalance - currentBalance;
    if (currentTotalDrawdown > maxTotalDrawdownUsd) {
      maxTotalDrawdownUsd = currentTotalDrawdown;
    }

    const currentDailyDrawdown = currentDayStartBalance - currentBalance;
    if (currentDailyDrawdown > maxDailyDrawdownUsd) {
      maxDailyDrawdownUsd = currentDailyDrawdown;
    }

    // Check failure conditions immediately
    if (currentDailyDrawdown > (accountSize * (maxDailyDrawdownPct / 100))) {
      failedDailyDrawdown = true;
    }
    
    if (currentTotalDrawdown > (accountSize * (maxTotalDrawdownPct / 100))) {
      failedTotalDrawdown = true;
    }

    if (failedDailyDrawdown || failedTotalDrawdown) {
      // Stop simulation if blown
      break;
    }
  }

  const netProfit = currentBalance - accountSize;
  const netProfitPct = (netProfit / accountSize) * 100;
  const targetProfitAmount = accountSize * (targetProfitPct / 100);
  const remainingTarget = Math.max(0, targetProfitAmount - netProfit);
  const passedTarget = netProfit >= targetProfitAmount;
  const tradingDaysCount = tradingDays.size;
  const passedMinDays = tradingDaysCount >= minTradingDays;

  let status: PropFirmResult['status'] = 'IN_PROGRESS';
  if (failedDailyDrawdown || failedTotalDrawdown) {
    status = 'FAILED';
  } else if (passedTarget && passedMinDays) {
    status = 'PASSED';
  }

  // Readiness Score (0-100)
  // Factors: Profit factor, Drawdown safety buffer, Win rate, Sample size
  let readinessScore = 0;
  if (sortedTrades.length < 20) {
    // Too small sample
    readinessScore = 20;
  } else if (failedDailyDrawdown || failedTotalDrawdown) {
    readinessScore = 0;
  } else {
    // Score based on distance to max DD
    const ddSafetyPct = 1 - (maxTotalDrawdownUsd / (accountSize * (maxTotalDrawdownPct / 100))); // 0 to 1
    const profitProgressPct = Math.min(1, netProfit / targetProfitAmount); // 0 to 1
    
    readinessScore = Math.round((ddSafetyPct * 50) + (profitProgressPct * 50));
  }

  let readinessLabel: PropFirmResult['readinessLabel'] = 'Not Ready';
  if (sortedTrades.length < 20) readinessLabel = 'Needs More Data';
  else if (readinessScore >= 80) readinessLabel = 'Prop Ready';
  else if (readinessScore >= 50) readinessLabel = 'Potential';

  let estimatedPayout: number | null = null;
  if (status === 'PASSED' || (status === 'IN_PROGRESS' && netProfit > 0)) {
    estimatedPayout = netProfit * (payoutSplitPct / 100);
  }

  return {
    currentBalance,
    netProfit,
    netProfitPct,
    targetProfitAmount,
    remainingTarget,
    passedTarget,
    maxDailyDrawdownUsd,
    maxDailyDrawdownPct: (maxDailyDrawdownUsd / accountSize) * 100,
    dailyDrawdownLimit: accountSize * (maxDailyDrawdownPct / 100),
    failedDailyDrawdown,
    maxTotalDrawdownUsd,
    maxTotalDrawdownPct: (maxTotalDrawdownUsd / accountSize) * 100,
    totalDrawdownLimit: accountSize * (maxTotalDrawdownPct / 100),
    failedTotalDrawdown,
    tradingDaysCount,
    passedMinDays,
    status,
    readinessScore,
    readinessLabel,
    estimatedPayout
  };
}
