/**
 * 游戏的标记：一枚小房子（2026-09-07 自绘，替掉原来的像素 logo PNG）。
 *
 * 放在 Components/Brand 而不是 TitleScreen 底下，是因为**它不属于任何一屏**
 * ——标题页和加载页都在用，将来关于页、图标也该用它。放在某一屏的目录里，
 * 第二个用它的地方就只能反向 import 那一屏。
 *
 * 三条约束决定了它长这样：
 *
 * 1. **没有深色描边。** 这套语言（日记本那本）里所有形状都是纯色块 +
 *    圆角，一条深棕描边就会让它像贴了另一个游戏的图标。层次靠色块自己的
 *    明度差，不靠线。
 * 2. **圆角靠 stroke-linejoin 而不是 rx。** 屋顶是三角形，`rx` 对 path
 *    无效；描一圈同色的粗线并让接头变圆，等于把三个尖角磨钝——比手写
 *    带圆角的贝塞尔路径短得多，也不会在缩放时露馅。
 * 3. **配色取自同一张稿**：薄荷屋顶 #81C784、奶黄墙 #FFE082、桃色门
 *    #FF8A65、奶油窗 #FFF8E1，四个色号在 BookPlanner 里全都出现过。
 *
 * 它是纯装饰，外面那层 `<span aria-hidden>` 已经把它挡在无障碍树外，
 * 所以这里不写 title/desc——读屏软件会念旁边那行真的标题。
 */
export function HouseMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" role="presentation">
      <path
        d="M24 8 L42 23 H6 Z"
        fill="#81C784"
        stroke="#81C784"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <rect x="10" y="22" width="28" height="20" rx="6" fill="#FFE082" />
      <rect x="19" y="30" width="10" height="12" rx="5" fill="#FF8A65" />
      <circle cx="15" cy="29" r="2.6" fill="#FFF8E1" />
      <circle cx="33" cy="29" r="2.6" fill="#FFF8E1" />
    </svg>
  );
}
