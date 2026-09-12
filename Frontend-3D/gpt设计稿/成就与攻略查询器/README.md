# 成就 · 攻略查询器（ESC 抽屉的两个新入口）

> 状态：**已完成** · 2026-09-12 · 设计稿：用户给了两张（成就面板、攻略查询器），聊天里发的，没进 ui-mockups/ · 收工记录见文末
>
> 一句话：ESC 抽屉从两格变四格——背包 / 成就 / 攻略 / 回到标题。成就是一张按统计表算进度的清单；
> 攻略查询器是所有教程图的索引，点一条就是现成的引导面板。

## 玩家看到什么

**ESC 抽屉**：现在两格（背包、回到标题），加「成就」「攻略」两格，2×2。

**攻略查询器**（设计稿二）：绿框白纸 Modal，标题「攻略查询器」带一本书的图标。
左栏：搜索框 + 分类列表（家具摆放 / 烹饪教学 / 日记本 / 补录奖励 / 白噪音 / 常见问题），选中的那条浅绿底。
右栏：该分类下的教程卡——左边缩略图、标题、一句副标题、右上一枚标签（基础 / 推荐 / 新手）、右侧尖角。
点卡片 → 弹现成的引导面板（GuidePanel，多图翻页那套）看图；关掉回到查询器。
底下「知道了」关掉整块。

**成就**（设计稿一）：绿框白纸 Modal，标题「成就」带奖杯。顶上一条：已完成 n / 总数 + 进度条、
成就点数总和、一句手写体的口号（"收集每一个生活里的小美好！"）。
左栏分类：全部 / 新手 / 生活 / 烹饪 / 家具 / 日记本 / 收集 / 隐藏。
右栏两列卡片：图标、标题、一句条件、状态（已完成 ✓ / 进行中 + 进度条 x/y / 未解锁）、「⭐ +点数」。
隐藏分类的成就没达成前只显示「？？？」和点数。达成那一刻屏幕上方一条提示（走现成的 story_toast）。

## 定下来的（用户 2026-09-12）

- 两块都从 ESC 进。
- UI 照两张设计稿。

## 我定的（可否）

| 事 | 定法 | 为什么 |
|---|---|---|
| 攻略查询器**不另做阅读器** | 卡片点开 = `guide_open_requested`，用 GuidePanel 看图 | 一份翻页逻辑、一份图；查询器只是索引 |
| 教程条目的元数据 | `guides.ts` 每条加 `category` / `subtitleKey` / `tag?`（basic / recommended / newbie） | 索引信息跟内容表走，加一条教程 = 加一行 |
| 缩略图 | 先用该教程第一张图裁成缩略（object-cover），设计稿那种单独画的小插画以后有了填 `thumb` | 不为一个索引再等一批图 |
| 分类只列**有条目的** | 白噪音 / 常见问题现在没有教程，不显示空分类 | 点进去一片空是最差的体验；教程补了分类自动出现 |
| 「P 人也能领奖励」 | 单独一条教程（只有 mission_2 那张），开场那条「日记本怎么用」照旧两页 | 设计稿里它是独立条目；开场要一口气讲完两页 |
| 搜索 | 按标题 + 副标题的文字过滤，本地即时 | 条目十来条，不做拼音 / 模糊 |
| 成就的**数据源只有统计表** | 成就 = `{ stat 键, 目标值 }`，进度 = 统计值 / 目标，完成 = 统计值 ≥ 目标，**不存解锁状态** | 统计表已进存档（v50），成就随时能从它重算；不再多一份"解锁了没"要同步 |
| 成就点数 | 派生：已完成的成就点数之和；不存 | 同上 |
| 达成提示 | 前端一个监听：`stats_changed` 前后比对，跨过目标就发 toast | 不进剧情规则表：几十条成就每条写一条规则是噪音 |
| 隐藏成就 | 数据表 `hidden: true`，没达成时卡片显示「？？？」 | 设计稿有这一栏 |
| 图标 | 每条 `icon`：优先指向现有物品图标（`/icons/<itemId>.png`），没有合适的用 emoji 兜底；美术出图后换 | 设计稿是单独画的插画，先不等 |
| 记账点 | 各玩法系统在**发剧情信号的同一处** `bumpStat`（见下表），不做"信号自动记账" | `stats` 和 `signalCounts` 是两张表（world.ts 的账），信号名不等于成就想数的事（比如白噪音分钟数根本没有信号） |
| 首批成就 | 12 条（下表），数值先按设计稿，用户随时改表 | 表驱动，改数只改数据 |

