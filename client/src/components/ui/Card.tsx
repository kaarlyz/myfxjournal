import React from 'react';

type CardVariant = 'default' | 'elevated' | 'hero' | 'flat' | 'profit' | 'loss' | 'warning';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
}

const variantMap: Record<CardVariant, string> = {
  default:  'card',
  elevated: 'card-elevated',
  hero:     'card-hero',
  flat:     'card-flat',
  profit:   'card-profit',
  loss:     'card-loss',
  warning:  'card-warning',
};

export function Card({ variant = 'default', children, className = '', as: Tag = 'div', ...props }: CardProps) {
  return (
    <Tag className={`${variantMap[variant]} ${className}`} {...props as any}>
      {children}
    </Tag>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
  /** Bauhaus colored accent bar position */
  accentColor?: string;
}

export function CardHeader({ children, className = '', accentColor }: CardHeaderProps) {
  return (
    <div
      className={`flex items-center justify-between px-5 py-4 ${className}`}
      style={accentColor ? { borderBottom: `2px solid rgba(18,18,18,0.1)` } : { borderBottom: `2px solid rgba(18,18,18,0.1)` }}
    >
      {accentColor && (
        <div
          className="absolute top-0 left-0 right-0 h-[3px]"
          style={{ backgroundColor: accentColor }}
        />
      )}
      {children}
    </div>
  );
}

export function CardBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`p-5 ${className}`}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`px-5 py-4 ${className}`}
      style={{ borderTop: '2px solid rgba(18,18,18,0.1)' }}
    >
      {children}
    </div>
  );
}
