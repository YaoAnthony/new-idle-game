/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        game: [
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