## 首批成就（Core `Data/achievements`）

| id | 分类 | 标题 | 条件（stat ≥ 目标） | 点数 | 隐藏 |
|---|---|---|---|---|---|
| first_furniture | 新手 | 第一次摆好家具 | furniture_placed ≥ 1 | 10 | |
| first_plan | 新手 | 今天也有计划 | action_created ≥ 1 | 10 | |
| first_backfill | 新手 | P 人也能拿奖励 | action_backfilled ≥ 1 | 10 | |
| journal_found | 新手 | 拿到魔女的本子 | journal_taken ≥ 1 | 5 | |
| cozy_home | 家具 | 温馨小屋 | furniture_placed ≥ 10 | 20 | |
| little_cook | 烹饪 | 小小料理人 | cook_completed ≥ 3 | 10 | |
| home_chef | 烹饪 | 家里的大厨 | cook_completed ≥ 20 | 30 | |
| focused_day | 日记本 | 专注的一天 | action_completed ≥ 5 | 20 | |
| noise_lover | 生活 | 白噪音爱好者 | noise_minutes ≥ 10 | 10 | |
| collector | 收集 | 收藏家 | rewards_claimed ≥ 20 | 20 | |
| burnt | 隐藏 | 黑暗料理 | cook_burnt ≥ 1 | 5 | ✓ |
| night_owl | 隐藏 | 夜猫子 | focus_after_midnight ≥ 1 | 5 | ✓ |

## 记账点（新加的 bumpStat）

| 键 | 在哪记 | 旁边已有的信号 |
|---|---|---|
| furniture_placed | `State/world/furniture.placeFurnitureAt` | `furniture_placed` |
| action_created | `Systems/actions.addActionEntry` | — |
| action_completed | `Systems/actions`（两处发 `action_completed` 的地方） | `action_completed` |
| action_backfilled | `Systems/dayRecord.recordActionFact`（补录） | — |
| cook_completed / cook_burnt | `Systems/kitchen` 起锅那一拍 | `cook_completed` |
| rewards_claimed | `Systems/actions.claimActionReward`（领到一件奖励 +1） | — |
| noise_minutes | 白噪音开着时每满一游戏分钟 +1（NoiseMixer / autoLife 的计时处） | — |
| journal_taken | `JournalArrival` 落地发信号处 | `journal_taken` |
| focus_after_midnight | `actions` 开始专注时按时钟判 0~4 点 | — |

Core 加 `STAT_KEYS` 白名单 + audit：成就表引用的键必须在名单里，名单里的键必须有记账点的测试。

## 分阶段（每段可单独验）

| 阶段 | 改哪些文件 | 验证 |
|---|---|---|
| 1 数据 | Core：`types/achievements.ts`、`Data/achievements/index.ts`、`STAT_KEYS`、audit 进 content.test；`logic/achievements.ts`（进度 / 完成 / 点数纯函数） | Core 测试：id 唯一、键在名单、目标 > 0、隐藏条有点数、纯函数算例 |
| 2 记账 | 上表九处 `bumpStat` | Frontend 测试：每个键一条"做这件事 → 统计 +1" |
| 3 攻略查询器 | `guides.ts` 加元数据 + `backfill` 条目；`Components/GuideBook/`；PanelId `guideBook`；i18n | Playwright：SE + 桌面各一张，点卡片弹出引导、关掉回到索引；搜索过滤 |
| 4 成就面板 | `Components/Achievements/`；PanelId `achievements`；达成 toast 监听；i18n | Playwright：SE + 桌面各一张；改统计值看卡片从进行中变已完成、toast 出现 |
| 5 ESC | 两格 + 图标 + i18n | Playwright：抽屉四格一张 |

## 风险

