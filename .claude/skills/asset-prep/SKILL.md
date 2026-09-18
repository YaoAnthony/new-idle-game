---
name: asset-prep
description: "美术出图进 src/Assets/ 之前的后处理工具箱（图一律放 Frontend-3D/src/Assets/ 走 import，不放 public/）：白底抠成透明、扫出还没处理的白底图。用户说'这张图白底''帮我抠个图''图放进去有白框''扫一下图标'就用它。每条指令对应目录里一个脚本，加新处理 = 加脚本 + 在指令表加一行。"
argument-hint: "dewhite <图> [输出] [fuzz] | check [目录] | pixel-up <图|目录> | list"
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Edit, Write
---

# 出图后处理（src/Assets/ 门口那道工序）

美术给的图（3D 渲染、AI 出图）和 `src/Assets/` 里能用的图之间差着一道固定工序。

**图放 `Frontend-3D/src/Assets/`，不放 `public/`**（图标 2026-09-13、光标 / 教程图 / 立绘
2026-09-17 先后搬过来）：走 import 的图文件名带 hash，路径写错构建当场报错；`public/`
里的图原样拷进产物，写错路径只会静默 404，没人引用的原图也照样被打包发出去。
图标按 §7 的约定放 `icons/`；界面插图、光标放 `ui/`；立绘原图放 `portraits/`
（`icons/` 以外的目录不被 glob 扫，不 import 就不进产物）。
这份技能把每道工序做成一条指令，**指令都是这个目录下的脚本，不是临时现敲的命令**——
现敲的东西下次就没了，今天调好的参数明天还得再调一遍。

## 1. 指令表

| 指令 | 干什么 | 脚本 |
|------|--------|------|
| `dewhite <图> [输出] [fuzz]` | 白底出图 → 透明底 | `dewhite.sh` |
| `check [目录]` | 扫出还是白底不透明的 PNG | `check-alpha.sh` |
| `pixel-up <图\|目录> [--name x]` | 像素图整数倍放大，出 @2x/@4x | `pixel-up.py` |
| `list` | 就是把这张表念给用户听 | — |

参数照着 `argument-hint` 传。用户没指定指令时，先跑 `check` 报告现状，再问要不要处理。

## 2. `dewhite` —— 白底转透明

```bash
.claude/skills/asset-prep/dewhite.sh 输入.png [输出.png] [fuzz百分比]
.claude/skills/asset-prep/dewhite.sh 输入.png [fuzz百分比]     # 省略输出 = 原地覆盖（自动备份到 /tmp）
```

**为什么要有这道工序**：白底图丢进 `Frontend-3D/src/Assets/icons/` 不会报错，只会在背包格子上
显出一个白方块——`.ui-slot` 的底是 `#fffcf5→#fff4e6` 的奶油渐变，不是纯白，差得出来。

**为什么不能用"接近白就透明"**：物体自己就有接近白的部分（云朵灯的灯罩 `#FFF8E0`、
家具小店的米白墙 `#F2EAD9`，离纯白只有 7%~10%），任何能吃掉背景的全局阈值也会把它们打穿。
脚本用的是「四角连通泛洪 + 背景区渐变 alpha」，原理写在 `dewhite.sh` 头部注释里，改参数前先读。

**fuzz 怎么定**：默认 10。碰到浅色物体贴着画面边缘的图，先扫一遍确认没有断崖——

```bash
for fz in 3 5 8 10 12 15 20; do
  echo -n "fuzz ${fz}%: "
  magick 图.png -alpha set -fuzz ${fz}% -fill none -floodfill +0+0 white -alpha extract -format "%[fx:mean]\n" info:
done
```

不透明占比应该随 fuzz **平滑缩小**；出现断崖 = 泛洪钻进物体内部了，往回调。
（实测：云朵灯 12%、两栋建筑 10%，都无断崖。）

## 3. `check` —— 扫白底

```bash
.claude/skills/asset-prep/check-alpha.sh [目录]      # 默认 Frontend-3D/src/Assets/icons
```

分两步判：先看**有没有真的透明像素**（有 alpha 通道但整张全 255 的图要算进来），
全不透明的再看**四角是不是接近白**。四角有颜色的是满幅图（`portraits/` 的立绘、
`ui-mockups/` 的设计稿），本来就该不透明，**不要动**。

## 4. `pixel-up` —— 像素图放大出 @2x

```bash
python .claude/skills/asset-prep/pixel-up.py <图|目录> [--scales 2,4] [--out 目录] [--name 新名]
```

**为什么不能交给 CSS 拉**：平常放大像素图靠 `image-rendering: pixelated` 保住硬边，
但 `cursor: url(...)` 吃不到这条属性——光标图是浏览器/系统合成的，不走页面渲染路径，
16px 的图摆在 32px 的位置上永远是平滑插值糊出来的。这种场合只能**先放大好再交出去**。
（favicon、分享图同理。）

**只收整数倍**：2.5 倍的最近邻会让源像素块一大一小（有的占 2 格、有的占 3 格），
横竖都不匀，像素画"每格一样大"的规整感当场就没了。真要 2.5 倍该换一张源图，
不在这儿凑——脚本直接拒掉小数。

