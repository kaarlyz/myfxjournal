import React, { useEffect, useState } from 'react';
import { useLiveJournalStore } from '../store/useLiveJournalStore';
import { Activity, Plus, FileText, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';

export default function LiveJournal() {
  const { accounts, activeAccountId, setActiveAccountId, trades, summary, loading, fetchAccounts, fetchTrades, fetchSummary } = useLiveJournalStore();
  const [isAdding, setIsAdding] = useState(false);
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

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white/5 rounded-2xl border border-white/10">
        <Activity className="w-12 h-12 text-gray-500 mb-4 opacity-50" />
        <h2 className="text-xl font-bold text-white mb-2">No Trading Accounts</h2>
        <p className="text-gray-400 text-sm mb-4">You need to create a trading account first to log live trades.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-white">Live Journal</h1>
          <select value={activeAccountId || ''} onChange={(e) => setActiveAccountId(e.target.value)}
            className="bg-black/60 border border-white/10 rounded-lg py-2 px-3 text-white focus:border-accentBlue outline-none text-sm cursor-pointer appearance-none">
            {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>)}
          </select>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={() => { fetchTrades(); fetchSummary(); }} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition" title="Refresh">
            <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setIsAdding(!isAdding)} className="px-4 py-2 bg-accentBlue text-white text-sm font-semibold rounded-lg hover:bg-accentBlue/80 transition flex items-center space-x-2">
            <Plus className="w-4 h-4" />
            <span>Add Manual Trade</span>
          </button>
        </div>
      </div>

      {/* Dashboard Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <div className="bg-black/40 border border-white/5 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Winrate</p>
            <p className="text-2xl font-bold text-white">{summary.winrate.toFixed(1)}%</p>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Net PnL</p>
            <p className={`text-2xl font-bold ${summary.netPnl >= 0 ? 'text-winGreen' : 'text-lossRed'}`}>
              ${summary.netPnl.toFixed(2)}
            </p>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Total Trades</p>
            <p className="text-2xl font-bold text-white">{summary.totalTrades}</p>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Profit Factor</p>
            <p className="text-2xl font-bold text-white">{summary.profitFactor.toFixed(2)}</p>
          </div>
          <div className="bg-black/40 border border-white/5 rounded-xl p-4 hidden lg:block">
            <p className="text-xs text-gray-500 mb-1">Balance Estimate</p>
            <p className="text-2xl font-bold text-accentBlue">${summary.currentBalance.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Add Trade Form */}
      {isAdding && (
        <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 relative z-20">
          <h2 className="text-lg font-bold text-white mb-4">Log New Trade</h2>
          <form onSubmit={handleAddTrade} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Symbol</label>
                <input type="text" required value={formData.symbol} onChange={e => setFormData({...formData, symbol: e.target.value.toUpperCase()})}
                  className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-3 text-white uppercase text-sm" placeholder="XAUUSD" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Side</label>
                <select value={formData.side} onChange={e => setFormData({...formData, side: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-3 text-white text-sm appearance-none cursor-pointer">
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Lot Size</label>
                <input type="number" required step="0.01" value={formData.lot} onChange={e => setFormData({...formData, lot: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-3 text-white text-sm" placeholder="0.01" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Entry Price</label>
                <input type="number" required step="0.00001" value={formData.entryPrice} onChange={e => setFormData({...formData, entryPrice: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-3 text-white text-sm" placeholder="1.1000" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Stop Loss</label>
                <input type="number" step="0.00001" value={formData.stopLoss} onChange={e => setFormData({...formData, stopLoss: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-3 text-white text-sm" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Take Profit</label>
                <input type="number" step="0.00001" value={formData.takeProfit} onChange={e => setFormData({...formData, takeProfit: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-3 text-white text-sm" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Open Time</label>
                <input type="datetime-local" required value={formData.openTime} onChange={e => setFormData({...formData, openTime: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-3 text-white text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Close Time (If closed)</label>
                <input type="datetime-local" value={formData.closeTime} onChange={e => setFormData({...formData, closeTime: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-3 text-white text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Close Price</label>
                <input type="number" step="0.00001" value={formData.closePrice} onChange={e => setFormData({...formData, closePrice: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-3 text-white text-sm" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Net Profit (Money)</label>
                <input type="number" step="0.01" value={formData.profit} onChange={e => setFormData({...formData, profit: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-3 text-white text-sm" placeholder="e.g. 50 or -20" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-400 mb-1">Notes</label>
                <input type="text" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-3 text-white text-sm" placeholder="Why did you take this trade?" />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-4">
              <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 bg-transparent text-gray-400 hover:text-white transition text-sm">Cancel</button>
              <button type="submit" disabled={loading} className="px-4 py-2 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition text-sm">
                Save Trade
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Trades Table */}
      <div className="bg-black/40 border border-white/5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-white/5 text-gray-400 text-xs uppercase">
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
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No trades logged yet for this account.
                  </td>
                </tr>
              ) : (
                trades.map((t) => (
                  <tr key={t.id} className="hover:bg-white/[0.02] transition">
                    <td className="px-6 py-4">
                      <div className="font-bold text-white">{t.symbol}</div>
                      <div className="text-xs text-gray-500">{new Date(t.openTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' })}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${t.side === 'BUY' ? 'bg-winGreen/20 text-winGreen' : 'bg-lossRed/20 text-lossRed'}`}>
                        {t.side === 'BUY' ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                        {t.side}
                      </span>
                      <div className="text-gray-400 mt-1">{t.lot} Lot</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-gray-300">
                      <div>E: {t.entryPrice}</div>
                      {t.stopLoss && <div className="text-xs text-gray-500">SL: {t.stopLoss}</div>}
                      {t.takeProfit && <div className="text-xs text-gray-500">TP: {t.takeProfit}</div>}
                    </td>
                    <td className="px-6 py-4">
                      {t.profit !== null ? (
                        <div className={`font-bold ${t.profit > 0 ? 'text-winGreen' : t.profit < 0 ? 'text-lossRed' : 'text-gray-400'}`}>
                          {t.profit > 0 ? '+' : ''}{t.profit.toFixed(2)}
                        </div>
                      ) : (
                        <span className="text-gray-500 text-xs uppercase px-2 py-1 bg-white/5 rounded">Open</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => {
                        if(window.confirm('Delete this trade?')) useLiveJournalStore.getState().deleteTrade(t.id);
                      }} className="text-gray-500 hover:text-lossRed transition">
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
