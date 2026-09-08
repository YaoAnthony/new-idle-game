/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /*
       * `short:` = 横屏矮屏（基准机 iPhone SE 667×375）。
       *
       * 判据和 index.css / TitleScreen.css 里那条 media query 一字不差——
       * 同一块屏幕不该有两套断点。Tailwind 自带的 sm/md 按**宽度**分，
       * SE 横屏宽 667 已经过了 sm，用它们判不出"矮"；这套游戏只做横屏，
       * 真正卡版式的是高度。
       */
      screens: {
        short: { raw: '(orientation: landscape) and (max-height: 500px)' },
      },
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
