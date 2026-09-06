/**
 * 门口装饰表（居民系统 11）：生日彩带、节日灯笼。渲染在建筑等级的 `decorationAnchor`，
 * **不占展示位**——送的灯不会被彩带挤掉。造型是表现层查 `visualId`（占位几何，参考图到了换）。
 */
export type DecorationDefinition = { id: string; visualId: string };

export const decorationDefinitions: readonly DecorationDefinition[] = [
  { id: "birthday", visualId: "porch_birthday" },
  { id: "festival", visualId: "porch_festival" },
];

export function findDecoration(id: string): DecorationDefinition | undefined {
  return decorationDefinitions.find((entry) => entry.id === id);
}
