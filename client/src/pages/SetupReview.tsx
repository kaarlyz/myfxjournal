import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, RefreshCcw, Clock, ExternalLink, AlertTriangle } from 'lucide-react';
import { PageHeader } from '../components/ui/SectionLabel';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

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

  const getStatusBadgeVariant = (s: string, expired: boolean) => {
    if (expired && s === 'PENDING_REVIEW') return 'loss';
    if (s === 'APPROVED') return 'profit';
    if (s === 'REJECTED' || s === 'EXPIRED') return 'loss';
    if (s === 'EXECUTED') return 'blue';
    return 'warning';
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <PageHeader 
          label="TradingView"
          title="Setup Review"
          subtitle="Review Momentum Candle setups from TradingView before the EA approval bridge can consume them."
          labelColor="blue"
        />
        <Button onClick={fetchSetups} disabled={loading} variant="secondary">
          <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-4 py-2 font-extrabold text-[12px] uppercase tracking-widest border-2 transition-all ${
              status === s 
                ? 'bg-[#121212] text-white border-[#121212] shadow-[4px_4px_0px_0px_#121212] -translate-y-0.5' 
                : 'bg-white text-[#717182] border-[#121212] hover:bg-[#F0F0F0] hover:text-[#121212] shadow-none hover:shadow-[4px_4px_0px_0px_#121212] hover:-translate-y-0.5'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-[var(--loss-dim)] border-2 border-[var(--loss)] text-[var(--loss)] p-4 shadow-[4px_4px_0px_0px_var(--loss)] flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 shrink-0" strokeWidth={2.5} />
          <span className="text-[13px] font-extrabold uppercase tracking-widest">{error}</span>
        </div>
      )}

      {sortedSetups.length === 0 ? (
        <div className="bg-[#F0F0F0] border-4 border-[#121212] border-dashed p-12 text-center shadow-[6px_6px_0px_0px_#121212]">
           <p className="text-[14px] font-extrabold text-[#717182] uppercase tracking-wide">No setups for this filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {sortedSetups.map(setup => {
            const expired = new Date(setup.expiresAt).getTime() <= Date.now();
            const canReview = setup.status === 'PENDING_REVIEW' && !expired;
            const badgeVariant = getStatusBadgeVariant(setup.status, expired);
            
            return (
              <div key={setup.id} className={`bg-white border-4 border-[#121212] flex flex-col group relative ${
                setup.id === selectedSetupId 
                  ? 'shadow-[8px_8px_0px_0px_#1040C0] -translate-y-1' 
                  : 'shadow-[6px_6px_0px_0px_#121212] hover:shadow-[8px_8px_0px_0px_#121212] hover:-translate-y-1 transition-all'
              }`}>
                {setup.id === selectedSetupId && (
                  <div className="absolute top-0 left-0 right-0 h-2 bg-[#1040C0]" />
                )}
                
                <div className="p-5 border-b-4 border-[#121212] flex items-start justify-between gap-4 bg-[#F0F0F0] mt-1">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-[20px] font-extrabold text-[#121212] uppercase tracking-wide">{setup.symbol} {setup.timeframe}</h2>
                      <Badge variant={setup.side === 'SELL' ? 'loss' : 'profit'}>{setup.side}</Badge>
                    </div>
                    <p className="text-[11px] text-[#717182] font-black uppercase tracking-wider mt-1">ID: {setup.id}</p>
                  </div>
                  <Badge variant={badgeVariant}>
                    {expired && setup.status === 'PENDING_REVIEW' ? 'EXPIRED' : setup.status}
                  </Badge>
                </div>

                <div className="p-5 space-y-5 flex-1">
                  <div className="bg-[#F0F0F0] border-2 border-[#121212] p-1 shadow-[4px_4px_0px_0px_#121212] mb-6">
                    {setup.previewUrl ? (
                      <img src={setup.previewUrl} alt={`${setup.symbol} setup preview`} className="w-full aspect-video object-cover border border-[#121212]" />
                    ) : (
                      <div className="aspect-video flex items-center justify-center text-[#717182] font-bold text-[12px] bg-white border border-[#121212] uppercase tracking-widest">
                        No preview generated.
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
                    <div className="bg-[#F0F0F0] border-2 border-[#121212] p-3 shadow-[2px_2px_0px_0px_#121212]">
                      <p className="text-[#717182] font-extrabold uppercase tracking-wider text-[10px]">Price</p>
                      <p className="text-[#121212] font-black font-number mt-1">{setup.price}</p>
                    </div>
                    <div className="bg-[#F0F0F0] border-2 border-[#121212] p-3 shadow-[2px_2px_0px_0px_#121212]">
                      <p className="text-[#717182] font-extrabold uppercase tracking-wider text-[10px]">SL / TP</p>
                      <p className="text-[#121212] font-black font-number mt-1">{setup.sl ?? '-'} / {setup.tp ?? '-'}</p>
                    </div>
                    <div className="bg-[#F0F0F0] border-2 border-[#121212] p-3 shadow-[2px_2px_0px_0px_#121212]">
                      <p className="text-[#717182] font-extrabold uppercase tracking-wider text-[10px]">Body</p>
                      <p className="text-[#121212] font-black font-number mt-1">{setup.bodySize ?? '-'}</p>
                    </div>
                    <div className="bg-[#F0F0F0] border-2 border-[#121212] p-3 shadow-[2px_2px_0px_0px_#121212]">
                      <p className="text-[#717182] font-extrabold uppercase tracking-wider text-[10px]">Volume</p>
                      <p className="text-[#121212] font-black font-number mt-1">{setup.volume ?? '-'}</p>
                    </div>
                  </div>

                  <div className="text-[13px] text-[#717182] border-l-4 border-[#1040C0] pl-4">
                    <p className="text-[#121212] font-extrabold uppercase tracking-widest text-[10px] mb-1">Reason</p>
                    <p className="font-bold">{setup.reason || 'No reason provided.'}</p>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] font-bold text-[#717182] pt-4">
                    <span className="flex items-center uppercase tracking-widest"><Clock className="w-4 h-4 mr-1.5" />Expires: <span className="ml-1 text-[#121212]">{timeLeft(setup.expiresAt)}</span></span>
                    {setup.chartUrl && (
                      <a href={setup.chartUrl} target="_blank" rel="noreferrer" className="text-[#1040C0] hover:text-[#121212] flex items-center font-extrabold uppercase tracking-widest transition-colors">
                        Open chart <ExternalLink className="w-4 h-4 ml-1" />
                      </a>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-[#F0F0F0] border-t-4 border-[#121212] flex flex-wrap gap-3 mt-auto">
                  <Button
                    onClick={() => review(setup.id, 'approve')}
                    disabled={!canReview || busyId === setup.id}
                    variant="profit"
                    className="flex-1"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" strokeWidth={2.5} />
                    Approve
                  </Button>
                  <Button
                    onClick={() => review(setup.id, 'reject')}
                    disabled={!canReview || busyId === setup.id}
                    variant="danger"
                    className="flex-1"
                  >
                    <XCircle className="w-4 h-4 mr-1.5" strokeWidth={2.5} />
                    Reject
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
