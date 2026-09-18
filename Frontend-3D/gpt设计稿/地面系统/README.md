# 地面系统（铺路）

用户 2026-09-18："加个地面的设定……效果是替换地面一块皮，然后会变化寻路算法的 weight……用户自动模式、NPC 行动的时候都会更愿意去走这些路……ground 要像栅栏那样有完善的纹理连接，直线、转弯、2×2 的纹理连接应该是不一样的。"

| 文档 | 内容 |
|---|---|
| [01 契约与施工](01-契约与施工.md) | 形状（注册表 / 存档 / op / 纯函数）、纹理连接的算法、施工步骤、走查、自查 |

## 一句话

院子里每一格草地可以铺成一种**地面**（第一种：沙土路 `sandy_road`）；地面住 `WorldSave.grounds`，
是一张"格 → 地面 id"的稀疏表。画面上按**对偶网格**（dual grid / marching squares）把相邻的格连成一片：
直线是直线、拐角是圆角、2×2 连成一整块、内凹角也圆——16 种角情形、6 种形状，全是同一条规则算出来的，
没有一张贴图。寻路给每格一个代价（路 1.0、草 1.6），活物和自动模式的角色都**更愿意走路上**；玩家手操不受影响。

## 参考

- 47 块 blob 自动拼接（8 邻位掩码，去重后 47 种）：<https://www.redblobgames.com/articles/autotile/claude/>、<https://rasterloom.itch.io/top-down-tileset-autotiling/devlog/1644351/why-an-auto-tiling-terrain-set-has-exactly-47-tiles>
- 对偶网格 16 块（Oskar Stålberg 的做法，角落天然圆）：<https://excaliburjs.com/blog/Dual%20Tilemap%20Autotiling%20Technique/>、<https://www.boristhebrave.com/2023/05/31/quarter-tile-autotiling/>、<https://github.com/jess-hammer/dual-grid-tilemap-system-godot>
- 本仓库的先例：`Buildings/woodWall.ts`——不枚举形状，"哪边有邻居就长臂"；本系统同一精神，只是长的是角。
