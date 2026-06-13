/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#1B2B4B',
          50: '#E8ECF3',
          100: '#C7CFDE',
          200: '#9FACC4',
          300: '#7689A9',
          400: '#4E6790',
          500: '#1B2B4B',
          600: '#172541',
          700: '#121E36',
          800: '#0D162A',
          900: '#080F1E'
        },
        press: {
          DEFAULT: '#E63946',
          light: '#F26876',
          dark: '#B82A35'
        },
        paper: '#F8F6F1',
        charcoal: '#2D2D2D',
        leaf: '#2D6A4F',
        amber_warn: '#F4A261'
      },
      fontFamily: {
        heading: ['Poppins', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['Roboto Mono', 'monospace']
      },
      boxShadow: {
        card: '0 2px 8px rgba(27, 43, 75, 0.06)',
        cardHover: '0 8px 24px rgba(27, 43, 75, 0.12)',
        panel: '-8px 0 32px rgba(27, 43, 75, 0.08)'
      },
      animation: {
        'ink-drop': 'inkDrop 1.2s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'fade-in': 'fadeIn 0.4s ease-out'
      },
      keyframes: {
        inkDrop: {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '60%': { transform: 'scale(1.05)', opacity: '0.85' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        }
      }
    },
  },
  plugins: [],
}
