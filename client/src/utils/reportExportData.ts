import { buildDailyStatsMap, getTradePnl } from './calendarStats';

const n = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const dateOnly = (value: any) => value ? String(value).slice(0, 10) : '-';

const sortByPnl = (trades: any[], direction: 'best' | 'worst') => {
  return [...(trades || [])]
    .sort((a, b) => direction === 'best' ? getTradePnl(b) - getTradePnl(a) : getTradePnl(a) - getTradePnl(b))
    .slice(0, 10);
};

export function buildMt5ReportExportData(report: any) {
  const summary = report?.summary || {};
  const trades = report?.trades || [];
  const dailyMap = buildDailyStatsMap(trades, 'BACKTEST');
  const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  const bestDay = daily.reduce<any | null>((best, row) => !best || row.totalPnl > best.totalPnl ? row : best, null);
  const worstDay = daily.reduce<any | null>((worst, row) => !worst || row.totalPnl < worst.totalPnl ? row : worst, null);

  return {
    title: 'MT5 Backtest Report',
    subtitle: `${summary.expertName || '-'} · ${summary.symbol || '-'} · ${summary.timeframe || '-'}`,
    metadata: [
      ['EA', summary.expertName || '-'],
      ['Symbol', summary.symbol || '-'],
      ['Timeframe', summary.timeframe || '-'],
      ['Period', `${dateOnly(summary.periodStart)} -> ${dateOnly(summary.periodEnd)}`],
      ['Generated', new Date().toLocaleString()],
    ],
    metrics: [
      ['Initial Balance', summary.initialDeposit],
      ['Final Balance', summary.finalBalance ?? (n(summary.initialDeposit) + n(summary.totalNetProfit))],
      ['Net Profit', summary.totalNetProfit],
      ['Profit Factor', summary.profitFactor],
      ['Expected Payoff', summary.expectedPayoff],
      ['Recovery Factor', summary.recoveryFactor],
      ['Sharpe Ratio', summary.sharpeRatio],
      ['Winrate', `${n(summary.winrate).toFixed(2)}%`],
      ['Total Trades', summary.totalTrades],
      ['Profit Trades', summary.profitTrades],
      ['Loss Trades', summary.lossTrades],
      ['Max Balance DD', `${n(summary.balanceDrawdownMax).toFixed(2)} (${n(summary.balanceDrawdownPct).toFixed(2)}%)`],
      ['Max Equity DD', `${n(summary.equityDrawdownMax).toFixed(2)} (${n(summary.equityDrawdownPct).toFixed(2)}%)`],
      ['Long Winrate', `${n(summary.longWinrate).toFixed(2)}%`],
      ['Short Winrate', `${n(summary.shortWinrate).toFixed(2)}%`],
    ],
    findings: report?.analysis?.findings || [],
    analysis: report?.analysis?.sections || {},
    verdict: report?.analysis?.rating || {},
    verdictText: report?.analysis?.verdict || '',
    daily,
    bestDay,
    worstDay,
    bestTrades: sortByPnl(trades, 'best'),
    worstTrades: sortByPnl(trades, 'worst'),
    trades,
    deals: report?.deals || [],
    orders: report?.orders || [],
    settings: report?.raw?.settings || {},
    results: report?.raw?.results || {},
    equityPoints: report?.equityPoints || [],
  };
}

export function buildBacktestExportData(sessionDetails: any) {
  const session = sessionDetails?.session || {};
  const metrics = sessionDetails?.metrics || {};
  const trades = sessionDetails?.trades || [];
  const daily = Object.values(buildDailyStatsMap(trades, 'BACKTEST')).sort((a: any, b: any) => a.date.localeCompare(b.date));

  return {
    title: 'Backtest Analysis Report',
    subtitle: `${session.name || '-'} · ${session.symbol || '-'} · ${session.timeframe || '-'}`,
    metadata: [
      ['Session', session.name || '-'],
      ['Symbol', session.symbol || '-'],
      ['Timeframe', session.timeframe || '-'],
      ['Market', session.marketType || '-'],
      ['Generated', new Date().toLocaleString()],
    ],
    metrics: [
      ['Initial Balance', session.initialBalance],
      ['Ending Balance', metrics.endingBalance],
      ['Net PnL', metrics.netPnlUsd],
      ['Winrate', `${n(metrics.winrate).toFixed(2)}%`],
      ['Profit Factor', metrics.profitFactor],
      ['Total Trades', metrics.totalTrades],
      ['Average R', metrics.avgR],
      ['Max Drawdown', metrics.maxDrawdownUsd],
    ],
    findings: [],
    analysis: {},
    daily,
    bestTrades: sortByPnl(trades, 'best'),
    worstTrades: sortByPnl(trades, 'worst'),
    trades,
  };
}

export function buildLiveJournalExportData(input: { account?: any; summary?: any; trades?: any[] }) {
  const account = input.account || {};
  const summary = input.summary?.summary || input.summary || {};
  const trades = input.trades || [];
  const daily = Object.values(buildDailyStatsMap(trades, 'LIVE')).sort((a: any, b: any) => a.date.localeCompare(b.date));
  const maskedAccount = account.accountNumber ? `****${String(account.accountNumber).slice(-4)}` : '-';

  return {
    title: 'Live Journal Report',
    subtitle: `${account.name || '-'} · ${account.broker || '-'} · ${maskedAccount}`,
    metadata: [
      ['Account', account.name || '-'],
      ['Broker', account.broker || '-'],
      ['Server', account.brokerServer || account.server || '-'],
      ['Account Number', maskedAccount],
      ['Generated', new Date().toLocaleString()],
    ],
    metrics: [
      ['Balance', summary.balance ?? account.currentBalance],
      ['Equity', summary.equity ?? account.currentEquity],
      ['Free Margin', summary.freeMargin ?? account.freeMargin],
      ['Net PnL', summary.netPnl],
      ['Today PnL', summary.todayPnl],
      ['Open Trades', summary.openTrades],
      ['Closed Trades', summary.closedTrades],
      ['Winrate', `${n(summary.winrate).toFixed(2)}%`],
      ['Profit Factor', summary.profitFactor],
      ['Average Win', summary.averageWin],
      ['Average Loss', summary.averageLoss],
      ['Total Lots', summary.totalLots],
    ],
    findings: [],
    analysis: {},
    daily,
    bestTrades: sortByPnl(trades, 'best'),
    worstTrades: sortByPnl(trades, 'worst'),
    trades,
  };
}
