import { expect, test } from "vitest";
import {
  NET_PROTOCOL_VERSION,
  PLAYER_SLICE_KEYS,
  WORLD_REFRESH_KEYS,
  WORLD_SLICE_KEYS,
  WORLD_SLICE_POLICY,
  wireKeyOf,
  type WorldSlicePolicy,
} from "core";

import { SAVE_SCHEMA_VERSION } from "../src/Data/Save/types";
import { RESTORE_ORDER } from "../src/Data/Save/registry/order";
import { PLAYER_SLICES } from "../src/Data/Save/registry/playerSlices";
import { WORLD_SLICES } from "../src/Data/Save/registry/worldSlices";
import { isDead, type LiveSlice, type Trigger } from "../src/Data/Save/registry/types";

/**
 * `contracts/save_schema.json` **是从注册表生成的**，不是手写的。
 *
 * 这条用例把注册表（Core 的策略表 + 前端的 registry）导成一张人能读的表，
 * 和仓库里那份文件比对——对不上就红。改了注册表之后跑
 * `npm run save-contract` 重生成，把生成物一起提交。
 *
 * 为什么要这样：`contracts/` 里原来的三份契约，`save_schema.json` 从 7 月
 * 建仓起就是 0 字节，`multiplayer_protocol.md` 里写着两条从没实现的机制
 * （服务端合并 op、房主结束时回传世界）。靠人记得去改一份文档这条路是断的；
 * 文档只有在"过期就红"时才会一直是对的。
 *
 * 用 vitest 的文件快照而不是另写脚本：注册表 import 了 Game/State 那一层，
 * 那层要 jsdom 环境（localStorage、matchMedia），vitest 本来就备好了。
 */

function describeTrigger(trigger: Trigger): string {
  // 带谓词的触发条件（活物只有生灭才推刷新）是函数，序列化不了，只标一句
  return typeof trigger === "string" ? trigger : `${trigger.event}（带条件）`;
}

function describeRuntime(slice: LiveSlice<unknown> | { dead: string }): Record<string, unknown> {
  if (isDead(slice)) return { dead: slice.dead };
  return {
    changedBy: slice.changedBy.map(describeTrigger),
    ...(slice.replicateOn ? { replicateOn: slice.replicateOn.map(describeTrigger) } : {}),
    write: slice.write ?? "debounced",
    ...(slice.after?.length ? { restoreAfter: [...slice.after] } : {}),
    hooks: {
      replicate: Boolean(slice.replicate),
      applyReplica: Boolean(slice.applyReplica),
      finalize: Boolean(slice.finalize),
    },
  };
}

function buildContract(): unknown {
  const world = Object.fromEntries(
    WORLD_SLICE_KEYS.map((key) => {
      // 拓宽成公共类型：表是字面量对象的联合，有的行没有 churn，直接点会报"属性不存在"
      const policy: WorldSlicePolicy = WORLD_SLICE_POLICY[key];
      const wire = wireKeyOf(key);
      return [
        key,
        {
          sync: policy.sync,
          ...(wire !== key ? { wireKey: wire } : {}),
          ...(policy.churn ? { churn: policy.churn } : {}),
          ...(policy.reason ? { reason: policy.reason } : {}),
          ...describeRuntime(WORLD_SLICES[key] as LiveSlice<unknown> | { dead: string }),
        },
      ];
    }),
  );
  const player = Object.fromEntries(
    PLAYER_SLICE_KEYS.map((key) => [
      key,
      describeRuntime(PLAYER_SLICES[key] as LiveSlice<unknown> | { dead: string }),
    ]),
  );

  return {
    $comment:
      "由 Frontend-3D/tests/saveContract.test.ts 从注册表生成（Core/src/types/saveSlices.ts + Frontend-3D/src/Data/Save/registry），别手改。改了注册表之后跑 `npm run save-contract` 重生成",
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    netProtocolVersion: NET_PROTOCOL_VERSION,
    legend: {
      sync: "refresh = 房主变了就推给全房、服务端也合并；join = 只在入房快照里给；none = 不参与联机（必带 reason）",
      changedBy: "哪些事件意味着这一片脏了 → 自动存档",
      replicateOn: "哪些事件值得推给房客；没写 = 同 changedBy",
      write: "immediate = 脏了立刻写；debounced = 2.5 秒防抖",
      restoreAfter: "读档时必须排在这些片之后（RESTORE_ORDER 按此校验）",
      hooks: "replicate = 线上形状和存档不同；applyReplica = 房客收到不是整体替换；finalize = 全部灌完后的收尾",
      dead: "类型里有、无人读写的字段，序列化时不写键",
    },
    refreshWireKeys: [...WORLD_REFRESH_KEYS],
    restoreOrder: [...RESTORE_ORDER],
    world,
    player,
  };
}

test("test_save_contract_file_is_generated_from_registry", async () => {
  const rendered = `${JSON.stringify(buildContract(), null, 2)}\n`;
  await expect(rendered).toMatchFileSnapshot("../../contracts/save_schema.json");
});
