export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      colors: {
        brown: {
          50: '#fdf8f6',
          100: '#f2e8e5',
          200: '#eaddd7',
          300: '#e0a96d',
          400: '#b87333',
          500: '#a0522d',
          600: '#92400e', // Amber-800 / Padrão "A confirmar"
          700: '#78350f', // Amber-900
          800: '#5c2c16',
          900: '#451a03',
        },
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc7fb',
          400: '#36abf7',
          500: '#0c91eb',
          600: '#0072c9',
          700: '#015ba3',
          800: '#064e86',
          900: '#0b416f',
          950: '#07294a',
        },
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
        '6xl': '3rem',
      },
    },
  },
  plugins: [],
};