#!/bin/bash
#
# dewhite —— 白底出图转透明底。
#
# 3D 渲染/AI 出图默认给的是**白底不透明 PNG**，直接丢进 public/icons/ 会在
# 奶油色格子上显出一个白方块（.ui-slot 的底是 #fffcf5→#fff4e6 的渐变，不是纯白，
# 差得出来）。这个脚本把背景抠成透明，其余像素一个不动。
#
# ## 为什么不是"接近白就透明"
#
# 全局阈值会把物体自己打穿：云朵灯的灯罩最亮处 #FFF8E0、家具小店的米白墙
# #F2EAD9，离纯白都只有 7%~10%，任何能吃掉背景的全局阈值也会吃掉它们。
#
# 所以这里分两步：
#
#   1. **从画布四角连通泛洪**拿背景。只有"从画布边缘一路走得到"的白才算背景，
#      物体内部的浅色（灯罩、白墙、遮阳篷的白条）走不到边，天然安全。
#   2. **背景区里按'离白多远'给渐变 alpha**，而不是一刀切 0/1。抗锯齿边、
#      灯的辉光、脚下的软投影都会平滑淡出——一刀切会在深色底上留一圈硬白边。
#
# 最后两张 alpha 取 max 贴回：物体区恒为 1，背景区用渐变值。
#
# ## fuzz 怎么定
#
# 第 3 个参数是泛洪容差（默认 10%）。调之前先跑一遍扫描确认没有"突变"：
# fuzz 从 3% 加到 20%，不透明像素占比应该平滑缩小；出现断崖 = 泛洪从某个
# 浅色边缘钻进物体内部了，得往回调。云朵灯用 12%，两栋建筑用 10%。
#
# 用法:
#   ./dewhite.sh 输入.png [输出.png] [fuzz百分比]
#   ./dewhite.sh 输入.png [fuzz百分比]            # 省略输出 = 原地覆盖
#
#   原地覆盖时原图先备份到 /tmp（路径会打印出来）。
#
set -euo pipefail

if [ $# -lt 1 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
  sed -n '2,41p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

IN="$1"
# 第二个参数是纯数字就当 fuzz——`dewhite.sh 图.png 12` 是最顺手的写法，
# 不这么判会把 12 当成输出路径，在当前目录默默造一个叫 "12" 的 PNG
if [[ "${2:-}" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
  OUT="$IN"
  FUZZ="$2"
else
  OUT="${2:-$1}"
  FUZZ="${3:-10}"
fi

command -v magick >/dev/null 2>&1 || { echo "缺 ImageMagick：brew install imagemagick" >&2; exit 1; }
[ -f "$IN" ] || { echo "找不到输入文件：$IN" >&2; exit 1; }

# 原地覆盖先备份。抠图是有损的（背景像素被丢了），出了问题要能退回去
if [ "$OUT" = "$IN" ]; then
  BACKUP="/tmp/dewhite-backup-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP"
  cp "$IN" "$BACKUP/$(basename "$IN")"
  echo "原图备份：$BACKUP/$(basename "$IN")"
fi

W=$(magick identify -format "%w" "$IN")
H=$(magick identify -format "%h" "$IN")
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT

# 1) 四角连通泛洪 → 物体遮罩（物体=255，背景=0）。四个角都放种子，
#    是为了背景被物体切成几块时（比如图钉在角上）不漏掉任何一块
magick "$IN" -alpha set -fuzz "${FUZZ}%" -fill none \
  -floodfill "+0+0" white \
  -floodfill "+$((W - 1))+0" white \
  -floodfill "+0+$((H - 1))" white \
  -floodfill "+$((W - 1))+$((H - 1))" white \
  -alpha extract "$T/mask.png"

# 2) 渐变 alpha = (255 - min(R,G,B) - 底噪) x 5.1
#    min 通道对"白"最敏感：纯白 min=255，淡黄辉光 min≈236，木头 min≈33。
#    减底噪那一步必须写成百分比——本机 ImageMagick 是 Q16 编译的，
#    `-evaluate subtract 6` 会被当成 6/65535 基本无效，纯白背景会留下 alpha≈4
#    的一层灰雾（深色底上就是一个淡淡的白方块）。
magick "$IN" -channel RGB -separate -evaluate-sequence min -negate \
  -evaluate subtract 2.4% -evaluate multiply 5.1 "$T/glow.png"

# 3) 取 max 合成，贴回 alpha 通道
magick "$T/mask.png" "$T/glow.png" -evaluate-sequence max "$T/alpha.png"
magick "$IN" "$T/alpha.png" -alpha off -compose CopyOpacity -composite \
  -strip -define png:compression-level=9 -define png:compression-filter=5 "$OUT"

printf "完成：%s  (%s, %s KB)\n" "$OUT" \
  "$(magick identify -format '%wx%h %[channels]' "$OUT")" \
  "$(($(wc -c <"$OUT") / 1024))"
