import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Database, 
  Download, 
  RefreshCw, 
  Layers, 
  Clock, 
  CheckCircle2, 
  Play, 
  Pause, 
  XCircle, 
  Search, 
  BarChart2, 
  FileText 
} from 'lucide-react';
import { PageHeader, SectionLabel } from '../components/ui/SectionLabel';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card, CardBody } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Input';
import { apiUrl, defaultHeaders } from '../utils/api';

interface CatalogItem {
  id: string;
  provider: string;
  symbol: string;
  dataType: string;
  timeframe?: string;
  dateFrom: string;
  dateTo: string;
  tickCount: number;
  candleCount: number;
  lastSyncedAt: string;
  downloadStatus: string;
}

interface SyncJob {
  id: string;
  symbol: string;
  dataType: string;
  timeframe?: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  progressPct: number;
  downloadedItems: number;
  errorMessage?: string;
  createdAt: string;
}

export default function MarketData() {
  const [searchParams] = useSearchParams();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Download Form State — pre-filled from URL params if coming from RR Lab
  const [symbol, setSymbol] = useState(() => searchParams.get('symbol') || 'XAUUSD');
  const [dataType, setDataType] = useState<'TICK' | 'CANDLE'>('CANDLE');
  const [timeframe, setTimeframe] = useState('H1');
  const [dateFrom, setDateFrom] = useState(() => {
    const fromParam = searchParams.get('from');
    if (fromParam) return fromParam;
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => {
    const toParam = searchParams.get('to');
    if (toParam) return toParam;
    return new Date().toISOString().slice(0, 10);
  });
  const [submitting, setSubmitting] = useState(false);

  // Show a highlight banner if we were redirected from RR Lab
  const fromRRLab = searchParams.get('symbol') !== null;

  const fetchData = async () => {
    setLoading(true);
    try {
      const [catRes, jobsRes] = await Promise.all([
        fetch(apiUrl('/mt5/catalog'), { headers: defaultHeaders() }),
        fetch(apiUrl('/mt5/jobs'), { headers: defaultHeaders() }),
      ]);

      if (catRes.ok) {
        const data = await catRes.json();
        setCatalog(data.catalog || []);
      }
      if (jobsRes.ok) {
        const data = await jobsRes.json();
        setJobs(data.jobs || []);
      }
    } catch (err) {
      console.error('Failed to fetch market data catalog:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl('/mt5/jobs/create'), {
        method: 'POST',
        headers: defaultHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          symbol: symbol.toUpperCase(),
          dataType,
          timeframe: dataType === 'CANDLE' ? timeframe : undefined,
          dateFrom: new Date(dateFrom).toISOString(),
          dateTo: new Date(dateTo).toISOString(),
        }),
      });

      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(`Failed to create job: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleJobAction = async (id: string, action: 'PAUSE' | 'RESUME' | 'CANCEL') => {
    try {
      await fetch(apiUrl(`/mt5/jobs/${id}/action`), {
        method: 'POST',
        headers: defaultHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action }),
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PageHeader
        label="DATA ENGINE"
        labelColor="yellow"
        title="Market Data Platform"
        subtitle="Provider-abstracted tick & candle storage engine with gap detection and resume support."
        actions={
          <Button variant="secondary" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh Catalog
          </Button>
        }
      />

      {/* Banner: redirected from RR Lab */}
      {fromRRLab && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border-2 border-amber-400 text-amber-800 text-[12px] font-bold">
          <Download className="w-4 h-4 shrink-0" />
          Form di bawah sudah diisi otomatis sesuai kebutuhan RR Lab kamu. Pilih timeframe lalu klik <strong>Start Download</strong>.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Create Download Job Card */}
        <Card className="lg:col-span-1 border-2 border-[#121212] bg-white">
          <CardBody className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Download className="w-5 h-5 text-indigo-600" />
              <h3 className="font-extrabold text-lg text-[#121212]">Download Market Data</h3>
            </div>

            <form onSubmit={handleCreateJob} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#717182] mb-1">
                  Symbol
                </label>
                <Input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="e.g. XAUUSD, EURUSD"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#717182] mb-1">
                  Data Type
                </label>
                <Select
                  value={dataType}
                  onChange={(e) => setDataType(e.target.value as any)}
                >
                  <option value="CANDLE">Candles (OHLCV)</option>
                  <option value="TICK">High-Density Ticks</option>
                </Select>
              </div>

              {dataType === 'CANDLE' && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#717182] mb-1">
                    Timeframe
                  </label>
                  <Select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                  >
                    <option value="M1">M1 (1 Minute)</option>
                    <option value="M5">M5 (5 Minutes)</option>
                    <option value="M15">M15 (15 Minutes)</option>
                    <option value="M30">M30 (30 Minutes)</option>
                    <option value="H1">H1 (1 Hour)</option>
                    <option value="H4">H4 (4 Hours)</option>
                    <option value="D1">D1 (Daily)</option>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#717182] mb-1">
                    Date From
                  </label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#717182] mb-1">
                    Date To
                  </label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button variant="primary" className="w-full" type="submit" disabled={submitting}>
                  <Download className="w-4 h-4 mr-2" />
                  {submitting ? 'Creating Job...' : 'Start Download Job'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        {/* Active Sync Jobs & Progress */}
        <Card className="lg:col-span-2 border-2 border-[#121212] bg-white">
          <CardBody className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-lg text-[#121212]">Sync Jobs</h3>
              </div>
              <Badge variant="neutral">{jobs.length} Total Jobs</Badge>
            </div>

            {jobs.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-[#121212]/20 rounded space-y-2">
                <Clock className="w-8 h-8 text-[#717182] mx-auto opacity-50" />
                <p className="text-xs text-[#717182]">No active background download jobs.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.slice(0, 5).map((job) => (
                  <div key={job.id} className="p-4 border-2 border-[#121212] bg-[#FCFCFC] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-[#121212]">{job.symbol}</span>
                        <Badge variant={job.dataType === 'TICK' ? 'warning' : 'blue'}>
                          {job.dataType} {job.timeframe ? `(${job.timeframe})` : ''}
                        </Badge>
                        <Badge
                          variant={
                            job.status === 'FINISHED' ? 'profit' :
                            job.status === 'RUNNING' ? 'blue' :
                            job.status === 'QUEUED' || job.status === 'PENDING' ? 'yellow' :
                            'loss'
                          }
                        >
                          {job.status === 'PENDING' || job.status === 'QUEUED' ? 'QUEUED (MT5 Sync)' : job.status}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2">
                        {job.status === 'RUNNING' && (
                          <button
                            onClick={() => handleJobAction(job.id, 'PAUSE')}
                            className="p-1 hover:bg-[#E5E5E5] text-[#121212]"
                            title="Pause"
                          >
                            <Pause className="w-4 h-4" />
                          </button>
                        )}
                        {job.status === 'PAUSED' && (
                          <button
                            onClick={() => handleJobAction(job.id, 'RESUME')}
                            className="p-1 hover:bg-[#E5E5E5] text-[#121212]"
                            title="Resume"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleJobAction(job.id, 'CANCEL')}
                          className="p-1 hover:bg-[#E5E5E5] text-red-600"
                          title="Cancel / Clear Job"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="w-full bg-[#E5E5E5] h-2 rounded overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${job.status === 'FINISHED' ? 'bg-emerald-600' : job.status === 'RUNNING' ? 'bg-indigo-600' : 'bg-amber-500'}`}
                          style={{ width: `${Math.max(job.progressPct, job.status === 'FINISHED' ? 100 : 5)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-bold text-[#717182]">
                        <span>{job.downloadedItems.toLocaleString()} items downloaded</span>
                        <span>{job.status === 'FINISHED' ? 100 : job.progressPct}%</span>
                      </div>
                      {job.status === 'FINISHED' && (
                        <div className="mt-2 text-[10px] text-emerald-700 bg-emerald-50 p-1.5 rounded border border-emerald-100">
                          <span className="font-bold">✓ Successfully cached to SQLite database (dev.db)</span>
                          <p className="mt-0.5 opacity-80">Data is instantly available for Replay & Backtesting. No external files needed.</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Catalog Inventory Table */}
      <Card className="border-2 border-[#121212] bg-white">
        <CardBody className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-600" />
              <h3 className="font-extrabold text-lg text-[#121212]">Market Data Inventory Catalog</h3>
            </div>
            <Badge variant="profit">{catalog.length} Datasets Cached</Badge>
          </div>

          <div className="overflow-x-auto border-2 border-[#121212]">
            <table className="w-full text-left text-xs font-semibold">
              <thead className="bg-[#121212] text-white font-extrabold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Symbol</th>
                  <th className="px-4 py-3">Data Type</th>
                  <th className="px-4 py-3">Timeframe</th>
                  <th className="px-4 py-3">Coverage Range</th>
                  <th className="px-4 py-3">Record Count</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#121212]/10 bg-white">
                {catalog.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[#717182] italic">
                      No market data cached in catalog yet. Start a download job above.
                    </td>
                  </tr>
                ) : (
                  catalog.map((c) => (
                    <tr key={c.id} className="hover:bg-[#F8F9FA]">
                      <td className="px-4 py-3 font-mono font-bold">{c.provider}</td>
                      <td className="px-4 py-3 font-black text-[#121212]">{c.symbol}</td>
                      <td className="px-4 py-3">
                        <Badge variant={c.dataType === 'TICK' ? 'warning' : 'blue'}>{c.dataType}</Badge>
                      </td>
                      <td className="px-4 py-3">{c.timeframe || '—'}</td>
                      <td className="px-4 py-3 text-[11px] font-mono text-[#717182]">
                        {new Date(c.dateFrom).toISOString().slice(0, 10)} &rarr; {new Date(c.dateTo).toISOString().slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 font-bold font-mono">
                        {(c.dataType === 'TICK' ? c.tickCount : c.candleCount).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={c.downloadStatus === 'COMPLETE' ? 'profit' : 'warning'}>
                          {c.downloadStatus}
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
    </div>
  );
}
