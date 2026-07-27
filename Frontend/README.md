# Frontend

当前主要游戏客户端。技术方向是 React + Vite 外壳，Phaser 负责 top-down 2D 游戏场景、角色移动、家具摆放、碰撞、交互和声景播放。

## 目录职责

- `src/Game/`：Phaser 游戏入口、Scene、地图和 gameplay presentation。
- `src/Components/`：React UI、菜单、面板和非 Phaser 的界面。
- `src/Types/`：仅放 Frontend-local 类型；共享类型应放在 `../Core/src/types/`。
- `public/` 或 `src/Assets/`：网页端实际图片、音频和字体资源。

## 共享数据

共享结构和内容注册表来自 `Core`：

```ts
import type { WorldSave, FurnitureDefinition } from "core";
```

`Core` 不依赖 Phaser。Frontend 负责把 `visualId`、`audioProfileId` 等共享 ID 映射到网页端实际资源。

## 开发命令

```bash
npm run dev
npm run build
npm run lint
```
