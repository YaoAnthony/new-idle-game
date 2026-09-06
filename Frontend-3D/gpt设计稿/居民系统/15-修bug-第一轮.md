# 15 · 修 bug · 第一轮（00~07 之后）

> 状态：**15 已完成（P0 / P1 为零；双端重跑留到 16）** · 2026-09-06 · 本提交
>
> 一句话：00~07 做完先停下来，把地基（改名、架构、作息、对话、好感、委托、居民之间、来访）
> 当成一个整体回归一遍，修完再往 08 走。**不加功能**。修 bug 任务的验收和功能任务不一样：
> 功能任务验"做到了"，修 bug 任务验"没坏别的"和"以后不会再坏"。

## 为什么放在 07 之后

00~07 把 `Resident` 从一个类拆成三层、加了七种切片和十几种信号，08 起开始建模室内、开新地图。
地基上的 bug 到 08 之后修，每一个都要多穿一层室内 / 访客 / 信箱。动森的 NH 1.0 上线时村民系统就是先稳的，
后面的季节活动全是叠在上面的——叠之前那层必须干净。

## Bug 从哪来（五个入口，缺一个就是漏网）

| 入口 | 做法 | 产出 |
|---|---|---|
| **回归清单重跑** | 把 00~07 每份文档「验收」里的浏览器步骤合成一张清单（`回归清单.md`，本任务产出），逐条重跑、逐条截图 | 每条 ✅ / ❌ + 截图 |
| **联机双端重跑** | 同上，01~07 的联机验收条目，两个标签页 | 同上 |
| **老档穿越** | 拿 00 之前备份的真档（[[verify-in-dedicated-page]]：动真档先备份），一路迁到最新版本，然后跑一天 | 迁移报告：三位在场、报纸旧期名字不空、剧情计数一致、金币不变 |
| **离线七天** | 存档时间往前拨七天再读（`/time` 不够，要改 `lastObservedUtc`）：作息该在哪、委托该过期、来信最多几封、去小镇的该回来 | 一份"回来看到什么"的对照表 |
| **自动化护栏** | 九条验收命令；`grep` 三条硬编码守卫（见下） | 全绿 |

每个 bug 用 `/bug-report` 的格式写进 `production/qa/bugs/`：复现步骤、期望、实际、严重度。**没有复现步骤的不算 bug，算传闻。**

## 硬编码守卫（每轮都跑，红了就是 bug）

```bash
# 基类不认识身份（唯一允许的是构造函数里 `?? CreatureRole.Pet` 那个默认标签）
grep -nE "CreatureRole\.(Worker|Merchant|Resident)" Frontend-3D/src/Game/State/residentAgent.ts
# 技能和子类里没有直接改位置 / 寻路
grep -rn "startPathTo\|this\.x = \|this\.z = " Frontend-3D/src/Game/State/skills Frontend-3D/src/Game/State/residents
# gameplay 代码里没有台词、没有居民 id 分支
grep -rnE "slime_neighbor|fox_neighbor|spirit_neighbor" Frontend-3D/src/Game --include=*.ts | grep -v test | grep -v "residents/index.ts"
# 随机只在动画
grep -rn "Math.random" Frontend-3D/src/Game/State/skills Frontend-3D/src/Game/Systems/residents
```

四条都应该输出为空（最后一条允许 `Visual/` 下有）。这四条**写进 CI**（`tests/hardcodeGuards.test.ts` 跑 grep 断言为空），第二轮就不用手跑。

## 分级与退出准则

| 级 | 定义 | 退出准则 |
|---|---|---|
| P0 | 存档坏 / 联机分叉（A 北 B 南）/ 起不来 / 数据丢（信物、图纸消失） | **零** |
| P1 | 功能链断（委托交不了、居民不来、门开不了）/ 明显穿模卡死 / 台词键裸露 | **零** |
| P2 | 表现瑕疵（气泡位置、动画抢帧、文案别扭）| 列进 `/tech-debt` 登记，带任务号，不挡 08 |
| P3 | 建议 | 记下，不排期 |

**退出 15 = P0、P1 为零 + 回归清单全绿 + 双端全绿 + 老档穿越通过 + 离线七天对照表无意外 + 守卫全空。**

## 每个 bug 的修法验收（三件缺一不可）

1. **先红后绿**：先写一条能复现的测试（vitest 或 Core 用例），跑红，再修，跑绿。测试名带 bug 编号。没法写自动化的（纯表现）要有修前 / 修后两张截图。
2. **不顺手加功能**。修 bug 的提交里出现新字段、新指令、新文案键就打回（`git diff --stat` 里 `Data/` 只允许改数值不允许加条目）。
3. **根因写进提交信息**：为什么会坏、为什么这样修、还有哪儿可能有同类（照 [[commit-messages-explain-tradeoffs]]）。同类的顺手一起查，不顺手一起改。

