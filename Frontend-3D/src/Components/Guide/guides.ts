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
export type GuideDefinition = {
  id: string;
  titleKey: string;
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
    image: "/ui/tutorial_furniture.webp",
  },
  {
    id: "kitchen",
    titleKey: "guide.kitchen.title",
    image: "/ui/tutorial_kitchen.webp",
  },
  // 日记本（开场二）：两页——第一页从打开日记本到领奖励的五步，第二页续
  {
    id: "diary",
    titleKey: "guide.diary.title",
    images: ["/ui/tutorial_mission_1.webp", "/ui/tutorial_mission_2.webp"],
  },
];

export function findGuideDefinition(id: string): GuideDefinition | undefined {
  return guideDefinitions.find((guide) => guide.id === id);
}
