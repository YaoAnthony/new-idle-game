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
      /*
       * 自定义鼠标光标。值指向 index.css 的 `--cursor-*` 变量，**图和热点只在
       * 那一处定义**，这里只是把 Tailwind 的四个工具类接过去。
       *
       * 为什么要动 Tailwind 而不是只写全局 CSS：`cursor-pointer` /
       * `cursor-grab` / `active:cursor-grabbing` 这些类名在 tsx 里用了 40 来处，
       * 它们生成的是 `cursor: pointer` 这种**字面值**，全局 CSS 盖不过类名，
       * 漏掉这一步的结果是"背包和拖拽那一片还是系统小手"。
       *
       * `extend` 是合并不是替换，`not-allowed` / `text` / `wait` 这些没列的
       * 还是 Tailwind 原样——那几个故意不换，见 index.css 光标那节的末尾。
       */
      cursor: {
        default: 'var(--cursor-default)',
        pointer: 'var(--cursor-pointer)',
        grab: 'var(--cursor-grab)',
        grabbing: 'var(--cursor-grabbing)',
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
