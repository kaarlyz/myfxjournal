import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import { useJournalStore } from '../store/useJournalStore';
import { formatUsd, formatPercent } from '../utils/formatters';
import { PageHeader, SectionLabel } from '../components/ui/SectionLabel';

export default function CompareSessions() {
  const { sessions } = useJournalStore();
  const [selected, setSelected] = useState<string[]>([]);

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212]">
        <div className="w-16 h-16 bg-[#F0F0F0] border-2 border-[#121212] flex items-center justify-center mb-6 shadow-[4px_4px_0px_0px_#121212]">
          <Zap className="w-8 h-8 text-[#121212]" strokeWidth={2.5} />
        </div>
        <h2 className="text-2xl font-extrabold text-[#121212] uppercase tracking-wide mb-2">Belum ada sesi</h2>
        <p className="text-[14px] font-bold text-[#717182]">Buat beberapa sesi terlebih dahulu untuk membandingkannya.</p>
      </div>
    );
  }

  const selectedSessions = sessions.filter((s) => selected.includes(s.id));

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <PageHeader 
        label="Analytics"
        title="Perbandingan Sesi"
        subtitle="Bandingkan performa antar sesi backtest untuk menemukan strategi terbaik."
        labelColor="blue"
      />

      {/* Session Selector */}
      <div className="bg-white border-4 border-[#121212] p-6 md:p-8 shadow-[8px_8px_0px_0px_#121212] relative">
        <div className="absolute top-0 left-0 right-0 h-3 bg-[#121212]" />
        
        <SectionLabel label="Pilih Sesi untuk Dibandingkan" shape="square" color="dark" className="mt-2 mb-6" />
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
              className={`p-5 border-2 transition-all text-left flex flex-col items-start ${
                selected.includes(session.id)
                  ? 'bg-[#1040C0] border-[#121212] shadow-[4px_4px_0px_0px_#121212] -translate-y-1 text-white'
                  : 'bg-white border-[#121212] hover:bg-[#F0F0F0] shadow-none hover:shadow-[4px_4px_0px_0px_#121212] text-[#121212] hover:-translate-y-1'
              }`}
            >
              <div className="font-extrabold uppercase tracking-wide text-[15px] mb-1">{session.name}</div>
              <div className={`text-[12px] font-bold mb-3 ${selected.includes(session.id) ? 'text-white/80' : 'text-[#717182]'}`}>
                {session.symbol} • {session.timeframe}
              </div>
              <div className="mt-auto">
                <span
                  className={`text-[16px] font-black font-number ${
                    selected.includes(session.id)
                      ? 'text-white'
                      : session.netPnlUsd >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'
                  }`}
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
        <div className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] overflow-hidden">
          <div className="p-6 border-b-4 border-[#121212] bg-[#F0F0F0]">
             <SectionLabel label="Perbandingan Metrik" shape="circle" color="blue" />
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#121212] text-white">
                  <th className="py-4 px-6 font-extrabold uppercase tracking-widest text-[12px] border-r-2 border-[#121212] whitespace-nowrap">Metrik</th>
                  {selectedSessions.map((s) => (
                    <th key={s.id} className="py-4 px-6 font-extrabold uppercase tracking-widest text-[12px] border-r-2 border-[#121212] last:border-r-0 min-w-[200px]">
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-[14px] font-bold">
                <tr className="border-b-2 border-[#121212] hover:bg-[#F0F0F0] transition-colors">
                  <td className="py-4 px-6 border-r-2 border-[#121212] text-[#717182] uppercase tracking-wider text-[11px] font-extrabold">Total Trades</td>
                  {selectedSessions.map((s) => (
                    <td key={s.id} className="py-4 px-6 border-r-2 border-[#121212] last:border-r-0 font-number text-[#121212]">
                      {s.tradeCount}
                    </td>
                  ))}
                </tr>
                <tr className="border-b-2 border-[#121212] hover:bg-[#F0F0F0] transition-colors">
                  <td className="py-4 px-6 border-r-2 border-[#121212] text-[#717182] uppercase tracking-wider text-[11px] font-extrabold">Winrate</td>
                  {selectedSessions.map((s) => (
                    <td key={s.id} className="py-4 px-6 border-r-2 border-[#121212] last:border-r-0 font-number text-[#121212]">
                      {formatPercent(s.winrate)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b-2 border-[#121212] hover:bg-[#F0F0F0] transition-colors">
                  <td className="py-4 px-6 border-r-2 border-[#121212] text-[#717182] uppercase tracking-wider text-[11px] font-extrabold">Net PnL (USD)</td>
                  {selectedSessions.map((s) => (
                    <td
                      key={s.id}
                      className={`py-4 px-6 border-r-2 border-[#121212] last:border-r-0 font-black font-number ${
                        s.netPnlUsd >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'
                      }`}
                    >
                      {formatUsd(s.netPnlUsd)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b-2 border-[#121212] hover:bg-[#F0F0F0] transition-colors">
                  <td className="py-4 px-6 border-r-2 border-[#121212] text-[#717182] uppercase tracking-wider text-[11px] font-extrabold">Net PnL %</td>
                  {selectedSessions.map((s) => (
                    <td
                      key={s.id}
                      className={`py-4 px-6 border-r-2 border-[#121212] last:border-r-0 font-black font-number ${
                        s.netPnlPct >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'
                      }`}
                    >
                      {formatPercent(s.netPnlPct)}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-[#F0F0F0] transition-colors">
                  <td className="py-4 px-6 border-r-2 border-[#121212] text-[#717182] uppercase tracking-wider text-[11px] font-extrabold">Ending Balance</td>
                  {selectedSessions.map((s) => (
                    <td key={s.id} className="py-4 px-6 border-r-2 border-[#121212] last:border-r-0 font-number text-[#121212]">
                      {formatUsd(s.endingBalance)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedSessions.length === 0 && (
        <div className="text-center py-12 text-[#717182] font-bold bg-[#F0F0F0] border-2 border-dashed border-[#121212]/30">
          Pilih minimal 1 sesi untuk melihat perbandingan
        </div>
      )}
    </div>
  );
}
