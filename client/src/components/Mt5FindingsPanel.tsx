import React from 'react';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';

export default function Mt5FindingsPanel({ findings }: { findings: any[] }) {
  const items = findings || [];
  if (!items.length) {
    return (
      <div className="bn-card p-4 text-sm text-[#929aa5]">Tidak ada finding besar dari rule detector.</div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((finding, index) => {
        const danger = finding.severity === 'DANGER';
        const warning = finding.severity === 'WARNING';
        const color = danger ? '#f6465d' : warning ? '#f0b90b' : '#0ecb81';
        const Icon = danger ? ShieldAlert : warning ? AlertTriangle : Info;
        return (
          <div key={`${finding.title}-${index}`} className="bn-card p-4 border" style={{ borderColor: `${color}44` }}>
            <div className="flex items-start gap-3">
              <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">{finding.title}</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: `${color}1a`, color }}>
                    {finding.severity}
                  </span>
                </div>
                <p className="text-xs text-[#929aa5]">{finding.explanation}</p>
                <p className="text-xs text-[#eaecef]">{finding.suggestedFix}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
