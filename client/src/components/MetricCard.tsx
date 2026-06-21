import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string | React.ReactNode;
  icon?: LucideIcon;
  valueColorClass?: string;
  tooltip?: string;
  glow?: boolean;
}

export default function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  valueColorClass,
  tooltip,
  glow = false,
}: MetricCardProps) {
  // Map legacy tailwind color classes to inline styles
  const valueColor = (() => {
    if (!valueColorClass) return '#eaecef';
    if (valueColorClass.includes('winGreen') || valueColorClass.includes('emerald') || valueColorClass.includes('green'))
      return '#0ecb81';
    if (valueColorClass.includes('lossRed') || valueColorClass.includes('red') || valueColorClass.includes('rose'))
      return '#f6465d';
    if (valueColorClass.includes('yellow') || valueColorClass.includes('primary') || valueColorClass.includes('accentBlue'))
      return '#fcd535';
    if (valueColorClass.includes('cyan'))
      return '#0ecb81';
    if (valueColorClass.includes('white'))
      return '#ffffff';
    return '#eaecef';
  })();

  return (
    <div
      className="metric-card"
      title={tooltip}
      style={glow ? { borderColor: 'rgba(252,213,53,0.2)' } : {}}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="space-y-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#707a8a' }}>
            {title}
          </p>
          <div className="text-xl font-bold ticker-value leading-tight" style={{ color: valueColor }}>
            {value}
          </div>
          {subtitle && (
            <div className="text-[11px]" style={{ color: '#707a8a' }}>
              {subtitle}
            </div>
          )}
        </div>
        {Icon && (
          <div
            className="p-2 rounded-lg flex-shrink-0"
            style={{
              background: glow ? 'rgba(252,213,53,0.1)' : '#2b3139',
              color: glow ? '#fcd535' : '#707a8a',
            }}
          >
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
    </div>
  );
}
