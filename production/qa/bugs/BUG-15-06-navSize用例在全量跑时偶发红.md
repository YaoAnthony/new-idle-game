# BUG-15-06 · `navSize.test` 的"傀儡乱走两分钟不进屋"在全量跑时偶发红

- 严重度：P2（用例偶发，功能没坏）
- 来源：15 全量跑（88 个文件并行）时红一次；单独跑 3/3 绿
- 复现：`npx vitest run`（全量）偶发 `test_worker_wanders_freely_but_never_ends_up_inside_the_house` 红；`npx vitest run tests/navSize.test.ts` 单跑稳绿
- 疑似根因：用例推 3600 拍让 wander 技能随机乱走，断言"挪了超过 3 步"；wander 的掷点（`chance`）和 idle 抖动是真随机，加上全量并行时的 CPU 抢占，3600 拍里可能凑不出 4 步
- 建议修法：用例里把 `jitter` 换成可注入的种子（15 把随机收进 `skills/jitter.ts` 之后这件事只要一个 `setJitterSource`），或者把断言从"步数"改成"曾经离开过出生格"
- 状态：登记，16 处理
