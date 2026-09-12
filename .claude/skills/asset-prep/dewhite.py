#!/usr/bin/env python
"""
dewhite.py —— dewhite.sh 的 Python 版，给没装 ImageMagick 的机器用（Windows 这台就是）。

算法**逐步照抄** dewhite.sh，别在这里另起一套：
  1. 四角连通泛洪拿背景：从四个角出发，只有"离白不超过 fuzz%"且连通的像素算背景。
     物体内部的浅色（灯罩、白墙）走不到边，天然安全。
  2. 背景区里按"离白多远"给渐变 alpha：alpha = (255 - min(R,G,B) - 底噪 2.4%) × 5.1，
     抗锯齿边、辉光、软投影平滑淡出，一刀切会在深色底上留一圈硬白边。
  3. 两张 alpha 取 max 贴回：物体区恒 255，背景区用渐变值。

"离白多远"用 max(|255-R|,|255-G|,|255-B|)/255 对应 ImageMagick 的 -fuzz（近似，
IM 用的是 RGB 距离；差别只在边缘一两个像素）。

用法（和 sh 版一致）:
  python dewhite.py 输入.png [输出.png] [fuzz百分比]
  python dewhite.py 输入.png [fuzz百分比]          # 原地覆盖，原图备份到系统临时目录
  python dewhite.py --scan 输入.png                 # 只扫 fuzz 3..20 的不透明占比，不写文件
"""
import os
import re
import shutil
import sys
import tempfile
import time

import numpy as np
from PIL import Image
from scipy import ndimage


def background_mask(rgb: np.ndarray, fuzz_pct: float) -> np.ndarray:
    """True = 背景（从四角连通、且离白 ≤ fuzz）"""
    dist = (255 - rgb.min(axis=2)).astype(np.float32) / 255.0
    near_white = dist <= fuzz_pct / 100.0
    labels, _ = ndimage.label(near_white)
    h, w = near_white.shape
    seeds = {labels[0, 0], labels[0, w - 1], labels[h - 1, 0], labels[h - 1, w - 1]}
    seeds.discard(0)
    if not seeds:
        return np.zeros_like(near_white)
    return np.isin(labels, list(seeds))


def dewhite(rgb: np.ndarray, fuzz_pct: float) -> np.ndarray:
    bg = background_mask(rgb, fuzz_pct)
    mask = np.where(bg, 0.0, 255.0)
    # 渐变：(255 - min通道 - 2.4% of 255) × 5.1，夹到 0..255
    glow = (255.0 - rgb.min(axis=2).astype(np.float32) - 255.0 * 0.024) * 5.1
    glow = np.clip(glow, 0.0, 255.0)
    alpha = np.maximum(mask, glow)
    return alpha.astype(np.uint8)


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if argv[0] == "--scan":
        rgb = np.asarray(Image.open(argv[1]).convert("RGB"))
        for fz in (3, 5, 8, 10, 12, 15, 20):
            bg = background_mask(rgb, fz)
            print(f"fuzz {fz}%: opaque {1 - bg.mean():.4f}")
        return 0
    src = argv[0]
    if len(argv) >= 2 and re.fullmatch(r"\d+(\.\d+)?", argv[1]):
        out, fuzz = src, float(argv[1])
    else:
        out = argv[1] if len(argv) >= 2 else src
        fuzz = float(argv[2]) if len(argv) >= 3 else 10.0
    if not os.path.isfile(src):
        print(f"找不到输入文件：{src}", file=sys.stderr)
        return 1
    if out == src:
        backup = os.path.join(tempfile.gettempdir(), f"dewhite-backup-{time.strftime('%Y%m%d-%H%M%S')}")
        os.makedirs(backup, exist_ok=True)
        shutil.copy(src, os.path.join(backup, os.path.basename(src)))
        print(f"原图备份：{os.path.join(backup, os.path.basename(src))}")
    im = Image.open(src).convert("RGB")
    rgb = np.asarray(im)
    alpha = dewhite(rgb, fuzz)
    rgba = np.dstack([rgb, alpha])
    Image.fromarray(rgba, "RGBA").save(out, "PNG", optimize=True)
    print(f"完成：{out}  ({im.size[0]}x{im.size[1]} rgba, {os.path.getsize(out) // 1024} KB, fuzz {fuzz}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
