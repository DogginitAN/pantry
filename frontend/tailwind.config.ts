import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Core backgrounds
        cream:     '#FAF7F2',
        parchment: '#F3EDE4',
        linen:     '#EBE3D6',
        // Primary — Sage Green
        sage: {
          50:  '#F2F7F2',
          100: '#E0EBE0',
          200: '#C2D7C2',
          300: '#9ABF9A',
          400: '#729F72',
          500: '#5B7553',
          600: '#4A6344',
          700: '#3D5239',
          800: '#2F3F2C',
          900: '#1F2B1E',
        },
        // Secondary — Terracotta
        terra: {
          50:  '#FDF5F0',
          100: '#F9E8DC',
          200: '#F0CEBA',
          300: '#E3AD8E',
          400: '#D48E65',
          500: '#C4956A',
          600: '#A8704A',
          700: '#8A5838',
          800: '#6D4430',
          900: '#4E3024',
        },
        // Neutrals — Warm
        warm: {
          50:  '#FDFCFA',
          100: '#FAF7F2',
          200: '#F3EDE4',
          300: '#E5DDD1',
          400: '#C9BFAF',
          500: '#A69A8A',
          600: '#7D7166',
          700: '#5C524A',
          800: '#3D3631',
          900: '#241F1B',
        },
        // Status colors
        status: {
          fresh: '#6B9E6B',
          low:   '#D4A843',
          out:   '#C27055',
          info:  '#6B8FA3',
        },
      },
      fontFamily: {
        sans:    ['var(--font-body)', 'DM Sans', 'system-ui', 'sans-serif'],
        heading: ['var(--font-heading)', 'DM Serif Display', 'Georgia', 'serif'],
      },
      boxShadow: {
        'card':       '0 1px 3px rgba(139, 109, 71, 0.06), 0 4px 12px rgba(139, 109, 71, 0.04)',
        'card-hover': '0 2px 8px rgba(139, 109, 71, 0.08), 0 8px 24px rgba(139, 109, 71, 0.06)',
        'dropdown':   '0 4px 16px rgba(139, 109, 71, 0.10), 0 12px 40px rgba(139, 109, 71, 0.06)',
        'soft':       '0 1px 2px rgba(139, 109, 71, 0.04)',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};
export default config;
