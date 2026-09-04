import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

interface LanguageSwitcherProps {
  compact?: boolean;
}

const LANGUAGES = [
  { code: 'id', label: 'Indonesia', short: 'ID' },
  { code: 'en', label: 'English',   short: 'EN' },
];

export default function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();
  const current = i18n.language?.startsWith('en') ? 'en' : 'id';

  const toggle = () => {
    const next = current === 'id' ? 'en' : 'id';
    i18n.changeLanguage(next);
  };

  if (compact) {
    return (
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 px-2 py-1.5 w-full text-left hover:bg-[#E5E5E5] transition-colors border-2 border-[#121212]"
        style={{ fontFamily: 'Outfit, sans-serif', fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em' }}
        aria-label={`Switch language to ${current === 'id' ? 'English' : 'Indonesia'}`}
        title={`Switch to ${current === 'id' ? 'English' : 'Indonesia'}`}
      >
        <Globe className="w-3 h-3 flex-shrink-0" style={{ color: '#717182' }} aria-hidden="true" />
        <span style={{ color: '#717182' }}>LANG</span>
        <span
          className="ml-auto font-black"
          style={{ color: '#121212' }}
        >
          {current.toUpperCase()}
        </span>
      </button>
    );
  }

  return (
    <div
      className="flex gap-2"
      role="group"
      aria-label="Language selection"
    >
      {LANGUAGES.map((lang) => {
        const isActive = current === lang.code;
        return (
          <button
            key={lang.code}
            onClick={() => i18n.changeLanguage(lang.code)}
            className="flex items-center gap-2 px-4 py-2.5 border-2 transition-all"
            style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              borderColor: '#121212',
              background: isActive ? '#121212' : '#F0F0F0',
              color: isActive ? '#FFFFFF' : '#717182',
              cursor: isActive ? 'default' : 'pointer',
            }}
            aria-pressed={isActive}
            aria-label={`${lang.label}${isActive ? ' (current)' : ''}`}
            disabled={isActive}
          >
            <Globe className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{lang.label}</span>
            <span
              className="ml-1 text-[10px] font-black opacity-60"
            >
              {lang.short}
            </span>
          </button>
        );
      })}
    </div>
  );
}