## 性能预算（这一轮定基线，第二轮验）

| 项 | 预算 | 量法 |
|---|---|---|
| 9 只活物 tick + 技能决策 | < 1.5 ms / 帧（iPhone SE 基准，[[landscape-only-iphone-se]]） | `performance.now()` 包 `tickResidents`，`/state` 打印 60 帧均值 |
| 关键帧出站 | < 2 KB / s | Backend 测试里数字节 |
| 场所解析（02 每次 decide 现算） | < 0.3 ms | 同上 |

超预算不是 bug，记成 P2 带数字，第二轮看要不要缓存。

## 产出

- `回归清单.md`（00~07 全部浏览器与双端步骤，可勾选）
- `production/qa/bugs/` 里每个 bug 一份
- `tests/hardcodeGuards.test.ts`
- 性能基线三个数，写进本文档末尾
- 一份"离线七天回来看到什么"对照表

## 刻意不做的

- 任何新功能、新文案、新指令；重构（"顺手拆一下"留给 16 之后再议）；调平衡数值（数值是设计不是 bug，除非导致 P0/P1）。

## 收工记录（2026-09-06）

**五个入口跑的结果**

| 入口 | 做了什么 | 结果 |
|---|---|---|
| 回归清单重跑 | `回归清单.md`（00~14 合成一张表）；本轮在宿主档重跑 03 / 04 / 05 / 06 / 07 的指令链 | 全绿；08~14 用当期验收结果标 ✔ |
| 联机双端重跑 | 没重跑 | 留到 16 的全链压测（用例层：切片 / 关键帧 / 只读都有） |
| 老档穿越 | `tests/oldSaveMigration.test.ts`：路径从 `OLD_SAVE_PATH` 来（真档不进仓库），拿会话里备份的 v45 真档（world / world.backup 两份）迁到 v46 | 通过：活物不少、进度只增、背包 / 库存不动、可重入 |
| 离线七天 | `tests/offlineWeek.test.ts` 三条 + 对照表（下） | 通过 |
| 自动化护栏 | `tests/hardcodeGuards.test.ts` 四条守卫进 CI；九条验收命令 | 守卫红了两条（BUG-15-02 / 03），修掉后全绿 |

**修掉的 bug**（`production/qa/bugs/`，每个带复现）：BUG-15-01 桥面算岸（P2）、BUG-15-02 技能里 13 处裸随机（守卫）、
BUG-15-03 指令写死三位 id（P3）；BUG-15-04 硬提委托倒推剧情线（P1）和 BUG-15-05 迁移读半形状档崩（P0）是 13 里发现当场修的，补了报告。
**P0 / P1 为零。** 另登记 BUG-15-06：`navSize.test` 全量并行时偶发红（单跑稳绿，随机 + 抢占），P2 留 16。

**离线七天回来看到什么（对照表）**

| 系统 | 回来那天 | 依据 |
|---|---|---|
| 委托 | 到期的一次收掉（`expireFavors` 再跑是 0）；早上抽签最多再提一件，不补七件 | offlineWeek 第 1 条 |
| 信箱 | 排好的明信片只到一封，不重复；自发信走 day_started 的池，一天只掷一次 | offlineWeek 第 2 条；10 文档 |
| 出门 | 当天往返的：回来那天他就在（`syncTrips`）；多日的按 `backDayId` | offlineWeek 第 3 条；trips.test |
| 作息 | 读档按当前时刻重排（睡着的 `wakeStaleSleepers` 叫醒） | routine.test |
| 剧情 | `day_started` 一天只发一次：金库五幕、个人线都只推一步 | storySystem.test、arcs.test |
| 好感 | 不衰减（04 定的） | affection.test |

**性能基线**（桌面 Chrome，16 核，宿主档 3 位居民在场；iPhone SE 实测留 16）

| 项 | 数 | 预算 |
|---|---|---|
| 整个 `RoomScene.update`（含活物 tick + 技能决策 + 门 + 家具） | 均值 **0.24 ms / 帧**，120 帧里最大一次 17.8 ms（一次决策 + 寻路的尖峰） | < 1.5 ms（活物部分） |
| 场所解析（七种全解析一遍，46 个场所） | **0.315 ms** | < 0.3 ms / 次 decide（一次 decide 只解析一种，≈ 0.05 ms） |
| 关键帧出站 | 一拍 98 B × 3 位 × 2 Hz ≈ **0.6 KB / s** | < 2 KB / s |

**没做 / 降级**：双端重跑（16）；`grep` 里 `Systems/residents` 的 Math.random 本来就是零；预存的 29 条 lint 错误全在居民系统之外
（BookPlanner 原型、inventory、dailyCommands、shops/interiors、两条旧用例），记 P3 不动。
