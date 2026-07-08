import React from 'react';

interface BrandLogoProps {
  size?: number | string;
  compact?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function BrandLogo({
  size = 92,
  compact = false,
  className = '',
  ariaLabel = 'KAFX brand logo',
}: BrandLogoProps) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`} aria-label={ariaLabel} role="img">
      <svg
        viewBox="0 0 96 96"
        width={size}
        height={size}
        className="flex-shrink-0"
        aria-hidden="true"
      >
        <rect x="4" y="4" width="88" height="88" rx="22" fill="#121212" />
        <path
          d="M28 24 L48 48 L28 72"
          stroke="#D02020"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M48 24 L72 48 L48 72"
          stroke="#1040C0"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="70" cy="24" r="7" fill="#F0C020" />
      </svg>

      {!compact && (
        <div className="leading-tight">
          <span
            className="block font-black uppercase tracking-[-0.04em] text-[#121212]"
            style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem' }}
          >
            KAFX
          </span>
          <span
            className="block text-[0.62rem] uppercase tracking-[0.18em] font-bold text-[#D02020]"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Trading Journal
          </span>
        </div>
      )}
    </div>
  );
}
