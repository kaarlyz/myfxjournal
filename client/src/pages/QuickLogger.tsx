import React, { useState } from 'react';
import { LogIn, LogOut, RotateCcw, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import { useJournalStore } from '../store/useJournalStore';
import { formatUsd, formatR } from '../utils/formatters';

export default function QuickLogger() {
  const { activeSessionId, activeSessionDetails } = useJournalStore();

  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  const [entryPrice, setEntryPrice] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [tpPrice, setTpPrice] = useState('');
  const [riskUsd, setRiskUsd] = useState('');
  const [riskPct, setRiskPct] = useState('');
  const [setupTag, setSetupTag] = useState('');
  const [notes, setNotes] = useState('');
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [isTradeActive, setIsTradeActive] = useState(false);

  if (!activeSessionId || !activeSessionDetails) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <Zap className="w-12 h-12 text-gray-600" />
        <h2 className="text-xl font-bold text-gray-300">Tidak ada sesi aktif</h2>
        <p className="text-sm text-gray-500">Pilih sesi dari sidebar untuk mulai logging trade.</p>
      </div>
    );
  }

  const handleEntryLong = () => {
    setSide('LONG');
    setIsTradeActive(true);
  };

  const handleEntryShort = () => {
    setSide('SHORT');
    setIsTradeActive(true);
  };

  const handleExitWin = async () => {
    // TODO: Implement exit logic
    setIsTradeActive(false);
  };

  const handleExitLoss = async () => {
    // TODO: Implement exit logic
    setIsTradeActive(false);
  };

  const handleExitBE = async () => {
    // TODO: Implement exit logic
    setIsTradeActive(false);
  };

  const handleUndo = () => {
    // TODO: Implement undo
  };

  const handleReset = () => {
    if (confirm('Reset semua trade dalam session ini? Tindakan tidak bisa dibatalkan.')) {
      // TODO: Implement reset
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Quick Logger
          </h1>
          <p className="text-sm text-gray-400 mt-2">
            Logging cepat trade manual sambil Bar Replay di TradingView
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setMode('simple')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
              mode === 'simple'
                ? 'bg-accentCyan/20 text-accentCyan border border-accentCyan/40'
                : 'bg-gray-800/40 text-gray-400 hover:bg-gray-800'
            }`}
          >
            Mode Cepat
          </button>
          <button
            onClick={() => setMode('advanced')}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
              mode === 'advanced'
                ? 'bg-accentCyan/20 text-accentCyan border border-accentCyan/40'
                : 'bg-gray-800/40 text-gray-400 hover:bg-gray-800'
            }`}
          >
            Mode Detail
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel: Entry/Exit Buttons */}
        <div className="lg:col-span-1 space-y-4">
          <div className="glass-card rounded-xl border border-gray-800 p-6">
            <h3 className="font-bold text-white mb-4">Entry</h3>
            <div className="space-y-3">
              <button
                onClick={handleEntryLong}
                disabled={isTradeActive}
                className="w-full bg-accentEmerald/20 hover:bg-accentEmerald/30 disabled:opacity-50 text-accentEmerald font-bold py-3 rounded-lg flex items-center justify-center space-x-2 transition"
              >
                <LogIn className="w-5 h-5" />
                <span>Entry Long</span>
              </button>
              <button
                onClick={handleEntryShort}
                disabled={isTradeActive}
                className="w-full bg-lossRed/20 hover:bg-lossRed/30 disabled:opacity-50 text-lossRed font-bold py-3 rounded-lg flex items-center justify-center space-x-2 transition"
              >
                <LogIn className="w-5 h-5" />
                <span>Entry Short</span>
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-800">
              <h3 className="font-bold text-white mb-4">Exit</h3>
              <div className="space-y-3">
                <button
                  onClick={handleExitWin}
                  disabled={!isTradeActive}
                  className="w-full bg-accentEmerald/20 hover:bg-accentEmerald/30 disabled:opacity-50 text-accentEmerald font-bold py-3 rounded-lg flex items-center justify-center space-x-2 transition"
                >
                  <TrendingUp className="w-5 h-5" />
                  <span>Exit Win</span>
                </button>
                <button
                  onClick={handleExitLoss}
                  disabled={!isTradeActive}
                  className="w-full bg-lossRed/20 hover:bg-lossRed/30 disabled:opacity-50 text-lossRed font-bold py-3 rounded-lg flex items-center justify-center space-x-2 transition"
                >
                  <TrendingDown className="w-5 h-5" />
                  <span>Exit Loss</span>
                </button>
                <button
                  onClick={handleExitBE}
                  disabled={!isTradeActive}
                  className="w-full bg-gray-700/40 hover:bg-gray-700/60 disabled:opacity-50 text-gray-300 font-bold py-3 rounded-lg transition"
                >
                  <span>Exit BE</span>
                </button>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-800 space-y-3">
              <button
                onClick={handleUndo}
                className="w-full bg-gray-800/40 hover:bg-gray-800 text-gray-300 font-semibold py-2 rounded-lg transition"
              >
                Undo
              </button>
              <button
                onClick={handleReset}
                className="w-full bg-lossRed/10 hover:bg-lossRed/20 text-lossRed font-semibold py-2 rounded-lg flex items-center justify-center space-x-2 transition"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset Session</span>
              </button>
            </div>
          </div>
        </div>

        {/* Center Panel: Trade Form */}
        <div className="lg:col-span-1">
          <div className="glass-card rounded-xl border border-gray-800 p-6 space-y-4">
            <h3 className="font-bold text-white">Form Entry</h3>

            {mode === 'simple' ? (
              <div className="space-y-3 text-sm">
                <p className="text-gray-400 italic">Mode cepat: Tinggal pilih RR default lalu klik WIN/LOSS/BE</p>
                {/* Simple mode implementation later */}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Entry Price</label>
                  <input
                    type="number"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-gray-800/40 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-accentCyan"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Exit Price</label>
                  <input
                    type="number"
                    value={exitPrice}
                    onChange={(e) => setExitPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-gray-800/40 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-accentCyan"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">SL</label>
                    <input
                      type="number"
                      value={slPrice}
                      onChange={(e) => setSlPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-gray-800/40 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-accentCyan"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">TP</label>
                    <input
                      type="number"
                      value={tpPrice}
                      onChange={(e) => setTpPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-gray-800/40 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-accentCyan"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Risk USD</label>
                    <input
                      type="number"
                      value={riskUsd}
                      onChange={(e) => setRiskUsd(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-gray-800/40 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-accentCyan"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Risk %</label>
                    <input
                      type="number"
                      value={riskPct}
                      onChange={(e) => setRiskPct(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-gray-800/40 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-accentCyan"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Setup Tag</label>
                  <input
                    type="text"
                    value={setupTag}
                    onChange={(e) => setSetupTag(e.target.value)}
                    placeholder="SNR, Fibo, Breakout, ..."
                    className="w-full bg-gray-800/40 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-accentCyan"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Catatan singkat tentang trade ini"
                    rows={3}
                    className="w-full bg-gray-800/40 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-accentCyan resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Session Stats & Recent Trades */}
        <div className="lg:col-span-1 space-y-4">
          {/* Session Stats */}
          <div className="glass-card rounded-xl border border-gray-800 p-6">
            <h3 className="font-bold text-white mb-4">Session Stats</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Trades:</span>
                <span className="text-white font-semibold">{activeSessionDetails?.trades.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Win:</span>
                <span className="text-accentEmerald font-semibold">
                  {activeSessionDetails?.trades.filter((t) => t.result === 'WIN').length || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Loss:</span>
                <span className="text-lossRed font-semibold">
                  {activeSessionDetails?.trades.filter((t) => t.result === 'LOSS').length || 0}
                </span>
              </div>
              <div className="flex justify-between border-t border-gray-800 pt-3 mt-3">
                <span className="text-gray-400">Net PnL:</span>
                <span
                  className={`font-bold ${
                    (activeSessionDetails?.metrics.netPnlUsd || 0) >= 0
                      ? 'text-accentEmerald'
                      : 'text-lossRed'
                  }`}
                >
                  {formatUsd(activeSessionDetails?.metrics.netPnlUsd || 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Winrate:</span>
                <span className="text-white font-semibold">
                  {((activeSessionDetails?.metrics.winrate || 0) * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Recent Trades */}
          <div className="glass-card rounded-xl border border-gray-800 p-6">
            <h3 className="font-bold text-white mb-4">Recent Trades</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(activeSessionDetails?.trades || []).slice(-5).reverse().map((trade) => (
                <div
                  key={trade.id}
                  className={`p-3 rounded-lg text-xs border ${
                    trade.result === 'WIN'
                      ? 'bg-accentEmerald/5 border-accentEmerald/20'
                      : trade.result === 'LOSS'
                      ? 'bg-lossRed/5 border-lossRed/20'
                      : 'bg-gray-800/20 border-gray-700/30'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-white">
                      {trade.side} #{trade.tradeNumber}
                    </span>
                    <span
                      className={
                        trade.result === 'WIN'
                          ? 'text-accentEmerald font-bold'
                          : trade.result === 'LOSS'
                          ? 'text-lossRed font-bold'
                          : 'text-gray-400 font-bold'
                      }
                    >
                      {formatUsd(trade.netPnlUsd || 0)}
                    </span>
                  </div>
                  {trade.rMultiple && <div className="text-gray-500 mt-1">{formatR(trade.rMultiple)}</div>}
                </div>
              ))}
              {(!activeSessionDetails?.trades || activeSessionDetails.trades.length === 0) && (
                <p className="text-gray-600 italic text-center py-4">Belum ada trade</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
