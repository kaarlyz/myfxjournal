import React from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { SectionLabel } from './ui/SectionLabel';

export default function Mt5VerdictCard({ analysis }: { analysis: any }) {
  const label = analysis?.rating?.label || 'Unknown';
  const score = analysis?.rating?.score ?? 0;
  const incomplete = label === 'Incomplete';
  const isDangerous = label === 'Dangerous' || incomplete;
  const isWeak = label === 'Weak';
  const colorClass = isDangerous ? 'bg-[var(--loss-dim)] text-[var(--loss)] border-[var(--loss)]' : isWeak ? 'bg-[var(--warning-dim)] text-[var(--warning)] border-[var(--warning)]' : 'bg-[var(--profit-dim)] text-[var(--profit)] border-[var(--profit)]';
  const Icon = isDangerous ? ShieldAlert : isWeak ? AlertTriangle : CheckCircle2;
  const iconColor = isDangerous ? 'text-[var(--loss)]' : isWeak ? 'text-[var(--warning)]' : 'text-[var(--profit)]';
  const shape = isDangerous ? 'circle' : isWeak ? 'diamond' : 'square';

  return (
    <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212] relative mt-4">
      <SectionLabel label="Automated Verdict" shape={shape} color={isDangerous ? 'red' : isWeak ? 'yellow' : 'blue'} className="absolute -top-3 left-4" />
      <div className="flex items-start gap-4 mt-3">
        <div className={`p-3 border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] ${colorClass}`}>
          <Icon className="w-6 h-6" strokeWidth={2.5} />
        </div>
        <div className="space-y-3 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-extrabold text-[#121212] font-display uppercase tracking-wide">Verdict: {label}</h2>
            <span className={`px-2 py-0.5 border-2 border-[#121212] text-[13px] font-extrabold uppercase tracking-widest shadow-[2px_2px_0px_0px_#121212] ${colorClass}`}>
              {incomplete ? 'N/A' : `${score}/100`}
            </span>
          </div>
          <p className="text-[14px] font-semibold leading-relaxed text-[#121212] max-w-3xl">{analysis?.verdict || '-'}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {(analysis?.rating?.reasons || []).map((reason: string) => (
              <span key={reason} className="text-[11px] px-2 py-1 bg-[#F0F0F0] border-2 border-[#121212] text-[#121212] font-bold uppercase tracking-wider shadow-[2px_2px_0px_0px_#121212]">
                {reason}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
