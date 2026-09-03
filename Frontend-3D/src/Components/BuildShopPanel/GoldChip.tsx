import { materialIconUrl } from "../../Game/Systems/materials";

/**
 * 金币数额：**一枚币 + 一个数**，没有别的。
 *
 * ---- 为什么专门做一个 ----
 *
 * 上一版把余额写成了「（你有 12）」跟在价钱后面。那是把调试输出摆进了
 * 界面——玩家在游戏里不读句子，读的是图标和数字（见 public/ui-mockups
 * 那张背包概念图：一整块界面里一句完整的话都没有）。
 *
 * 币是 `/icons/gold_icon.png`，全项目同一枚。**不画 CSS 圆点代替**：
 * 那枚八角星币是这个游戏"钱"的样子，换成一个黄圆圈，玩家得重新学一次
 * 什么是钱。
 *
 * ---- 三档尺寸 ----
 *
 * `chip` 是余额（角落里的常驻信息），`price` 是要掏的钱（对话框的主角），
 * `inline` 是卡片上那种一眼扫过去的。同一件东西在三个场合的分量不同，
 * 但**长相一样**——这样玩家不用分辨"这个数是我的还是要花的"，
 * 位置和大小自己说清楚了。
 */

const SIZES = {
  /** 贴在格子角上的小价签（寄售台每格的折后价）。再小币就认不出来了 */
  mini: { coin: 14, text: "text-[11px]", pad: "px-1.5 py-[1px]" },
  inline: { coin: 20, text: "text-[15px]", pad: "px-2.5 py-[3px]" },
  chip: { coin: 22, text: "text-[16px]", pad: "px-3 py-1" },
  price: { coin: 40, text: "text-[30px]", pad: "px-5 py-1.5" },
} as const;

export function GoldChip({
  amount,
  size = "chip",
  tone = "neutral",
  strike = false,
}: {
  amount: number;
  size?: keyof typeof SIZES;
  /** short = 不够，标红。neutral = 中性（余额、够得起的价钱） */
  tone?: "neutral" | "short";
  /**
   * 划掉：原价对比用（寄售台的"标价 → 8 折"）。整个胶囊压一条斜线，
   * 连币的图标一起划——只划数字的话，玩家会以为币本身没变、只是数字变了。
   * 划掉的胶囊同时褪色，不参与"这是我的钱 / 要掏的钱"那两种读法。
   */
  strike?: boolean;
}) {
  const style = SIZES[size];
  const icon = materialIconUrl("gold");

  return (
    <span
      className={[
        "relative inline-flex items-center gap-1.5 rounded-full font-bold tabular-nums",
        style.pad,
        style.text,
        strike
          ? "bg-[#F5EDE3] text-[#8D6E63] opacity-90"
          : tone === "short"
            ? "bg-[#ffd2c6] text-[#a3392a]"
            : "bg-[var(--cream-3)] text-[#7a5a1d]",
      ].join(" ")}
    >
      {icon && (
        <img
          src={icon}
          alt=""
          style={{ width: style.coin, height: style.coin }}
          className="object-contain"
          // 币是立体渲染的，压一点投影让它像躺在胶囊上而不是贴上去的
          draggable={false}
        />
      )}
      {amount}
      {strike && (
        // 水平删除线，贴着数字中线走——斜穿整颗胶囊的线读起来像"禁止"，
        // 水平线才是全世界通用的"原价划掉"
        <span
          aria-hidden
          className="pointer-events-none absolute left-1 right-1 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[#6D4C41]/85"
        />
      )}
    </span>
  );
}
