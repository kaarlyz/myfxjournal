import { Mt5EquityPointInput } from './mt5TesterGraphParser';

export type FindingSeverity = 'INFO' | 'WARNING' | 'DANGER';

export interface Mt5Finding {
  severity: FindingSeverity;
  title: string;
  explanation: string;
  suggestedFix: string;
}

export interface Mt5AnalysisInput {
  expertName?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  initialDeposit?: number | null;
  totalNetProfit?: number | null;
  grossProfit?: number | null;
  grossLoss?: number | null;
  profitFactor?: number | null;
  expectedPayoff?: number | null;
  recoveryFactor?: number | null;
  sharpeRatio?: number | null;
  totalTrades?: number | null;
  winrate?: number | null;
  shortWinrate?: number | null;
  longWinrate?: number | null;
  balanceDrawdownMax?: number | null;
  balanceDrawdownPct?: number | null;
  equityDrawdownMax?: number | null;
  equityDrawdownPct?: number | null;
  largestProfitTrade?: number | null;
  largestLossTrade?: number | null;
  averageProfitTrade?: number | null;
  averageLossTrade?: number | null;
  maxConsecutiveLosses?: number | null;
  averageConsecutiveWins?: number | null;
  averageConsecutiveLosses?: number | null;
  finalBalance?: number | null;
  zScore?: number | null;
  ahpr?: number | null;
  ghpr?: number | null;
}

export interface Mt5DailyReview {
  date: string;
  dailyNetChange: number;
  equityLow: number | null;
  equityHigh: number | null;
  tradeCount: number;
  maxDepositLoad: number | null;
  comment: string;
}

export interface Mt5WeeklyReview {
  week: string;
  totalPnl: number;
  bestDay: string | null;
  worstDay: string | null;
  averageDailyPnl: number;
  drawdown: number;
  suggestions: string[];
}

export interface Mt5Analysis {
  verdict: string;
  rating: { score: number; label: 'Incomplete' | 'Dangerous' | 'Weak' | 'Promising' | 'Strong' | 'Robust'; reasons: string[] };
  sections: Record<string, string>;
  findings: Mt5Finding[];
  dailyReview: Mt5DailyReview[];
  weeklyReview: Mt5WeeklyReview[];
}

const n = (value: number | null | undefined, digits = 2) => Number(value || 0).toFixed(digits);
const pct = (value: number | null | undefined) => `${n(value)}%`;

function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function daysBetween(start?: Date | string | null, end?: Date | string | null): number | null {
  if (!start || !end) return null;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  return Math.max(1, Math.ceil((e - s) / 86400000));
}

function pushFinding(findings: Mt5Finding[], severity: FindingSeverity, title: string, explanation: string, suggestedFix: string) {
  findings.push({ severity, title, explanation, suggestedFix });
}

export function buildMt5DailyReview(points: Mt5EquityPointInput[], trades: Array<{ exitTime?: Date | string | null; profit?: number | null }>): Mt5DailyReview[] {
  const byDate = new Map<string, Mt5EquityPointInput[]>();
  for (const point of points || []) {
    const key = dayKey(new Date(point.time));
    byDate.set(key, [...(byDate.get(key) || []), point]);
  }
  const tradesByDate = new Map<string, Array<{ profit?: number | null }>>();
  for (const trade of trades || []) {
    if (!trade.exitTime) continue;
    const key = dayKey(new Date(trade.exitTime));
    tradesByDate.set(key, [...(tradesByDate.get(key) || []), trade]);
  }

  const reviews = [...new Set([...byDate.keys(), ...tradesByDate.keys()])].sort().map((date) => {
    const dayPoints = byDate.get(date) || [];
    const dayTrades = tradesByDate.get(date) || [];
    const first = dayPoints[0];
    const last = dayPoints[dayPoints.length - 1];
    const dailyNetChange = first && last
      ? last.balance - first.balance
      : dayTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0);
    const equities = dayPoints.map((p) => p.equity);
    const loads = dayPoints.map((p) => p.depositLoad).filter((v): v is number => v !== null && v !== undefined);
    let comment = 'Normal day';
    if (dailyNetChange < 0 && Math.abs(dailyNetChange) > 0) comment = 'Loss day';
    if (dailyNetChange > 0) comment = 'Recovery day';
    if (dayTrades.length >= 10) comment = 'Overtrading day';
    return {
      date,
      dailyNetChange,
      equityLow: equities.length ? Math.min(...equities) : null,
      equityHigh: equities.length ? Math.max(...equities) : null,
      tradeCount: dayTrades.length,
      maxDepositLoad: loads.length ? Math.max(...loads) : null,
      comment,
    };
  });

  const worst = reviews.reduce((acc, item) => !acc || item.dailyNetChange < acc.dailyNetChange ? item : acc, null as Mt5DailyReview | null);
  if (worst) worst.comment = 'Worst day';
  return reviews;
}

