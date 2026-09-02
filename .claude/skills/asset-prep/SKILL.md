---
name: asset-prep
description: "美术出图进 public/ 之前的后处理工具箱：白底抠成透明、扫出还没处理的白底图。用户说'这张图白底''帮我抠个图''图放进去有白框''扫一下图标'就用它。每条指令对应目录里一个脚本，加新处理 = 加脚本 + 在指令表加一行。"
argument-hint: "dewhite <图> [输出] [fuzz] | check [目录] | list"
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Edit, Write
---

# 出图后处理（public/ 门口那道工序）

美术给的图（3D 渲染、AI 出图）和 `public/` 里能用的图之间差着一道固定工序。
这份技能把每道工序做成一条指令，**指令都是这个目录下的脚本，不是临时现敲的命令**——
现敲的东西下次就没了，今天调好的参数明天还得再调一遍。

## 1. 指令表

| 指令 | 干什么 | 脚本 |
|------|--------|------|
| `dewhite <图> [输出] [fuzz]` | 白底出图 → 透明底 | `dewhite.sh` |
| `check [目录]` | 扫出还是白底不透明的 PNG | `check-alpha.sh` |
| `list` | 就是把这张表念给用户听 | — |

参数照着 `argument-hint` 传。用户没指定指令时，先跑 `check` 报告现状，再问要不要处理。

## 2. `dewhite` —— 白底转透明

```bash
.claude/skills/asset-prep/dewhite.sh 输入.png [输出.png] [fuzz百分比]
.claude/skills/asset-prep/dewhite.sh 输入.png [fuzz百分比]     # 省略输出 = 原地覆盖（自动备份到 /tmp）
```

**为什么要有这道工序**：白底图丢进 `public/icons/` 不会报错，只会在背包格子上
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
.claude/skills/asset-prep/check-alpha.sh [目录]      # 默认 Frontend-3D/public
```

分两步判：先看**有没有真的透明像素**（有 alpha 通道但整张全 255 的图要算进来），
全不透明的再看**四角是不是接近白**。四角有颜色的是满幅图（`portraits/` 的立绘、
`ui-mockups/` 的设计稿），本来就该不透明，**不要动**。

## 4. 验收（跑完必须做，不许跳）

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
3. 动过 `public/icons/` 下建筑图的，跑 `npx vitest run tests/buildingIcons.test.ts`（在 `Frontend-3D/`）。

## 5. 写回之前先问一句（ask before writing）

`dewhite` 原地覆盖是**有损**的——背景像素被丢掉了。所以：

- 覆盖仓库里已有的图之前，先说清楚要覆盖哪几个文件、备份在哪，**得到用户同意再写**。
- 新图第一次进仓库不用问，但要把落地路径念一遍再写。
- 备份在 `/tmp/dewhite-backup-*/`，跟用户说一声——`/tmp` 会被系统清，要长期留的自己挪走。

## 6. 顺带一提：图标是按 id 拼路径取的

物品图标**没有** `icon` 字段可以填，取图是一条约定：`/icons/<itemId>.png`
（`Game/Systems/materials.ts`、`Components/Inventory/slots.tsx`、`TradePanel.tsx` 三处）。
所以给物品配图 = **文件名必须等于物品 id**，改名就完事，不要去加映射表。
建筑不一样，走 `level.icon` 写全路径（`Buildings/types.ts`）。

拿到一张图不知道该叫什么，先去 `Core/src/Data/items/index.ts` 查 id，别照着中文名音译
（`cloud_deng.png` 那种名字取图链路是找不到的）。

## 7. 怎么加一条新指令

以后再遇到"每次出图都要手动做一遍"的事（批量缩到 1024、生成 @2x、压体积……），
按这四步加，**不要在对话里敲一次性命令**：

1. 脚本放这个目录，`chmod +x`，文件头注释写清楚**为什么这么做、否掉了什么做法**。
2. §1 指令表加一行，`argument-hint` 加一项。
3. 补一节用法（参数、什么时候用、坑）。
4. 跑 `/skill-test static asset-prep`，7 项结构检查要 COMPLIANT。

## 8. 做完之后

- 图是给新家具/新建筑配的 → 回 `Frontend-3D/Agent/create-furniture/SKILL.md` 走完注册和验收。
- 想全面盘一遍资源合规（命名、体积预算、孤儿文件）→ `/asset-audit`。
- 提交时 commit 信息写清楚**处理了哪几张、fuzz 用了多少**，下次遇到同类图有个参照。
