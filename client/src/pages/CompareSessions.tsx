import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import { useJournalStore } from '../store/useJournalStore';
import { formatUsd, formatPercent } from '../utils/formatters';

export default function CompareSessions() {
  const { sessions } = useJournalStore();
  const [selected, setSelected] = useState<string[]>([]);

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <Zap className="w-12 h-12 text-gray-600" />
        <h2 className="text-xl font-bold text-gray-300">Belum ada sesi</h2>
        <p className="text-sm text-gray-500">Buat beberapa sesi terlebih dahulu untuk membandingkannya.</p>
      </div>
    );
  }

  const selectedSessions = sessions.filter((s) => selected.includes(s.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">
          Perbandingan Sesi
        </h1>
        <p className="text-sm text-gray-400 mt-2">
          Bandingkan performa antar sesi backtest untuk menemukan strategi terbaik.
        </p>
      </div>

      {/* Session Selector */}
      <div className="glass-card rounded-xl border border-gray-800 p-6">
        <h3 className="font-bold text-white mb-4">Pilih Sesi untuk Dibandingkan</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => {
                if (selected.includes(session.id)) {
                  setSelected(selected.filter((id) => id !== session.id));
                } else {
                  setSelected([...selected, session.id]);
                }
              }}
              className={`p-4 rounded-lg border-2 transition text-left ${
                selected.includes(session.id)
                  ? 'bg-accentCyan/20 border-accentCyan/40'
                  : 'bg-gray-800/20 border-gray-700/30 hover:border-gray-700'
              }`}
            >
              <div className="font-bold text-white">{session.name}</div>
              <div className="text-xs text-gray-400 mt-1">
                {session.symbol} • {session.timeframe}
              </div>
              <div className="text-sm mt-2">
                <span
                  className={
                    session.netPnlUsd >= 0 ? 'text-accentEmerald' : 'text-lossRed'
                  }
                >
                  {formatUsd(session.netPnlUsd)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Comparison Table */}
      {selectedSessions.length > 0 && (
        <div className="glass-card rounded-xl border border-gray-800 p-6 overflow-x-auto">
          <h3 className="font-bold text-white mb-4">Perbandingan Metrik</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-3 px-4 text-gray-400 font-semibold">Metrik</th>
                {selectedSessions.map((s) => (
                  <th key={s.id} className="text-right py-3 px-4 text-gray-400 font-semibold">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-800">
                <td className="py-3 px-4 text-gray-300">Total Trades</td>
                {selectedSessions.map((s) => (
                  <td key={s.id} className="text-right py-3 px-4 text-white font-semibold">
                    {s.tradeCount}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-800">
                <td className="py-3 px-4 text-gray-300">Winrate</td>
                {selectedSessions.map((s) => (
                  <td key={s.id} className="text-right py-3 px-4 text-white font-semibold">
                    {formatPercent(s.winrate)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-800">
                <td className="py-3 px-4 text-gray-300">Net PnL (USD)</td>
                {selectedSessions.map((s) => (
                  <td
                    key={s.id}
                    className={`text-right py-3 px-4 font-bold ${
                      s.netPnlUsd >= 0 ? 'text-accentEmerald' : 'text-lossRed'
                    }`}
                  >
                    {formatUsd(s.netPnlUsd)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-800">
                <td className="py-3 px-4 text-gray-300">Net PnL %</td>
                {selectedSessions.map((s) => (
                  <td
                    key={s.id}
                    className={`text-right py-3 px-4 font-bold ${
                      s.netPnlPct >= 0 ? 'text-accentEmerald' : 'text-lossRed'
                    }`}
                  >
                    {formatPercent(s.netPnlPct)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 px-4 text-gray-300">Ending Balance</td>
                {selectedSessions.map((s) => (
                  <td key={s.id} className="text-right py-3 px-4 text-white font-semibold">
                    {formatUsd(s.endingBalance)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {selectedSessions.length === 0 && (
        <div className="text-center py-12 text-gray-500 italic">
          Pilih minimal 1 sesi untuk melihat perbandingan
        </div>
      )}
    </div>
  );
}
