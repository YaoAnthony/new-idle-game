# 任务组（清单上的文件夹）

2026-09-08 做完。它是「系列任务」的第二版：第一版（画布上的行动链 `ActionChainSave`，
8-20 ～ 9-08）要求玩家先想清楚一张依赖图再开始，实际没人这么用，用户拍板整套拆掉，
换成"拖两下就成一串"的文件夹。存档迁移 v49 把没做完的链降成组。

## 规格（用户描述，逐条对应）

| 用户说的 | 落地 |
|---|---|
| 左页加一个「添加系列任务」按钮 | 日记本左页表单下面那颗绿胶囊；行动面板首屏「系列任务」区块右上角 |
| 点了只能填一个名字 | 建组只要名字，没有分类 / 图标 / 颜色（分类跟条目走） |
| 普通任务拖进去就变系列 | 日记本：原生拖放；触摸端和行动面板：每行「放进…」下拉。**搬家不是复制** |
| 多条时只显示最上面的，其他折叠 | 折叠只露第一条；第一条做完会从清单划掉，第二条自然浮上来 |
| 可以展开、拖动挪顺序 | 展开后拖行排序（日记本）/ 上下箭头（行动面板）；**展开后也只有第一条能开始** |

不在需求里、自己定的：删组不删成员（回到散条目）；折叠状态不进存档；组排在散条目前面；
悬空 id（成员被删）在读取时过滤。

## 数据

```
ActionGroupSave = { groupId, name, createdAtUtc, entryIds: string[] }   // Core/types/actions.ts
PlayerSave.actionGroups                                                   // 必填，v49 起
```

成员和顺序**只存在 `entryIds` 一处**，不在 `PlayerActionEntry` 上加 `groupId`。两处存同一件事，
第一次不同步就永远对不上；排序在一个数组里就是一次 splice。代价是要防悬空 id：
`Systems/actions.removeActionEntry` 调 `detachEntry` 同步剔除，`layoutEntries` 读取时再过滤——
两道闸，后一道兜住任何漏网的路径。

## 代码

| 文件 | 职责 |
|---|---|
| `Game/State/actionGroups.ts` | 建 / 删 / 拖入拖出 / 组内排序 / `layoutEntries`（纯函数，两处 UI 共用） |
| `Components/ActionHub/GroupSection.tsx` | 行动面板首屏的区块（跨分类，所以不在分类列表里） |
| `Components/Diary/PlanFolders.tsx` | 日记本左页的文件夹卡 + 原生拖放 |
| `Components/Diary/useDiaryData.ts` | `groups` + 四个动作透传给书 |
| `BookPlanner.tsx` 左页 | 散条目可拖、带「放进…」下拉、散条目区是"拖出来"的落点 |
| `Data/Save/migrations.ts` v49 | 旧链 → 组：未完成节点按一层一层的拓扑序进清单 |
| `Game/Systems/chest.ts` / `Core/logic/chest.ts` / `Core/Data/chest` | 开箱（从旧链那些文件里搬出来的，和链无关） |

## 坑

- **拖放走 dataTransfer 不走 React 状态**：拖的源头在 BookPlanner，落点在 PlanFolders，
  共享"正在拖谁"就得提到两边共同的父级，而父级是一本翻页书。
- **书在 react-pageflip 里**：InteractiveArea 拦 pointerdown 不让翻页，dragstart 走浏览器自己的
  手势识别不受影响。触摸端没有原生拖放，所以「放进…」下拉不是备胎，是触摸端的正门。
- **行动面板的组不能进分类列表**：组是跨分类的，分类屏只显示该分类的成员的话，
  "只露出第一条"就不成立了。

## 回归清单

自动化：`tests/actionGroups.test.ts`（11 条：搬家不是复制、删条目摘出组、悬空 id 不漏、
删组留成员、组内排序夹住越界、快照往返）、`tests/migrations.test.ts` v49 三条（拓扑序 +
做完的链不生成组、chainRef 摘掉、无链得空数组）。

手动：
1. 行动面板首屏：＋ 系列任务 → 名字 → 出现空组；分类列表某行「放进系列」→ 首屏那组 1 件。
2. 日记本左页：绿胶囊建组 → 拖一条散计划进卡 → 计数 +1、散条目少一条；再拖一条 → 折叠只露第一条。
3. 展开 → 拖第二条到第一条上面 → 顺序换；「拿出」→ 回到散条目。
4. 第一条按播放 → 专注 → 做完 → 回来它没了、第二条浮上来。
5. 老档（v48 带链）读进来：同名组出现、未完成节点按序在里面、做完的链没有空组。