**默认出 x2 和 x4 两套**：CSS 那头写 `image-set(url(x2/a.png) 1x, url(x4/a.png) 2x)`，
1× 屏取 x2、2× 屏取 x4，两边都落在整数倍上。只出一张的话另一边必然糊：只给 x2，
2× 屏把它当 64 设备像素平滑拉开；只给 x4，1× 屏又缩一半，边缘出灰。

**`--name` 是给源图改名用的**。美术给的像素图常带空格和大写
（`Arrow Mouse icon 1.png`），这种名字进 URL 要转义，不如在出图这一步就换成
`arrow`。批量模式下用不了——一个名字盖不住一堆图。

输出落在 `<out>/x2/`、`<out>/x4/` 里，**从不覆盖输入**，所以这条指令没有 dewhite
那套备份逻辑（源图一直都在）。

首个用例是 `Frontend-3D/src/Assets/ui/cursor/` 那套 16px 鼠标光标（2026-09-17 从 `public/ui/cursor/` 搬来），CSS 那头怎么接
写在 `Frontend-3D/src/index.css` 的"自定义鼠标光标"一节。

## 5. 验收（跑完必须做，不许跳）

1. **看图，别只看 exit code**。合成三张底再看：
   ```bash
   magick -size 260x260 xc:'#ff00ff' \( 图.png -resize 240x240 \) -gravity center -composite 洋红.png
   magick -size 260x260 xc:'#2b2118' \( 图.png -resize 240x240 \) -gravity center -composite 深色.png
   magick -size 260x260 gradient:'#fffcf5-#fff4e6' \( 图.png -resize 240x240 \) -gravity center -composite 奶油.png
   ```
   - **洋红底查漏**：物体的浅色区域透出粉色 = 泛洪吃进去了 → **FAIL**，调小 fuzz 重来。
   - **深色底查白边**：边缘有一圈白/灰硬边 = alpha 没淡出 → **FAIL**，读脚本里"底噪"那段注释。
   - **奶油底**是真实观感（背包格子的底色），确认没有白方块。
2. 再跑一次 `check`，应该 **PASS**。
3. 动过 `src/Assets/icons/` 下的图，跑 `npx vitest run tests/icons.test.ts tests/buildingIcons.test.ts`（在 `Frontend-3D/`）。
   `check` 默认扫 `Frontend-3D/src/Assets/icons`（进产物、摆在奶油格子上的那批），别的目录把路径传进去。
   `src/Assets/portraits/` 里是没抠过的立绘原图（游戏用的是 `icons/residents/` 下抠好的那份），扫它会报白底，不用管。
4. **`pixel-up` 出的图**：放大看边缘。一个源像素应该是一个**实心方块**；
   边上出现两三级渐变过渡 = 采样器没走最近邻，图废了重出。
   光标另外还要**真进浏览器晃一遍**——热点（`cursor: url(x) 热点x 热点y`）
   量错了图不会报错，只是点不准，静态看图看不出来。

## 6. 写回之前先问一句（ask before writing）

`dewhite` 原地覆盖是**有损**的——背景像素被丢掉了。所以：

- 覆盖仓库里已有的图之前，先说清楚要覆盖哪几个文件、备份在哪，**得到用户同意再写**。
- 新图第一次进仓库不用问，但要把落地路径念一遍再写。
- 备份在 `/tmp/dewhite-backup-*/`，跟用户说一声——`/tmp` 会被系统清，要长期留的自己挪走。

## 7. 顺带一提：图标是按 id 拼路径取的

图标在 `Frontend-3D/src/Assets/icons/`（2026-09-13 从 `public/icons/` 搬进来，
走 import，由 `Assets/icons/index.ts` 用 `import.meta.glob` 扫成一张表）。
**放进对的目录、起对的名字就有图，不用登记**：

| 放哪 | 文件名 |
|---|---|
| `items/` | **必须等于物品 id**（`items/tomato.png`） |
| `buildings/<buildingId>/` | 等级 id（`buildings/gold_jar/l1.png`，不是 `lv1`） |
| `terrain/` | 地貌名（`terrain/forest.png`） |
| `currency/` | 非物品资源（`currency/gold.png`） |

改名就完事，不要去加映射表。放错名字 `tests/icons.test.ts` 会报"对不上物品 id 的图"。

拿到一张图不知道该叫什么，先去 `Core/src/Data/items/index.ts` 查 id，别照着中文名音译
（`cloud_deng.png` 那种名字取图链路是找不到的）。

## 8. 怎么加一条新指令

以后再遇到"每次出图都要手动做一遍"的事（批量缩到 1024、生成 @2x、压体积……），
按这四步加，**不要在对话里敲一次性命令**：

1. 脚本放这个目录，`chmod +x`，文件头注释写清楚**为什么这么做、否掉了什么做法**。
2. §1 指令表加一行，`argument-hint` 加一项。
3. 补一节用法（参数、什么时候用、坑）。
4. 跑 `/skill-test static asset-prep`，7 项结构检查要 COMPLIANT。

## 9. 做完之后

- 图是给新家具/新建筑配的 → 回 `Frontend-3D/Agent/create-furniture/SKILL.md` 走完注册和验收。
- 想全面盘一遍资源合规（命名、体积预算、孤儿文件）→ `/asset-audit`。
- 提交时 commit 信息写清楚**处理了哪几张、fuzz 用了多少**，下次遇到同类图有个参照。
