import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#fff4ec', 100: '#ffe9d9', 500: '#f57c32', 600: '#ef6f1d', 700: '#d9651e' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 10px 25px rgba(17, 24, 39, 0.06)' },
    },
  },
} satisfies Config;