const tailwindColors = {
  ivory: '#EDE8DC',
  'ivory-panel': '#F5F1E6',
  ink: '#131F33',
  'ink-soft': '#2B3A52',
  vault: '#1E3B2E',
  'vault-soft': '#2F5140',
  brass: '#A67C3D',
  'brass-soft': '#C79A5C',
  rust: '#9C3B2A',
  slate: '#5B6572',
  line: '#D8D0BC',
};

module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: tailwindColors,
      fontFamily: {
        fraunces: ['Fraunces', 'serif'],
        inter: ['Inter', 'sans-serif'],
        'ibm-plex-mono': ['IBM Plex Mono', 'monospace'],
      },
      screens: {
        '800': {'max': '800px'},
      },
      boxShadow: {
        shadow: '0 1px 2px rgba(19,31,51,0.06), 0 8px 24px rgba(19,31,51,0.06)',
      },
      animation: {
        none: 'none',
        spin: 'spin 1s linear infinite',
        ping: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [
    function({ addUtilities }) {
      addUtilities({
        '.no-actions-visible': {
          '[data-actions]:empty': {
            display: 'none'
          }
        },
        '[data-actions]:empty::before': {
          content: '\"No action available for your current role on this job.\"',
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '11.5px',
          color: tailwindColors.slate,
          padding: '8px 2px',
          display: 'block'
        }
      });
    }
  ],
  corePlugins: {
    preflight: false,
  },
};