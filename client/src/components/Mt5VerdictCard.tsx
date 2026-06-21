import React from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function Mt5VerdictCard({ analysis }: { analysis: any }) {
  const label = analysis?.rating?.label || 'Unknown';
  const score = analysis?.rating?.score ?? 0;
  const incomplete = label === 'Incomplete';
  const color = label === 'Dangerous' || incomplete ? '#f6465d' : label === 'Weak' ? '#f0b90b' : '#0ecb81';
  const Icon = label === 'Dangerous' || incomplete ? ShieldAlert : label === 'Weak' ? AlertTriangle : CheckCircle2;

  return (
    <div className="bn-card p-5 border" style={{ borderColor: `${color}55` }}>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg" style={{ background: `${color}1a`, color }}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-white">Verdict: {label}</h2>
            <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: `${color}1a`, color }}>
              {incomplete ? 'N/A' : `${score}/100`}
            </span>
          </div>
          <p className="text-sm leading-6 text-[#eaecef]">{analysis?.verdict || '-'}</p>
          <div className="flex flex-wrap gap-2">
            {(analysis?.rating?.reasons || []).map((reason: string) => (
              <span key={reason} className="text-[11px] px-2 py-1 rounded bg-[#2b3139] text-[#929aa5]">
                {reason}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
