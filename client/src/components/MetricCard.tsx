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
  valueColorClass = 'text-white',
  tooltip,
  glow = false,
}: MetricCardProps) {
  return (
    <div 
      className={`metric-card rounded-xl p-4 relative overflow-hidden ${
        glow ? 'border-accentCyan/30 cyan-glow' : ''
      }`}
      title={tooltip}
    >
      {/* Top shimmer line for glow cards */}
      {glow && (
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accentCyan/40 to-transparent" />
      )}

      {/* Decorative background orb */}
      <div className={`absolute -top-8 -right-8 w-20 h-20 rounded-full pointer-events-none blur-2xl ${
        glow ? 'bg-accentCyan/10' : 'bg-white/[0.02]'
      }`} />
      
      <div className="flex justify-between items-start gap-2">
        <div className="space-y-1.5 min-w-0">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-none">
            {title}
          </p>
          <h3 className={`text-xl font-extrabold tracking-tight ticker-value leading-tight ${valueColorClass}`}>
            {value}
          </h3>
          {subtitle && (
            <div className="text-[10px] text-gray-500 font-medium leading-tight">
              {subtitle}
            </div>
          )}
        </div>

        {Icon && (
          <div className={`p-2 rounded-lg flex-shrink-0 ${
            glow 
              ? 'bg-accentCyan/15 text-accentCyan' 
              : 'bg-gray-800/50 text-gray-500'
          }`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
    </div>
  );
}
