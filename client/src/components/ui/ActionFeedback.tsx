import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, ArrowRight, RefreshCw, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export interface MetricChip {
  label: string;
  value: string | number;
  highlight?: boolean;
  color?: 'profit' | 'loss' | 'neutral' | 'blue';
}

export interface ActionFeedbackProps {
  type?: 'SUCCESS' | 'WARNING' | 'ERROR' | 'INFO';
  title: string;
  subtitle?: string;
  description?: string;
  metrics?: MetricChip[];
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    variant?: 'primary' | 'yellow' | 'blue' | 'profit';
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  className?: string;
  children?: React.ReactNode;
}

export function ActionFeedback({
  type = 'SUCCESS',
  title,
  subtitle,
  description,
  metrics,
  primaryAction,
  secondaryAction,
  className = '',
  children,
}: ActionFeedbackProps) {
  const styles = {
    SUCCESS: {
      bg: 'bg-emerald-50/90',
      border: 'border-emerald-500',
      shadow: 'shadow-[4px_4px_0px_0px_#059669]',
      badgeBg: 'bg-emerald-600',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />,
      titleColor: 'text-emerald-950',
    },
    WARNING: {
      bg: 'bg-amber-50/90',
      border: 'border-amber-500',
      shadow: 'shadow-[4px_4px_0px_0px_#D97706]',
      badgeBg: 'bg-amber-600',
      icon: <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />,
      titleColor: 'text-amber-950',
    },
    ERROR: {
      bg: 'bg-red-50/90',
      border: 'border-red-500',
      shadow: 'shadow-[4px_4px_0px_0px_#DC2626]',
      badgeBg: 'bg-red-600',
      icon: <AlertCircle className="w-5 h-5 text-red-700 shrink-0" />,
      titleColor: 'text-red-950',
    },
    INFO: {
      bg: 'bg-blue-50/90',
      border: 'border-blue-500',
      shadow: 'shadow-[4px_4px_0px_0px_#2563EB]',
      badgeBg: 'bg-blue-600',
      icon: <Info className="w-5 h-5 text-blue-700 shrink-0" />,
      titleColor: 'text-blue-950',
    },
  }[type];

  return (
    <div
      className={`border-2 p-5 md:p-6 space-y-4 ${styles.bg} ${styles.border} ${styles.shadow} ${className}`}
      role="region"
      aria-label={title}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{styles.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`font-black text-base md:text-lg font-display tracking-tight ${styles.titleColor}`}>
              {title}
            </h3>
            {subtitle && (
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-white/80 border border-current rounded">
                {subtitle}
              </span>
            )}
          </div>
          {description && (
            <p className="text-xs text-[#3F3F46] font-medium mt-1 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Metrics breakdown chips */}
      {metrics && metrics.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1">
          {metrics.map((m, idx) => {
            const colorClass = m.color === 'profit'
              ? 'text-[var(--profit)]'
              : m.color === 'loss'
              ? 'text-[var(--loss)]'
              : m.color === 'blue'
              ? 'text-[#1040C0]'
              : 'text-[#121212]';

            return (
              <div
                key={idx}
                className="bg-white p-2.5 border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212]"
              >
                <span className="block text-[9px] font-extrabold uppercase tracking-widest text-[#717182] truncate">
                  {m.label}
                </span>
                <span className={`block font-black font-number text-[14px] mt-0.5 ${colorClass}`}>
                  {m.value}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {children}

      {/* Primary & Secondary Contextual CTAs */}
      {(primaryAction || secondaryAction) && (
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t-2 border-dashed border-[#121212]/15">
          {primaryAction && (
            <Button
              variant={primaryAction.variant || 'primary'}
              onClick={primaryAction.onClick}
              className="flex items-center gap-2 text-xs font-black"
            >
              {primaryAction.icon || <ArrowRight className="w-4 h-4" />}
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant="secondary"
              onClick={secondaryAction.onClick}
              className="flex items-center gap-1.5 text-xs font-bold"
            >
              {secondaryAction.icon}
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
