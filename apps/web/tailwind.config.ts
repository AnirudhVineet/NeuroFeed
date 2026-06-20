import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Base surfaces
        bg: '#050816',
        ink: '#0b0f1a',
        card: '#111827',
        // Brand
        primary: {
          DEFAULT: '#8B5CF6',
          soft: '#A78BFA',
        },
        secondary: '#6366F1',
        accent: '#A855F7',
        danger: '#EF4444',
        muted: '#9aa3b2',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
        '4xl': '1.5rem',
      },
      boxShadow: {
        glow: '0 0 24px 0 rgba(139, 92, 246, 0.35)',
        'glow-lg': '0 0 48px 0 rgba(168, 85, 247, 0.45)',
        soft: '0 8px 32px -8px rgba(0, 0, 0, 0.45)',
        'soft-lg': '0 24px 60px -20px rgba(0, 0, 0, 0.55)',
      },
      backgroundImage: {
        'brand-gradient':
          'linear-gradient(135deg, #8B5CF6 0%, #6366F1 50%, #A855F7 100%)',
        'brand-soft':
          'linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(168,85,247,0.15) 100%)',
        'app-aurora':
          'radial-gradient(80% 60% at 12% 0%, rgba(139,92,246,0.18) 0%, transparent 60%), radial-gradient(70% 60% at 88% 100%, rgba(99,102,241,0.16) 0%, transparent 60%), linear-gradient(180deg, #050816 0%, #07091a 60%, #050816 100%)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 220ms cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 2.4s linear infinite',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
