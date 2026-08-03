import { findAudioProfileDefinition } from "../Data/audio/index.js";
import { doorDefinitions } from "../Data/doors/index.js";

/**
 * 门注册表自检，和 story / avatar 审计同一个思路：
 * 全是字符串引用和裸数字，错了不炸编译，运行时表现成
 * "门永远不自动开"这类查不出来的哑巴病。
 */
export type DoorAuditOptions = {
  hasLocalizationKey?: (key: string) => boolean;
};

export function auditDoorContent(options: DoorAuditOptions = {}): string[] {
  const { hasLocalizationKey } = options;
  const problems: string[] = [];

  const seen = new Set<string>();
  for (const definition of doorDefinitions) {
    if (seen.has(definition.id)) problems.push(`门 id 重复：${definition.id}`);
    seen.add(definition.id);

    if (hasLocalizationKey && !hasLocalizationKey(definition.localizationKey)) {
      problems.push(
        `门 ${definition.id} 的文案键 ${definition.localizationKey} 没有对应文案`,
      );
    }

    /*
     * 声音档案引用。拼错的表现是"这扇门没声音"——比开不了门更难发现，
     * 因为没人会怀疑是 id 写错了，只会以为素材还没做。
     */
    for (const [when, profileId] of Object.entries(definition.sounds ?? {})) {
      if (profileId && !findAudioProfileDefinition(profileId)) {
        problems.push(
          `门 ${definition.id} 的${when}声引用了不存在的音频档案 ${profileId}`,
        );
      }
    }

    const behavior = definition.behavior;
    if (behavior?.autoOpenRadius !== undefined) {
      if (behavior.autoCloseRadius === undefined) {
        problems.push(
          `门 ${definition.id} 有自动开半径却没有关门半径，开了就永远不关`,
        );
      } else if (behavior.autoCloseRadius <= behavior.autoOpenRadius) {
        problems.push(
          `门 ${definition.id} 的关门半径(${behavior.autoCloseRadius})必须大于` +
            `开门半径(${behavior.autoOpenRadius})，否则生物站在临界距离上会抖`,
        );
      }
    }
  }

  return problems;
}
