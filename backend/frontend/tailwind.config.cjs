/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        brand: {
          white: '#FFFFFF',
          dark: '#1B2A4A',
          accent: '#D4A574',
        },
      },
    },
  },
  plugins: [],
};
