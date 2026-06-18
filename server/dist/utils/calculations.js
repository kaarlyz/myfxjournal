"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateMetrics = calculateMetrics;
function calculateMetrics(initialBalance, usdIdrRate, trades) {
    // Only calculate metrics for CLOSED trades
    const closedTrades = trades
        .filter((t) => t.status === 'CLOSED')
        .sort((a, b) => {
        const aTime = a.exitTime ? new Date(a.exitTime).getTime() : 0;
        const bTime = b.exitTime ? new Date(b.exitTime).getTime() : 0;
        return aTime - bTime;
    });
    const totalTrades = closedTrades.length;
    if (totalTrades === 0) {
        return {
            initialBalance,
            endingBalance: initialBalance,
            netPnlUsd: 0,
            netPnlIdr: 0,
            netPnlPct: 0,
            totalTrades: 0,
            win: 0,
            loss: 0,
            breakEven: 0,
            winrate: 0,
            lossrate: 0,
            profitFactor: 0,
            grossProfit: 0,
            grossLoss: 0,
            averageWin: 0,
            averageLoss: 0,
            averageTrade: 0,
            bestTrade: 0,
            worstTrade: 0,
            maxDrawdownUsd: 0,
            maxDrawdownPct: 0,
            maxConsecutiveWins: 0,
            maxConsecutiveLosses: 0,
            averageR: 0,
            netR: 0,
            expectancyUsd: 0,
            expectancyR: 0,
            averageFavorableExcursionUsd: 0,
            averageAdverseExcursionUsd: 0,
            averageTradeDurationMs: 0,
            longWinrate: 0,
            shortWinrate: 0,
        };
    }
    let win = 0;
    let loss = 0;
    let breakEven = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let bestTrade = -Infinity;
    let worstTrade = Infinity;
    let totalR = 0;
    let countR = 0;
    let totalMfe = 0;
    let totalMae = 0;
    let totalDuration = 0;
    let countDuration = 0;
    let longTrades = 0;
    let longWins = 0;
    let shortTrades = 0;
    let shortWins = 0;
    // Track streaks
    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;
    let currentWins = 0;
    let currentLosses = 0;
    // Track equity curve to compute drawdowns
    let currentEquity = initialBalance;
    let peak = initialBalance;
    let maxDrawdownUsd = 0;
    let maxDrawdownPct = 0;
    closedTrades.forEach((trade) => {
        const pnl = trade.netPnlUsd || 0;
        // Update best/worst trades
        if (pnl > bestTrade)
            bestTrade = pnl;
        if (pnl < worstTrade)
            worstTrade = pnl;
        // Direct performance categorization
        if (pnl > 0) {
            win++;
            grossProfit += pnl;
            currentWins++;
            if (currentWins > maxConsecutiveWins)
                maxConsecutiveWins = currentWins;
            currentLosses = 0;
        }
        else if (pnl < 0) {
            loss++;
            grossLoss += Math.abs(pnl);
            currentLosses++;
            if (currentLosses > maxConsecutiveLosses)
                maxConsecutiveLosses = currentLosses;
            currentWins = 0;
        }
        else {
            breakEven++;
            currentWins = 0;
            currentLosses = 0;
        }
        // Directional (Side) Winrate
        if (trade.side === 'LONG') {
            longTrades++;
            if (pnl > 0)
                longWins++;
        }
        else if (trade.side === 'SHORT') {
            shortTrades++;
            if (pnl > 0)
                shortWins++;
        }
        // R-Multiple
        if (trade.rMultiple !== undefined && trade.rMultiple !== null) {
            totalR += trade.rMultiple;
            countR++;
        }
        // Excursions (MFE/MAE)
        totalMfe += trade.favorableExcursionUsd || 0;
        totalMae += trade.adverseExcursionUsd || 0;
        // Duration
        if (trade.entryTime && trade.exitTime) {
            const entryMs = new Date(trade.entryTime).getTime();
            const exitMs = new Date(trade.exitTime).getTime();
            const duration = exitMs - entryMs;
            if (duration >= 0) {
                totalDuration += duration;
                countDuration++;
            }
        }
        // Equity Curve Drawdown calculation
        currentEquity += pnl;
        if (currentEquity > peak) {
            peak = currentEquity;
        }
        const ddUsd = peak - currentEquity;
        const ddPct = peak > 0 ? (ddUsd / peak) * 100 : 0;
        if (ddUsd > maxDrawdownUsd)
            maxDrawdownUsd = ddUsd;
        if (ddPct > maxDrawdownPct)
            maxDrawdownPct = ddPct;
    });
    const netPnlUsd = grossProfit - grossLoss;
    const endingBalance = initialBalance + netPnlUsd;
    const netPnlIdr = netPnlUsd * usdIdrRate;
    const netPnlPct = (netPnlUsd / initialBalance) * 100;
    const winrate = (win / totalTrades) * 100;
    const lossrate = (loss / totalTrades) * 100;
    // Profit Factor = Gross Profit / Gross Loss. Handles division by 0.
    const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;
    const averageWin = win > 0 ? grossProfit / win : 0;
    const averageLoss = loss > 0 ? grossLoss / loss : 0;
    const averageTrade = totalTrades > 0 ? netPnlUsd / totalTrades : 0;
    const averageR = countR > 0 ? totalR / countR : null;
    const netR = countR > 0 ? totalR : null;
    const expectancyUsd = averageTrade; // Expectancy per trade in USD
    const expectancyR = countR > 0 ? totalR / totalTrades : null; // Expectancy in R terms per trade
    const averageFavorableExcursionUsd = totalMfe / totalTrades;
    const averageAdverseExcursionUsd = totalMae / totalTrades;
    const averageTradeDurationMs = countDuration > 0 ? totalDuration / countDuration : 0;
    const longWinrate = longTrades > 0 ? (longWins / longTrades) * 100 : 0;
    const shortWinrate = shortTrades > 0 ? (shortWins / shortTrades) * 100 : 0;
    return {
        initialBalance,
        endingBalance,
        netPnlUsd,
        netPnlIdr,
        netPnlPct,
        totalTrades,
        win,
        loss,
        breakEven,
        winrate,
        lossrate,
        profitFactor,
        grossProfit,
        grossLoss,
        averageWin,
        averageLoss,
        averageTrade,
        bestTrade: bestTrade === -Infinity ? 0 : bestTrade,
        worstTrade: worstTrade === Infinity ? 0 : worstTrade,
        maxDrawdownUsd,
        maxDrawdownPct,
        maxConsecutiveWins,
        maxConsecutiveLosses,
        averageR,
        netR,
        expectancyUsd,
        expectancyR,
        averageFavorableExcursionUsd,
        averageAdverseExcursionUsd,
        averageTradeDurationMs,
        longWinrate,
        shortWinrate,
    };
}
