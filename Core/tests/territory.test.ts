import assert from "node:assert/strict";
import { test } from "node:test";

import type { TerritoryDefinition } from "../src/types/territory.js";
import { plotFeatureId } from "../src/types/territory.js";
import {
  isInsideTerritory,
  isPlotOwned,
  ownedBoundaryEdges,
  ownedPlots,
  plotsShareEdge,
  rectInsideTerritory,
  unlockPlot,
  territoryStandingAt,
  unlockablePlots,
} from "../src/logic/territory.js";
import { auditTerritory } from "../src/logic/territoryAudit.js";

/**
 * 领地格盘。要钉住的是三条容易走偏的判据：
 * - 三态：owned / locked / **outside**（桥、河、镇是地理不是领地，能不能走由地理答）；
 * - 邻接是**共边**不是共角（不然开一块地会顺带解锁斜对角，领地长成斜线）；
 * - 不可开时 `unlockPlot` 返回**同一个引用**（调用方靠它判"有没有真的变"）。
 */

/** 4 列 × 3 行、每格 15×15，照 base 的格盘（列 A–D 西→东，行 1–3 北→南） */
function makeTerritory(): TerritoryDefinition {
  const plots = [];
  const cols = ["A", "B", "C", "D"];
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 3; r += 1) {
      const plotId = `${cols[c]}${r + 1}`;
      plots.push({
        plotId,
        localizationKey: `territory.plot.${plotId}`,
        rect: {
          minX: -40 + 15 * c,
          maxX: -40 + 15 * (c + 1),
          minZ: -27 + 15 * r,
          maxZ: -27 + 15 * (r + 1),
        },
        initial: plotId === "C3",
      });
    }
  }
  return { plots };
}

const territory = makeTerritory();
const none = new Set<string>();

test("开局只有 initial 那一格算拥有", () => {
  assert.deepEqual(
    ownedPlots(territory, none).map((plot) => plot.plotId),
    ["C3"],
  );
  assert.equal(isPlotOwned(territory, none, "C3"), true);
  assert.equal(isPlotOwned(territory, none, "C2"), false);
  // initial 不写进 unlockedFeatureIds，也照样拥有——它不该是可以被误删的数据
  assert.equal(none.has(plotFeatureId("C3")), false);
});

test("邻接是共边不是共角：开局可开 C2 / B3 / D3", () => {
  assert.deepEqual(
    unlockablePlots(territory, none)
      .map((plot) => plot.plotId)
      .sort(),
    ["B3", "C2", "D3"],
  );
  // B2 和 C3 只碰一个角，不算共边——否则开一块地会顺带解锁斜对角
  const b2 = territory.plots.find((p) => p.plotId === "B2")!;
  const c3 = territory.plots.find((p) => p.plotId === "C3")!;
  assert.equal(plotsShareEdge(b2, c3), false);
});

test("开了 C2 之后 B2 / C1 / D2 变可开", () => {
  const after = unlockPlot(territory, none, "C2");
  const next = unlockablePlots(territory, after).map((p) => p.plotId);
  for (const id of ["B2", "C1", "D2"]) {
    assert.ok(next.includes(id), `${id} 应该变可开，实际：${next.join()}`);
  }
});

test("不可开时返回原集合（同一个引用），调用方靠它判有没有变", () => {
  // A1 在西北角，和 C3 隔着两格
  const same = unlockPlot(territory, none, "A1");
  assert.equal(same, none, "不可开应当返回原集合本身，不是一个内容相同的新集合");

  const owned = unlockPlot(territory, none, "C2");
  assert.notEqual(owned, none);
  // 幂等：已经开过的再开也返回原集合
  assert.equal(unlockPlot(territory, owned, "C2"), owned);
});

test("格外的点算在领地内——桥、河、镇是地理不是领地", () => {
  // (0,0) 在 C2，锁着
  assert.equal(isInsideTerritory(territory, none, 0, 0), false);
  // (-2,10) 在 C3，开局就有
  assert.equal(isInsideTerritory(territory, none, -2, 10), true);
  // (30,-4) 是东桥，**不属于任何格** → true
  assert.equal(isInsideTerritory(territory, none, 30, -4), true);
  // 开了 C2 之后 (0,0) 就在领地里了
  const after = unlockPlot(territory, none, "C2");
  assert.equal(isInsideTerritory(territory, after, 0, 0), true);
});

