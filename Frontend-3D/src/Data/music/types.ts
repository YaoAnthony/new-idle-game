/**
 * 曲库的一条。**这不是 Core 的 AudioProfileDefinition**——
 * 那张表描述"游戏里会响的声音"（壁炉、雨、脚步），由人手写、带播放语义
 * （总线/半径/触发条件）；曲库是**玩家自己的文件夹**，由脚本扫出来，
 * 只有"这是哪首歌、文件在哪"。两者混进一张表，脚本一跑就会把手写的
 * 条目冲掉。
 */
export type MusicTrack = {
  /** 稳定 id（从相对路径推导，文件不挪窝就不变） */
  id: string;
  /** 显示名：文件名剥掉音轨号 */
  label: string;
  /** 编码好的请求路径 */
  url: string;
};

/**
 * 一张专辑 = public/music 下的一个顶层子文件夹 = 一张唱片能装的内容。
 * 唱片物品靠 `id` 对上号（见 Core 注册的唱片；文件夹改名等于换专辑）。
 */
export type MusicAlbum = {
  id: string;
  /** 文件夹原名，唱片机上显示用 */
  label: string;
  /** 封面（文件夹里的 curver.png）。物品图标和 3D 封套都渲染它 */
  coverUrl?: string;
  tracks: readonly MusicTrack[];
};

/**
 * 播放模式。唱片机按 F 循环切换，顺序在这里定死：
 * 顺序 → 随机 → 单曲循环 → 回到顺序。
 */
export const MUSIC_MODES = ["sequential", "shuffle", "repeat-one"] as const;
export type MusicMode = (typeof MUSIC_MODES)[number];
