# IndexDB

这是 Frontend 的 IndexedDB 基础封装。业务模块通过 repository 读写数据，不直接调用原生 IndexedDB API。

当前 object stores：

- `settings`：设备设置。
- `gameSaves`：本地游戏存档。

每条记录统一保存为：

```ts
type IndexDbRecord<T> = {
  id: string;
  value: T;
  createdAtUtc: string;
  updatedAtUtc: string;
};
```

所有操作统一返回 `IndexDbResult<T>`，调用方先检查 `ok`：

```ts
import { createIndexDbRepository } from "./Data/IndexDB";

type Settings = {
  schemaVersion: 1;
  muted: boolean;
};

const settingsRepository =
  createIndexDbRepository<Settings>("settings");

const result = await settingsRepository.upsert("device", {
  schemaVersion: 1,
  muted: false,
});

if (!result.ok) {
  console.error(result.error.code, result.error.message);
}
```

Repository 提供 `create`、`get`、`getAll`、`update`、`upsert`、`remove` 和 `clear`。

领域数据的 schema version、运行时校验和迁移由 Settings 或 Save 模块负责，不放进通用数据库层。
