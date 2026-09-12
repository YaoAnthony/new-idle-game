/**
 * 引导面板的内容表（2026-09-09）。剧情效果 `show_guide` 按 guideId 来这里找。
 *
 * 一条引导 = 标题 + 一张示意图（还没画的先留空位，面板会画一块占位）+ 可选的一句说明。
 * 图画好之后说明就多余了：摆家具那条原本有一句操作说明，图上三步已经把话说完，
 * 底下再来一行字反而像没看图的人在念稿，删了。没图的引导可以先靠说明撑着。
 * 加一条引导 = 这里加一行 + 文案表加键；触发时机写在 Core 的 storyRules 里，
 * 这张表不知道"什么时候弹"。
 *
 * 示意图放 public/ui/，存 WebP 不存 PNG：这种满幅插画 PNG 1.6 MB、WebP 质量 85
 * 只有 100 KB，肉眼看不出差别，而它是开场第一分钟就要下载的东西。
 */
/**
 * 攻略查询器的分类（2026-09-12）。顺序即左栏顺序；**没有条目的分类不显示**
 * （白噪音 / 常见问题现在是空的，教程补进来它们自动出现）。
 */
export const GUIDE_CATEGORY_ORDER = ["furniture", "cooking", "diary", "rewards", "ambience", "faq"] as const;
export type GuideCategory = (typeof GUIDE_CATEGORY_ORDER)[number];

/** 左栏每个分类前面那个小图。设计稿是插画，先用 emoji 顶着 */
export const GUIDE_CATEGORY_ICON: Record<GuideCategory, string> = {
  furniture: "🛋️",
  cooking: "🍲",
  diary: "📔",
  rewards: "🎁",
  ambience: "🎵",
  faq: "💬",
};

/** 卡片右上角的标签 */
export type GuideTag = "basic" | "recommended" | "newbie";

export type GuideDefinition = {
  id: string;
  titleKey: string;
  /** 攻略查询器：归哪一类 */
  category: GuideCategory;
  /** 攻略查询器：卡片上那句副标题（"学会拿出家具、旋转方向、完成放置"） */
  subtitleKey: string;
  /** 攻略查询器：右上角标签。不填不显示 */
  tag?: GuideTag;
  /** 攻略查询器：缩略图。不填用第一张图裁 */
  thumb?: string;
  /** 图下面的一句说明。有图就别写，图说不清的才补 */
  bodyKey?: string;
  /** public/ 下的示意图路径。没画好就不填，面板画占位 */
  image?: string;
  /** 多张图（一页一张，面板给翻页箭头和页码点）。和 image 二选一，都给了 images 优先 */
  images?: string[];
};

/** 这条引导的图，按页序。没图 = 空数组（面板画占位） */
export function guideImages(guide: GuideDefinition): string[] {
  if (guide.images && guide.images.length > 0) return guide.images;
  return guide.image ? [guide.image] : [];
}

export const guideDefinitions: GuideDefinition[] = [
  {
    id: "place_furniture",
    titleKey: "guide.place_furniture.title",
    category: "furniture",
    subtitleKey: "guide.place_furniture.subtitle",
    tag: "basic",
    image: "/ui/tutorial_furniture.webp",
  },
  {
    id: "kitchen",
    titleKey: "guide.kitchen.title",
    category: "cooking",
    subtitleKey: "guide.kitchen.subtitle",
    tag: "recommended",
    image: "/ui/tutorial_kitchen.webp",
  },
  // 日记本（开场二）：两页——第一页从打开日记本到领奖励的五步，第二页续
  {
    id: "diary",
    titleKey: "guide.diary.title",
    category: "diary",
    subtitleKey: "guide.diary.subtitle",
    tag: "newbie",
    images: ["/ui/tutorial_mission_1.webp", "/ui/tutorial_mission_2.webp"],
  },
  // 查询器里单列一条「P 人也能领奖励」：图就是日记本教程的第二页（设计稿里它是独立条目）
  {
    id: "backfill",
    titleKey: "guide.backfill.title",
    category: "rewards",
    subtitleKey: "guide.backfill.subtitle",
    tag: "recommended",
    image: "/ui/tutorial_mission_2.webp",
  },
];

export function findGuideDefinition(id: string): GuideDefinition | undefined {
  return guideDefinitions.find((guide) => guide.id === id);
}

/** 有条目的分类，按 GUIDE_CATEGORY_ORDER */
export function guideCategoriesInUse(): GuideCategory[] {
  return GUIDE_CATEGORY_ORDER.filter((category) => guideDefinitions.some((guide) => guide.category === category));
}
