import React from 'react';

type BadgeVariant = 'profit' | 'loss' | 'warning' | 'blue' | 'red' | 'yellow' | 'neutral' | 'csv' | 'violet';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

const variantMap: Record<BadgeVariant, string> = {
  profit:  'badge badge-profit',
  loss:    'badge badge-loss',
  warning: 'badge badge-warning',
  blue:    'badge badge-blue',
  red:     'badge badge-red',
  yellow:  'badge badge-yellow',
  neutral: 'badge badge-neutral',
  csv:     'badge badge-csv',
  violet:  'badge badge-violet',
};

export function Badge({ variant = 'neutral', children, className = '', dot }: BadgeProps) {
  const dotColors: Record<BadgeVariant, string> = {
    profit:  '#059669',
    loss:    '#DC2626',
    warning: '#D97706',
    blue:    '#1040C0',
    red:     '#D02020',
    yellow:  '#b8890a',
    neutral: '#717182',
    csv:     '#1040C0',
    violet:  '#6d28d9',
  };

  return (
    <span className={`${variantMap[variant]} ${className}`}>
      {dot && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: dotColors[variant] }}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

/** Source mode badge for sessions */
export function SourceModeBadge({ mode }: { mode: string }) {
  const modeMap: Record<string, BadgeVariant> = {
    CSV:     'yellow',
    WEBHOOK: 'profit',
    MT5:     'blue',
    MANUAL:  'neutral',
  };
  return <Badge variant={modeMap[mode] ?? 'neutral'}>{mode}</Badge>;
}

/** Win/Loss label badge */
export function ResultBadge({ isWin }: { isWin: boolean }) {
  return (
    <Badge variant={isWin ? 'profit' : 'loss'} dot>
      {isWin ? 'WIN' : 'LOSS'}
    </Badge>
  );
}
