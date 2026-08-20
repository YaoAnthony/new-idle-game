/**
 * 系列任务的视觉标识候选：玩家建链时挑一个图标 + 一个颜色。
 *
 * 存进档的是 **id 不是字面量**——以后换表情/调色不动存档；
 * 读到不认识的 id 一律回退第一项，老档不会因为删了候选而画崩。
 */

export const CHAIN_ICONS: ReadonlyArray<{ id: string; emoji: string }> = [
  { id: "flag", emoji: "🚩" },
  { id: "book", emoji: "📖" },
  { id: "muscle", emoji: "💪" },
  { id: "art", emoji: "🎨" },
  { id: "leaf", emoji: "🌿" },
  { id: "star", emoji: "⭐" },
  { id: "mountain", emoji: "⛰️" },
  { id: "rocket", emoji: "🚀" },
];

export const CHAIN_COLORS: ReadonlyArray<{ id: string; hex: string }> = [
  { id: "sky", hex: "#5aa7d6" },
  { id: "moss", hex: "#7aa35a" },
  { id: "clay", hex: "#c9784a" },
  { id: "plum", hex: "#9a6fb8" },
  { id: "gold", hex: "#c9a13d" },
  { id: "rose", hex: "#c96a86" },
];

export function chainEmoji(iconId: string): string {
  return (CHAIN_ICONS.find((icon) => icon.id === iconId) ?? CHAIN_ICONS[0]).emoji;
}

export function chainColor(colorId: string): string {
  return (CHAIN_COLORS.find((color) => color.id === colorId) ?? CHAIN_COLORS[0]).hex;
}
