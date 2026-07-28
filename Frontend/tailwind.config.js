/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        game: [
          '"Fusion Pixel 12px Proportional SC"',
          '"Fusion Pixel 12px Proportional JP"',
          '"Noto Sans SC"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Yu Gothic"',
          '"Meiryo"',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
