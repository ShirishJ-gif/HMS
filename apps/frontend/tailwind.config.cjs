/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#162234',
        muted: '#667389',
        shell: '#f5f7fa',
        paper: 'rgba(255, 255, 255, 0.94)',
        gold: '#c58c2e',
        green: '#1d7a56',
        blue: '#1f5f8b',
        rose: '#a14a54',
        sidebar: '#242b38',
      },
      fontFamily: {
        sans: ['Avenir Next', 'Segoe UI', 'Trebuchet MS', 'sans-serif'],
      },
      borderRadius: {
        panel: '0.5rem',
      },
      boxShadow: {
        panel: '0 0.35rem 1rem rgba(22, 34, 52, 0.05)',
      },
    },
  },
  plugins: [],
};