- **SE 上左栏 + 两列卡挤不下**：矮屏卡片改一列、左栏收成图标 + 短字；设计稿是桌面比例，手机版式要自己定，渲图看。
- **noise_minutes 的计时点**：白噪音的计时逻辑我还没读，记账点位置实装时定；若白噪音没有"每分钟"的钩子，改成"专注结束时把这段的分钟数一次记入"。
- **老档**：统计表 v50 起就有，老档进度从 0 起算是对的（以前的事没记）；不做补算。

## 明确不做

- 不做成就奖励（点数只是数字，不兑换）。
- 不做云同步 / 联机同步（房客看房主的统计表，成就面板在做客时只读）。
- 不画新图：缩略图裁教程图、成就图标借物品图标 + emoji。
- 白噪音 / 常见问题两个分类的教程内容。

## 收工记录（2026-09-12）

**架构（用户要求：清晰、注册表、EventBus 能调、别的系统能查、存档跟档走）**

| 层 | 文件 | 职责 |
|---|---|---|
| 注册表 | `Core/Data/achievements` | 一条成就一条数据：分类、条件（统计键 ≥ 目标）、点数、奖励、图标、隐藏 |
| 键名单 | `Core/types/stats.ts` `STAT_KEYS` | 能记的统计键只能从这里选；成就表和剧情条件引用的键都审计 |
| 规则 | `Core/logic/achievements.ts` | 纯函数：进度、这一刻该落成的、点数、能否领奖、内容审计 |
| 存档 | `WorldSave.progression.achievements`（v53） | 只存达成日 / 领奖日；"完成了没"随时从统计表重算 |
| 运行时 | `Frontend Systems/achievements.ts` | 听 `stats_changed` → 落成 → 发 `achievement_unlocked`（EventBus）+ 剧情信号 + toast；读档全表对账；查询口 `isAchievementUnlocked` / `getAchievementProgress` / `listAchievements` / `getAchievementPoints`；领奖 `claimAchievementReward` |
| 内容门槛 | 条件 `achievement_unlocked`（对话 / 剧情 requires） | "摆够十件家具解锁 X"这类写在 storyRules 里 |
| 记账点 | 九处 `bumpStat`（计划里那张表） | 谁产生谁记，在发剧情信号的同一处 |
| 调试口 | `/stat [键] [+n]`、`/achievements [claim <id>]` | 验收不用真做二十次饭 |

**奖励接口**：`reward` 是可辨识联合，现在两种 `furniture_chest`（随机 count 件能摆地上、能交易的家具，按成就 id + 达成日 hashSeed 抽，刷新不能重抽）和 `items`；领取走现成的领取面板。以后换奖励只改数据。

**和计划不一样的地方**

| 计划 | 实际 | 为什么 |
|---|---|---|
| 不存解锁状态 | 存达成日 / 领奖日 | 用户要求"存档跟着角色"，且领没领奖必须记；"完成了没"仍是算的 |
| 不做奖励 | 做了接口 + 随机家具箱占位 | 用户当天加的 |
| toast 走原 StoryToast | StoryToast 重做成一栈（motion popLayout，从上往下落、可关、自动消失） | 用户给了示例，要求方向反过来 |
| 查询器卡片直接弹引导 | `guide_open_requested` 加 `immediate`：玩家点的立刻开在最上面，剧情弹的照旧排队 | 引导面板刚加了"有面板开着就排队"，不加旗子点卡片会被排到关掉查询器之后 |
| 白噪音每分钟 +1 | `Systems/noiseTime.ts`：墙钟每分钟看一眼"专注中 + 有循环在响" | 白噪音没有现成事件 |

**验证**：Core 506 过（3 个时区旧失败）；Frontend 全套 886 过 + 2 失败：`saveShape` 是形状变了要更新清单（已更新），`visitors` 一条在没有本次改动时也失败（别的会话的活，未动）；Playwright：SE 与 1600×823 各一轮——ESC 四格、成就面板（总览 / 分类 / 卡片 / 隐藏）、领取 → 奖励面板开出一件家具、达成 toast、攻略查询器分类 / 卡片 / 点开引导 / 搜索。

**没做**：成就图标的插画（借物品图 + emoji）、缩略图插画（裁教程图）、白噪音 / 常见问题的教程内容、联机同步。
