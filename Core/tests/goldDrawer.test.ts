import test from "node:test";
import assert from "node:assert/strict";

import { claimFromDrawer, drawerHint } from "../src/logic/goldDrawer.js";

/**
 * 金币抽屉的规则（产金币的建筑 / 家具共用）：装得下多少领多少，剩下的
 * 留在抽屉。纯函数，前端只负责"抽屉记在哪、钱往哪送"。
 */

test("抽屉_120进只剩50空位的罐_领50_抽屉还剩70", () => {
  assert.deepEqual(claimFromDrawer(120, 50), { accepted: 50, left: 70 });
});

test("抽屉_空位够_一次领光", () => {
  assert.deepEqual(claimFromDrawer(12, 20), { accepted: 12, left: 0 });
});

test("抽屉_罐满了_一分领不到也一分不丢", () => {
  assert.deepEqual(claimFromDrawer(12, 0), { accepted: 0, left: 12 });
});

test("抽屉_空抽屉_什么也领不到", () => {
  assert.deepEqual(claimFromDrawer(0, 50), { accepted: 0, left: 0 });
});

test("抽屉_负数和小数不信任", () => {
  assert.deepEqual(claimFromDrawer(-5, 10), { accepted: 0, left: 0 });
  assert.deepEqual(claimFromDrawer(7.9, -3), { accepted: 0, left: 7 });
});

test("提示_空_可领_金库满_三态和领取用同一把尺子", () => {
  assert.equal(drawerHint(0, 50), "empty");
  assert.equal(drawerHint(12, 50), "claimable");
  assert.equal(drawerHint(12, 0), "vault_full");
  // 抽屉空的时候金库满不满不重要——没东西可领就是"空"
  assert.equal(drawerHint(0, 0), "empty");
});
