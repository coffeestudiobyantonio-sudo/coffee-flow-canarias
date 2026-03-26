/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        dashboard: {
          bg: '#0f1115',
          panel: '#1a1d24',
          border: '#2e3340',
        },
        coffee: {
          accent: '#d97706', // amber-600
          light: '#fbbf24', // amber-400
          error: '#ef4444',
          success: '#10b981',
          info: '#3b82f6',
        }
      }
    },
  },
  plugins: [],
}
