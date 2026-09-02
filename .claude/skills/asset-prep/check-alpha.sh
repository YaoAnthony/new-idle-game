#!/bin/bash
#
# check-alpha —— 扫一个目录，找出"还是白底不透明"的 PNG。
#
# 白底图在界面上不报错，只是安静地显示成一个白方块（`<img>` 拿到图了，
# 只是这张图四边是白的），光靠玩发现不了——所以要有一条能主动扫出来的命令。
#
# 判定分两步，顺序不能反：
#
#   1. **有没有真的透明像素**（alpha 最小值 < 1）。只看"有没有 alpha 通道"
#      会漏——有些导出器给的是"带 alpha 通道但整张全 255"的图，通道在，
#      效果和没有一样。
#   2. 全不透明的，再看**四角是不是接近白**。四角都白 = 典型的白底出图，
#      建议跑 dewhite；四角是别的颜色 = 满幅图（portraits/ 的立绘、
#      ui-mockups/ 的设计稿就是这种），本来就该不透明，不要动。
#
# 用法:
#   ./check-alpha.sh [目录]        # 默认 Frontend-3D/public
#
set -euo pipefail

DIR="${1:-Frontend-3D/public}"

command -v magick >/dev/null 2>&1 || { echo "缺 ImageMagick：brew install imagemagick" >&2; exit 1; }
[ -d "$DIR" ] || { echo "找不到目录：$DIR" >&2; exit 1; }

total=0
white=0
opaque=0

echo "扫描 $DIR"
echo

while IFS= read -r f; do
  total=$((total + 1))

  read -r w h aflag <<<"$(magick identify -format "%w %h %A" "$f")"

  # 第 1 步：有没有真的透明像素。没有 alpha 通道时 -alpha extract 会得到全 255，
  # minima 正好是 1，和"有通道但全不透明"落在同一个分支，不用分开写
  mina=$(magick "$f" -alpha extract -format "%[fx:minima]" info:)
  if [ "$(echo "$mina < 0.99" | bc -l)" = "1" ]; then
    continue
  fi

  opaque=$((opaque + 1))

  # 第 2 步：四角取"最暗的那个通道"，四个角里再取最小。全部 >= 0.96(≈245) 才算白底
  corners=$(magick "$f" -format \
    "%[fx:min(min(p{0,0}.r,p{0,0}.g),p{0,0}.b)] \
     %[fx:min(min(p{w-1,0}.r,p{w-1,0}.g),p{w-1,0}.b)] \
     %[fx:min(min(p{0,h-1}.r,p{0,h-1}.g),p{0,h-1}.b)] \
     %[fx:min(min(p{w-1,h-1}.r,p{w-1,h-1}.g),p{w-1,h-1}.b)]" info:)
  darkest=$(printf '%s\n' $corners | sort -n | head -1)

  if [ "$(echo "$darkest >= 0.96" | bc -l)" = "1" ]; then
    white=$((white + 1))
    printf "  白底  %-46s %sx%s  ← 跑 dewhite.sh\n" "${f#"$DIR"/}" "$w" "$h"
  else
    printf "  满幅  %-46s %sx%s  (四角有颜色，应该是故意的，别动)\n" "${f#"$DIR"/}" "$w" "$h"
  fi
done < <(find "$DIR" -name "*.png" | sort)

echo
if [ "$white" -eq 0 ]; then
  echo "PASS：$total 张 PNG，没有白底图（其中 $opaque 张全不透明，都是满幅图）"
else
  echo "发现 $white 张白底图（共 $total 张 PNG）——挨个跑 dewhite.sh，跑完再扫一次应该 PASS"
fi
