/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Binance design tokens
        primary:    '#fcd535',
        'primary-active':   '#f0b90b',
        'primary-disabled': '#3a3a1f',
        ink:        '#181a20',
        body:       '#eaecef',
        muted:      '#707a8a',
        'muted-strong': '#929aa5',
        'hairline-dark':  '#2b3139',
        'hairline-light': '#eaecef',
        'canvas-dark':  '#0b0e11',
        'canvas-light': '#ffffff',
        'card-dark':    '#1e2329',
        'elevated-dark':'#2b3139',
        'surface-soft': '#fafafa',
        'on-primary':   '#181a20',
        'trading-up':   '#0ecb81',
        'trading-down': '#f6465d',
        // Legacy aliases for existing components (no breakage)
        darkBg:       '#0b0e11',
        darkCard:     '#1e2329',
        accentCyan:   '#0ecb81',
        accentEmerald:'#0ecb81',
        accentBlue:   '#fcd535',
        winGreen:     '#0ecb81',
        lossRed:      '#f6465d',
      },
      fontFamily: {
        sans:   ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        number: ['JetBrains Mono', 'IBM Plex Mono', 'monospace'],
        mono:   ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        xs:   '2px',
        sm:   '4px',
        md:   '6px',
        lg:   '8px',
        xl:   '12px',
        pill: '9999px',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}
