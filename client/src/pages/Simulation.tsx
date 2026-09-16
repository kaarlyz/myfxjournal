import React, { useState, useEffect } from 'react';
import { Activity, BarChart3, DatabaseZap, RefreshCw, Target } from 'lucide-react';
import { Card, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { apiUrl, defaultHeaders } from '../utils/api';

interface ReplayRow {
  rrTarget: number;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  expectancy: number;
}

interface ReplaySummary {
  averageMaxRR: number;
  medianMaxRR: number;
  distribution: Array<{ bucket: string; count: number }>;
  captureEfficiencyAvg: number;
  averageLostOpportunity: number;
  coveragePct: number;
  missingHistoricalData: number;
}

interface SampleReplayResult {
  tradeId: string;
  symbol: string;
  side: string;
  replaySource: string;
  maxRR: number;
  capturedRR: number;
  exitEfficiencyPct: number;
  potentialRRLost: number;
  coverage?: { coveragePct: number; missingTimestamps: string[] };
}

export const Simulation: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReplayRow[]>([]);
  const [summary, setSummary] = useState<ReplaySummary | null>(null);
  const [sampleResults, setSampleResults] = useState<SampleReplayResult[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [coverage, setCoverage] = useState<any[]>([]);

  useEffect(() => {
    void fetchSessions();
  }, []);

  useEffect(() => {
    if (selectedSession) {
      void fetchReplayData(selectedSession);
    }
  }, [selectedSession]);

  const fetchSessions = async () => {
    try {
      const res = await fetch(apiUrl('/sessions'), { headers: defaultHeaders() });
      const json = await res.json();
      if (Array.isArray(json)) {
        setSessions(json);
        if (json.length > 0 && !selectedSession) {
          setSelectedSession(json[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchReplayData = async (sessionId: string) => {
    try {
      setLoading(true);
      const res = await fetch(apiUrl(`/analytics/session/${sessionId}/rr-simulation`), { headers: defaultHeaders() });
      const json = await res.json();
      if (json.data) {
        setData(json.data);
      }
      if (json.replaySummary) {
        setSummary(json.replaySummary);
      }
      if (json.sampleResults) {
        setSampleResults(json.sampleResults);
      }
      if (json.coverage) {
        setCoverage(json.coverage);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRunAnalysis = async () => {
    if (!selectedSession) return;
    try {
      setLoading(true);
      await fetch(apiUrl(`/analytics/session/${selectedSession}/replay`), { method: 'POST', headers: defaultHeaders() });
      await fetchReplayData(selectedSession);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[#121212] flex items-center gap-2">
            <Target className="w-6 h-6 text-indigo-600" />
            Historical Replay RR Lab
          </h1>
          <p className="text-[#717182] font-medium mt-1">
            RR targets are now derived from real historical replay results instead of outcome-based simulation.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <select
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="bg-white border-2 border-[#121212] px-4 py-2 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2"
          >
            <option value="" disabled>Select Trading Session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.symbol})</option>
            ))}
          </select>

          <Button onClick={handleRunAnalysis} disabled={loading} variant="primary">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Run Replay Analysis
          </Button>
        </div>
      </div>

      <Card className="border-2 border-[#121212] bg-white">
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#121212] text-white">
                  <th className="p-4 font-extrabold uppercase tracking-wider text-xs">Target RR</th>
                  <th className="p-4 font-extrabold uppercase tracking-wider text-xs">Replay Wins</th>
                  <th className="p-4 font-extrabold uppercase tracking-wider text-xs">Replay Losses</th>
                  <th className="p-4 font-extrabold uppercase tracking-wider text-xs">Replay Win Rate</th>
                  <th className="p-4 font-extrabold uppercase tracking-wider text-xs">Expectancy (Per Trade)</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-[#121212]/10">
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-[#717182] font-medium">
                      No replay data available. Click “Run Replay Analysis” to replay MT5 candles and ticks for the selected session.
                    </td>
                  </tr>
                ) : (
                  data.map((row) => (
                    <tr key={row.rrTarget} className="hover:bg-[#F8F8F8] transition-colors">
                      <td className="p-4">
                        <Badge variant="blue" className="text-sm">1 : {row.rrTarget}</Badge>
                      </td>
                      <td className="p-4 font-bold text-emerald-600 flex items-center gap-1.5">
                        <Activity className="w-4 h-4" /> {row.wins}
                      </td>
                      <td className="p-4 font-bold text-red-600">
                        <div className="flex items-center gap-1.5">
                          <Activity className="w-4 h-4" /> {row.losses}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <span className={`font-black ${row.winRate > 50 ? 'text-emerald-600' : row.winRate > 30 ? 'text-amber-500' : 'text-red-600'}`}>
                            {row.winRate.toFixed(1)}%
                          </span>
                          <div className="flex-1 h-2 bg-[#E5E5E5] rounded-full overflow-hidden w-24">
                            <div
                              className={`h-full ${row.winRate > 50 ? 'bg-emerald-600' : row.winRate > 30 ? 'bg-amber-500' : 'bg-red-600'}`}
                              style={{ width: `${Math.min(100, row.winRate)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant={row.expectancy > 0 ? 'profit' : 'loss'}>
                          {row.expectancy > 0 ? '+' : ''}{row.expectancy.toFixed(2)} R
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-2 border-[#121212] bg-white">
          <CardBody className="space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-black uppercase tracking-tight">Replay Verification</h3>
            </div>
            {summary ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded border border-[#121212]/10 p-3">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#717182]">Average Maximum RR</p>
                  <p className="mt-1 text-2xl font-black text-[#121212]">{summary.averageMaxRR.toFixed(2)}R</p>
                </div>
                <div className="rounded border border-[#121212]/10 p-3">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#717182]">Median Maximum RR</p>
                  <p className="mt-1 text-2xl font-black text-[#121212]">{summary.medianMaxRR.toFixed(2)}R</p>
                </div>
                <div className="rounded border border-[#121212]/10 p-3">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#717182]">Capture Efficiency</p>
                  <p className="mt-1 text-2xl font-black text-[#121212]">{summary.captureEfficiencyAvg.toFixed(1)}%</p>
                </div>
                <div className="rounded border border-[#121212]/10 p-3">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#717182]">Potential RR Lost</p>
                  <p className="mt-1 text-2xl font-black text-[#121212]">{summary.averageLostOpportunity.toFixed(2)}R</p>
                </div>
                <div className="rounded border border-[#121212]/10 p-3">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#717182]">Coverage %</p>
                  <p className="mt-1 text-2xl font-black text-[#121212]">{summary.coveragePct.toFixed(1)}%</p>
                </div>
                <div className="rounded border border-[#121212]/10 p-3">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#717182]">Missing Historical Data</p>
                  <p className="mt-1 text-2xl font-black text-[#121212]">{summary.missingHistoricalData}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[#717182]">Replay verification metrics will appear here after the session is analyzed.</p>
            )}

            <div className="space-y-2">
              <p className="text-sm font-extrabold uppercase tracking-wider text-[#717182]">Distribution</p>
              <div className="space-y-2">
                {summary?.distribution?.map((bucket) => (
                  <div key={bucket.bucket} className="flex items-center gap-3">
                    <span className="w-20 text-sm font-semibold text-[#121212]">{bucket.bucket}</span>
                    <div className="flex-1 h-2 rounded-full bg-[#E5E5E5] overflow-hidden">
                      <div className="h-full bg-indigo-600" style={{ width: `${Math.max(4, (bucket.count / Math.max(1, data.length)) * 100)}%` }} />
                    </div>
                    <span className="text-sm font-bold text-[#121212]">{bucket.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="border-2 border-[#121212] bg-white">
          <CardBody className="space-y-4">
            <div className="flex items-center gap-2">
              <DatabaseZap className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-black uppercase tracking-tight">Historical Coverage</h3>
            </div>
            {coverage.length > 0 ? (
              <div className="space-y-2 text-sm text-[#121212]">
                {coverage.map((entry: any) => (
                  <div key={`${entry.timeframe}-${entry.symbol}`} className="rounded border border-[#121212]/10 p-3">
                    <p className="font-bold">{entry.timeframe}</p>
                    <p className="text-[#717182]">{entry.totalCandles} candles • {entry.firstCandle ? new Date(entry.firstCandle).toISOString() : '—'} → {entry.lastCandle ? new Date(entry.lastCandle).toISOString() : '—'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#717182]">Coverage details will appear after replaying the selected session.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="border-2 border-[#121212] bg-white">
        <CardBody className="space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-black uppercase tracking-tight">Sample Replay Results</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#F5F5F5] text-[#121212]">
                  <th className="p-3 font-extrabold uppercase tracking-wider text-xs">Trade</th>
                  <th className="p-3 font-extrabold uppercase tracking-wider text-xs">Side</th>
                  <th className="p-3 font-extrabold uppercase tracking-wider text-xs">Replay Source</th>
                  <th className="p-3 font-extrabold uppercase tracking-wider text-xs">Max RR</th>
                  <th className="p-3 font-extrabold uppercase tracking-wider text-xs">Captured RR</th>
                  <th className="p-3 font-extrabold uppercase tracking-wider text-xs">Capture Efficiency</th>
                  <th className="p-3 font-extrabold uppercase tracking-wider text-xs">Coverage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#121212]/10">
                {sampleResults.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-[#717182]">Replay sample results will be shown here once the analysis completes.</td>
                  </tr>
                ) : (
                  sampleResults.map((result) => (
                    <tr key={result.tradeId} className="hover:bg-[#F8F8F8] transition-colors">
                      <td className="p-3 font-semibold">{result.tradeId}</td>
                      <td className="p-3">{result.side}</td>
                      <td className="p-3">{result.replaySource}</td>
                      <td className="p-3 font-bold text-emerald-600">{result.maxRR.toFixed(2)}R</td>
                      <td className="p-3 font-bold text-[#121212]">{result.capturedRR.toFixed(2)}R</td>
                      <td className="p-3">{result.exitEfficiencyPct.toFixed(1)}%</td>
                      <td className="p-3">{result.coverage?.coveragePct ?? 0}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};
