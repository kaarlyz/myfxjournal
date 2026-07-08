import React from 'react';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { Badge } from './ui/Badge';

export default function Mt5FindingsPanel({ findings }: { findings: any[] }) {
  const items = findings || [];
  if (!items.length) {
    return (
      <div className="bg-[#F0F0F0] border-2 border-dashed border-[#121212]/20 p-6 text-[13px] font-bold text-[#717182] uppercase tracking-widest text-center">
        Tidak ada finding besar dari rule detector.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((finding, index) => {
        const danger = finding.severity === 'DANGER';
        const warning = finding.severity === 'WARNING';
        const colorClass = danger ? 'bg-[var(--loss-dim)] border-[var(--loss)] text-[var(--loss)]' : warning ? 'bg-[var(--warning-dim)] border-[var(--warning)] text-[var(--warning)]' : 'bg-[var(--profit-dim)] border-[var(--profit)] text-[var(--profit)]';
        const Icon = danger ? ShieldAlert : warning ? AlertTriangle : Info;
        return (
          <div key={`${finding.title}-${index}`} className={`bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212] relative overflow-hidden`}>
            <div className={`absolute top-0 left-0 bottom-0 w-2 ${danger ? 'bg-[var(--loss)]' : warning ? 'bg-[var(--warning)]' : 'bg-[var(--profit)]'}`} />
            <div className="flex items-start gap-3 ml-3">
              <Icon className="w-5 h-5 mt-0.5 shrink-0" strokeWidth={2.5} style={{ color: danger ? 'var(--loss)' : warning ? 'var(--warning)' : 'var(--profit)' }} />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-[14px] font-extrabold text-[#121212] uppercase tracking-wide">{finding.title}</h3>
                  <Badge variant={danger ? 'loss' : warning ? 'warning' : 'profit'}>{finding.severity}</Badge>
                </div>
                <p className="text-[13px] font-semibold text-[#717182]">{finding.explanation}</p>
                <div className="bg-[#F0F0F0] border-2 border-[#121212]/10 p-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#121212] block mb-1">Suggested Fix:</span>
                  <p className="text-[12px] font-bold text-[#121212]">{finding.suggestedFix}</p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
