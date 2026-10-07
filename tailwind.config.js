export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#faf4ef',
          100: '#f3e4d6',
          200: '#e6c4a8',
          300: '#d9a47a',
          400: '#e0975f',
          500: '#c8794a',
          600: '#a8643c',
          700: '#884f30',
          800: '#683b24',
          900: '#482818',
        },
        brand: {
          orange: '#c8794a',
          anthracite: '#15181d',
          white: '#ebe5db',
          gray: '#20242b',
          darkGray: '#2f353e',
        },
        cpc: {
          bg: '#15181d',
          card: '#20242b',
          line: '#2f353e',
          copper: '#c8794a',
          copperLight: '#e0975f',
          text: '#ebe5db',
          muted: '#9a958c',
          onCopper: '#1b120c',
          page: '#0b0d10',
        },
        dark: {
          50: '#F9FAFB',
          100: '#D1D5DB',
          200: '#9CA3AF',
          300: '#6B7280',
          400: '#4B5563',
          500: '#374151',
          600: '#3E4651',
          700: '#20242b',
          800: '#15181d',
          900: '#0b0d10',
        },
        success: {
          500: '#10B981',
          600: '#059669',
        },
        warning: {
          500: '#F59E0B',
          600: '#D97706',
        },
        danger: {
          500: '#EF4444',
          600: '#DC2626',
        },
        info: {
          500: '#3B82F6',
          600: '#2563EB',
        }
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Inter', 'sans-serif'],
      },
      letterSpacing: {
        tight: '-0.02em',
        tighter: '-0.04em',
      },
      boxShadow: {
        'premium': '0 4px 20px rgba(0, 0, 0, 0.08)',
        'premium-lg': '0 8px 32px rgba(0, 0, 0, 0.12)',
        'orange': '0 4px 12px rgba(200, 121, 74, 0.3)',
      },
      maxWidth: {
        phone: '430px',
      },
    },
  },
  plugins: [],
}
