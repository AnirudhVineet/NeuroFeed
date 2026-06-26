import type { Config } from 'tailwindcss';

// Design tokens ported from the new mockups (Material Design 3 inspired,
// clinical teal/navy on a light surface). The mockup HTML files in
// `neurofeed frontend/` are the source of truth for these values.
//
// Roles follow M3: primary (deep teal) for actions, secondary (a sibling
// teal) for accents, tertiary (navy) for contrast, surface tones for the
// off-white background ladder.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ---- M3 role tokens (the ones you'll use 90% of the time) ----
        primary: {
          DEFAULT: '#006a61',
          fixed: '#85f5e7',
          'fixed-dim': '#67d9cb',
          container: '#63d5c7',
        },
        'on-primary': '#ffffff',
        'on-primary-container': '#005a53',
        'on-primary-fixed': '#00201d',
        'on-primary-fixed-variant': '#005049',

        secondary: {
          DEFAULT: '#006a66',
          fixed: '#8ff3ed',
          'fixed-dim': '#72d7d1',
          container: '#8cf1ea',
        },
        'on-secondary': '#ffffff',
        'on-secondary-container': '#006f6a',
        'on-secondary-fixed': '#00201e',
        'on-secondary-fixed-variant': '#00504d',

        tertiary: {
          DEFAULT: '#495e8a',
          fixed: '#d8e2ff',
          'fixed-dim': '#b1c6f9',
          container: '#aec3f5',
        },
        'on-tertiary': '#ffffff',
        'on-tertiary-container': '#3b507b',
        'on-tertiary-fixed': '#001a42',
        'on-tertiary-fixed-variant': '#314671',

        // Surface ladder (light theme)
        background: '#f5faf8',
        'on-background': '#171d1c',
        surface: {
          DEFAULT: '#f5faf8',
          dim: '#d6dbd9',
          bright: '#f5faf8',
          tint: '#006a61',
          variant: '#dee4e1',
          container: {
            DEFAULT: '#eaefed',
            lowest: '#ffffff',
            low: '#eff5f2',
            high: '#e4e9e7',
            highest: '#dee4e1',
          },
        },
        'on-surface': '#171d1c',
        'on-surface-variant': '#3d4947',
        'inverse-surface': '#2c3230',
        'inverse-on-surface': '#edf2f0',
        'inverse-primary': '#67d9cb',

        outline: {
          DEFAULT: '#6d7a77',
          variant: '#bcc9c6',
        },

        error: {
          DEFAULT: '#ba1a1a',
          container: '#ffdad6',
        },
        'on-error': '#ffffff',
        'on-error-container': '#93000a',

        // Legacy aliases — used by yet-to-be-migrated components so the app
        // still renders during the T2-T8 page-by-page port. Remove once
        // every page has been ported.
        //
        // `ink` and `card` must stay DARK: every unmigrated component using
        // `bg-ink` / `bg-card/X` (TutorPanel, QuickLearningSheet,
        // NotificationBell, ToastHost, ChallengeDialog, FilterSheet, and the
        // dashboard/tutor pages) layers `text-white` on top. Flipping these
        // to light off-white made all that text invisible. The values match
        // the reel canvas gradient (#0a0e18 → #03050a) so the dark panels
        // feel consistent with the rest of the dark-media surfaces.
        accent: '#006a61',
        secondaryLegacy: '#6366F1',
        danger: '#EF4444',
        muted: '#6d7a77',
        bg: '#f5faf8',
        ink: '#0a0e18',
        card: '#141a26',
      },
      fontFamily: {
        // Single Inter face globally; per-role font-* tokens kept so we can
        // paste mockup class strings verbatim. All map to Inter.
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
        // Soft clinical shadows for cards on a light surface
        'auth-card': '0 8px 30px rgba(0, 27, 68, 0.05)',
        card: '0 4px 24px rgba(15, 23, 42, 0.06)',
        'card-lg': '0 12px 40px rgba(15, 23, 42, 0.08)',
        // Legacy — used by old dark-themed components until migrated
        glow: '0 0 24px 0 rgba(0, 106, 97, 0.25)',
        'glow-lg': '0 0 48px 0 rgba(0, 106, 97, 0.35)',
        soft: '0 8px 32px -8px rgba(15, 23, 42, 0.12)',
        'soft-lg': '0 24px 60px -20px rgba(15, 23, 42, 0.18)',
      },
      backgroundImage: {
        // New light-theme gradients
        'brand-gradient': 'linear-gradient(135deg, #006a61 0%, #006a66 50%, #495e8a 100%)',
        'brand-soft':
          'linear-gradient(135deg, rgba(0,106,97,0.10) 0%, rgba(73,94,138,0.08) 100%)',
        'surface-fade': 'linear-gradient(180deg, #ffffff 0%, #eff5f2 100%)',
        // app-aurora kept (dark) for the reel media surface — reels stay dark
        // even in the light app, as a "media canvas"
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
