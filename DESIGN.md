---
name: NeuroFeed Structural System
colors:
  surface: '#f5faf8'
  surface-dim: '#d6dbd9'
  surface-bright: '#f5faf8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff5f2'
  surface-container: '#eaefed'
  surface-container-high: '#e4e9e7'
  surface-container-highest: '#dee4e1'
  on-surface: '#171d1c'
  on-surface-variant: '#3d4947'
  inverse-surface: '#2c3230'
  inverse-on-surface: '#edf2f0'
  outline: '#6d7a77'
  outline-variant: '#bcc9c6'
  surface-tint: '#006a61'
  primary: '#006a61'
  on-primary: '#ffffff'
  primary-container: '#63d5c7'
  on-primary-container: '#005a53'
  inverse-primary: '#67d9cb'
  secondary: '#006a66'
  on-secondary: '#ffffff'
  secondary-container: '#8cf1ea'
  on-secondary-container: '#006f6a'
  tertiary: '#495e8a'
  on-tertiary: '#ffffff'
  tertiary-container: '#aec3f5'
  on-tertiary-container: '#3b507b'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#85f5e7'
  primary-fixed-dim: '#67d9cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#005049'
  secondary-fixed: '#8ff3ed'
  secondary-fixed-dim: '#72d7d1'
  on-secondary-fixed: '#00201e'
  on-secondary-fixed-variant: '#00504d'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#b1c6f9'
  on-tertiary-fixed: '#001a42'
  on-tertiary-fixed-variant: '#314671'
  background: '#f5faf8'
  on-background: '#171d1c'
  surface-variant: '#dee4e1'
typography:
  display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 48px
  xl: 80px
  container-max: 1280px
  gutter: 24px
---

## Brand & Style
The design system for this educational platform centers on a "Clinical Modernist" aesthetic. It balances the rigor of academic research with the accessibility of modern SaaS. The personality is authoritative yet welcoming, aiming to evoke a state of "calm focus" for learners and educators.

The visual style is **Minimalist** with a focus on high-clarity information architecture. It utilizes ample whitespace, a constrained color palette, and premium typographic scales to ensure the content remains the hero. The interface avoids unnecessary ornamentation, relying instead on precise alignment and intentional structural depth to guide the user's journey.

## Colors
The palette is engineered for prolonged cognitive engagement without eye strain. 

- **Primary Teal (#63D5C7):** Used for primary actions, progress indicators, and active states. It represents growth and clarity.
- **Secondary Teal (#0E8B86):** A deeper shade used for emphasis in typography, iconography, and interactive elements requiring higher contrast against light backgrounds.
- **Dark Navy (#001B44):** The foundational anchor. Reserved for primary headings and navigation backgrounds to provide a sense of stability and institutional trust.
- **Accent (#F4C98A):** A soft gold used sparingly for highlights, achievements, and "lightbulb" moments in the learning flow.
- **Neutral System:** The background (#F8F8F8) and surface (#FFFFFF) create a layered effect, while the border (#E8EAF0) provides subtle definition between logical content groups.

## Typography
Inter is the exclusive typeface for this design system, chosen for its exceptional legibility and systematic weights. 

- **Headlines:** Use SemiBold (600) and Bold (700) weights with slightly tightened letter-spacing for a premium, "locked-in" feel.
- **Body Text:** Use Regular (400) for standard reading. Line heights are kept generous (1.5x) to facilitate high reading comprehension and reduce "text-density" anxiety for students.
- **Labels:** Use Medium (500) or SemiBold (600) weights to differentiate metadata and UI controls from narrative content.

## Layout & Spacing
The layout follows a **Fluid Grid** model within a maximum container width of 1280px. 

- **Grid:** A 12-column system is used for desktop, 8-column for tablet, and 4-column for mobile. 
- **Rhythm:** An 8px base unit drives all spacing decisions. 
- **Margins:** 24px gutters are used consistently between cards and main content blocks to ensure breathing room.
- **Vertical Flow:** Use `lg` (48px) spacing between major sections (e.g., Course Header vs. Lesson List) and `md` (24px) for internal module spacing.

## Elevation & Depth
This design system uses a "Layered Surface" approach to depth. 

- **Level 0 (Background):** #F8F8F8. The base canvas.
- **Level 1 (Cards/Containers):** #FFFFFF. These surfaces are defined primarily by a 1px solid border (#E8EAF0) rather than heavy shadows.
- **Level 2 (Interactive/Floating):** For elements like dropdowns or active modals, use a very soft, diffused shadow: `0 8px 30px rgba(0, 27, 68, 0.05)`. The shadow color should be a tinted version of the Dark Navy to maintain color harmony.

## Shapes
A "Rounded" strategy (0.5rem base) is applied across the system to soften the clinical nature of the colors.

- **Primary Components:** Buttons, Input Fields, and small Chips use the 8px (0.5rem) radius.
- **Large Components:** Course cards and main content containers use the `rounded-lg` (16px / 1rem) radius to create a distinct visual hierarchy.
- **Interactive States:** Subtle transitions in border-color should be used instead of shape changes to maintain structural integrity.

## Components

- **Buttons:** Primary buttons use the Primary Teal (#63D5C7) with white text. Secondary buttons use a ghost style with a #E8EAF0 border and Secondary Teal text. High-emphasis "Finish" or "Submit" actions use the Dark Navy background.
- **Input Fields:** Use the Surface color (#FFFFFF) with a 1px #E8EAF0 border. On focus, the border transitions to Primary Teal with a 2px outer glow of the same color at 10% opacity.
- **Cards:** The hallmark of the system. White background, 16px corner radius, and a 1px #E8EAF0 border. No shadow is used for static cards; a subtle shadow appears only on hover to indicate interactivity.
- **Progress Indicators:** Use Primary Teal for "In Progress" and Secondary Teal for "Completed." The track should be the Background color (#F8F8F8).
- **Chips/Badges:** Small, 8px rounded elements using a 10% opacity fill of the category color (e.g., 10% Primary Teal) with the full-strength color for the text label.
- **Learning Modules:** A custom component consisting of a "List Item" with a left-aligned icon in Dark Navy and a right-aligned completion checkbox in Secondary Teal.