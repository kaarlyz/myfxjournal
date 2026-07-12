/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Bauhaus design tokens mapped to CSS variables
        'bg-base':    'var(--bg-base)',
        'bg-surface': 'var(--bg-surface)',
        'bg-dark':    'var(--bg-dark)',
        'bg-muted':   'var(--bg-muted)',
        'bg-yellow':  'var(--bg-yellow)',

        // Bauhaus accent palette
        'accent-red':    'var(--accent-red)',
        'accent-blue':   'var(--accent-blue)',
        'accent-yellow': 'var(--accent-yellow)',
        'accent-dark':   'var(--accent-dark)',

        // Trading semantics
        'profit':      'var(--profit)',
        'profit-dim':  'var(--profit-dim)',
        'loss':        'var(--loss)',
        'loss-dim':    'var(--loss-dim)',
        'warning':     'var(--warning)',
        'warning-dim': 'var(--warning-dim)',
        'neutral':     'var(--neutral)',

        // Text colors
        'text-primary':   'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted':     'var(--text-muted)',
        'text-inverted':  'var(--text-inverted)',

        // Border colors
        'border-color': 'var(--border-color)',
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
        'offset-lg': 'var(--shadow-lg)',
        'offset-md': 'var(--shadow-md)',
        'offset-sm': 'var(--shadow-sm)',
        'offset-xs': 'var(--shadow-xs)',
        'offset-red': 'var(--shadow-red)',
        'offset-blue': 'var(--shadow-blue)',
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
