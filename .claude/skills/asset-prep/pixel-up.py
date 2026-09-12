#!/usr/bin/env python
"""
pixel-up.py —— 像素图按整数倍最近邻放大，出 @2x / @4x。

## 为什么要有这道工序（不能交给 CSS 拉）

像素画的原始尺寸往往是 16×16 / 32×32，直接丢进界面会小得看不清。平常的做法是
让浏览器拉大，再用 `image-rendering: pixelated` 保住硬边——**但有两个地方吃不到
这条属性**：

  - `cursor: url(...)`：光标图由浏览器/系统合成，`image-rendering` 完全不参与。
    16px 的光标图在 32px 的位置上永远是平滑插值糊出来的。
  - 拿去当 `favicon` / OG 图 / 外部分享图的，走的也不是页面的渲染路径。

这两种场合只能**先把图放大好再交出去**。所以有了这个脚本。

## 为什么只收整数倍

非整数倍的最近邻会让源像素块一大一小：放 2.5 倍时，有的源像素占 2 格、有的占 3 格，
横竖都不匀，像素画那种"每格一样大"的规整感当场就没了（一眼能看出是被拉过的）。
真需要 2.5 倍，应该是设计上换一张源图，不是在这里凑。脚本直接拒掉小数。

## 为什么是最近邻

PIL 的 `resize` 默认是 BICUBIC，会在硬边上插出中间色，像素画立刻变成"油画"。
`Image.NEAREST` 是唯一能让一个源像素原样变成 N×N 实心块的采样方式。

## 为什么默认同时出 x2 和 x4

高分屏。CSS 那头用 `image-set(url(x2/a.png) 1x, url(x4/a.png) 2x)`，1× 屏取 x2、
2× 屏取 x4，两边都是整数倍、都锐。只出一张的话另一边必然糊：只给 x2，2× 屏上
浏览器把它当 64 设备像素平滑拉开；只给 x4，1× 屏上又被缩一半，边缘出灰。

## 用法

    python pixel-up.py <输入.png|输入目录> [--scales 2,4] [--out 目录] [--name 新名]

    --out    输出根目录，默认 = 输入所在目录。每个倍数落在 <out>/x<N>/ 下。
    --name   只对单文件有效：换个干净的文件名（源图常带空格和大写，
             "Arrow Mouse icon 1.png" 这种名字进 URL 要转义，不如在这儿改掉）。
    --scales 逗号分隔的整数倍，默认 2,4。

    输出**从不覆盖输入**（输入在 <out>/ 根上，输出在 <out>/x<N>/ 里），
    所以这个脚本不需要 dewhite 那套备份逻辑——源图一直在。
"""
import argparse
import os
import sys

from PIL import Image


def upscale(src_path, out_root, scales, rename=None):
    im = Image.open(src_path)
    if im.mode != "RGBA":
        # 光标/图标都靠 alpha 抠形，转 RGBA 是为了 P 模式（带调色板的 PNG）
        # 也能正确带出透明——P 模式直接 resize 会把透明索引当成普通颜色插值。
        im = im.convert("RGBA")

    base = rename or os.path.splitext(os.path.basename(src_path))[0]
    w, h = im.size
    written = []
    for n in scales:
        out_dir = os.path.join(out_root, f"x{n}")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{base}.png")
        im.resize((w * n, h * n), Image.NEAREST).save(
            out_path, "PNG", optimize=True
        )
        written.append((n, out_path, w * n, h * n, os.path.getsize(out_path)))
    return written


def main():
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("src", nargs="?")
    ap.add_argument("--scales", default="2,4")
    ap.add_argument("--out")
    ap.add_argument("--name")
    ap.add_argument("-h", "--help", action="store_true")
    args = ap.parse_args()

    if args.help or not args.src:
        print(__doc__)
        return 0

    try:
        scales = [int(s) for s in args.scales.split(",") if s.strip()]
    except ValueError:
        print(f"倍数必须是整数，收到：{args.scales}（为什么 → 读脚本头部）", file=sys.stderr)
        return 1
    if not scales or any(n < 2 for n in scales):
        print(f"倍数必须是 >= 2 的整数，收到：{args.scales}", file=sys.stderr)
        return 1

    src = args.src
    if os.path.isdir(src):
        if args.name:
            print("--name 只对单个文件有效（批量时用不了，一个名字盖不住一堆图）", file=sys.stderr)
            return 1
        files = sorted(
            os.path.join(src, f)
            for f in os.listdir(src)
            if f.lower().endswith(".png")
        )
        out_root = args.out or src
    elif os.path.isfile(src):
        files = [src]
        out_root = args.out or os.path.dirname(src) or "."
    else:
        print(f"找不到：{src}", file=sys.stderr)
        return 1

    if not files:
        print(f"{src} 里没有 PNG", file=sys.stderr)
        return 1

    for f in files:
        for n, path, w, h, size in upscale(f, out_root, scales, args.name):
            print(f"x{n}  {path}  {w}x{h}  {size}B")
    return 0


if __name__ == "__main__":
    sys.exit(main())
