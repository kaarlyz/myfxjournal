/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Bauhaus design tokens (from /copyit)
        'bg-base':    '#F0F0F0',
        'bg-surface': '#FFFFFF',
        'bg-dark':    '#121212',
        'bg-muted':   '#E0E0E0',
        'bg-yellow':  '#F0C020',

        // Bauhaus accent palette
        'accent-red':    '#D02020',
        'accent-blue':   '#1040C0',
        'accent-yellow': '#F0C020',
        'accent-dark':   '#121212',

        // Trading semantics (readable financial data)
        'profit':  '#059669',
        'loss':    '#DC2626',
        'warning': '#D97706',

        // Legacy aliases (keep for backward compat in existing components)
        primary:          '#D02020',
        'primary-active': '#B01010',
        ink:              '#121212',
        body:             '#121212',
        muted:            '#717182',
        'muted-strong':   '#3a3a3a',
        'hairline-dark':  'rgba(18,18,18,0.15)',
        'hairline-light': 'rgba(18,18,18,0.08)',
        'canvas-dark':    '#121212',
        'canvas-light':   '#F0F0F0',
        'card-dark':      '#FFFFFF',
        'elevated-dark':  '#F8F8F8',
        'surface-soft':   '#F0F0F0',
        'on-primary':     '#FFFFFF',
        'trading-up':     '#059669',
        'trading-down':   '#DC2626',

        // Further legacy
        darkBg:        '#F0F0F0',
        darkCard:      '#FFFFFF',
        accentCyan:    '#059669',
        accentEmerald: '#059669',
        accentBlue:    '#1040C0',
        winGreen:      '#059669',
        lossRed:       '#DC2626',
      },

      fontFamily: {
        sans:   ['Outfit', 'system-ui', '-apple-system', 'sans-serif'],
        number: ['JetBrains Mono', 'IBM Plex Mono', 'monospace'],
        mono:   ['JetBrains Mono', 'monospace'],
        outfit: ['Outfit', 'sans-serif'],
      },

      fontSize: {
        'display-xl': ['clamp(3rem, 8vw, 7rem)', { lineHeight: '1', letterSpacing: '-0.04em', fontWeight: '900' }],
        'display-lg': ['clamp(2rem, 5vw, 4rem)',  { lineHeight: '1', letterSpacing: '-0.04em', fontWeight: '900' }],
        'display-md': ['clamp(1.5rem, 3vw, 2.5rem)', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '900' }],
      },

      borderRadius: {
        xs:   '0px',
        sm:   '2px',
        md:   '4px',
        lg:   '8px',
        xl:   '8px',
        pill: '9999px',
      },

      boxShadow: {
        'offset-lg': '8px 8px 0px 0px #121212',
        'offset-md': '6px 6px 0px 0px #121212',
        'offset-sm': '4px 4px 0px 0px #121212',
        'offset-xs': '3px 3px 0px 0px #121212',
        'offset-red': '6px 6px 0px 0px #D02020',
        'offset-blue': '6px 6px 0px 0px #1040C0',
      },

      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'dot-grid': 'radial-gradient(#12121230 1.5px, transparent 1.5px)',
      },

      backgroundSize: {
        'dot-24': '24px 24px',
      },
    },
  },
  plugins: [],
}
