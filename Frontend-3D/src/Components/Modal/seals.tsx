/**
 * 印章：绽开动画中间那半秒里出现的那枚圆牌。
 *
 * **全部用实心块面画，不用线性图标。** 上一版 UI 被打回就是因为那套
 * 细线图标——它是 AI 生成界面的典型长相，放在游戏里像个后台管理系统。
 * 实心块面还有个实际好处：缩到 50px 也不糊，而 2px 的线在 50px 圆牌里
 * 会碎成一团。
 *
 * 每枚都是 115×115 的 viewBox，外圈一道窄白边 + 内圈一块底色，
 * 和面板外壳的同心结构呼应——印章就是那块面板缩起来的样子。
 */

type SealProps = {
  /** 内圈底色。默认跟面板的框色走 */
  ground?: string;
};

const PAPER = "#fdfbf7";

function Ring({ ground, children }: SealProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 115 115" width="100%" height="100%" fill="none" aria-hidden>
      <circle cx="57.5" cy="57.5" r="57.5" fill={PAPER} />
      <circle cx="57.5" cy="57.5" r="51" fill={ground} />
      {children}
    </svg>
  );
}

/** 行动：一栋房子（这游戏叫「我的异世界小家」，据点本身就是主角） */
export function HouseSeal({ ground = "#2f6b58" }: SealProps) {
  return (
    <Ring ground={ground}>
      {/* 屋顶：厚三角，两侧出檐——出檐是"房子"这个剪影的辨识点 */}
      <path d="M57.5 24 L96 57 H82 L57.5 37 L33 57 H19 Z" fill={PAPER} />
      <path d="M31 57 H84 V90 H31 Z" fill="#ffc94d" />
      {/* 门挖到底沿，读得出"进得去" */}
      <path d="M50 68 H65 V90 H50 Z" fill={ground} />
      <path d="M37 64 H46 V73 H37 Z" fill={PAPER} />
      <path d="M69 64 H78 V73 H69 Z" fill={PAPER} />
    </Ring>
  );
}

/** 每日任务：一张钉在板上的便签 */
export function NoteSeal({ ground = "#c96a4e" }: SealProps) {
  return (
    <Ring ground={ground}>
      <path d="M32 30 H83 V85 H32 Z" fill={PAPER} />
      {/* 三道"字迹"。长短不一才像手写，等长会读成表格 */}
      <path d="M41 46 H74 V51 H41 Z" fill={ground} />
      <path d="M41 58 H68 V63 H41 Z" fill={ground} />
      <path d="M41 70 H58 V75 H41 Z" fill={ground} />
      {/* 图钉 */}
      <circle cx="57.5" cy="30" r="8" fill="#ffc94d" />
    </Ring>
  );
}

/** 背包：一个鼓鼓的口袋 */
export function BagSeal({ ground = "#7a5aa8" }: SealProps) {
  return (
    <Ring ground={ground}>
      <path d="M30 52 H85 V88 H30 Z" fill="#ffc94d" />
      {/* 提手：两条竖 + 一条横，比画一个 U 形更利落，也不会缩糊 */}
      <path d="M43 32 H50 V52 H43 Z" fill={PAPER} />
      <path d="M65 32 H72 V52 H65 Z" fill={PAPER} />
      <path d="M43 32 H72 V39 H43 Z" fill={PAPER} />
      <path d="M30 52 H85 V60 H30 Z" fill={PAPER} />
    </Ring>
  );
}

/** 建筑管理：一把锤子。盖房、升级、拆除都是它 */
export function HammerSeal({ ground = "#66BB6A" }: SealProps) {
  return (
    <Ring ground={ground}>
      {/* 锤头：一整块厚方，斜着放才有"抡起来"的势 */}
      <g transform="rotate(40 57.5 57.5)">
        <path d="M34 30 H81 V52 H34 Z" fill={PAPER} />
        {/* 柄：从锤头中点垂下来，底端一圈缠把 */}
        <path d="M52 52 H63 V88 H52 Z" fill="#ffc94d" />
        <path d="M52 78 H63 V85 H52 Z" fill={PAPER} />
      </g>
    </Ring>
  );
}

/** 货架：两层格板，架上蹲着几件小货。上架面板的身份 */
export function ShelfSeal({ ground = "#c9862e" }: SealProps) {
  return (
    <Ring ground={ground}>
      {/* 两块横板 */}
      <path d="M28 48 H87 V55 H28 Z" fill={PAPER} />
      <path d="M28 72 H87 V79 H28 Z" fill={PAPER} />
      {/* 上层的货：一高一矮 */}
      <path d="M36 32 H50 V48 H36 Z" fill="#ffc94d" />
      <path d="M58 38 H74 V48 H58 Z" fill={PAPER} />
      {/* 下层的货：一矮一高 */}
      <path d="M38 62 H52 V72 H38 Z" fill={PAPER} />
      <path d="M62 56 H76 V72 H62 Z" fill="#ffc94d" />
    </Ring>
  );
}

/**
 * 寄售台：一只箱子，箱盖上坐着一只钱袋。
 *
 * 不复用货架那枚（两层格板 + 货品是"开店"的身份）：面板认不出自己是干嘛的，
 * 开场那半秒的印章也得说对话。钱袋和三维场景里招牌上那只、面板招牌行那枚
 * 是同一个形象，三处对得上。
 */
export function ChestSeal({ ground = "#d9702f" }: SealProps) {
  return (
    <Ring ground={ground}>
      {/* 箱体 */}
      <path d="M28 52 H87 V86 H28 Z" fill={PAPER} />
      {/* 箱盖：比箱体宽一圈，压在上沿——"有盖子的箱子"这个读法靠这条线 */}
      <path d="M24 44 H91 V54 H24 Z" fill="#ffc94d" />
      {/* 两条竖向包边 */}
      <path d="M40 54 H46 V86 H40 Z" fill={ground} />
      <path d="M69 54 H75 V86 H69 Z" fill={ground} />
      {/* 钱袋：坐在箱盖正上方 */}
      <circle cx="57.5" cy="30" r="14" fill="#ffc94d" />
      <path d="M50 20 H65 V26 H50 Z" fill={PAPER} />
      <circle cx="57.5" cy="19" r="4" fill={PAPER} />
    </Ring>
  );
}
