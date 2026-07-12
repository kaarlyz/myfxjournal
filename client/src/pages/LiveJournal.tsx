import React, { useEffect, useRef, useState } from 'react';
import { useLiveJournalStore } from '../store/useLiveJournalStore';
import { formatTradeTime } from '../utils/timeUtils';
import LiveDashboardCharts from '../components/LiveDashboardCharts';
import JournalCalendar from '../components/JournalCalendar';
import { Activity, Plus, FileText, ArrowUpRight, ArrowDownRight, RefreshCw, Camera } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatPercent, formatPnL } from '../utils/numberUtils';
import WidgetErrorBoundary from '../components/WidgetErrorBoundary';
import { buildExportFilename, exportElementAsPng } from '../utils/exportImage';
import { HelpCard, PageGuide } from '../components/help/HelpSystem';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { SectionLabel } from '../components/ui/SectionLabel';

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
      <div className="flex flex-col items-center justify-center h-64 bg-white border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212]">
        <RefreshCw className="w-8 h-8 text-[#121212] animate-spin mb-4" />
        <h2 className="text-xl font-extrabold text-[#121212] mb-2 font-display">Loading Accounts...</h2>
      </div>
    );
  }

  if (error && accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-[var(--loss-dim)] border-2 border-[var(--loss)] shadow-[6px_6px_0px_0px_var(--loss)] p-6 text-center">
        <Activity className="w-12 h-12 text-[var(--loss)] mb-4" />
        <h2 className="text-xl font-extrabold text-[#121212] mb-2 font-display">Error Loading Data</h2>
        <p className="text-[#121212] font-semibold text-[13px] mb-4">{error}</p>
        <Button variant="secondary" onClick={() => fetchAccounts()}>
          Try Again
        </Button>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] bg-white border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212] p-8 text-center">
        <Activity className="w-12 h-12 text-[#121212] mb-4 opacity-50" />
        <h2 className="text-xl font-extrabold text-[#121212] mb-2 font-display uppercase tracking-wider">No live trading account connected yet</h2>
        <p className="text-[#717182] font-bold text-[13px] mb-6">Connect or create a trading account to show the realtime live account dashboard.</p>
        <div className="flex space-x-3">
          <Link to="/accounts" className="px-4 py-2 bg-[#1040C0] text-white border-2 border-[#121212] font-extrabold uppercase tracking-widest text-[11px] shadow-[2px_2px_0px_0px_#121212] hover:bg-[#0D3399] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
            Go to Trading Accounts
          </Link>
          <Link to="/integrations" className="px-4 py-2 bg-[#F0F0F0] text-[#121212] border-2 border-[#121212] font-extrabold uppercase tracking-widest text-[11px] shadow-[2px_2px_0px_0px_#121212] hover:bg-[#E0E0E0] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
            Go to MT5 Setup
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
          <h1 className="text-3xl font-extrabold text-[#121212] uppercase tracking-tight font-display flex items-center gap-3">
            <Activity className="w-8 h-8 text-[var(--profit)]" strokeWidth={3} />
            Live Journal
          </h1>
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
              <Button variant="secondary" onClick={exportLivePng} disabled={isExporting} data-export-hide>
                <Camera className="w-4 h-4" />
                <span>{isExporting ? 'Exporting...' : 'Export PNG'}</span>
              </Button>
              <Button variant="secondary" onClick={() => window.open(`/reports/live/${activeAccount.id}/print`, '_blank')} data-export-hide>
                <FileText className="w-4 h-4" />
                <span>Preview PDF</span>
              </Button>
            </>
          )}
          <button onClick={() => { fetchTrades(); fetchSummary(); }} className="p-2 border-2 border-[#121212] bg-white hover:bg-[#F0F0F0] rounded-sm transition shadow-[2px_2px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none" title="Refresh">
            <RefreshCw className={`w-4 h-4 text-[#121212] font-bold ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Button variant="blue" onClick={() => setIsAdding(!isAdding)}>
            <Plus className="w-4 h-4" />
            <span>Add Manual Trade</span>
          </Button>
        </div>
      </div>

      <HelpCard title="Cara membaca Live Journal">
        Fokus pada perbedaan balance dan equity. Kalau equity jauh di bawah balance, akun sedang menanggung floating risk walaupun closed PnL terlihat aman.
      </HelpCard>

      {/* Dashboard Summary Cards */}
      {activeAccount && (
        <div className="bg-white border-2 border-[#121212] p-6 shadow-[6px_6px_0px_0px_#121212] mb-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--profit)] opacity-5 rounded-bl-[100%]" />
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b-4 border-[#121212] pb-6">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 bg-[#F0F0F0] border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] flex items-center justify-center font-display font-extrabold text-[15px] uppercase tracking-wider text-[#1040C0]">
                {activeAccount.platform}
              </div>
              <div>
                <select value={activeAccountId || ''} onChange={(e) => setActiveAccountId(e.target.value)}
                  className="bg-transparent text-xl font-extrabold text-[#121212] focus:outline-none cursor-pointer font-display uppercase tracking-tight">
                  {accounts.map(acc => <option key={acc.id} value={acc.id} className="font-sans font-bold">{acc.name} ({acc.currency})</option>)}
                </select>
                <div className="text-[11px] font-bold text-[#717182] uppercase tracking-widest flex items-center space-x-2 mt-1">
                  <span>{activeAccount.broker} • {activeAccount.brokerServer}</span>
                  <span>•</span>
                  <span className="font-mono bg-[#F0F0F0] px-1 text-[#121212]">{activeAccount.accountNumber ? `****${activeAccount.accountNumber.slice(-4)}` : 'N/A'}</span>
                </div>
                <p className="text-[10px] font-bold text-[#121212] uppercase tracking-widest mt-2 bg-[#F0F0F0] px-2 py-0.5 inline-block border-2 border-[#121212]">ACC: {activeAccount.name}</p>
              </div>
            </div>
            
            <div className="flex flex-col items-end">
              <div className="flex items-center space-x-2 bg-[#F0F0F0] border-2 border-[#121212] px-3 py-1 shadow-[2px_2px_0px_0px_#121212]">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--profit)] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--profit)]"></span>
                </span>
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--profit)]">{activeAccount.status || 'Active'}</span>
              </div>
              <span className="text-[10px] font-bold text-[#717182] uppercase tracking-widest mt-2">
                Last Sync: <span className="text-[#121212]">{activeAccount.lastSnapshotAt ? new Date(activeAccount.lastSnapshotAt).toLocaleTimeString() : 'Never'}</span>
              </span>
            </div>
          </div>

          {activeAccount.accountType === 'CENT' && (
            <div className="mb-6 border-2 border-[var(--warning)] bg-[var(--warning-dim)] p-3 text-[13px] text-[#121212] font-bold flex items-center gap-2">
              <div className="bg-[var(--warning)] text-white px-2 py-0.5 text-[10px] uppercase tracking-widest border border-white">Cent</div>
              Ini adalah Cent Account (Multiplier: {activeAccount.centMultiplier || 100}). Angka USD di broker mungkin bernilai USC (US Cents).
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#F0F0F0] border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212]">
              <p className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-1">Balance</p>
              <p className="text-2xl font-extrabold text-[#121212] font-number">{formatCurrency(activeAccount.currentBalance, activeAccount.currency)}</p>
            </div>
            <div className="bg-[#F0F0F0] border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212]">
              <p className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-1">Equity</p>
              <p className="text-2xl font-extrabold text-[#121212] font-number">{formatCurrency(activeAccount.currentEquity, activeAccount.currency)}</p>
            </div>
            <div className="bg-[#F0F0F0] border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212]">
              <p className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-1">Free Margin</p>
              <p className="text-2xl font-extrabold text-[#121212] font-number">{formatCurrency(activeAccount.freeMargin, activeAccount.currency)}</p>
            </div>
            <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-8 h-full bg-[var(--profit)] opacity-10 transform skew-x-12" />
              <p className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-1">Net PnL</p>
              <p className={`text-2xl font-extrabold font-number ${netPnl >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                {formatPnL(netPnl, activeAccount.currency)}
              </p>
            </div>

            <div className="bg-white border-2 border-[#121212] p-3 shadow-[2px_2px_0px_0px_#121212]">
              <p className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-0.5">Open Trades</p>
              <p className="text-lg font-extrabold text-[#121212] font-number">{openTrades.length}</p>
            </div>
            <div className="bg-white border-2 border-[#121212] p-3 shadow-[2px_2px_0px_0px_#121212]">
              <p className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-0.5">Closed Trades</p>
              <p className="text-lg font-extrabold text-[#121212] font-number">{closedTrades.length}</p>
            </div>
            <div className="bg-white border-2 border-[#121212] p-3 shadow-[2px_2px_0px_0px_#121212]">
              <p className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-0.5">Today PnL</p>
              <p className={`text-lg font-extrabold font-number ${todayPnl >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                {formatPnL(todayPnl, activeAccount.currency)}
              </p>
            </div>
            <div className="bg-white border-2 border-[#121212] p-3 shadow-[2px_2px_0px_0px_#121212]">
              <p className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-0.5">Winrate</p>
              <p className="text-lg font-extrabold text-[#121212] font-number">{formatPercent(winrate)}</p>
            </div>
            <div className="bg-white border-2 border-[#121212] p-3 shadow-[2px_2px_0px_0px_#121212]">
              <p className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-0.5">Profit Factor</p>
              <p className="text-lg font-extrabold text-[#121212] font-number">{Number(profitFactor || 0).toFixed(2)}</p>
            </div>
            <div className="bg-[var(--profit-dim)] border-2 border-[#121212] p-3 shadow-[2px_2px_0px_0px_#121212]">
              <p className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-0.5">Average Win</p>
              <p className="text-lg font-extrabold text-[var(--profit)] font-number">{formatPnL(averageWin, activeAccount.currency)}</p>
            </div>
            <div className="bg-[var(--loss-dim)] border-2 border-[#121212] p-3 shadow-[2px_2px_0px_0px_#121212]">
              <p className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-0.5">Average Loss</p>
              <p className="text-lg font-extrabold text-[var(--loss)] font-number">{formatPnL(-Math.abs(averageLoss || 0), activeAccount.currency)}</p>
            </div>
            <div className="bg-white border-2 border-[#121212] p-3 shadow-[2px_2px_0px_0px_#121212]">
              <p className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mb-0.5">Max Drawdown</p>
              <p className="text-lg font-extrabold text-[#121212] font-number">-</p>
            </div>
          </div>
          {trades.length === 0 && (
            <div className="mt-6 border-2 border-dashed border-[#121212]/20 bg-[#F0F0F0] p-6 text-[13px] font-bold text-[#717182] uppercase tracking-widest text-center">
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
          <div className="bg-[#F0F0F0] border-2 border-dashed border-[#121212]/20 p-8 text-center text-[#717182] font-bold text-[13px] uppercase tracking-widest">No live equity/balance curve yet.</div>
          <div className="bg-[#F0F0F0] border-2 border-dashed border-[#121212]/20 p-8 text-center text-[#717182] font-bold text-[13px] uppercase tracking-widest">No daily PnL chart yet.</div>
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
          <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212]">
            <SectionLabel label="Open Trades" shape="circle" color="red" className="mb-4 mt-1" />
            {openTrades.length === 0 ? <p className="text-[11px] font-bold uppercase tracking-wider text-[#717182] py-6 text-center bg-[#F0F0F0] border-2 border-dashed border-[#121212]/20">No open trades.</p> : (
              <div className="space-y-3">{openTrades.slice(0, 8).map(t => <div key={t.id} className="flex justify-between items-center text-[13px] font-bold border-2 border-[#121212] rounded-sm p-3 bg-white shadow-[2px_2px_0px_0px_#121212]"><span className="text-[#121212] font-display uppercase tracking-wide">{t.symbol} <Badge variant={t.side === 'LONG' || t.side === 'BUY' ? 'profit' : 'loss'}>{t.side}</Badge></span><span className="text-[#717182] font-number bg-[#F0F0F0] px-2 py-1">{t.lot} Lot @ {t.entryPrice}</span></div>)}</div>
            )}
          </div>
          <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212]">
            <SectionLabel label="Recent Closed Trades" shape="square" color="blue" className="mb-4 mt-1" />
            {closedTrades.length === 0 ? <p className="text-[11px] font-bold uppercase tracking-wider text-[#717182] py-6 text-center bg-[#F0F0F0] border-2 border-dashed border-[#121212]/20">No closed trades yet.</p> : (
              <div className="space-y-3">{closedTrades.slice(0, 8).map(t => <div key={t.id} className="flex justify-between items-center text-[13px] font-bold border-2 border-[#121212] rounded-sm p-3 bg-white shadow-[2px_2px_0px_0px_#121212]"><span className="text-[#121212] font-display uppercase tracking-wide">{t.symbol} <span className="text-[#717182] ml-1">{t.side}</span></span><span className={`font-number px-2 py-1 ${(Number(t.profit) || 0) >= 0 ? 'bg-[var(--profit-dim)] text-[var(--profit)]' : 'bg-[var(--loss-dim)] text-[var(--loss)]'}`}>{formatPnL(t.profit, activeAccount.currency)}</span></div>)}</div>
            )}
          </div>
          <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212]">
            <SectionLabel label="Symbol Performance" shape="diamond" color="yellow" className="mb-4 mt-1" />
            {symbolStats.length === 0 ? <p className="text-[11px] font-bold uppercase tracking-wider text-[#717182] py-6 text-center bg-[#F0F0F0] border-2 border-dashed border-[#121212]/20">No symbol performance yet.</p> : (
              <div className="space-y-3">{symbolStats.map(s => <div key={s.symbol} className="flex justify-between items-center text-[13px] font-bold border-2 border-[#121212] rounded-sm p-3 bg-white shadow-[2px_2px_0px_0px_#121212]"><span className="text-[#121212] font-display uppercase tracking-wide">{s.symbol} <span className="text-[#717182] ml-1 bg-[#F0F0F0] px-1">{s.count} TR</span></span><span className={`font-number px-2 py-1 ${s.pnl >= 0 ? 'bg-[var(--profit-dim)] text-[var(--profit)]' : 'bg-[var(--loss-dim)] text-[var(--loss)]'}`}>{formatPnL(s.pnl, activeAccount.currency)}</span></div>)}</div>
            )}
          </div>
          <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212]">
            <SectionLabel label="Buy vs Sell Performance" shape="circle" color="dark" className="mb-4 mt-1" />
            <div className="space-y-3">{sideStats.map(s => <div key={s.side} className="flex justify-between items-center text-[13px] font-bold border-2 border-[#121212] rounded-sm p-3 bg-white shadow-[2px_2px_0px_0px_#121212]"><span className="text-[#121212] font-display uppercase tracking-wide">{s.side} <span className="text-[#717182] ml-1 bg-[#F0F0F0] px-1">{s.count} TR</span></span><span className={`font-number px-2 py-1 ${s.pnl >= 0 ? 'bg-[var(--profit-dim)] text-[var(--profit)]' : 'bg-[var(--loss-dim)] text-[var(--loss)]'}`}>{formatPnL(s.pnl, activeAccount.currency)}</span></div>)}</div>
          </div>
        </div>
      )}

      {/* Add Trade Form */}
      {isAdding && (
        <div className="bg-white border-4 border-[#121212] rounded-xl p-8 shadow-[12px_12px_0px_0px_#121212] relative z-20 animate-fade-in mt-8">
          <div className="absolute top-0 left-0 right-0 h-[4px] bg-[#1040C0]" />
          <h2 className="text-2xl font-extrabold text-[#121212] font-display uppercase tracking-wide mb-6">Log New Trade</h2>
          <form onSubmit={handleAddTrade} className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#121212] mb-1.5">Symbol</label>
                <input type="text" required value={formData.symbol} onChange={e => setFormData({...formData, symbol: e.target.value.toUpperCase()})}
                  className="input font-bold uppercase" placeholder="XAUUSD" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#121212] mb-1.5">Side</label>
                <select value={formData.side} onChange={e => setFormData({...formData, side: e.target.value})}
                  className="input font-bold cursor-pointer">
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#121212] mb-1.5">Lot Size</label>
                <input type="number" required step="0.01" value={formData.lot} onChange={e => setFormData({...formData, lot: e.target.value})}
                  className="input font-bold" placeholder="0.01" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#121212] mb-1.5">Entry Price</label>
                <input type="number" required step="0.00001" value={formData.entryPrice} onChange={e => setFormData({...formData, entryPrice: e.target.value})}
                  className="input font-bold" placeholder="1.1000" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#121212] mb-1.5">Stop Loss</label>
                <input type="number" step="0.00001" value={formData.stopLoss} onChange={e => setFormData({...formData, stopLoss: e.target.value})}
                  className="input font-bold" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#121212] mb-1.5">Take Profit</label>
                <input type="number" step="0.00001" value={formData.takeProfit} onChange={e => setFormData({...formData, takeProfit: e.target.value})}
                  className="input font-bold" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#121212] mb-1.5">Open Time</label>
                <input type="datetime-local" required value={formData.openTime} onChange={e => setFormData({...formData, openTime: e.target.value})}
                  className="input font-bold text-[13px]" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#121212] mb-1.5">Close Time</label>
                <input type="datetime-local" value={formData.closeTime} onChange={e => setFormData({...formData, closeTime: e.target.value})}
                  className="input font-bold text-[13px]" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#121212] mb-1.5">Close Price</label>
                <input type="number" step="0.00001" value={formData.closePrice} onChange={e => setFormData({...formData, closePrice: e.target.value})}
                  className="input font-bold" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#121212] mb-1.5">Net Profit</label>
                <input type="number" step="0.01" value={formData.profit} onChange={e => setFormData({...formData, profit: e.target.value})}
                  className="input font-bold" placeholder="e.g. 50" />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#121212] mb-1.5">Notes</label>
                <input type="text" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}
                  className="input font-bold" placeholder="Why did you take this trade?" />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 pt-6 border-t-4 border-[#121212] border-dashed">
              <Button type="button" variant="secondary" onClick={() => setIsAdding(false)}>Cancel</Button>
              <Button type="submit" variant="blue" disabled={loading} isLoading={loading}>
                Save Trade
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Trades Table */}
      <div className="bg-white border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212] overflow-hidden">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time / Symbol</th>
                <th>Side / Lot</th>
                <th>Entry / SL / TP</th>
                <th>Profit</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[#717182] font-bold text-[13px] uppercase tracking-widest bg-[#F0F0F0]">
                    <FileText className="w-8 h-8 mx-auto mb-3 opacity-50" />
                    No live trades yet. Add manual trade or sync with MT5.
                  </td>
                </tr>
              ) : (
                trades.slice(0, 100).map((t) => (
                  <tr key={t.id} className="hover:bg-[#F0F0F0] transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-extrabold text-[#121212] font-display text-[15px]">{t.symbol}</div>
                      <div className="text-[11px] font-bold text-[#717182] uppercase tracking-wider mt-1">{formatTradeTime(t.openTime)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={t.side === 'BUY' || t.side === 'LONG' ? 'profit' : 'loss'}>
                        {t.side === 'BUY' || t.side === 'LONG' ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                        {t.side}
                      </Badge>
                      <div className="text-[#121212] font-bold text-[13px] mt-2 font-number">{t.lot} Lot</div>
                    </td>
                    <td className="px-6 py-4 font-number text-[13px] font-bold text-[#121212] space-y-1">
                      <div><span className="text-[#717182] mr-1">E:</span>{t.entryPrice}</div>
                      {t.stopLoss && <div className="text-[11px]"><span className="text-[#717182] mr-1">SL:</span>{t.stopLoss}</div>}
                      {t.takeProfit && <div className="text-[11px]"><span className="text-[#717182] mr-1">TP:</span>{t.takeProfit}</div>}
                    </td>
                    <td className="px-6 py-4">
                      {t.profit !== null ? (
                        <div className={`font-extrabold font-number text-[15px] ${t.profit > 0 ? 'text-[var(--profit)]' : t.profit < 0 ? 'text-[var(--loss)]' : 'text-[#717182]'}`}>
                          {formatPnL(t.profit, activeAccount?.currency || 'USD')}
                        </div>
                      ) : (
                        <span className="text-[#121212] text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-[#F0C020] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212]">Open</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => {
                        if(window.confirm('Delete this trade?')) useLiveJournalStore.getState().deleteTrade(t.id);
                      }} className="text-[11px] font-extrabold uppercase tracking-widest text-[#717182] hover:text-[var(--loss)] hover:underline transition-colors">
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
    <WidgetErrorBoundary>
      <LiveJournalContent />
    </WidgetErrorBoundary>
  );
}
