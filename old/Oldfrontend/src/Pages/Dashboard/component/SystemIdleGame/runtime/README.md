# Runtime

This folder owns Phaser lifecycle wiring and system orchestration.

- `GameSceneRuntime.ts` is the thin Phaser-facing shell.
- `IdleGameRuntime.ts` owns ordered frame-system execution.
- `GameSceneBootstrap.ts` still contains legacy boot wiring and should shrink
  over time.
- New feature boot/update work should prefer runtime adapters or
  `IdleGameRuntime`, not direct growth in `GameSceneRuntime`.
