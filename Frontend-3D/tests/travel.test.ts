import { beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_MAP_ID } from "core";

import {
  destinations,
  findDestination,
  planRoute,
} from "../src/Game/Systems/travelPlan";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { mapDefinitions } from "../src/Maps/index";
import { snapshotLocalPosition } from "../src/Game/State/participants";
import { on } from "../src/Game/EventBus";

/**
 * 跨图旅行。两件事各归各的：
 * - `travelPlan` 回答"能去哪儿、怎么过去"——**全从注册表推导**，
 *   加一张图、加一家店都不用改代码；写死一张表的话，加内容要记得
 *   同步两处，那是迟早对不上的活；
 * - `mapTravel` 回答"现在能不能走、走完站哪"。
 *
 * 路线用 BFS 找**最少换图次数**，不是最短距离：跨图的代价（加载页、
 * 打断感）远大于图内多走几步。
 */

beforeEach(() => {
  // 每个用例都从起始图出发
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
});

// ---- 地名表 ----

describe("能去哪儿", () => {
  test("每张注册过的图都有一条", () => {
    const list = destinations();

    for (const map of mapDefinitions) {
      expect(
        list.some((d) => d.mapId === map.mapId),
        `${map.mapId} 没出现在地名表里`,
      ).toBe(true);
    }
  });

  test("每条都有标签和至少一个关键词，关键词全小写", () => {
    for (const destination of destinations()) {
      expect(destination.label.length).toBeGreaterThan(0);
      expect(destination.keys.length).toBeGreaterThan(0);
      for (const key of destination.keys) {
        expect(key).toBe(key.toLowerCase());
      }
    }
  });

  test("店铺额外挂一条门口条目，落在小镇上并带具体站位", () => {
    const doors = destinations().filter((d) => d.label.endsWith("门口"));

    expect(doors.length).toBeGreaterThan(0);
    for (const door of doors) {
      expect(door.mapId).toBe("town");
      expect(door.spot).toBeTruthy();
      expect(Number.isFinite(door.spot!.x)).toBe(true);
    }
  });
});

describe("按名字找地方", () => {
  test("精确匹配优先", () => {
    const town = destinations().find((d) => d.mapId === "town")!;
    expect(findDestination(town.keys[0])?.mapId).toBe("town");
  });

  test("大小写和首尾空格都不影响", () => {
    expect(findDestination("  TOWN ")?.mapId).toBe("town");
  });

  test("短的优先——说书店不该被书店门口抢走", () => {
    const shop = destinations().find(
      (d) => !d.label.endsWith("门口") && destinations().some((o) => o.label === `${d.label}门口`),
    );
    if (!shop) return; // 注册表里暂时没有这种成对的名字

    expect(findDestination(shop.label)?.label).toBe(shop.label);
  });

  test("空查询和查无此地都返回 undefined，不是抛", () => {
    expect(findDestination("")).toBeUndefined();
    expect(findDestination("   ")).toBeUndefined();
    expect(findDestination("从没听说过的地方")).toBeUndefined();
  });
});

// ---- 路线 ----

describe("路线规划", () => {
  test("同图内只有一段，终点就是目的地", () => {
    const here = destinations().find((d) => d.mapId === DEFAULT_MAP_ID)!;
    const legs = planRoute(DEFAULT_MAP_ID, here);

    expect(legs).toHaveLength(1);
    expect(legs![0].mapId).toBe(DEFAULT_MAP_ID);
    expect(legs![0].portal).toBeUndefined();
  });

  test("跨图时每一段都带出入口，最后一段没有", () => {
    const town = destinations().find((d) => d.mapId === "town")!;
    const legs = planRoute(DEFAULT_MAP_ID, town);

    expect(legs).toBeTruthy();
    expect(legs!.length).toBeGreaterThanOrEqual(2);

    // 中间每一段都要走一个门
    for (const leg of legs!.slice(0, -1)) {
      expect(leg.portal, `${leg.mapId} 那一段没有出入口`).toBeTruthy();
    }
    expect(legs![legs!.length - 1].portal).toBeUndefined();
    expect(legs![legs!.length - 1].mapId).toBe("town");
  });

  test("路线首尾相接：每一段的目标图就是下一段所在的图", () => {
    const shop = destinations().find(
      (d) => d.mapId !== DEFAULT_MAP_ID && d.mapId !== "town" && !d.label.endsWith("门口"),
    );
    if (!shop) return;

    const legs = planRoute(DEFAULT_MAP_ID, shop)!;
    expect(legs).toBeTruthy();

    for (let i = 0; i < legs.length - 1; i += 1) {
      expect(legs[i].portal!.targetMapId).toBe(legs[i + 1].mapId);
    }
  });

  test("选的是换图次数最少的走法", () => {
    const town = destinations().find((d) => d.mapId === "town")!;
    const legs = planRoute(DEFAULT_MAP_ID, town)!;

    // 据点直连小镇，所以只该换一次图（两段）
    expect(legs).toHaveLength(2);
  });

  test("去不了的地方返回 null，不是空数组", () => {
    const unreachable = {
      keys: ["虚空"],
      label: "虚空",
      mapId: "根本没有这张图",
    };
    expect(planRoute(DEFAULT_MAP_ID, unreachable)).toBeNull();
  });

  test("每张图都能从起始图走到——加了图却忘了接出入口，这条会红", () => {
    for (const map of mapDefinitions) {
      const target = destinations().find((d) => d.mapId === map.mapId)!;
      expect(
        planRoute(DEFAULT_MAP_ID, target),
        `从 ${DEFAULT_MAP_ID} 走不到 ${map.mapId}`,
      ).toBeTruthy();
    }
  });
});

// ---- 真的走过去 ----

describe("换图", () => {
  test("换图会切当前图、把人摆到落点、并发 map_changed", () => {
    const events: unknown[] = [];
    const off = on("map_changed", (payload) => events.push(payload));

    const result = travelTo("town");

    expect(result.ok).toBe(true);
    expect(getCurrentMapId()).toBe("town");
    // 位置的 mapId 也要跟着换——只写坐标的话，重开游戏会落回旧图
    expect(snapshotLocalPosition().mapId).toBe("town");
    expect(events).toHaveLength(1);
    off();
  });

  test("已经在那张图上时拒绝，且不发事件", () => {
    const events: unknown[] = [];
    const off = on("map_changed", (payload) => events.push(payload));

    const result = travelTo(DEFAULT_MAP_ID);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("already_there");
    expect(events).toEqual([]);
    off();
  });

  test("认不出的图返回 unknown_map，当前图不动", () => {
    const result = travelTo("根本没有这张图");

    expect(result.ok === false && result.reason).toBe("unknown_map");
    expect(getCurrentMapId()).toBe(DEFAULT_MAP_ID);
  });

  test("带落点时按落点站，不用目标图的出生点", () => {
    travelTo("town", { x: 12.5, y: -7.25, heading: 1.5 });

    const position = snapshotLocalPosition();
    expect(position.x).toBeCloseTo(12.5, 5);
    expect(position.y).toBeCloseTo(-7.25, 5);
    expect(position.heading).toBeCloseTo(1.5, 5);
  });

  test("来回换图之后还能回到起点", () => {
    expect(travelTo("town").ok).toBe(true);
    expect(travelTo(DEFAULT_MAP_ID).ok).toBe(true);
    expect(getCurrentMapId()).toBe(DEFAULT_MAP_ID);
  });
});
