import type { Config } from 'tailwindcss';

// Design tokens follow Material Design 3 roles (primary/secondary/tertiary +
// a surface ladder + on-* foreground tokens). Color values are NOT hardcoded
// here — every color resolves to a CSS variable defined in `src/index.css`,
// with a `:root` (light) set and a `.dark` set. That lets ANY component
// written with `bg-surface text-on-surface` adapt automatically when the
// theme flips, with zero `dark:` prefixes needed.
//
// Brand hues (primary/secondary/tertiary) intentionally keep the same vars
// in both themes — only the surface ladder, foreground tokens, and outlines
// swap. That preserves the Clinical Modernist identity across modes.
//
// `rgb(var(--token) / <alpha-value>)` is the Tailwind v3 pattern that
// lets `bg-primary/50` work via alpha substitution. Variables in index.css
// are stored as space-separated RGB triplets (e.g. `0 106 97`, no commas,
// no `#`) which is the format the alpha-value syntax expects.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ---- M3 role tokens ----
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          fixed: 'rgb(var(--primary-fixed) / <alpha-value>)',
          'fixed-dim': 'rgb(var(--primary-fixed-dim) / <alpha-value>)',
          container: 'rgb(var(--primary-container) / <alpha-value>)',
        },
        'on-primary': 'rgb(var(--on-primary) / <alpha-value>)',
        'on-primary-container': 'rgb(var(--on-primary-container) / <alpha-value>)',
        'on-primary-fixed': 'rgb(var(--on-primary-fixed) / <alpha-value>)',
        'on-primary-fixed-variant': 'rgb(var(--on-primary-fixed-variant) / <alpha-value>)',

        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          fixed: 'rgb(var(--secondary-fixed) / <alpha-value>)',
          'fixed-dim': 'rgb(var(--secondary-fixed-dim) / <alpha-value>)',
          container: 'rgb(var(--secondary-container) / <alpha-value>)',
        },
        'on-secondary': 'rgb(var(--on-secondary) / <alpha-value>)',
        'on-secondary-container': 'rgb(var(--on-secondary-container) / <alpha-value>)',
        'on-secondary-fixed': 'rgb(var(--on-secondary-fixed) / <alpha-value>)',
        'on-secondary-fixed-variant': 'rgb(var(--on-secondary-fixed-variant) / <alpha-value>)',

        tertiary: {
          DEFAULT: 'rgb(var(--tertiary) / <alpha-value>)',
          fixed: 'rgb(var(--tertiary-fixed) / <alpha-value>)',
          'fixed-dim': 'rgb(var(--tertiary-fixed-dim) / <alpha-value>)',
          container: 'rgb(var(--tertiary-container) / <alpha-value>)',
        },
        'on-tertiary': 'rgb(var(--on-tertiary) / <alpha-value>)',
        'on-tertiary-container': 'rgb(var(--on-tertiary-container) / <alpha-value>)',
        'on-tertiary-fixed': 'rgb(var(--on-tertiary-fixed) / <alpha-value>)',
        'on-tertiary-fixed-variant': 'rgb(var(--on-tertiary-fixed-variant) / <alpha-value>)',

        // Surface ladder
        background: 'rgb(var(--background) / <alpha-value>)',
        'on-background': 'rgb(var(--on-background) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          dim: 'rgb(var(--surface-dim) / <alpha-value>)',
          bright: 'rgb(var(--surface-bright) / <alpha-value>)',
          tint: 'rgb(var(--surface-tint) / <alpha-value>)',
          variant: 'rgb(var(--surface-variant) / <alpha-value>)',
          container: {
            DEFAULT: 'rgb(var(--surface-container) / <alpha-value>)',
            lowest: 'rgb(var(--surface-container-lowest) / <alpha-value>)',
            low: 'rgb(var(--surface-container-low) / <alpha-value>)',
            high: 'rgb(var(--surface-container-high) / <alpha-value>)',
            highest: 'rgb(var(--surface-container-highest) / <alpha-value>)',
          },
        },
        'on-surface': 'rgb(var(--on-surface) / <alpha-value>)',
        'on-surface-variant': 'rgb(var(--on-surface-variant) / <alpha-value>)',
        'inverse-surface': 'rgb(var(--inverse-surface) / <alpha-value>)',
        'inverse-on-surface': 'rgb(var(--inverse-on-surface) / <alpha-value>)',
        'inverse-primary': 'rgb(var(--inverse-primary) / <alpha-value>)',

        outline: {
          DEFAULT: 'rgb(var(--outline) / <alpha-value>)',
          variant: 'rgb(var(--outline-variant) / <alpha-value>)',
        },

        error: {
          DEFAULT: 'rgb(var(--error) / <alpha-value>)',
          container: 'rgb(var(--error-container) / <alpha-value>)',
        },
        'on-error': 'rgb(var(--on-error) / <alpha-value>)',
        'on-error-container': 'rgb(var(--on-error-container) / <alpha-value>)',

        // Legacy aliases — kept theme-aware so any un-migrated component still
        // adapts when the user flips themes. `ink` resolves to the deepest
        // surface in both modes (the canvas), and `card` to an elevated
        // container — so a stale `bg-ink text-white` will look like a dark
        // sheet in light mode and a panel in dark mode rather than going
        // invisible. Remove after every page is fully ported off these.
        accent: 'rgb(var(--primary) / <alpha-value>)',
        secondaryLegacy: '#6366F1',
        danger: 'rgb(var(--error) / <alpha-value>)',
        muted: 'rgb(var(--outline) / <alpha-value>)',
        bg: 'rgb(var(--background) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter'],
        'headline-lg': ['Inter'],
        'headline-md': ['Inter'],
        'headline-sm': ['Inter'],
        'body-lg': ['Inter'],
        'body-md': ['Inter'],
        'body-sm': ['Inter'],
        'label-md': ['Inter'],
        'label-sm': ['Inter'],
      },
      fontSize: {
        display: ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-lg-mobile': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'headline-sm': ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-md': ['14px', { lineHeight: '16px', letterSpacing: '0.01em', fontWeight: '500' }],
        'label-sm': ['12px', { lineHeight: '16px', fontWeight: '600' }],
      },
      spacing: {
        xs: '4px',
        base: '8px',
        sm: '12px',
        md: '24px',
        lg: '48px',
        xl: '80px',
        gutter: '24px',
        'container-max': '1280px',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
        full: '9999px',
      },
      boxShadow: {
        'auth-card': '0 8px 30px rgba(0, 27, 68, 0.05)',
        card: '0 4px 24px rgba(15, 23, 42, 0.06)',
        'card-lg': '0 12px 40px rgba(15, 23, 42, 0.08)',
        glow: '0 0 24px 0 rgba(0, 106, 97, 0.25)',
        'glow-lg': '0 0 48px 0 rgba(0, 106, 97, 0.35)',
        soft: '0 8px 32px -8px rgba(15, 23, 42, 0.12)',
        'soft-lg': '0 24px 60px -20px rgba(15, 23, 42, 0.18)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #006a61 0%, #006a66 50%, #495e8a 100%)',
        'brand-soft':
          'linear-gradient(135deg, rgba(0,106,97,0.10) 0%, rgba(73,94,138,0.08) 100%)',
        'surface-fade': 'linear-gradient(180deg, #ffffff 0%, #eff5f2 100%)',
        // Reel media canvas — intentionally dark in BOTH themes (it's a "media
        // surface" like YouTube's player, not a content surface).
        'media-aurora':
          'radial-gradient(80% 60% at 12% 0%, rgba(0,106,97,0.20) 0%, transparent 60%), radial-gradient(70% 60% at 88% 100%, rgba(73,94,138,0.18) 0%, transparent 60%), linear-gradient(180deg, #050816 0%, #07091a 60%, #050816 100%)',
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
