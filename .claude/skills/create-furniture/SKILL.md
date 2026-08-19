---
name: create-furniture
description: "给据点添加一件/一批新家具（Core 物品定义 + Frontend 低模配方 + 注册 + 文案 + 验收）。用户说'做一件XX家具''加个XX''设计家具'就用它。先问尺寸/功能/表现问题，定稿规格表再动代码。"
argument-hint: "[家具名或一批家具的描述]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, AskUserQuestion
---

技能正文住在仓库里（用户要求放这儿，方便和代码一起改）：

**先 Read `Frontend-3D/Agent/create-furniture/SKILL.md`，然后严格按它的工作流执行。**

那份文件是家具架构的常驻地图（Core 物品定义字段、外观配方坐标约定、注册/文案落点、运行时消费方、验收命令、每件要问用户的问题、默认值、已知坑）。
如果它和代码对不上，以代码为准，并顺手把它改对。参数：$ARGUMENTS
