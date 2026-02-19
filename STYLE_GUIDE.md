# Pantry Style Guide

*Design system for Project Pantry — Organic, warm, human.*

---

## Design Philosophy

Pantry should feel like opening your grandmother's recipe box, not logging into a SaaS dashboard. Every surface should breathe. Every interaction should feel gentle. The app manages food — something deeply human, sensory, and nourishing — and the interface should reflect that warmth.

**Inspired by:** [Fazenda Organic Food App](https://www.behance.net/gallery/233133755/Fazenda-Organic-food-Mobile-App) — creamy backgrounds, sage greens, soft rounded forms, generous whitespace, and organic illustration.

**Anti-inspiration:** Vercel utility dashboards, dark zinc themes, dense data tables, sharp corners, monospace accents. We are moving *away* from developer-tool aesthetics entirely.

### Three Words
- **Warm** — Every color has a yellow/brown undertone. Nothing is pure gray or pure white.
- **Soft** — Rounded corners, gentle shadows, relaxed spacing. Nothing feels rigid.
- **Natural** — Earthy palette, organic shapes, hand-drawn illustration style. Feels grown, not manufactured.

---

## Color Palette

### Tailwind Config Extension

```js
// tailwind.config.ts — theme.extend.colors
colors: {
  // Core backgrounds
  cream:     '#FAF7F2',   // Page background — warm off-white
  parchment: '#F3EDE4',   // Card/section backgrounds — slightly deeper
  linen:     '#EBE3D6',   // Borders, dividers, subtle fills

  // Primary — Sage Green (actions, active states, primary buttons)
  sage: {
    50:  '#F2F7F2',
    100: '#E0EBE0',
    200: '#C2D7C2',
    300: '#9ABF9A',
    400: '#729F72',
    500: '#5B7553',   // Primary — buttons, active nav, links
    600: '#4A6344',
    700: '#3D5239',
    800: '#2F3F2C',
    900: '#1F2B1E',
  },

  // Secondary — Terracotta (accents, badges, warnings)
  terra: {
    50:  '#FDF5F0',
    100: '#F9E8DC',
    200: '#F0CEBA',
    300: '#E3AD8E',
    400: '#D48E65',
    500: '#C4956A',   // Secondary accent
    600: '#A8704A',
    700: '#8A5838',
    800: '#6D4430',
    900: '#4E3024',
  },

  // Neutrals — Warm (replace zinc entirely)
  warm: {
    50:  '#FDFCFA',
    100: '#FAF7F2',   // = cream
    200: '#F3EDE4',   // = parchment
    300: '#E5DDD1',
    400: '#C9BFAF',
    500: '#A69A8A',   // Muted text
    600: '#7D7166',   // Secondary text
    700: '#5C524A',   // Primary text
    800: '#3D3631',   // Headings
    900: '#241F1B',   // Maximum contrast text
  },

  // Status colors — muted, organic versions
  status: {
    fresh:   '#6B9E6B',  // In-stock, healthy — muted green
    low:     '#D4A843',  // Running low — warm amber
    out:     '#C27055',  // Out of stock — soft terracotta red
    info:    '#6B8FA3',  // Informational — dusty blue
  },
}
```

### CSS Variables (globals.css)

```css
:root {
  --background: #FAF7F2;
  --foreground: #3D3631;
  --card: #FFFFFF;
  --card-border: #EBE3D6;
  --card-shadow: 0 1px 3px rgba(139, 109, 71, 0.06), 0 4px 12px rgba(139, 109, 71, 0.04);
  --card-shadow-hover: 0 2px 8px rgba(139, 109, 71, 0.08), 0 8px 24px rgba(139, 109, 71, 0.06);
  --primary: #5B7553;
  --primary-hover: #4A6344;
  --accent: #C4956A;
  --muted: #A69A8A;
  --radius: 16px;
  --radius-lg: 24px;
  --radius-full: 9999px;
}
```

### Color Rules
- **Never use pure black (#000) or pure white (#FFF)** as primary surfaces. Darkest text is `warm-900`. Card backgrounds are `#FFFFFF` with warm-tinted shadows.
- **Never use zinc, slate, gray, or neutral** Tailwind defaults. Always use the `warm-*` scale.
- **Status colors** should appear as soft-filled badges, not as harsh outlines or solid blocks.

---

## Typography

### Font Stack

```css
/* Import in layout.tsx via next/font/google */
/* Heading: DM Serif Display — warm, editorial, grounded */
/* Body: DM Sans — clean humanist sans, pairs naturally */

/* If DM Serif Display feels too heavy for the context, */
/* Lora or Source Serif 4 are acceptable alternates. */
```

### Next.js Setup

```tsx
// app/layout.tsx
import { DM_Sans, DM_Serif_Display } from 'next/font/google';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
});

const dmSerif = DM_Serif_Display({
  subsets: ['latin'],
  variable: '--font-heading',
  weight: '400',
});

// Apply to <html> or <body>:
// className={`${dmSans.variable} ${dmSerif.variable} font-sans`}
```

### Tailwind Font Config

```js
// tailwind.config.ts — theme.extend.fontFamily
fontFamily: {
  sans:    ['var(--font-body)', 'DM Sans', 'system-ui', 'sans-serif'],
  heading: ['var(--font-heading)', 'DM Serif Display', 'Georgia', 'serif'],
},
```

### Scale

| Element | Font | Size | Weight | Color |
|---------|------|------|--------|-------|
| Page title | `font-heading` | `text-2xl` / `text-3xl` | Normal (400) | `warm-900` |
| Section heading | `font-heading` | `text-xl` | Normal (400) | `warm-800` |
| Card title | `font-sans` | `text-base` | Semibold (600) | `warm-800` |
| Body text | `font-sans` | `text-base` (16px) | Normal (400) | `warm-700` |
| Secondary text | `font-sans` | `text-sm` | Normal (400) | `warm-500` |
| Label / caption | `font-sans` | `text-xs` | Medium (500) | `warm-500` |
| Nav link | `font-sans` | `text-sm` | Medium (500) | `warm-600` |
| Nav link (active) | `font-sans` | `text-sm` | Semibold (600) | `sage-700` |

### Rules
- **Headlines use the serif font.** Everything else uses the sans.
- **Minimum body text size is 16px** (`text-base`). Never go below `text-xs` (12px) for anything.
- **Line height is relaxed.** Use `leading-relaxed` (1.625) for body paragraphs, `leading-normal` (1.5) for UI text.
- **No uppercase text.** No `tracking-widest`. This is a kitchen, not a terminal.
- **No monospace.** Even for numbers or data, use the body font.

---

## Spacing & Layout

### Spacing Scale

| Context | Value | Tailwind |
|---------|-------|----------|
| Between sections | 32-48px | `space-y-8` / `space-y-12` |
| Between cards | 16-24px | `gap-4` / `gap-6` |
| Card internal padding | 24px | `p-6` |
| Compact card padding | 16-20px | `p-4` / `p-5` |
| Between form fields | 16px | `space-y-4` |
| Page horizontal padding | 24-32px | `px-6` / `px-8` |
| Page top padding | 32px | `pt-8` |

### Layout Rules
- **Maximum content width:** `max-w-6xl` (1152px) for main content areas. Let it breathe.
- **Sidebar width:** 240px (`w-60`), with a warm background — not a dark cave.
- **Grid:** Use `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` for card layouts with `gap-6`.
- **Whitespace is a feature.** When in doubt, add more space, not less. Every element should have room to breathe.
- **No cramming.** If a card has more than 5 pieces of information, break it into sections or use a detail view.

---

## Components

### Cards

The primary container for all content. Cards should feel like paper — lightweight, warm, with a subtle lift.

```tsx
// Standard card
<div className="bg-white rounded-2xl border border-linen p-6 shadow-card transition-shadow duration-300 hover:shadow-card-hover">
  {children}
</div>

// Compact card (list items, small summaries)
<div className="bg-white rounded-xl border border-linen p-4 shadow-soft">
  {children}
</div>
```

**Card rules:**
- Always `rounded-2xl` for standard cards, `rounded-xl` for compact.
- Always white background with warm-tinted shadow. Never `bg-parchment` for cards (that's for page sections).
- Hover state: slightly deeper shadow, 300ms transition. No color change on hover.
- No colored borders. Border is always `border-linen` or `border-warm-300`.

### Buttons

```tsx
// Primary — sage green, pill shape
<button className="bg-sage-500 text-white font-medium text-sm px-6 py-2.5 rounded-full hover:bg-sage-600 active:bg-sage-700 transition-colors duration-200 shadow-sm">
  Add Item
</button>

// Secondary — outlined
<button className="border border-sage-300 text-sage-700 font-medium text-sm px-6 py-2.5 rounded-full hover:bg-sage-50 active:bg-sage-100 transition-colors duration-200">
  Cancel
</button>

// Ghost — minimal
<button className="text-sage-600 font-medium text-sm px-4 py-2 rounded-full hover:bg-sage-50 transition-colors duration-200">
  View All
</button>

// Danger — muted terracotta
<button className="bg-terra-100 text-terra-700 font-medium text-sm px-6 py-2.5 rounded-full hover:bg-terra-200 transition-colors duration-200">
  Remove
</button>
```

**Button rules:**
- Always `rounded-full` (pill shape). No sharp-cornered buttons.
- Primary actions: sage green filled. One primary button per card/section max.
- Minimum touch target: 44px height for mobile.
- Icon buttons: 40x40px (`p-2.5 rounded-full`), with hover background.
- Never red/crimson for destructive actions — use muted terracotta.

### Badges / Status Pills

```tsx
// Status badges — soft fill, no border
<span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#E8F3E8] text-status-fresh">
  ● Fresh
</span>

<span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#FFF3E0] text-status-low">
  ● Running Low
</span>

<span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#FDEAE5] text-status-out">
  ● Out
</span>
```

**Badge rules:**
- Always `rounded-full` with soft pastel backgrounds (10-15% opacity of the status color).
- Use a small filled circle `●` or a dot as the status indicator, not harsh icons.
- Text is the status color at 700-800 weight (dark enough to read).

### Navigation / Sidebar

The sidebar transforms from a dark utility bar to a warm, grounded panel.

```tsx
// Sidebar container
<aside className="w-60 bg-parchment border-r border-linen flex flex-col py-6 px-4">
  {/* Logo area */}
  <div className="mb-8 px-3">
    <span className="font-heading text-2xl text-warm-800">Pantry</span>
  </div>

  {/* Nav items */}
  <nav className="flex flex-col gap-0.5">
    {/* Active link */}
    <a className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-sage-700 bg-sage-50">
      <Icon className="w-5 h-5" />
      Dashboard
    </a>

    {/* Inactive link */}
    <a className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-warm-600 hover:text-warm-800 hover:bg-warm-100 transition-colors duration-200">
      <Icon className="w-5 h-5" />
      Inventory
    </a>
  </nav>
</aside>
```

**Sidebar rules:**
- Background: `parchment` (#F3EDE4), never dark.
- Active state: `bg-sage-50` with `text-sage-700`. Subtle, not bold.
- Icons: Required for every nav item. Use Lucide React, `strokeWidth={1.75}` (lighter than default).
- Mobile hamburger: same warm treatment, no dark overlay feel.

### Tables / Data Lists

Avoid dense data grids. Prefer card lists for small datasets. When tables are needed:

```tsx
// Table — minimal, warm
<table className="w-full">
  <thead>
    <tr className="border-b border-linen">
      <th className="text-left text-xs font-medium text-warm-500 pb-3 pr-4">Item</th>
      <th className="text-left text-xs font-medium text-warm-500 pb-3 pr-4">Category</th>
      <th className="text-right text-xs font-medium text-warm-500 pb-3">Status</th>
    </tr>
  </thead>
  <tbody>
    <tr className="border-b border-linen/50 hover:bg-warm-50 transition-colors">
      <td className="py-3.5 pr-4 text-sm text-warm-800 font-medium">Whole Milk</td>
      <td className="py-3.5 pr-4 text-sm text-warm-600">Dairy</td>
      <td className="py-3.5 text-right"><StatusBadge status="low" /></td>
    </tr>
  </tbody>
</table>
```

**Table rules:**
- Borders: only horizontal, using `border-linen` at reduced opacity.
- No zebra striping. Use hover highlight (`hover:bg-warm-50`).
- Header text: `text-xs font-medium text-warm-500`. Understated, not shouting.
- Generous row height: `py-3.5` minimum. Don't pack data in.

### Inputs / Forms

```tsx
// Text input
<input className="w-full px-4 py-3 rounded-xl border border-warm-300 bg-white text-warm-800 text-sm placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-sage-200 focus:border-sage-400 transition-all duration-200" />

// Select
<select className="w-full px-4 py-3 rounded-xl border border-warm-300 bg-white text-warm-800 text-sm focus:outline-none focus:ring-2 focus:ring-sage-200 focus:border-sage-400 appearance-none">
  <option>Choose category...</option>
</select>

// Search
<div className="relative">
  <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
  <input className="w-full pl-10 pr-4 py-3 rounded-full border border-warm-300 bg-white text-sm text-warm-800 placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-sage-200 focus:border-sage-400" placeholder="Search pantry..." />
</div>
```

**Form rules:**
- All inputs: `rounded-xl`. Search bars: `rounded-full`.
- Focus ring: `ring-sage-200` with `border-sage-400`. Gentle green glow, not harsh blue.
- Label placement: above the field, `text-sm font-medium text-warm-700 mb-1.5`.
- Minimum input height: 44px (mobile-friendly).

### Empty States

Use warm, encouraging illustrations and messaging. Empty states are opportunities to feel human.

```tsx
<div className="flex flex-col items-center justify-center py-16 text-center">
  {/* Illustration — see Iconography section */}
  <div className="w-24 h-24 mb-6 text-warm-300">
    <EmptyPantryIllustration />
  </div>
  <h3 className="font-heading text-xl text-warm-800 mb-2">Your pantry is empty</h3>
  <p className="text-sm text-warm-500 max-w-xs mb-6">
    Start by scanning a receipt or adding items manually. We'll help you keep track.
  </p>
  <button className="bg-sage-500 text-white font-medium text-sm px-6 py-2.5 rounded-full hover:bg-sage-600 transition-colors">
    Add Your First Item
  </button>
</div>
```

**Empty state rules:**
- Always centered. Always with an illustration or icon.
- Headline in serif (`font-heading`). Subtext in `text-warm-500`.
- Always offer a clear action. Don't just say "nothing here."
- Tone: encouraging, not clinical. "Your pantry is empty" not "No data found."

### Loading States

```tsx
// Skeleton — warm pulsing
<div className="animate-pulse">
  <div className="h-4 bg-warm-200 rounded-lg w-2/3 mb-3" />
  <div className="h-3 bg-warm-200 rounded-lg w-1/2" />
</div>

// Spinner — sage colored
<div className="w-5 h-5 border-2 border-sage-200 border-t-sage-500 rounded-full animate-spin" />
```

**Loading rules:**
- Skeleton colors: `bg-warm-200`, not gray.
- Match skeleton shapes to the content they replace (round avatar placeholders, text-width bars, card-shaped blocks).
- Spinners: sage green, not blue or gray.

---

## Iconography

### Library: Lucide React

```bash
npm install lucide-react
```

### Usage

```tsx
import { ShoppingCart, Leaf, ChefHat, BarChart3, Settings, Home } from 'lucide-react';

// Standard icon in UI
<ShoppingCart className="w-5 h-5 text-warm-600" strokeWidth={1.75} />

// Nav icon
<Home className="w-5 h-5" strokeWidth={1.75} />

// Decorative/large
<Leaf className="w-12 h-12 text-sage-300" strokeWidth={1.25} />
```

### Icon Rules
- **Stroke width: 1.75** for UI icons (lighter than Lucide's default of 2). This softens the feel.
- **Decorative/large icons: 1.25** stroke weight for illustration-like appearance.
- **Standard sizes:** 16px (`w-4 h-4`) for inline, 20px (`w-5 h-5`) for UI, 24px+ for features.
- **Color:** Match surrounding text color, or use `sage-*` / `warm-*` for accents.

### Nav Icons Mapping

| Page | Icon | Lucide Name |
|------|------|-------------|
| Dashboard | Home | `Home` |
| Inventory | Package | `Package` |
| Shopping List | ShoppingCart | `ShoppingCart` |
| Meal Planner | ChefHat | `ChefHat` |
| Receipts | Receipt | `Receipt` |
| Spending | BarChart3 | `BarChart3` |
| Settings | Settings | `Settings` |
| About | Leaf | `Leaf` |

### Illustration Style (Empty States, Feature Cards)

When SVG illustrations are needed (empty states, onboarding, feature highlights):
- **Style:** Simple line art with a single fill accent in `sage-100` or `terra-100`.
- **Stroke:** `warm-400` at 1.5px weight.
- **Complexity:** Keep to 1-2 objects max. A bowl, a leaf, a shopping bag. Not detailed scenes.
- **Do not** use emoji as illustration substitutes. Use proper SVG or Lucide icons at large sizes.

---

## Shadows & Elevation

### Shadow Scale

```js
// tailwind.config.ts — theme.extend.boxShadow
boxShadow: {
  'card':      '0 1px 3px rgba(139, 109, 71, 0.06), 0 4px 12px rgba(139, 109, 71, 0.04)',
  'card-hover':'0 2px 8px rgba(139, 109, 71, 0.08), 0 8px 24px rgba(139, 109, 71, 0.06)',
  'dropdown':  '0 4px 16px rgba(139, 109, 71, 0.10), 0 12px 40px rgba(139, 109, 71, 0.06)',
  'soft':      '0 1px 2px rgba(139, 109, 71, 0.04)',
}
```

### Rules
- All shadows use warm brown tint (`rgba(139, 109, 71, ...)`) — never pure black.
- Cards at rest: `shadow-card`. Cards on hover: `shadow-card-hover` with 300ms transition.
- Dropdowns/modals: `shadow-dropdown` for elevated surfaces.
- Never use `shadow-lg` or `shadow-xl` from Tailwind defaults (they're cool-gray tinted).

---

## Motion & Transitions

### General

```css
/* Default transition for interactive elements */
transition-colors duration-200
transition-shadow duration-300
transition-all duration-200

/* Page content entry */
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up {
  animation: fadeInUp 0.4s ease-out forwards;
}
```

### Rules
- **Duration:** 200ms for color/state changes, 300ms for shadow/transform, 400ms for entry animations.
- **Easing:** `ease-out` for entries, `ease-in-out` for state changes. Never linear.
- **Stagger:** When multiple cards load, stagger with 50ms delay per item (max 6 items, then batch).
- **No bouncing, no overshoot.** Gentle and grounded, not playful or springy.
- **Page transitions:** Content fades in with subtle upward motion (8px). Not dramatic.

---

## Responsive Behavior

### Breakpoints (Tailwind defaults)
- `sm` (640px) — Single column, bottom nav consideration
- `md` (768px) — Sidebar appears, 2-column grids
- `lg` (1024px) — Full layout, 3-column grids

### Mobile-First Rules
- Sidebar collapses to a slide-out drawer on mobile (already implemented).
- Cards stack single-column below `md`.
- Minimum touch target: 44x44px for all interactive elements.
- Bottom padding on pages: `pb-24` on mobile (room for potential bottom nav).
- No horizontal scrolling ever.
- Font sizes don't shrink below `text-sm` on mobile.

---

## Implementation Phases

This guide is designed for task-by-task execution by the dev agent. Each task below is independently executable and verifiable.

### Task Sequence (Recommended)

**Task 0: Foundation — Tailwind config + globals + fonts**
- Update `tailwind.config.ts` with all color, font, shadow, and animation tokens
- Replace `globals.css` with new CSS variables and warm background
- Install and configure Google Fonts in `layout.tsx`
- Install `lucide-react`
- Verify: app loads with cream background and new fonts

**Task 1: Sidebar retheme**
- Replace zinc palette with warm/sage palette
- Add Lucide icons to all nav items
- Update active/hover states per guide
- Verify: sidebar renders correctly on desktop and mobile

**Task 2: Dashboard retheme**
- Replace StatCard component with warm card styles
- Update heading typography to serif
- Replace status colors with new palette
- Apply empty/loading state patterns
- Verify: dashboard renders with warm theme, all data loads

**Task 3: Inventory page retheme**
- Update table/list to warm styling
- Replace status badges with new pill style
- Update search input
- Apply card container to page sections
- Verify: inventory loads and filters work

**Task 4: Receipts page retheme**
- Same card/typography/badge patterns
- Warm file upload area
- Verify: receipt upload flow works visually

**Task 5: Shopping List retheme**
- Card-based list items
- Checkbox styling (sage green checks)
- Verify: list functionality preserved

**Task 6: Meal Planner retheme**
- Suggestion cards with serif headings
- Ingredient tags as soft pills
- Verify: meal suggestions display correctly

**Task 7: Spending page retheme**
- Chart colors updated to sage/terra palette
- Card containers for stats
- Verify: spending data renders

**Task 8: Settings page retheme**
- Form inputs per guide spec
- Section cards
- Verify: settings save correctly

**Task 9: Empty states + polish pass**
- Add illustrated empty states to all pages
- Verify loading skeletons use warm palette
- Add entry animations
- Final consistency check across all pages

---

## What NOT to Do

- ❌ **No zinc, slate, gray, or neutral** from Tailwind defaults
- ❌ **No pure black (#000) or pure white (#FFF)** as surface colors
- ❌ **No sharp corners** — minimum `rounded-xl`, prefer `rounded-2xl`
- ❌ **No uppercase text** or wide letter-spacing
- ❌ **No monospace fonts** anywhere
- ❌ **No blue focus rings** — always sage green
- ❌ **No emoji as UI elements** — use Lucide icons
- ❌ **No dense data grids** — if it feels like a spreadsheet, redesign it
- ❌ **No cool-toned shadows** — all shadows have warm brown tint
- ❌ **No "dark mode"** — this app is light-only

---

## Quick Reference Card

| Element | Pattern |
|---------|---------|
| Page background | `bg-cream` (#FAF7F2) |
| Card | `bg-white rounded-2xl border border-linen p-6 shadow-card` |
| Page title | `font-heading text-2xl text-warm-900` |
| Body text | `text-base text-warm-700` |
| Muted text | `text-sm text-warm-500` |
| Primary button | `bg-sage-500 text-white rounded-full px-6 py-2.5` |
| Input | `rounded-xl border border-warm-300 px-4 py-3 focus:ring-sage-200` |
| Active nav | `bg-sage-50 text-sage-700 font-semibold rounded-xl` |
| Status: fresh | `bg-[#E8F3E8] text-status-fresh rounded-full px-3 py-1 text-xs` |
| Status: low | `bg-[#FFF3E0] text-status-low rounded-full px-3 py-1 text-xs` |
| Status: out | `bg-[#FDEAE5] text-status-out rounded-full px-3 py-1 text-xs` |
| Shadow | `shadow-card` / `shadow-card-hover` |
| Icon stroke | `strokeWidth={1.75}` for UI, `1.25` for decorative |
| Transition | `transition-colors duration-200` or `transition-shadow duration-300` |

---

*This guide is the source of truth for all Pantry UI work. Every task in the retheme phase should reference this document. When in doubt, choose the warmer, softer, more spacious option.*
