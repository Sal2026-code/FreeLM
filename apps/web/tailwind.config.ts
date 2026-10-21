import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
    './src/hooks/**/*.{ts,tsx}',
    '../../packages/shared/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // NotebookLM-style neutral ramp used across the whole app.
        canvas: '#0b0b0c',
        surface: '#131315',
        'surface-2': '#1a1a1d',
        'surface-3': '#232327',
        hairline: 'rgba(255,255,255,0.10)',
        'hairline-strong': 'rgba(255,255,255,0.18)',
        accent: '#1a73e8',
        'accent-soft': 'rgba(26,115,232,0.16)',
        'accent-hover': '#2b7ef0',
        success: '#81c995',
        warning: '#fdd663',
        danger: '#f28b82',
        muted: '#9aa0a6',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        pill: '999px',
        panel: '16px',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,255,255,0.06), 0 8px 30px -12px rgba(0,0,0,0.9)',
        'glow-accent': '0 0 0 1px rgba(26,115,232,0.5), 0 8px 30px -12px rgba(26,115,232,0.6)',
        panel: '0 20px 60px -20px rgba(0,0,0,0.85)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.3)', opacity: '0' },
          '100%': { transform: 'scale(1.3)', opacity: '0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        shimmer: 'shimmer 1.6s linear infinite',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.4,0,0.6,1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
