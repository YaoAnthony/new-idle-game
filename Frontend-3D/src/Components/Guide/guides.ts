/**
 * 引导面板的内容表（2026-09-09）。剧情效果 `show_guide` 按 guideId 来这里找。
 *
 * 一条引导 = 标题 + 说明 + 一张示意图（还没画的先留空位，面板会画一块占位）。
 * 加一条引导 = 这里加一行 + 文案表加两个键；触发时机写在 Core 的 storyRules 里，
 * 这张表不知道"什么时候弹"。
 *
 * 示意图放 public/ui/，存 WebP 不存 PNG：这种满幅插画 PNG 1.6 MB、WebP 质量 85
 * 只有 100 KB，肉眼看不出差别，而它是开场第一分钟就要下载的东西。
 */
export type GuideDefinition = {
  id: string;
  titleKey: string;
  bodyKey: string;
  /** public/ 下的示意图路径。没画好就不填，面板画占位 */
  image?: string;
};

export const guideDefinitions: GuideDefinition[] = [
  {
    id: "place_furniture",
    titleKey: "guide.place_furniture.title",
    bodyKey: "guide.place_furniture.body",
    image: "/ui/tutorial_furniture.webp",
  },
];

export function findGuideDefinition(id: string): GuideDefinition | undefined {
  return guideDefinitions.find((guide) => guide.id === id);
}
