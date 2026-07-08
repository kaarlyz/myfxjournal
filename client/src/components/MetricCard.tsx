import React from 'react';
import { LucideIcon } from 'lucide-react';

import { motion } from 'framer-motion';

type MetricAccent = 'red' | 'blue' | 'yellow' | 'profit' | 'loss' | 'warning' | 'dark';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string | React.ReactNode;
  icon?: LucideIcon;
  valueColorClass?: string;
  tooltip?: string;
  glow?: boolean;
  accent?: MetricAccent;
}

const accentColorMap: Record<MetricAccent, string> = {
  red:     '#D02020',
  blue:    '#1040C0',
  yellow:  '#F0C020',
  profit:  '#059669',
  loss:    '#DC2626',
  warning: '#D97706',
  dark:    '#121212',
};

export default function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  valueColorClass,
  tooltip,
  glow = false,
  accent,
}: MetricCardProps) {
  // Map legacy color classes to CSS variable-based classes
  let valueStyle: React.CSSProperties = { color: 'var(--text-primary)' };

  if (valueColorClass) {
    if (
      valueColorClass.includes('winGreen') ||
      valueColorClass.includes('emerald') ||
      valueColorClass.includes('green') ||
      valueColorClass.includes('#0ecb81') ||
      valueColorClass.includes('profit')
    ) {
      valueStyle = { color: 'var(--profit)' };
    } else if (
      valueColorClass.includes('lossRed') ||
      valueColorClass.includes('#f6465d') ||
      valueColorClass.includes('loss') ||
      (valueColorClass.includes('red') && !valueColorClass.includes('accent-red'))
    ) {
      valueStyle = { color: 'var(--loss)' };
    } else if (
      valueColorClass.includes('yellow') ||
      valueColorClass.includes('warning') ||
      valueColorClass.includes('#fcd535')
    ) {
      valueStyle = { color: 'var(--warning)' };
    } else if (valueColorClass.includes('cyan') || valueColorClass.includes('accent')) {
      valueStyle = { color: 'var(--accent-blue)' };
    }
  }

  // Determine accent color for top bar
  const resolvedAccent = accent
    ? accentColorMap[accent]
    : valueStyle.color === 'var(--profit)'
    ? '#059669'
    : valueStyle.color === 'var(--loss)'
    ? '#DC2626'
    : valueStyle.color === 'var(--warning)'
    ? '#D97706'
    : glow
    ? '#D02020'
    : '#121212';

  return (
    <motion.div
      whileHover={{ y: -4, x: -2, boxShadow: '6px 6px 0px 0px #121212' }}
      whileTap={{ y: 0, x: 0, boxShadow: '2px 2px 0px 0px #121212' }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-4 hover-lift relative overflow-hidden bg-white"
      title={tooltip}
      data-tooltip={tooltip}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ backgroundColor: resolvedAccent }}
        aria-hidden="true"
      />

      <div className="flex justify-between items-start gap-2 mt-1">
        <div className="space-y-1 min-w-0">
          {/* Label */}
          <p className="metric-label truncate">{title}</p>

          {/* Value */}
          <div
            className="metric-value leading-tight truncate"
            style={valueStyle}
            aria-label={`${title}: ${value}`}
          >
            {value}
          </div>

          {/* Subtitle */}
          {subtitle && (
            <div className="metric-sublabel truncate">
              {subtitle}
            </div>
          )}
        </div>

        {/* Icon box — Bauhaus flat bordered */}
        {Icon && (
          <div
            className="w-9 h-9 flex items-center justify-center flex-shrink-0 border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212]"
            style={{ backgroundColor: resolvedAccent }}
            aria-hidden="true"
          >
            <Icon
              className="w-4 h-4"
              style={{ color: resolvedAccent === '#F0C020' ? '#121212' : '#FFFFFF' }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}
