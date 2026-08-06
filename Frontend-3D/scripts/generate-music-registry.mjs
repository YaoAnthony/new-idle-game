import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 递归扫 public/music，生成曲库注册表（src/Data/music/generated.ts）。
 *
 * **为什么是构建期脚本而不是运行时发现**：浏览器根本列不了目录——
 * 静态服务器只回答"给我这个文件"，不回答"这里有哪些文件"。
 * Oldfrontend 的 generate-music-registry.mjs 就是这么做的，此处照抄
 * 它的标准：递归、自然序排序、从文件名剥掉音轨号当标题、路径 URL 编码。
 *
 * 挂在 predev / prebuild 上自动跑：往 public/music 里扔文件 → 重启 dev
 * 就进曲库，不需要记得手动执行什么。产物提交进仓库（和 Oldfrontend 一致），
 * 这样没有音乐文件的环境（CI、刚 clone）也能通过编译。
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const musicDir = path.join(frontendRoot, "public", "music");
const output = path.join(frontendRoot, "src", "Data", "music", "generated.ts");

/** 浏览器普遍能解的格式。flac/aac 各家支持参差，不收 */
const supportedExtensions = new Set([".mp3", ".wav", ".ogg", ".m4a"]);

function collectMusicFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMusicFiles(fullPath));
      continue;
    }
    if (
      !entry.isFile() ||
      !supportedExtensions.has(path.extname(entry.name).toLowerCase())
    ) {
      continue;
    }
    files.push(path.relative(musicDir, fullPath).split(path.sep).join("/"));
  }
  return files;
}

/**
 * `1-02. 1200 AM (Sunny).mp3` → 标题 `1200 AM (Sunny)`。
 * 音轨号（`1-02.` / `03 -` / `07_` 这类前缀）是专辑的事，不是曲名的事。
 */
function labelOf(fileName) {
  const base = path.posix.basename(fileName, path.posix.extname(fileName));
  const stripped = base
    .replace(/^\d+(?:-\d+)?[.\s_-]+/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || base;
}

/** 稳定 id：取相对路径（不含扩展名）做 slug。文件不挪窝 id 就不变 */
function idOf(relativePath) {
  const withoutExt = relativePath.slice(
    0,
    -path.posix.extname(relativePath).length,
  );
  const slug = withoutExt
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `music.${slug || "track"}`;
}

/** 空格、括号、中文都要编码，否则 <audio src> 在部分环境下 404 */
function urlOf(relativePath) {
  return `/music/${relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/'/g, "%27"))
    .join("/")}`;
}

const files = collectMusicFiles(musicDir).sort((a, b) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
);

/**
 * **一个顶层子文件夹 = 一张专辑（= 一张唱片能放的内容）。**
 * 散落在 music 根目录的文件归进 "misc" 专辑，不丢。
 * 专辑 id 从文件夹名 slug 出来：唱片物品（Core 注册）靠这个 id 对上号，
 * 文件夹改名 = 换了一张专辑，旧唱片会指向空专辑——所以文件夹名要稳定。
 */
function albumOf(relativePath) {
  const slash = relativePath.indexOf("/");
  if (slash < 0) return { id: "misc", label: "Misc" };
  const folder = relativePath.slice(0, slash);
  return { id: slugOf(folder), label: folder };
}

function slugOf(value) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "album";
}

/** 专辑封面：文件夹里放一张 curver.png（统一用这个名，2026-08-05 定） */
function coverOf(folder) {
  const coverPath = path.join(musicDir, folder, "curver.png");
  if (!fs.existsSync(coverPath)) return undefined;
  return `/music/${encodeURIComponent(folder).replace(/'/g, "%27")}/curver.png`;
}

const albums = new Map();
for (const relativePath of files) {
  const { id, label } = albumOf(relativePath);
  if (!albums.has(id)) {
    const slash = relativePath.indexOf("/");
    const folder = slash < 0 ? null : relativePath.slice(0, slash);
    albums.set(id, {
      id,
      label,
      ...(folder && coverOf(folder) ? { coverUrl: coverOf(folder) } : {}),
      tracks: [],
    });
  }
  albums.get(id).tracks.push({
    id: idOf(relativePath),
    label: labelOf(relativePath),
    url: urlOf(relativePath),
  });
}

const content = `// 由 scripts/generate-music-registry.mjs 生成，不要手改。
// 往 public/music 里放文件夹（一个文件夹 = 一张专辑，mp3/wav/ogg/m4a），重启 dev 即生效。
import type { MusicAlbum } from "./types";

export const MUSIC_ALBUMS: readonly MusicAlbum[] = ${JSON.stringify([...albums.values()], null, 2)};
`;

fs.mkdirSync(path.dirname(output), { recursive: true });
if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== content) {
  fs.writeFileSync(output, content, "utf8");
}
console.log(`music registry: ${albums.size} albums, ${files.length} tracks`);