export function buildMt5WeeklyReview(daily: Mt5DailyReview[]): Mt5WeeklyReview[] {
  const weeks = new Map<string, Mt5DailyReview[]>();
  for (const day of daily) {
    const d = new Date(`${day.date}T00:00:00Z`);
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    weeks.set(key, [...(weeks.get(key) || []), day]);
  }
  return [...weeks.entries()].map(([week, days]) => {
    const totalPnl = days.reduce((sum, d) => sum + d.dailyNetChange, 0);
    const best = days.reduce((a, b) => b.dailyNetChange > a.dailyNetChange ? b : a, days[0]);
    const worst = days.reduce((a, b) => b.dailyNetChange < a.dailyNetChange ? b : a, days[0]);
    const peakToLow = Math.max(...days.map((d) => d.equityHigh || 0)) - Math.min(...days.map((d) => d.equityLow || 0));
    const suggestions = totalPnl < 0
      ? ['Kurangi risk per trade minggu berikutnya.', 'Review hari loss terbesar sebelum optimasi entry.']
      : ['Pertahankan rule yang menghasilkan recovery day.', 'Validasi performa di periode lebih panjang.'];
    return {
      week,
      totalPnl,
      bestDay: best?.date || null,
      worstDay: worst?.date || null,
      averageDailyPnl: days.length ? totalPnl / days.length : 0,
      drawdown: Number.isFinite(peakToLow) ? peakToLow : 0,
      suggestions,
    };
  });
}

