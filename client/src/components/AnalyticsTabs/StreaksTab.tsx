import React from 'react';
import { Flame, TrendingDown, Calendar, Trophy } from 'lucide-react';
import { SectionLabel } from '../ui/SectionLabel';

interface Props {
  metrics: any;
  trades: any[];
}

export default function StreaksTab({ metrics, trades }: Props) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-[var(--profit)] opacity-10 rounded-full transform translate-x-1/2 -translate-y-1/2" />
          <div className="text-[10px] text-[#717182] uppercase font-bold tracking-wider flex items-center gap-1.5 mb-1"><Flame className="w-3.5 h-3.5 text-[var(--profit)]" /> Max Consecutive Wins</div>
          <div className="text-2xl font-extrabold text-[var(--profit)] font-number">
            {metrics.maxConsecutiveWins} <span className="text-[10px] text-[#121212] uppercase tracking-wider font-bold font-sans">Trades</span>
          </div>
        </div>
        <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-[var(--loss)] opacity-10 rounded-full transform translate-x-1/2 -translate-y-1/2" />
          <div className="text-[10px] text-[#717182] uppercase font-bold tracking-wider flex items-center gap-1.5 mb-1"><TrendingDown className="w-3.5 h-3.5 text-[var(--loss)]" /> Max Consecutive Losses</div>
          <div className="text-2xl font-extrabold text-[var(--loss)] font-number">
            {metrics.maxConsecutiveLosses} <span className="text-[10px] text-[#121212] uppercase tracking-wider font-bold font-sans">Trades</span>
          </div>
        </div>
        <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-[var(--profit)] opacity-10 rounded-full transform translate-x-1/2 -translate-y-1/2" />
          <div className="text-[10px] text-[#717182] uppercase font-bold tracking-wider flex items-center gap-1.5 mb-1"><Calendar className="w-3.5 h-3.5 text-[var(--profit)]" /> Max Win Days</div>
          <div className="text-2xl font-extrabold text-[var(--profit)] font-number">
            {metrics.maxConsecutiveProfitableDays} <span className="text-[10px] text-[#121212] uppercase tracking-wider font-bold font-sans">Days</span>
          </div>
        </div>
        <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-[var(--loss)] opacity-10 rounded-full transform translate-x-1/2 -translate-y-1/2" />
          <div className="text-[10px] text-[#717182] uppercase font-bold tracking-wider flex items-center gap-1.5 mb-1"><Calendar className="w-3.5 h-3.5 text-[var(--loss)]" /> Max Loss Days</div>
          <div className="text-2xl font-extrabold text-[var(--loss)] font-number">
            {metrics.maxConsecutiveLosingDays} <span className="text-[10px] text-[#121212] uppercase tracking-wider font-bold font-sans">Days</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[var(--profit-dim)] border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212] relative">
          <div className="absolute top-0 left-0 bottom-0 w-2 bg-[var(--profit)]" />
          <SectionLabel label="Best Day" shape="square" color="dark" icon={<Trophy className="w-4 h-4 text-[var(--profit)]" />} className="ml-2 mb-2" />
          {metrics.bestDay ? (
            <div className="ml-2 mt-2">
              <p className="text-3xl font-extrabold text-[#121212] font-display">{metrics.bestDay}</p>
            </div>
          ) : (
            <p className="text-xs font-bold text-[#717182] ml-2 mt-2 uppercase tracking-widest">No profitable days recorded.</p>
          )}
        </div>
        
        <div className="bg-[var(--loss-dim)] border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212] relative">
          <div className="absolute top-0 left-0 bottom-0 w-2 bg-[var(--loss)]" />
          <SectionLabel label="Worst Day" shape="square" color="dark" icon={<TrendingDown className="w-4 h-4 text-[var(--loss)]" />} className="ml-2 mb-2" />
          {metrics.worstDay ? (
            <div className="ml-2 mt-2">
              <p className="text-3xl font-extrabold text-[#121212] font-display">{metrics.worstDay}</p>
            </div>
          ) : (
            <p className="text-xs font-bold text-[#717182] ml-2 mt-2 uppercase tracking-widest">No losing days recorded.</p>
          )}
        </div>
      </div>
    </div>
  );
}
