import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3, CheckCircle2, RefreshCw, Zap } from 'lucide-react';
import { useJournalStore } from '../store/useJournalStore';
import { formatUsd, formatPercent } from '../utils/formatters';
import { HelpCard, PageGuide } from '../components/help/HelpSystem';
import { PageHeader } from '../components/ui/SectionLabel';
import { Button } from '../components/ui/Button';
import { apiUrl, defaultHeaders } from '../utils/api';

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
      const res = await fetch(apiUrl(`/sessions/${sessionId}/quick-log`), {
        method: 'POST',
        headers: defaultHeaders({ 'Content-Type': 'application/json' }),
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
      <div className="flex flex-col items-center justify-center py-20 space-y-8 max-w-lg mx-auto text-center border-4 border-[#121212] bg-white p-12 shadow-[12px_12px_0px_0px_#121212]">
        <Zap className="w-16 h-16 text-[#121212]" strokeWidth={2.5} />
        <div>
          <h2 className="text-[28px] font-black text-[#121212] uppercase tracking-tighter">Quick Logger</h2>
          <p className="text-[14px] font-bold text-[#717182] mt-3 leading-relaxed">Buat atau import sesi dulu sebelum mencatat trade menggunakan Quick Logger.</p>
        </div>
        <div className="flex flex-col w-full gap-4 mt-4">
          <Link to="/create-session" className="w-full text-center px-6 py-4 bg-[#1040C0] text-white border-4 border-[#121212] shadow-[4px_4px_0px_0px_#121212] font-black uppercase tracking-widest hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_#121212] transition-all">Create Session</Link>
          <Link to="/csv-import" className="w-full text-center px-6 py-4 bg-[#F0F0F0] text-[#121212] border-4 border-[#121212] shadow-[4px_4px_0px_0px_#121212] font-black uppercase tracking-widest hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_#121212] transition-all">Import CSV</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-4">
            <PageHeader 
              label="Logger"
              title="Quick Logger"
              subtitle="Tambah trade manual cepat ke sesi backtest yang dipilih."
              labelColor="blue"
            />
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
        </div>
        
        <div className="w-full md:w-80 relative min-w-0">
          <select
            value={sessionId}
            onChange={(e) => {
              setSessionId(e.target.value);
              selectSession(e.target.value);
              navigate(`/quick-logger?sessionId=${e.target.value}`, { replace: true });
            }}
            className="w-full bg-white border-4 border-[#121212] py-4 pl-5 pr-10 text-[#121212] text-xs sm:text-sm font-black uppercase tracking-wider shadow-[6px_6px_0px_0px_#121212] appearance-none cursor-pointer outline-none focus:border-[#1040C0] truncate"
          >
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name} ({s.symbol})</option>)}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#121212]">
            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
          </div>
        </div>
      </div>

      <HelpCard title="Fast R mode" tone="neutral">
        Mode ini cocok jika kamu hanya tahu hasil trade secara risk/reward. Contoh: risk $50, RR 2, result WIN akan membuat trade profit +$100.
      </HelpCard>

      {selectedSession && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border-4 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212] min-w-0">
            <p className="text-[10px] font-extrabold text-[#717182] uppercase tracking-widest mb-1 truncate">Session</p>
            <p className="text-xs sm:text-sm text-[#121212] font-black uppercase tracking-wide break-words line-clamp-2" title={selectedSession.name}>{selectedSession.name}</p>
          </div>
          <div className="bg-white border-4 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212] min-w-0">
            <p className="text-[10px] font-extrabold text-[#717182] uppercase tracking-widest mb-1 truncate">Trades</p>
            <p className="text-lg sm:text-[20px] text-[#121212] font-black font-number leading-none truncate">{selectedSession.tradeCount}</p>
          </div>
          <div className="bg-white border-4 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212] min-w-0">
            <p className="text-[10px] font-extrabold text-[#717182] uppercase tracking-widest mb-1 truncate">Winrate</p>
            <p className="text-lg sm:text-[20px] text-[#121212] font-black font-number leading-none truncate">{selectedSession.tradeCount ? formatPercent(selectedSession.winrate) : '-'}</p>
          </div>
          <div className="bg-white border-4 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212] min-w-0">
            <p className="text-[10px] font-extrabold text-[#717182] uppercase tracking-widest mb-1 truncate">Net PnL</p>
            <p className={`text-lg sm:text-[20px] font-black font-number leading-none truncate ${selectedSession.netPnlUsd >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`} title={formatUsd(selectedSession.netPnlUsd)}>
              {formatUsd(selectedSession.netPnlUsd)}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-[var(--loss-dim)] border-4 border-[var(--loss)] p-5 text-[14px] font-bold text-[var(--loss)] shadow-[4px_4px_0px_0px_var(--loss)]">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-[var(--profit-dim)] border-4 border-[var(--profit)] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[4px_4px_0px_0px_var(--profit)]">
          <div className="text-[14px] text-[var(--profit)] font-black uppercase tracking-wide flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 shrink-0" strokeWidth={2.5} /> 
            <span>Quick log saved. Dashboard stats refreshed.</span>
          </div>
          <Button onClick={() => navigate(`/dashboard?sessionId=${sessionId}`)} variant="profit">
            <BarChart3 className="w-4 h-4 mr-2" /> View Dashboard
          </Button>
        </div>
      )}

      <form onSubmit={submit} className="bg-[#F0F0F0] border-4 border-[#121212] p-6 md:p-8 space-y-8 shadow-[8px_8px_0px_0px_#121212]">
        <div className="flex flex-wrap gap-3 pb-6 border-b-4 border-[#121212]">
          <button 
            type="button" 
            onClick={() => setMode('FAST_R')} 
            className={`px-6 py-3 font-extrabold uppercase tracking-widest text-[12px] border-2 border-[#121212] transition-all ${
              mode === 'FAST_R' 
                ? 'bg-[#121212] text-white shadow-[4px_4px_0px_0px_#121212] -translate-y-0.5' 
                : 'bg-white text-[#717182] hover:bg-[#F0F0F0] hover:text-[#121212] hover:shadow-[4px_4px_0px_0px_#121212] hover:-translate-y-0.5'
            }`}
          >
            Fast R mode
          </button>
          <button 
            type="button" 
            onClick={() => setMode('DETAILED')} 
            className={`px-6 py-3 font-extrabold uppercase tracking-widest text-[12px] border-2 border-[#121212] transition-all ${
              mode === 'DETAILED' 
                ? 'bg-[#121212] text-white shadow-[4px_4px_0px_0px_#121212] -translate-y-0.5' 
                : 'bg-white text-[#717182] hover:bg-[#F0F0F0] hover:text-[#121212] hover:shadow-[4px_4px_0px_0px_#121212] hover:-translate-y-0.5'
            }`}
          >
            Detailed trade mode
          </button>
        </div>

        {mode === 'FAST_R' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-[11px] font-extrabold text-[#717182] uppercase tracking-widest mb-2">Result</label>
              <select 
                value={result} 
                onChange={(e: any) => setResult(e.target.value)} 
                className={`w-full border-4 border-[#121212] py-3 px-4 text-[#121212] font-black uppercase tracking-wider outline-none focus:border-[#1040C0] transition-colors appearance-none bg-white ${
                  result === 'WIN' ? 'border-l-8 border-l-[var(--profit)]' : 
                  result === 'LOSS' ? 'border-l-8 border-l-[var(--loss)]' : 
                  'border-l-8 border-l-[#717182]'
                }`}
              >
                <option value="WIN">WIN</option>
                <option value="LOSS">LOSS</option>
                <option value="BE">BREAKEVEN</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-extrabold text-[#717182] uppercase tracking-widest mb-2">Risk per trade ($)</label>
              <input 
                value={riskPerTrade} 
                onChange={e => setRiskPerTrade(e.target.value)} 
                type="number" 
                step="0.01" 
                className="w-full bg-white border-4 border-[#121212] py-3 px-4 text-[#121212] font-black font-number outline-none focus:border-[#1040C0] transition-colors" 
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold text-[#717182] uppercase tracking-widest mb-2">RR / R multiple</label>
              <input 
                value={rr} 
                onChange={e => setRr(e.target.value)} 
                type="number" 
                step="0.01" 
                className="w-full bg-white border-4 border-[#121212] py-3 px-4 text-[#121212] font-black font-number outline-none focus:border-[#1040C0] transition-colors" 
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <div>
              <label className="block text-[11px] font-extrabold text-[#717182] uppercase tracking-widest mb-2">Side</label>
              <select 
                value={side} 
                onChange={(e: any) => setSide(e.target.value)} 
                className={`w-full border-4 border-[#121212] py-3 px-4 text-[#121212] font-black uppercase tracking-wider outline-none focus:border-[#1040C0] transition-colors appearance-none bg-white ${
                  side === 'BUY' ? 'border-l-8 border-l-[var(--profit)]' : 'border-l-8 border-l-[var(--loss)]'
                }`}
              >
                <option value="BUY">BUY / LONG</option>
                <option value="SELL">SELL / SHORT</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-extrabold text-[#717182] uppercase tracking-widest mb-2">Entry price</label>
              <input 
                value={entryPrice} 
                onChange={e => setEntryPrice(e.target.value)} 
                type="number" 
                step="0.00001" 
                className="w-full bg-white border-4 border-[#121212] py-3 px-4 text-[#121212] font-black font-number outline-none focus:border-[#1040C0] transition-colors" 
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold text-[#717182] uppercase tracking-widest mb-2">Exit price</label>
              <input 
                value={exitPrice} 
                onChange={e => setExitPrice(e.target.value)} 
                type="number" 
                step="0.00001" 
                className="w-full bg-white border-4 border-[#121212] py-3 px-4 text-[#121212] font-black font-number outline-none focus:border-[#1040C0] transition-colors" 
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold text-[#717182] uppercase tracking-widest mb-2">Lot (optional)</label>
              <input 
                value={lot} 
                onChange={e => setLot(e.target.value)} 
                type="number" 
                step="0.01" 
                className="w-full bg-white border-4 border-[#121212] py-3 px-4 text-[#121212] font-black font-number outline-none focus:border-[#1040C0] transition-colors" 
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold text-[#717182] uppercase tracking-widest mb-2">Profit/Loss (optional)</label>
              <input 
                value={profit} 
                onChange={e => setProfit(e.target.value)} 
                type="number" 
                step="0.01" 
                className="w-full bg-white border-4 border-[#121212] py-3 px-4 text-[#121212] font-black font-number outline-none focus:border-[#1040C0] transition-colors" 
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-extrabold text-[#717182] uppercase tracking-widest mb-2">Notes</label>
          <textarea 
            value={notes} 
            onChange={e => setNotes(e.target.value)} 
            rows={4} 
            className="w-full bg-white border-4 border-[#121212] py-4 px-5 text-[#121212] font-bold outline-none focus:border-[#1040C0] transition-colors shadow-inner resize-y" 
            placeholder="Add context to this manual log..."
          />
        </div>

        <div className="pt-4">
          <Button 
            type="submit" 
            disabled={saving} 
            variant="dark"
            className="w-full md:w-auto"
          >
            {saving ? <RefreshCw className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" strokeWidth={2.5} />}
            <span className="text-[14px]">Save Quick Log</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