export function analyzeMt5Report(input: Mt5AnalysisInput, points: Mt5EquityPointInput[] = [], trades: Array<{ exitTime?: Date | string | null; profit?: number | null }> = []): Mt5Analysis {
  const findings: Mt5Finding[] = [];
  const reasons: string[] = [];
  const hasCoreMetrics = input.totalNetProfit !== null && input.totalNetProfit !== undefined
    && input.profitFactor !== null && input.profitFactor !== undefined
    && input.totalTrades !== null && input.totalTrades !== undefined;
  if (!hasCoreMetrics) {
    const verdict = 'Strategy Tester report metrics were not detected.';
    return {
      verdict,
      rating: {
        score: 0,
        label: 'Incomplete',
        reasons: ['Settings or Results metrics were not detected.'],
      },
      sections: {
        executiveVerdict: verdict,
        profitabilityAnalysis: 'N/A',
        riskAnalysis: 'N/A',
        tradeQuality: 'N/A',
        directionBias: 'N/A',
        stability: 'N/A',
        reliabilityWarnings: 'Report metrics missing.',
        suggestions: 'Upload the full MT5 Strategy Tester XLSX report, not only the tester graph export.',
        finalRating: 'Incomplete (N/A): Strategy Tester report metrics were not detected.',
      },
      findings: [{
        severity: 'DANGER',
        title: 'Strategy Tester metrics missing',
        explanation: verdict,
        suggestedFix: 'Export and upload the Strategy Tester report XLSX that contains Settings and Results sections.',
      }],
      dailyReview: buildMt5DailyReview(points, trades),
      weeklyReview: buildMt5WeeklyReview(buildMt5DailyReview(points, trades)),
    };
  }
  const periodDays = daysBetween(input.periodStart, input.periodEnd);
  const finalBalance = input.finalBalance ?? ((input.initialDeposit || 0) + (input.totalNetProfit || 0));
  const maxDepositLoad = points.length ? Math.max(...points.map((p) => p.depositLoad || 0)) : null;
  let score = 100;

  if ((input.profitFactor || 0) < 1) {
    score -= 30;
    reasons.push('Profit factor di bawah 1.');
    pushFinding(findings, 'DANGER', 'Profit factor di bawah 1', `PF ${n(input.profitFactor, 4)} berarti gross loss lebih besar dari gross profit.`, 'Perbaiki filter entry/exit atau hentikan rule yang paling sering rugi.');
  }
  if ((input.totalNetProfit || 0) < 0) {
    score -= 25;
    reasons.push('Net profit negatif.');
    pushFinding(findings, 'DANGER', 'Net profit negatif', `Backtest rugi ${n(input.totalNetProfit)} dari deposit awal ${n(input.initialDeposit)}.`, 'Jangan dipakai live sebelum profit bersih dan expectancy berubah positif.');
  }
  if ((input.expectedPayoff || 0) < 0) {
    score -= 15;
    pushFinding(findings, 'DANGER', 'Expected payoff negatif', `Rata-rata ekspektasi trade ${n(input.expectedPayoff)}.`, 'Naikkan kualitas setup atau ubah risk/reward sebelum live.');
  }
  if ((input.equityDrawdownPct || 0) > 50) {
    score -= 25;
    reasons.push('Equity drawdown di atas 50%.');
    pushFinding(findings, 'DANGER', 'Drawdown sangat tinggi', `Equity DD ${pct(input.equityDrawdownPct)} sudah masuk zona berbahaya.`, 'Turunkan lot/risk percent dan tambahkan batas stop trading.');
  } else if ((input.equityDrawdownPct || 0) > 30) {
    score -= 15;
    pushFinding(findings, 'WARNING', 'Drawdown tinggi', `Equity DD ${pct(input.equityDrawdownPct)} terlalu agresif untuk kebanyakan akun.`, 'Kurangi risiko dan uji ulang dengan spread/slippage konservatif.');
  }
  if ((input.equityDrawdownPct || 0) > (input.balanceDrawdownPct || 0) + 10) {
    score -= 8;
    pushFinding(findings, 'WARNING', 'Floating drawdown besar', 'Equity drawdown jauh lebih buruk dari balance drawdown.', 'Batasi posisi floating, tambah cut loss berbasis equity, atau kurangi averaging.');
  }
  if ((input.totalTrades || 0) < 100) {
    score -= 10;
    pushFinding(findings, 'WARNING', 'Jumlah trade terlalu sedikit', `${input.totalTrades || 0} trade belum cukup untuk kesimpulan kuat.`, 'Test minimal ratusan trade di multi-periode.');
  }
  if (periodDays !== null && periodDays < 90) {
    score -= 10;
    pushFinding(findings, 'WARNING', 'Periode backtest terlalu pendek', `Periode hanya sekitar ${periodDays} hari.`, 'Uji minimal 3 bulan, lebih baik multi-year dan multi-market.');
  }
  if ((input.maxConsecutiveLosses || 0) >= 5) {
    score -= 7;
    pushFinding(findings, 'WARNING', 'Loss streak panjang', `Maksimum consecutive loss ${input.maxConsecutiveLosses}.`, 'Tambahkan max consecutive loss stop dan review kondisi pasar saat streak.');
  }
  if ((input.shortWinrate || 0) < 25) {
    pushFinding(findings, 'WARNING', 'Short side lemah', `Short winrate ${pct(input.shortWinrate)}.`, 'Uji opsi disable sell atau tambah trend filter untuk posisi short.');
  }
  if ((input.longWinrate || 0) < 25) {
    pushFinding(findings, 'WARNING', 'Long side lemah', `Long winrate ${pct(input.longWinrate)}.`, 'Uji opsi disable buy atau tambah konfirmasi momentum untuk long.');
  }
  if ((input.averageLossTrade || 0) < 0 && Math.abs(input.averageLossTrade || 0) >= (input.averageProfitTrade || 0)) {
    score -= 5;
    pushFinding(findings, 'WARNING', 'Average loss terlalu besar', 'Average loss mendekati atau melebihi average win.', 'Perbaiki exit loss, trailing, atau target reward minimal.');
  }
  if (finalBalance < (input.initialDeposit || 0)) {
    pushFinding(findings, 'DANGER', 'Final balance turun', `Final balance sekitar ${n(finalBalance)} dari deposit awal ${n(input.initialDeposit)}.`, 'Jangan live sebelum net profit dan expectancy positif.');
  }
  if ((input.recoveryFactor || 0) < 0) {
    pushFinding(findings, 'DANGER', 'Recovery factor negatif', 'Sistem belum mampu memulihkan drawdown.', 'Fokus pada pengurangan DD sebelum mengejar profit.');
  }
  if ((input.sharpeRatio || 0) < 0) {
    pushFinding(findings, 'WARNING', 'Sharpe ratio negatif', 'Return tidak sebanding dengan volatilitas hasil.', 'Stabilkan kurva equity dan kurangi trade noise.');
  }
  if (maxDepositLoad !== null && maxDepositLoad > 30) {
    score -= 8;
    pushFinding(findings, 'WARNING', 'Deposit load tinggi', `Deposit load maksimum ${pct(maxDepositLoad)}.`, 'Kurangi lot dan batasi jumlah posisi bersamaan.');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score < 35 ? 'Dangerous' : score < 55 ? 'Weak' : score < 75 ? 'Promising' : score < 90 ? 'Strong' : 'Robust';
  const verdict = label === 'Dangerous' || label === 'Weak'
    ? `Backtest ini belum layak dipakai live. Net profit ${n(input.totalNetProfit)}, profit factor ${n(input.profitFactor, 4)}, winrate ${pct(input.winrate)}, dan equity drawdown ${pct(input.equityDrawdownPct)} menunjukkan risiko masih terlalu besar.`
    : `Backtest ini punya potensi, tetapi tetap perlu validasi lebih panjang. Profit factor ${n(input.profitFactor, 4)}, winrate ${pct(input.winrate)}, dan equity drawdown ${pct(input.equityDrawdownPct)} harus diuji di periode berbeda.`;

  const dailyReview = buildMt5DailyReview(points, trades);
  const weeklyReview = buildMt5WeeklyReview(dailyReview);

  return {
    verdict,
    rating: { score, label, reasons: reasons.length ? reasons : ['Tidak ada red flag mayor dari rules dasar.'] },
    sections: {
      executiveVerdict: verdict,
      profitabilityAnalysis: `Net profit ${n(input.totalNetProfit)}, gross profit ${n(input.grossProfit)}, gross loss ${n(input.grossLoss)}, PF ${n(input.profitFactor, 4)}, expected payoff ${n(input.expectedPayoff)}, final balance ${n(finalBalance)}. Sistem ${((input.totalNetProfit || 0) > 0 && (input.profitFactor || 0) > 1) ? 'terlihat profitable' : 'belum profitable'} dari data ini.`,
      riskAnalysis: `Balance DD ${n(input.balanceDrawdownMax)} (${pct(input.balanceDrawdownPct)}), equity DD ${n(input.equityDrawdownMax)} (${pct(input.equityDrawdownPct)}), recovery factor ${n(input.recoveryFactor)}. Risiko ${((input.equityDrawdownPct || 0) > 30) ? 'terlalu agresif' : 'masih perlu diawasi'}.`,
      tradeQuality: `Winrate ${pct(input.winrate)}, average win ${n(input.averageProfitTrade)}, average loss ${n(input.averageLossTrade)}, largest win ${n(input.largestProfitTrade)}, largest loss ${n(input.largestLossTrade)}, total trades ${input.totalTrades || 0}, max loss streak ${input.maxConsecutiveLosses || 0}.`,
      directionBias: `Long winrate ${pct(input.longWinrate)}, short winrate ${pct(input.shortWinrate)}. ${((input.longWinrate || 0) > (input.shortWinrate || 0)) ? 'Buy lebih kuat dari sell.' : 'Sell tidak lebih buruk dari buy atau data seimbang.'}`,
      stability: `Stabilitas dinilai dari equity curve, floating DD, deposit load, dan streak. Consecutive losses ${input.maxConsecutiveLosses || 0}, average consecutive losses ${n(input.averageConsecutiveLosses)}, equity DD ${pct(input.equityDrawdownPct)}, deposit load maksimum ${maxDepositLoad === null ? '-' : pct(maxDepositLoad)}.`,
      reliabilityWarnings: findings.filter((f) => f.severity !== 'INFO').map((f) => f.title).join(', ') || 'Tidak ada warning rule-based besar.',
      suggestions: 'Kurangi risk percent, tambah trend filter, disable arah yang lemah, tambahkan max loss streak stop, hindari periode spread tinggi, test periode lebih panjang, gunakan real ticks, dan bandingkan multi-symbol/multi-timeframe.',
      finalRating: `${label} (${score}/100): ${reasons.join(' ') || 'Butuh validasi lanjutan.'}`,
    },
    findings,
    dailyReview,
    weeklyReview,
  };
}
