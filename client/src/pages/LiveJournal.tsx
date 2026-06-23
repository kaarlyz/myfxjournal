import React, { useEffect, useRef, useState } from 'react';
import { useLiveJournalStore } from '../store/useLiveJournalStore';
import { formatTradeTime } from '../utils/timeUtils';
import LiveDashboardCharts from '../components/LiveDashboardCharts';
import JournalCalendar from '../components/JournalCalendar';
import { Activity, Plus, FileText, ArrowUpRight, ArrowDownRight, RefreshCw, Camera } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatPercent, formatPnL } from '../utils/numberUtils';
import ErrorBoundary from '../components/ErrorBoundary';
import { buildExportFilename, exportElementAsPng } from '../utils/exportImage';
import { HelpCard, PageGuide } from '../components/help/HelpSystem';

function LiveJournalContent() {
  const { accounts, activeAccountId, setActiveAccountId, trades, summary, loading, error, fetchAccounts, fetchTrades, fetchSummary } = useLiveJournalStore();
  const [isAdding, setIsAdding] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState({
    symbol: '',
    side: 'BUY',
    lot: '',
    entryPrice: '',
    stopLoss: '',
    takeProfit: '',
    closePrice: '',
    openTime: new Date().toISOString().slice(0, 16),
    closeTime: '',
    profit: '',
    notes: ''
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (activeAccountId) {
      fetchTrades();
      fetchSummary();
    }
  }, [activeAccountId]);

  // Fallback polling
  useEffect(() => {
    let interval: any;
    if (useLiveJournalStore.getState().sseStatus === 'offline' && activeAccountId) {
      interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchSummary();
          fetchTrades();
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [activeAccountId]);

  const handleAddTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccountId) return;
    
    await useLiveJournalStore.getState().addTrade({
      ...formData,
      tradingAccountId: activeAccountId,
      lot: Number(formData.lot),
      entryPrice: Number(formData.entryPrice),
      stopLoss: formData.stopLoss ? Number(formData.stopLoss) : null,
      takeProfit: formData.takeProfit ? Number(formData.takeProfit) : null,
      closePrice: formData.closePrice ? Number(formData.closePrice) : null,
      profit: formData.profit ? Number(formData.profit) : null,
      openTime: new Date(formData.openTime).toISOString(),
      closeTime: formData.closeTime ? new Date(formData.closeTime).toISOString() : null,
    });
    
    setIsAdding(false);
    setFormData({
      symbol: '', side: 'BUY', lot: '', entryPrice: '', stopLoss: '', takeProfit: '', closePrice: '', openTime: new Date().toISOString().slice(0, 16), closeTime: '', profit: '', notes: ''
    });
  };

  if (loading && accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white/5 rounded-xl border border-[#2b3139]">
        <RefreshCw className="w-8 h-8 text-[#707a8a] animate-spin mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Loading Accounts...</h2>
      </div>
    );
  }

  if (error && accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-[rgba(246,70,93,0.08)] rounded-xl border border-[rgba(246,70,93,0.2)] p-6 text-center">
        <Activity className="w-12 h-12 text-[#f6465d] mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Error Loading Data</h2>
        <p className="text-[#929aa5] text-sm mb-4">{error}</p>
        <button onClick={() => fetchAccounts()} className="px-4 py-2 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition text-sm">
          Try Again
        </button>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] bg-white/5 rounded-xl border border-[#2b3139] p-8 text-center">
        <Activity className="w-12 h-12 text-[#707a8a] mb-4 opacity-50" />
        <h2 className="text-xl font-bold text-white mb-2">No live trading account connected yet</h2>
        <p className="text-[#929aa5] text-sm mb-4">Connect or create a trading account to show the realtime live account dashboard.</p>
        <div className="flex space-x-3">
          <Link to="/accounts" className="px-4 py-2 bg-accentBlue text-white font-semibold rounded-lg hover:bg-accentBlue/80 transition text-sm">
            Go to Trading Accounts
          </Link>
          <Link to="/integrations" className="px-4 py-2 bg-[#2b3139] text-white font-semibold rounded-lg hover:bg-[#363e47] transition text-sm">
            Go to MT5 Integration Setup
          </Link>
        </div>
      </div>
    );
  }

  const activeAccount = accounts.find(a => a.id === activeAccountId);
  const openTrades = trades.filter(t => !t.closeTime);
  const closedTrades = trades.filter(t => t.closeTime);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayPnl = closedTrades
    .filter(t => new Date(t.closeTime || t.openTime) >= today)
    .reduce((sum, t) => sum + (Number(t.profit) || 0), 0);
  const netPnl = summary?.netPnl ?? closedTrades.reduce((sum, t) => sum + (Number(t.profit) || 0), 0);
  const winrate = summary?.winrate ?? (closedTrades.length ? (closedTrades.filter(t => (Number(t.profit) || 0) > 0).length / closedTrades.length) * 100 : 0);
  const profitFactor = summary?.profitFactor ?? 0;
  const averageWin = summary?.averageWin ?? 0;
  const averageLoss = summary?.averageLoss ?? 0;
  const symbolStats = Object.values(trades.reduce((acc: any, trade: any) => {
    const key = trade.symbol || 'UNKNOWN';
    if (!acc[key]) acc[key] = { symbol: key, count: 0, pnl: 0 };
    acc[key].count += 1;
    acc[key].pnl += Number(trade.profit) || 0;
    return acc;
  }, {})).slice(0, 6) as Array<{ symbol: string; count: number; pnl: number }>;
  const sideStats = ['BUY', 'SELL'].map(side => {
    const sideTrades = trades.filter(t => t.side === side);
    return { side, count: sideTrades.length, pnl: sideTrades.reduce((sum, t) => sum + (Number(t.profit) || 0), 0) };
  });

  const exportLivePng = async () => {
    if (!exportRef.current || !activeAccount) return;
    setIsExporting(true);
    try {
      await exportElementAsPng(exportRef.current, buildExportFilename('live-dashboard', activeAccount.name || 'live-account'));
    } catch (err) {
      alert('Export gagal. Coba lagi.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 relative" ref={exportRef} id="live-journal-export-root">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-white">Live Journal</h1>
          <PageGuide
            title="Live Journal"
            purpose="Halaman ini membaca akun MT5 live/demo yang terkoneksi untuk memantau balance, equity, trade aktif, dan performa realtime."
            steps={[
              'Pilih akun dari account selector.',
              'Cek balance, equity, free margin, floating PnL, open trades, dan closed trades.',
              'Gunakan calendar untuk melihat performa harian.',
              'Review open/recent trades dan symbol performance.',
              'Export PNG/PDF untuk laporan akun.'
            ]}
            outputs={[
              'Jika akun ada tapi belum ada trade, dashboard tetap menampilkan balance/equity.',
              'Closed trades dipakai untuk winrate, profit factor, average win/loss, dan daily PnL.'
            ]}
            warnings={[
              'Data realtime tergantung koneksi MT5 connector dan snapshot terakhir.',
              'Remote trade execution dari WhatsApp/Telegram tetap dimatikan.'
            ]}
            nextAction="Jika belum ada data, buka Trading Accounts dan Integrations untuk menyambungkan MT5."
          />
        </div>
        <div className="flex items-center space-x-3">
          {activeAccount && (
            <>
              <button onClick={exportLivePng} disabled={isExporting} className="px-4 py-2 bg-[#2b3139] text-white text-sm font-semibold rounded-lg hover:bg-[#363e47] transition flex items-center space-x-2" data-export-hide>
                <Camera className="w-4 h-4" />
                <span>{isExporting ? 'Exporting...' : 'Export PNG'}</span>
              </button>
              <button onClick={() => window.open(`/reports/live/${activeAccount.id}/print`, '_blank')} className="px-4 py-2 bg-[#2b3139] text-white text-sm font-semibold rounded-lg hover:bg-[#363e47] transition flex items-center space-x-2" data-export-hide>
                <FileText className="w-4 h-4" />
                <span>Preview PDF</span>
              </button>
            </>
          )}
          <button onClick={() => { fetchTrades(); fetchSummary(); }} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition" title="Refresh">
            <RefreshCw className={`w-4 h-4 text-[#929aa5] ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setIsAdding(!isAdding)} className="px-4 py-2 bg-accentBlue text-white text-sm font-semibold rounded-lg hover:bg-accentBlue/80 transition flex items-center space-x-2">
            <Plus className="w-4 h-4" />
            <span>Add Manual Trade</span>
          </button>
        </div>
      </div>

      <HelpCard title="Cara membaca Live Journal">
        Fokus pada perbedaan balance dan equity. Kalau equity jauh di bawah balance, akun sedang menanggung floating risk walaupun closed PnL terlihat aman.
      </HelpCard>

      {/* Dashboard Summary Cards */}
      {activeAccount && (
        <div className="bn-card  border border-[#2b3139] rounded-xl p-6 mb-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-[#2b3139] pb-4">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accentBlue/20 to-accentBlue/5 flex items-center justify-center border border-[rgba(252,213,53,0.2)]">
                <span className="font-bold text-[#fcd535]">{activeAccount.platform}</span>
              </div>
              <div>
                <select value={activeAccountId || ''} onChange={(e) => setActiveAccountId(e.target.value)}
                  className="bg-transparent text-lg font-bold text-white focus:outline-none cursor-pointer">
                  {accounts.map(acc => <option key={acc.id} value={acc.id} className="bg-[#1e2329]">{acc.name} ({acc.currency})</option>)}
                </select>
                <div className="text-xs text-[#929aa5] flex items-center space-x-2 mt-1">
                  <span>{activeAccount.broker} • {activeAccount.brokerServer}</span>
                  <span>•</span>
                  <span className="font-mono">{activeAccount.accountNumber ? `****${activeAccount.accountNumber.slice(-4)}` : 'N/A'}</span>
                </div>
                <p className="text-[10px] text-[#707a8a] mt-1">Account: {activeAccount.name}</p>
              </div>
            </div>
            
            <div className="flex flex-col items-end">
              <div className="flex items-center space-x-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-winGreen opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-winGreen"></span>
                </span>
                <span className="text-xs font-semibold text-[#0ecb81]">{activeAccount.status || 'Active'}</span>
              </div>
              <span className="text-[10px] text-[#707a8a] mt-1">
                Last Sync: {activeAccount.lastSnapshotAt ? new Date(activeAccount.lastSnapshotAt).toLocaleTimeString() : 'Never'}
              </span>
            </div>
          </div>

          {activeAccount.accountType === 'CENT' && (
            <div className="mb-6 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-400 font-medium">
              Ini adalah Cent Account (Multiplier: {activeAccount.centMultiplier || 100}). Angka USD di broker mungkin bernilai USC (US Cents).
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-[#707a8a] mb-1">Balance</p>
              <p className="text-xl font-bold text-white">{formatCurrency(activeAccount.currentBalance, activeAccount.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-[#707a8a] mb-1">Equity</p>
              <p className="text-xl font-bold text-white">{formatCurrency(activeAccount.currentEquity, activeAccount.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-[#707a8a] mb-1">Free Margin</p>
              <p className="text-xl font-bold text-white">{formatCurrency(activeAccount.freeMargin, activeAccount.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-[#707a8a] mb-1">Net PnL</p>
              <p className={`text-xl font-bold ${netPnl >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                {formatPnL(netPnl, activeAccount.currency)}
              </p>
            </div>

            <div>
              <p className="text-xs text-[#707a8a] mb-1">Open Trades</p>
              <p className="text-lg font-semibold text-white">{openTrades.length}</p>
            </div>
            <div>
              <p className="text-xs text-[#707a8a] mb-1">Closed Trades</p>
              <p className="text-lg font-semibold text-white">{closedTrades.length}</p>
            </div>
            <div>
              <p className="text-xs text-[#707a8a] mb-1">Today PnL</p>
              <p className={`text-lg font-semibold ${todayPnl >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                {formatPnL(todayPnl, activeAccount.currency)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#707a8a] mb-1">Winrate</p>
              <p className="text-lg font-semibold text-white">{formatPercent(winrate)}</p>
            </div>
            <div>
              <p className="text-xs text-[#707a8a] mb-1">Profit Factor</p>
              <p className="text-lg font-semibold text-white">{Number(profitFactor || 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-[#707a8a] mb-1">Average Win</p>
              <p className="text-lg font-semibold text-[#0ecb81]">{formatPnL(averageWin, activeAccount.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-[#707a8a] mb-1">Average Loss</p>
              <p className="text-lg font-semibold text-[#f6465d]">{formatPnL(-Math.abs(averageLoss || 0), activeAccount.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-[#707a8a] mb-1">Max Drawdown</p>
              <p className="text-lg font-semibold text-white">-</p>
            </div>
          </div>
          {trades.length === 0 && (
            <div className="mt-6 rounded-lg border border-[#2b3139] bg-white/5 p-4 text-sm text-[#929aa5]">
              No live trades yet. Balance and equity are still shown above.
            </div>
          )}
        </div>
      )}

      {/* Live Dashboard Charts */}
      {trades.length > 0 ? (
        <LiveDashboardCharts trades={trades} />
      ) : activeAccount ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bn-card border border-[#2b3139] rounded-xl p-6 text-center text-[#707a8a]">No live equity/balance curve yet.</div>
          <div className="bn-card border border-[#2b3139] rounded-xl p-6 text-center text-[#707a8a]">No daily PnL chart yet.</div>
        </div>
      ) : null}

      {activeAccount && (
        <JournalCalendar
          mode="LIVE"
          title="Live Journal Calendar"
          trades={trades}
          currency={activeAccount.currency || 'USD'}
          storageKey="replayfx:showLiveCalendar"
          defaultCollapsed={true}
          contextType="LIVE_ACCOUNT"
          contextId={activeAccount.id}
        />
      )}

      {activeAccount && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bn-card border border-[#2b3139] rounded-xl p-4">
            <h3 className="text-sm font-bold text-white mb-3">Open Trades</h3>
            {openTrades.length === 0 ? <p className="text-xs text-[#707a8a] py-6 text-center">No open trades.</p> : (
              <div className="space-y-2">{openTrades.slice(0, 8).map(t => <div key={t.id} className="flex justify-between text-xs border border-[#2b3139] rounded-lg p-2"><span className="text-white">{t.symbol} {t.side}</span><span className="text-[#929aa5]">{t.lot} @ {t.entryPrice}</span></div>)}</div>
            )}
          </div>
          <div className="bn-card border border-[#2b3139] rounded-xl p-4">
            <h3 className="text-sm font-bold text-white mb-3">Recent Closed Trades</h3>
            {closedTrades.length === 0 ? <p className="text-xs text-[#707a8a] py-6 text-center">No closed trades yet.</p> : (
              <div className="space-y-2">{closedTrades.slice(0, 8).map(t => <div key={t.id} className="flex justify-between text-xs border border-[#2b3139] rounded-lg p-2"><span className="text-white">{t.symbol} {t.side}</span><span className={(Number(t.profit) || 0) >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>{formatPnL(t.profit, activeAccount.currency)}</span></div>)}</div>
            )}
          </div>
          <div className="bn-card border border-[#2b3139] rounded-xl p-4">
            <h3 className="text-sm font-bold text-white mb-3">Symbol Performance</h3>
            {symbolStats.length === 0 ? <p className="text-xs text-[#707a8a] py-6 text-center">No symbol performance yet.</p> : (
              <div className="space-y-2">{symbolStats.map(s => <div key={s.symbol} className="flex justify-between text-xs border border-[#2b3139] rounded-lg p-2"><span className="text-white">{s.symbol} · {s.count}</span><span className={s.pnl >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>{formatPnL(s.pnl, activeAccount.currency)}</span></div>)}</div>
            )}
          </div>
          <div className="bn-card border border-[#2b3139] rounded-xl p-4">
            <h3 className="text-sm font-bold text-white mb-3">Buy vs Sell Performance</h3>
            <div className="space-y-2">{sideStats.map(s => <div key={s.side} className="flex justify-between text-xs border border-[#2b3139] rounded-lg p-2"><span className="text-white">{s.side} · {s.count}</span><span className={s.pnl >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>{formatPnL(s.pnl, activeAccount.currency)}</span></div>)}</div>
          </div>
        </div>
      )}

      {/* Add Trade Form */}
      {isAdding && (
        <div className="bn-card  backdrop-blur-xl border border-[#2b3139] rounded-xl p-6 relative z-20">
          <h2 className="text-lg font-bold text-white mb-4">Log New Trade</h2>
          <form onSubmit={handleAddTrade} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#929aa5] mb-1">Symbol</label>
                <input type="text" required value={formData.symbol} onChange={e => setFormData({...formData, symbol: e.target.value.toUpperCase()})}
                  className="w-full bn-card  border border-[#2b3139] rounded-lg py-2 px-3 text-white uppercase text-sm" placeholder="XAUUSD" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#929aa5] mb-1">Side</label>
                <select value={formData.side} onChange={e => setFormData({...formData, side: e.target.value})}
                  className="w-full bn-card  border border-[#2b3139] rounded-lg py-2 px-3 text-white text-sm appearance-none cursor-pointer">
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#929aa5] mb-1">Lot Size</label>
                <input type="number" required step="0.01" value={formData.lot} onChange={e => setFormData({...formData, lot: e.target.value})}
                  className="w-full bn-card  border border-[#2b3139] rounded-lg py-2 px-3 text-white text-sm" placeholder="0.01" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#929aa5] mb-1">Entry Price</label>
                <input type="number" required step="0.00001" value={formData.entryPrice} onChange={e => setFormData({...formData, entryPrice: e.target.value})}
                  className="w-full bn-card  border border-[#2b3139] rounded-lg py-2 px-3 text-white text-sm" placeholder="1.1000" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#929aa5] mb-1">Stop Loss</label>
                <input type="number" step="0.00001" value={formData.stopLoss} onChange={e => setFormData({...formData, stopLoss: e.target.value})}
                  className="w-full bn-card  border border-[#2b3139] rounded-lg py-2 px-3 text-white text-sm" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#929aa5] mb-1">Take Profit</label>
                <input type="number" step="0.00001" value={formData.takeProfit} onChange={e => setFormData({...formData, takeProfit: e.target.value})}
                  className="w-full bn-card  border border-[#2b3139] rounded-lg py-2 px-3 text-white text-sm" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#929aa5] mb-1">Open Time</label>
                <input type="datetime-local" required value={formData.openTime} onChange={e => setFormData({...formData, openTime: e.target.value})}
                  className="w-full bn-card  border border-[#2b3139] rounded-lg py-2 px-3 text-white text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#929aa5] mb-1">Close Time (If closed)</label>
                <input type="datetime-local" value={formData.closeTime} onChange={e => setFormData({...formData, closeTime: e.target.value})}
                  className="w-full bn-card  border border-[#2b3139] rounded-lg py-2 px-3 text-white text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#929aa5] mb-1">Close Price</label>
                <input type="number" step="0.00001" value={formData.closePrice} onChange={e => setFormData({...formData, closePrice: e.target.value})}
                  className="w-full bn-card  border border-[#2b3139] rounded-lg py-2 px-3 text-white text-sm" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#929aa5] mb-1">Net Profit (Money)</label>
                <input type="number" step="0.01" value={formData.profit} onChange={e => setFormData({...formData, profit: e.target.value})}
                  className="w-full bn-card  border border-[#2b3139] rounded-lg py-2 px-3 text-white text-sm" placeholder="e.g. 50 or -20" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-[#929aa5] mb-1">Notes</label>
                <input type="text" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}
                  className="w-full bn-card  border border-[#2b3139] rounded-lg py-2 px-3 text-white text-sm" placeholder="Why did you take this trade?" />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-4">
              <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 bg-transparent text-[#929aa5] hover:text-white transition text-sm">Cancel</button>
              <button type="submit" disabled={loading} className="px-4 py-2 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition text-sm">
                Save Trade
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Trades Table */}
      <div className="bn-card  border border-[#2b3139] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-white/5 text-[#929aa5] text-xs uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Time / Symbol</th>
                <th className="px-6 py-4 font-medium">Side / Lot</th>
                <th className="px-6 py-4 font-medium">Entry / SL / TP</th>
                <th className="px-6 py-4 font-medium">Profit</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[#707a8a]">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No live trades yet. Add manual trade or sync with MT5.
                  </td>
                </tr>
              ) : (
                trades.map((t) => (
                  <tr key={t.id} className="hover:bg-white/[0.02] transition">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white">{t.symbol}</div>
                      <div className="text-xs text-[#707a8a]">{formatTradeTime(t.openTime)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${t.side === 'BUY' ? 'bg-[rgba(14,203,129,0.12)] text-[#0ecb81]' : 'bg-[rgba(246,70,93,0.12)] text-[#f6465d]'}`}>
                        {t.side === 'BUY' ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                        {t.side}
                      </span>
                      <div className="text-[#929aa5] mt-1">{t.lot} Lot</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-[#eaecef]">
                      <div>E: {t.entryPrice}</div>
                      {t.stopLoss && <div className="text-xs text-[#707a8a]">SL: {t.stopLoss}</div>}
                      {t.takeProfit && <div className="text-xs text-[#707a8a]">TP: {t.takeProfit}</div>}
                    </td>
                    <td className="px-6 py-4">
                      {t.profit !== null ? (
                        <div className={`font-bold ${t.profit > 0 ? 'text-[#0ecb81]' : t.profit < 0 ? 'text-[#f6465d]' : 'text-[#929aa5]'}`}>
                          {formatPnL(t.profit, activeAccount?.currency || 'USD')}
                        </div>
                      ) : (
                        <span className="text-[#707a8a] text-xs uppercase px-2 py-1 bg-white/5 rounded">Open</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => {
                        if(window.confirm('Delete this trade?')) useLiveJournalStore.getState().deleteTrade(t.id);
                      }} className="text-[#707a8a] hover:text-[#f6465d] transition">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function LiveJournal() {
  return (
    <ErrorBoundary>
      <LiveJournalContent />
    </ErrorBoundary>
  );
}
