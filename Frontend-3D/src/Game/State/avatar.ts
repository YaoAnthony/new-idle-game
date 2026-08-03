import { defaultAvatarConfig, type AvatarConfig } from "core";

/**
 * 玩家外观的运行时权威。
 *
 * 链路和背包一样：hydrate 从存档灌进来 → 场景构建时读 → serialize 存回去。
 * 之前 serialize 里是 `previous?.player.avatar ?? 默认`——外观永远原样
 * 传抄，运行时没有任何一格真正持有它，捏脸界面捏完根本没处放。
 *
 * 游戏中途不改外观（换装镜是以后的玩法），所以没有 change 事件——
 * 场景在构建时读一次就够了。捏脸界面在**进世界之前**写入这里。
 */

let current: AvatarConfig = defaultAvatarConfig();

export function getAvatar(): AvatarConfig {
  return current;
}

export function setAvatar(avatar: AvatarConfig): void {
  current = avatar;
}

/** 读档回灌。老档缺字段的情况迁移已经补过，这里直接信任 */
export function restoreAvatar(avatar: AvatarConfig | undefined): void {
  current = avatar ?? defaultAvatarConfig();
}

export function snapshotAvatar(): AvatarConfig {
  return current;
}
