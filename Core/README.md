# core

Shared TypeScript data contracts for frontend and backend code.

This package intentionally contains only stable IDs, authored definitions,
save payloads, and runtime snapshots. Gameplay implementation should live in
the client or server feature modules that consume these contracts.

Build locally:

```bash
npm run build
```

After publishing or linking this package, consumers can import from:

```ts
import type { WorldSave, PlacedFurniture } from "core";
```
