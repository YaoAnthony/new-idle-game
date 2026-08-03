import {
  avatarPalettes,
  avatarPartDefinitions,
  avatarPartsForSlot,
  defaultAvatarConfig,
  findAvatarPalette,
  findAvatarPart,
} from "../Data/avatars/index.js";
import { AvatarSlot, type AvatarConfig } from "../types/avatar.js";

/**
 * 捏人注册表自检。和 storyAudit 同一个思路：注册表全是字符串引用，
 * 拼错一个 id 不会在编译期炸，只会在玩家点开捏脸界面时表现成
 * "少一款发型"或"染不上色"——这类错要在启动时全部揪出来。
 * 文案键在 Frontend，所以由调用方传 `hasLocalizationKey`。
 */
export type AvatarAuditOptions = {
  hasLocalizationKey?: (key: string) => boolean;
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function auditAvatarContent(options: AvatarAuditOptions = {}): string[] {
  const { hasLocalizationKey } = options;
  const problems: string[] = [];

  const checkKey = (key: string, where: string): void => {
    if (hasLocalizationKey && !hasLocalizationKey(key)) {
      problems.push(`${where} 的文案键 ${key} 没有对应文案`);
    }
  };

  // ---- 零件表 ----
  const seen = new Set<string>();
  for (const part of avatarPartDefinitions) {
    if (seen.has(part.id)) problems.push(`零件 id 重复：${part.id}`);
    seen.add(part.id);
    checkKey(part.localizationKey, `零件 ${part.id}`);
    for (const colorKey of part.colorKeys) {
      if (!findAvatarPalette(colorKey)) {
        problems.push(`零件 ${part.id} 引用了不存在的调色板 ${colorKey}`);
      }
    }
  }

  // 每个槽至少一款，否则捏脸界面会出现空标签页
  for (const slot of Object.values(AvatarSlot)) {
    if (avatarPartsForSlot(slot).length === 0) {
      problems.push(`槽位 ${slot} 一款零件都没有`);
    }
  }

  // ---- 调色板 ----
  for (const palette of avatarPalettes) {
    checkKey(palette.localizationKey, `调色板 ${palette.key}`);
    if (palette.colors.length === 0) {
      problems.push(`调色板 ${palette.key} 是空的`);
    }
    for (const color of palette.colors) {
      if (!HEX_COLOR.test(color)) {
        problems.push(`调色板 ${palette.key} 里的 ${color} 不是六位十六进制色`);
      }
    }
  }

  // ---- 默认配置必须自洽：它是新档和迁移的兜底，坏了就全坏 ----
  problems.push(...auditAvatarConfig(defaultAvatarConfig(), "默认外观"));

  return problems;
}

/**
 * 校验一份具体配置（默认配置、读进来的存档、将来账户同步下来的数据
 * 都走这一个口）。只报问题不修数据——修是迁移的事，校验不该有副作用。
 */
export function auditAvatarConfig(
  config: AvatarConfig,
  where: string,
): string[] {
  const problems: string[] = [];

  const slotIds: [AvatarSlot, string][] = [
    [AvatarSlot.Body, config.bodyId],
    [AvatarSlot.Face, config.faceId],
    [AvatarSlot.Hair, config.hairId],
    [AvatarSlot.Eyes, config.eyesId],
    [AvatarSlot.Mouth, config.mouthId],
    [AvatarSlot.Nose, config.noseId],
    [AvatarSlot.Top, config.topId],
    [AvatarSlot.Bottom, config.bottomId],
    [AvatarSlot.Shoes, config.shoesId],
  ];
  for (const [slot, id] of slotIds) {
    const part = findAvatarPart(id);
    if (!part) {
      problems.push(`${where} 的 ${slot} 槽引用了不存在的零件 ${id}`);
    } else if (part.slot !== slot) {
      problems.push(`${where} 把 ${part.slot} 槽的零件 ${id} 塞进了 ${slot} 槽`);
    }
  }

  for (const [key, color] of Object.entries(config.colors)) {
    if (!findAvatarPalette(key)) {
      problems.push(`${where} 的颜色键 ${key} 没有对应调色板`);
    }
    if (!HEX_COLOR.test(color)) {
      problems.push(`${where} 的颜色 ${key}=${color} 不是六位十六进制色`);
    }
  }

  return problems;
}
