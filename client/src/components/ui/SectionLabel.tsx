import React from 'react';

type GeoShape = 'circle' | 'square' | 'diamond';
type LabelColor = 'red' | 'blue' | 'yellow' | 'dark';

interface SectionLabelProps {
  label: string;
  heading?: string;
  subheading?: string;
  color?: LabelColor;
  shape?: GeoShape;
  className?: string;
  icon?: React.ReactNode;
  inverse?: boolean;
}

const colorMap: Record<LabelColor, string> = {
  red:    '#D02020',
  blue:   '#1040C0',
  yellow: '#F0C020',
  dark:   '#121212',
};

export function SectionLabel({
  label,
  heading,
  subheading,
  color = 'red',
  shape = 'circle',
  className = '',
  icon,
  inverse = false,
}: SectionLabelProps) {
  const accentColor = colorMap[color];

  return (
    <div className={className}>
      {/* Label row */}
      <div className="flex items-center gap-2 mb-3">
        <div
          aria-hidden="true"
          style={{
            width: 10,
            height: 10,
            backgroundColor: accentColor,
            borderRadius: shape === 'circle' ? '50%' : '0',
            transform: shape === 'diamond' ? 'rotate(45deg)' : 'none',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 700,
            fontSize: '0.65rem',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: inverse ? '#FFFFFF' : '#717182',
          }}
        >
          {label}
        </span>
        {icon && <span className="ml-1 text-[#717182]">{icon}</span>}
      </div>

      {/* Heading */}
      {heading && (
        <h2
          style={{
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 900,
            fontSize: 'clamp(1.5rem, 3vw, 2.5rem)',
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: '#121212',
            marginBottom: subheading ? '8px' : '0',
          }}
        >
          {heading}
        </h2>
      )}

      {/* Subheading */}
      {subheading && (
        <p
          style={{
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 500,
            fontSize: '0.9rem',
            lineHeight: '1.6',
            color: '#717182',
          }}
        >
          {subheading}
        </p>
      )}
    </div>
  );
}

/** Page heading with Bauhaus section label pattern */
export function PageHeader({
  label,
  title,
  subtitle,
  labelColor = 'red',
  actions,
}: {
  label: string;
  title: string;
  subtitle?: string;
  labelColor?: LabelColor;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
      <div>
        <SectionLabel label={label} color={labelColor} shape="circle" />
        <h1
          style={{
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 900,
            fontSize: 'clamp(1.6rem, 4vw, 2.8rem)',
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: '#121212',
            marginTop: '8px',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="mt-2 max-w-lg"
            style={{
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 500,
              fontSize: '0.9rem',
              color: '#717182',
              lineHeight: '1.6',
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
