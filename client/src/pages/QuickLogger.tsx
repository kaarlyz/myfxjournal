import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3, CheckCircle2, RefreshCw, Zap } from 'lucide-react';
import { useJournalStore } from '../store/useJournalStore';
import { formatUsd, formatPercent } from '../utils/formatters';
import { HelpCard, PageGuide } from '../components/help/HelpSystem';

export default function QuickLogger() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { sessions, activeSessionId, activeSessionDetails, fetchSessions, fetchActiveSession, selectSession } = useJournalStore();
  const [sessionId, setSessionId] = useState('');
  const [mode, setMode] = useState<'FAST_R' | 'DETAILED'>('FAST_R');
  const [result, setResult] = useState<'WIN' | 'LOSS' | 'BE'>('WIN');
  const [riskPerTrade, setRiskPerTrade] = useState('50');
  const [rr, setRr] = useState('2');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [entryPrice, setEntryPrice] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [lot, setLot] = useState('');
  const [profit, setProfit] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<any | null>(null);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    const querySessionId = searchParams.get('sessionId');
    const preferred = querySessionId || activeSessionId || sessions[0]?.id || '';
    if (preferred && preferred !== sessionId) {
      setSessionId(preferred);
      selectSession(preferred);
    }
  }, [searchParams, activeSessionId, sessions, sessionId, selectSession]);

  const selectedSession = sessions.find(s => s.id === sessionId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) return setError('Pilih sesi dulu.');
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body = {
        mode,
        result,
        side,
        entryPrice: entryPrice ? Number(entryPrice) : undefined,
        exitPrice: exitPrice ? Number(exitPrice) : undefined,
        lot: lot ? Number(lot) : undefined,
        riskPerTrade: riskPerTrade ? Number(riskPerTrade) : undefined,
        rr: rr ? Number(rr) : undefined,
        profit: profit !== '' ? Number(profit) : undefined,
        notes,
      };
      const res = await fetch(`/api/sessions/${sessionId}/quick-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menyimpan quick log.');
      setSuccess(data);
      await fetchSessions();
      await fetchActiveSession(sessionId);
      setNotes('');
      if (mode === 'DETAILED') {
        setEntryPrice('');
        setExitPrice('');
        setLot('');
        setProfit('');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <Zap className="w-12 h-12 text-[#707a8a]" />
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white">Quick Logger</h2>
          <p className="text-[#929aa5] mt-2">Buat atau import sesi dulu sebelum quick log.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/create-session" className="px-5 py-2 bg-[#fcd535] text-black rounded-lg font-bold text-sm">Create Session</Link>
          <Link to="/csv-import" className="px-5 py-2 bg-[#2b3139] text-white rounded-lg font-bold text-sm">Import CSV</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl min-w-0">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 min-w-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Zap className="w-5 h-5 text-[#fcd535]" /> Quick Logger</h1>
            <PageGuide
              title="Quick Logger"
              purpose="Quick Logger dipakai untuk mencatat trade manual dengan cepat tanpa upload CSV."
              steps={[
                'Pilih sesi tujuan.',
                'Gunakan Fast R jika hanya ingin input WIN/LOSS/BE, risk, dan RR.',
                'Gunakan Detailed jika ingin input harga entry/exit dan lot.',
                'Klik Save Quick Log lalu buka dashboard untuk melihat trade count dan PnL update.'
              ]}
              outputs={[
                'WIN menghitung profit = risk x RR.',
                'LOSS menghitung profit = -risk.',
                'BE menghitung profit = 0.'
              ]}
              warnings={[
                'Pastikan sesi yang dipilih benar agar trade tidak masuk ke dashboard yang salah.',
                'Quick Log cocok untuk catatan cepat, bukan pengganti broker statement.'
              ]}
              nextAction="Setelah save, klik View Dashboard untuk cek metrik terbaru."
            />
          </div>
          <p className="text-sm text-[#929aa5] mt-1">Tambah trade manual cepat ke sesi backtest yang dipilih.</p>
        </div>
        <select
          value={sessionId}
          onChange={(e) => {
            setSessionId(e.target.value);
            selectSession(e.target.value);
            navigate(`/quick-logger?sessionId=${e.target.value}`, { replace: true });
          }}
          className="bn-card border border-[#2b3139] rounded-lg py-2 px-3 text-white text-sm min-w-[260px]"
          style={{ maxWidth: '100%' }}
        >
          {sessions.map(s => <option key={s.id} value={s.id}>{s.name} ({s.symbol})</option>)}
        </select>
      </div>

      <HelpCard title="Fast R mode">
        Mode ini cocok jika kamu hanya tahu hasil trade secara risk/reward. Contoh: risk $50, RR 2, result WIN akan membuat trade profit +$100.
      </HelpCard>

      {selectedSession && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bn-card border border-[#2b3139] rounded-lg p-3 min-w-0"><p className="text-[10px] text-[#707a8a]">Session</p><p className="text-sm text-white font-bold truncate" title={selectedSession.name}>{selectedSession.name}</p></div>
          <div className="bn-card border border-[#2b3139] rounded-lg p-3"><p className="text-[10px] text-[#707a8a]">Trades</p><p className="text-sm text-white font-bold">{selectedSession.tradeCount}</p></div>
          <div className="bn-card border border-[#2b3139] rounded-lg p-3"><p className="text-[10px] text-[#707a8a]">Winrate</p><p className="text-sm text-white font-bold">{selectedSession.tradeCount ? formatPercent(selectedSession.winrate) : '-'}</p></div>
          <div className="bn-card border border-[#2b3139] rounded-lg p-3"><p className="text-[10px] text-[#707a8a]">Net PnL</p><p className={`text-sm font-bold ${selectedSession.netPnlUsd >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{formatUsd(selectedSession.netPnlUsd)}</p></div>
        </div>
      )}

      {error && <div className="rounded-lg border border-[rgba(246,70,93,0.25)] bg-[rgba(246,70,93,0.08)] p-4 text-sm text-[#f6465d]">{error}</div>}
      {success && (
        <div className="rounded-lg border border-[rgba(14,203,129,0.25)] bg-[rgba(14,203,129,0.08)] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="text-sm text-[#0ecb81] font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Quick log saved. Dashboard stats refreshed.</div>
          <button onClick={() => navigate(`/dashboard?sessionId=${sessionId}`)} className="px-4 py-2 bg-[#fcd535] text-black rounded-lg text-xs font-bold flex items-center justify-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" /> View Dashboard
          </button>
        </div>
      )}

      <form onSubmit={submit} className="bn-card border border-[#2b3139] rounded-xl p-6 space-y-5">
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode('FAST_R')} className={`px-4 py-2 rounded-lg text-sm font-bold ${mode === 'FAST_R' ? 'bg-[#fcd535] text-black' : 'bg-[#2b3139] text-[#929aa5]'}`}>Fast R mode</button>
          <button type="button" onClick={() => setMode('DETAILED')} className={`px-4 py-2 rounded-lg text-sm font-bold ${mode === 'DETAILED' ? 'bg-[#fcd535] text-black' : 'bg-[#2b3139] text-[#929aa5]'}`}>Detailed trade mode</button>
        </div>

        {mode === 'FAST_R' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-[#929aa5] mb-1">Result</label>
              <select value={result} onChange={(e: any) => setResult(e.target.value)} className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white">
                <option value="WIN">WIN</option>
                <option value="LOSS">LOSS</option>
                <option value="BE">BE</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#929aa5] mb-1">Risk per trade</label>
              <input value={riskPerTrade} onChange={e => setRiskPerTrade(e.target.value)} type="number" step="0.01" className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white" />
            </div>
            <div>
              <label className="block text-xs text-[#929aa5] mb-1">RR / R multiple</label>
              <input value={rr} onChange={e => setRr(e.target.value)} type="number" step="0.01" className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs text-[#929aa5] mb-1">Side</label>
              <select value={side} onChange={(e: any) => setSide(e.target.value)} className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white">
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#929aa5] mb-1">Entry price</label>
              <input value={entryPrice} onChange={e => setEntryPrice(e.target.value)} type="number" step="0.00001" className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white" />
            </div>
            <div>
              <label className="block text-xs text-[#929aa5] mb-1">Exit price</label>
              <input value={exitPrice} onChange={e => setExitPrice(e.target.value)} type="number" step="0.00001" className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white" />
            </div>
            <div>
              <label className="block text-xs text-[#929aa5] mb-1">Lot optional</label>
              <input value={lot} onChange={e => setLot(e.target.value)} type="number" step="0.01" className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white" />
            </div>
            <div>
              <label className="block text-xs text-[#929aa5] mb-1">Profit/Loss optional</label>
              <input value={profit} onChange={e => setProfit(e.target.value)} type="number" step="0.01" className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white" />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs text-[#929aa5] mb-1">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white" />
        </div>

        <button disabled={saving} className="px-5 py-2.5 bg-[#fcd535] hover:bg-[#f0b90b] disabled:opacity-50 text-black rounded-lg text-sm font-bold flex items-center gap-2">
          {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
          Save Quick Log
        </button>
      </form>
    </div>
  );
}
