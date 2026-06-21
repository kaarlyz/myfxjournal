import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, RefreshCcw, Clock, ExternalLink, AlertTriangle } from 'lucide-react';

type TradingViewSetup = {
  id: string;
  symbol: string;
  timeframe: string;
  side: string;
  price: number;
  sl?: number | null;
  tp?: number | null;
  bodySize?: number | null;
  volume?: number | null;
  reason?: string | null;
  chartUrl?: string | null;
  previewUrl?: string | null;
  status: string;
  expiresAt: string;
  reviewSource?: string | null;
  reviewNote?: string | null;
  createdAt: string;
};

const statuses = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED', 'ALL'];

function timeLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function statusClass(status: string) {
  if (status === 'APPROVED') return 'bg-[rgba(14,203,129,0.12)] text-[#0ecb81] border-[rgba(14,203,129,0.25)]';
  if (status === 'REJECTED' || status === 'EXPIRED') return 'bg-[rgba(246,70,93,0.12)] text-[#f6465d] border-[rgba(246,70,93,0.25)]';
  if (status === 'EXECUTED') return 'bg-[#229ED9]/15 text-[#229ED9] border-[#229ED9]/25';
  return 'bg-[#fcd535]/10 text-[#fcd535] border-[#fcd535]/25';
}

export default function SetupReview() {
  const [searchParams] = useSearchParams();
  const selectedSetupId = searchParams.get('setupId');
  const [status, setStatus] = useState('PENDING_REVIEW');
  const [setups, setSetups] = useState<TradingViewSetup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const API_BASE_URL = (import.meta as any).env.VITE_API_URL || '/api';

  const fetchSetups = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `${API_BASE_URL}/integrations/tradingview/setups${status !== 'ALL' ? `?status=${status}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load setups');
      setSetups(data.setups || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSetups();
    const timer = window.setInterval(fetchSetups, 10000);
    return () => window.clearInterval(timer);
  }, [status]);

  const sortedSetups = useMemo(() => {
    if (!selectedSetupId) return setups;
    return [...setups].sort((a, b) => (a.id === selectedSetupId ? -1 : b.id === selectedSetupId ? 1 : 0));
  }, [setups, selectedSetupId]);

  const review = async (setupId: string, action: 'approve' | 'reject') => {
    setBusyId(setupId);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/integrations/tradingview/setups/${setupId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewSource: 'WEB' }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || `Failed to ${action}`);
      await fetchSetups();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Setup Review</h1>
          <p className="text-sm text-[#929aa5] mt-1">Review Momentum Candle setups from TradingView before the EA approval bridge can consume them.</p>
        </div>
        <button onClick={fetchSetups} disabled={loading} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-[#2b3139] rounded-lg text-xs font-bold text-white flex items-center">
          <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${status === s ? 'bg-[#fcd535] text-black border-[#fcd535]' : 'bg-white/5 text-[#929aa5] border-[#2b3139] hover:text-white'}`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-[rgba(246,70,93,0.1)] border border-[rgba(246,70,93,0.25)] rounded-xl p-4 text-sm text-[#f6465d] flex items-center">
          <AlertTriangle className="w-4 h-4 mr-2" />
          {error}
        </div>
      )}

      {sortedSetups.length === 0 ? (
        <div className="border border-[#2b3139] rounded-xl p-10 text-center text-[#707a8a] bg-white/5">
          No setups for this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {sortedSetups.map(setup => {
            const expired = new Date(setup.expiresAt).getTime() <= Date.now();
            const canReview = setup.status === 'PENDING_REVIEW' && !expired;
            return (
              <div key={setup.id} className={`bn-card border rounded-xl overflow-hidden ${setup.id === selectedSetupId ? 'border-[#fcd535]' : 'border-[#2b3139]'}`}>
                <div className="p-4 border-b border-[#2b3139] flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white">{setup.symbol} {setup.timeframe}</h2>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${setup.side === 'SELL' ? 'bg-[rgba(246,70,93,0.12)] text-[#f6465d] border-[rgba(246,70,93,0.25)]' : 'bg-[rgba(14,203,129,0.12)] text-[#0ecb81] border-[rgba(14,203,129,0.25)]'}`}>{setup.side}</span>
                    </div>
                    <p className="text-xs text-[#707a8a] font-mono mt-1">{setup.id}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusClass(expired && setup.status === 'PENDING_REVIEW' ? 'EXPIRED' : setup.status)}`}>
                    {expired && setup.status === 'PENDING_REVIEW' ? 'EXPIRED' : setup.status}
                  </span>
                </div>

                <div className="p-4 space-y-4">
                  <div className="bg-black border border-[#2b3139] rounded-xl overflow-hidden">
                    {setup.previewUrl ? (
                      <img src={setup.previewUrl} alt={`${setup.symbol} setup preview`} className="w-full aspect-video object-cover" />
                    ) : (
                      <div className="aspect-video flex items-center justify-center text-[#707a8a] text-sm">No preview generated.</div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="bg-white/5 border border-[#2b3139] rounded-lg p-3">
                      <p className="text-[#707a8a]">Price</p>
                      <p className="text-white font-bold mt-1">{setup.price}</p>
                    </div>
                    <div className="bg-white/5 border border-[#2b3139] rounded-lg p-3">
                      <p className="text-[#707a8a]">SL / TP</p>
                      <p className="text-white font-bold mt-1">{setup.sl ?? '-'} / {setup.tp ?? '-'}</p>
                    </div>
                    <div className="bg-white/5 border border-[#2b3139] rounded-lg p-3">
                      <p className="text-[#707a8a]">Body</p>
                      <p className="text-white font-bold mt-1">{setup.bodySize ?? '-'}</p>
                    </div>
                    <div className="bg-white/5 border border-[#2b3139] rounded-lg p-3">
                      <p className="text-[#707a8a]">Volume</p>
                      <p className="text-white font-bold mt-1">{setup.volume ?? '-'}</p>
                    </div>
                  </div>

                  <div className="text-sm text-[#929aa5]">
                    <p className="text-white font-semibold mb-1">Reason</p>
                    <p>{setup.reason || 'No reason provided.'}</p>
                  </div>

                  <div className="flex items-center justify-between gap-3 text-xs text-[#929aa5]">
                    <span className="flex items-center"><Clock className="w-3 h-3 mr-1.5" />Expires: {timeLeft(setup.expiresAt)}</span>
                    {setup.chartUrl && (
                      <a href={setup.chartUrl} target="_blank" rel="noreferrer" className="text-[#fcd535] hover:text-white flex items-center">
                        Open chart <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-[#2b3139]">
                    <button
                      onClick={() => review(setup.id, 'approve')}
                      disabled={!canReview || busyId === setup.id}
                      className="px-4 py-2 bg-[rgba(14,203,129,0.12)] hover:bg-[rgba(14,203,129,0.2)] disabled:opacity-40 text-[#0ecb81] rounded-lg text-xs font-bold flex items-center"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                      Approve
                    </button>
                    <button
                      onClick={() => review(setup.id, 'reject')}
                      disabled={!canReview || busyId === setup.id}
                      className="px-4 py-2 bg-[rgba(246,70,93,0.12)] hover:bg-[rgba(246,70,93,0.2)] disabled:opacity-40 text-[#f6465d] rounded-lg text-xs font-bold flex items-center"
                    >
                      <XCircle className="w-4 h-4 mr-1.5" />
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
