/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#E91E63',
        secondary: '#4CAF50',
        accent: '#FF8A65',
        background: '#FFF8F6',
        surface: '#FFFFFF',
        'text-primary': '#1A1A1A',
        'text-secondary': '#757575',
      },
    },
  },
  plugins: [],
};