test("矩形整个在领地内才算数（跨到锁定格就不行）", () => {
  // C3 是 x −10..5 / z 3..18
  assert.equal(
    rectInsideTerritory(territory, none, { minX: -8, maxX: -6, minZ: 5, maxZ: 7 }),
    true,
  );
  // 跨过 C3 的北边线 z=3 伸进 C2
  assert.equal(
    rectInsideTerritory(territory, none, { minX: -8, maxX: -6, minZ: 1, maxZ: 5 }),
    false,
  );
  // 跨过 C3 的东边线 x=5 伸进 D3
  assert.equal(
    rectInsideTerritory(territory, none, { minX: 3, maxX: 7, minZ: 5, maxZ: 7 }),
    false,
  );
});

test("轮廓边：开局是 C3 的四条边，开了 C2 之后中间那条缝消失", () => {
  const one = ownedBoundaryEdges(territory, none);
  // 15×15 一格，四条边各 15 段
  assert.equal(one.length, 60);

  const after = unlockPlot(territory, none, "C2");
  const two = ownedBoundaryEdges(territory, after);
  // 两格并起来是 15×30 的矩形：周长 (15+30)*2 = 90 段
  assert.equal(two.length, 90);
  // C3 和 C2 之间那条边（z = 3，x −10..5）整条都不在轮廓里
  const seam = two.filter(
    (edge) => edge.from[1] === 3 && edge.to[1] === 3 && edge.from[0] >= -10 && edge.to[0] <= 5,
  );
  assert.equal(seam.length, 0, "两块地之间的内缝不该出现在外轮廓上");
});

// ---- 审计 ----

test("audit：正常格盘通过", () => {
  assert.deepEqual(auditTerritory(territory, { spawn: { x: -2, z: 10 } }), []);
});

test("audit：出生点落在 initial 格外要报错（开新档人会走不动）", () => {
  // (-8.5, -6) 是老出生点，在 B2 不在 C3
  const problems = auditTerritory(territory, { spawn: { x: -8.5, z: -6 } });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /出生点/);
});

test("audit：两块 initial、地块重叠、中间有洞、孤岛，各自报错", () => {
  const twoInitial = {
    plots: territory.plots.map((p) =>
      p.plotId === "C2" ? { ...p, initial: true } : p,
    ),
  };
  assert.ok(auditTerritory(twoInitial).some((m) => m.includes("恰好有一块开局地")));

  const overlapping = {
    plots: [
      { plotId: "X", localizationKey: "x", rect: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, initial: true },
      { plotId: "Y", localizationKey: "y", rect: { minX: 5, maxX: 15, minZ: 0, maxZ: 10 } },
    ],
  };
  assert.ok(auditTerritory(overlapping).some((m) => m.includes("重叠")));

  // 中间缺一块：外接矩形 30×10，只声明了左右两条
  const holed = {
    plots: [
      { plotId: "L", localizationKey: "l", rect: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, initial: true },
      { plotId: "R", localizationKey: "r", rect: { minX: 20, maxX: 30, minZ: 0, maxZ: 10 } },
    ],
  };
  const holeProblems = auditTerritory(holed);
  assert.ok(holeProblems.some((m) => m.includes("不是一整块矩形")));
  assert.ok(holeProblems.some((m) => m.includes("谁都不共边")));
});

test("audit：非整数边要报错——格心取样会落在边线上，归属出现两个答案", () => {
  const half = {
    plots: [
      { plotId: "H", localizationKey: "h", rect: { minX: 0, maxX: 10.5, minZ: 0, maxZ: 10 }, initial: true },
    ],
  };
  assert.ok(auditTerritory(half).some((m) => m.includes("不是整数")));
});

test("三态：你的地 / 还没开的格 / 领地不管这里", () => {
  assert.equal(territoryStandingAt(territory, none, -2, 10), "owned"); // C3
  assert.equal(territoryStandingAt(territory, none, 0, 0), "locked"); // C2
  assert.equal(territoryStandingAt(territory, none, 30, -4), "outside"); // 东桥

  const after = unlockPlot(territory, none, "C2");
  assert.equal(territoryStandingAt(territory, after, 0, 0), "owned");
});

test("outside 和 owned 在 isInsideTerritory 里都算真，只有 locked 是假", () => {
  /*
   * 这条钉住的是分工：`isInsideTerritory` 是**放置**用的（只问"这里能不能
   * 摆"），格外的点根本传不进来（放置只在院子网格内问）。
   * 走路那条链要区分"格外能不能走"——那是地理的事，用三态版本。
   *
   * 历史：这两件事原来合成一个布尔（格外一律返回真），后果是领地东、南
   * 两边墙拆之后剩下的那条平地走廊变成了合法通路，人能绕过锁定格直接
   * 走到桥上，"扩充两次才看得到桥"被整个绕过去。
   */
  assert.equal(isInsideTerritory(territory, none, -2, 10), true); // owned
  assert.equal(isInsideTerritory(territory, none, 0, 0), false); // locked
  assert.equal(isInsideTerritory(territory, none, 30, -4), true); // outside
});
