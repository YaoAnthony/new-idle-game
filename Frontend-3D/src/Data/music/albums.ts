import { findItemDefinition } from "core";
import { MUSIC_ALBUMS } from "./generated";
import type { MusicAlbum } from "./types";

/** 专辑查找的薄封装。查不到返回 undefined——专辑文件夹可能被删了 */
export function albumById(albumId: string): MusicAlbum | undefined {
  return MUSIC_ALBUMS.find((album) => album.id === albumId);
}

/** 显示名：文件夹原名。查不到就把 id 亮出来，至少能对上是哪张丢了 */
export function albumLabelOf(albumId: string): string {
  return albumById(albumId)?.label ?? albumId;
}

/**
 * 一件物品对应的专辑封面（`<专辑文件夹>/curver.png`，见生成脚本）。
 * 非唱片物品、或专辑没放封面图时返回 null——调用方各自兜底
 * （2D 图标退回 /icons，3D 封套退回纯色）。
 */
export function recordCoverUrl(itemId: string): string | null {
  const albumId = findItemDefinition(itemId)?.record?.albumId;
  if (!albumId) return null;
  return albumById(albumId)?.coverUrl ?? null;
}
