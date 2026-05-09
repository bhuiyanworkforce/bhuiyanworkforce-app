/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Syne", "system-ui", "sans-serif"],
      },
      colors: {
        // Semantic palette — use these instead of arbitrary values
        background: '#050D1A',   // bg-background  (was bg-[#050D1A])
        surface:    '#080F1E',   // bg-surface      (was bg-[#080F1E])
        primary: {
          DEFAULT: '#6366f1',    // indigo-500
          light:   '#818cf8',    // indigo-400
          subtle:  'rgba(99,102,241,0.15)',
        },
        secondary: {
          DEFAULT: '#7c3aed',    // violet-600
        },
        success: {
          DEFAULT: '#34d399',    // emerald-400
          subtle:  'rgba(52,211,153,0.10)',
        },
        danger: {
          DEFAULT: '#f87171',    // red-400
          subtle:  'rgba(248,113,113,0.10)',
        },
        warning: {
          DEFAULT: '#fbbf24',    // amber-400
          subtle:  'rgba(251,191,36,0.15)',
        },
      },
    },
  },
  plugins: [],
}
