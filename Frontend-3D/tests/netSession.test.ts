import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Facing, NET_EVENTS, type GameSave, type WorldSave } from "core";

// ---- 假 socket。必须在 import session 之前声明 ----

type Handler = (payload: unknown) => void;

/** 假 socket：记录出站、可手动灌入站，不碰真网络 */
const fakeSocket = {
  connected: true,
  handlers: new Map<string, Handler[]>(),
  outbound: [] as Array<{ event: string; payload: unknown }>,
  /** 测试按事件名塞应答 */
  replies: new Map<string, unknown>(),

  emit(event: string, payload: unknown) {
    this.outbound.push({ event, payload });
  },
  async emitWithAck(event: string, payload: unknown) {
    this.outbound.push({ event, payload });
    const reply = this.replies.get(event);
    if (!reply) throw new Error(`测试没有为 ${event} 准备应答`);
    return reply;
  },
  on(event: string, handler: Handler) {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  },
  once(event: string, handler: Handler) {
    this.on(event, handler);
  },
  off() {},

  /** 从"服务端"推一条事件下来 */
  inbound(event: string, payload: unknown) {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  },
  reset() {
    this.outbound = [];
  },
};

vi.mock("../src/Game/Net/socket", () => ({
  getSocket: () => fakeSocket,
  ensureConnected: async () => fakeSocket,
  disconnectSocket: () => {},
}));

import {
  getSessionState,
  hostSession,
  isInSession,
  isRemoteWorldActive,
  joinSession,
  leaveSession,
} from "../src/Game/Net/session";
import { getSaveRepository } from "../src/Data/Save/SaveRepository";
import { SAVE_KEYS, SAVE_SCHEMA_VERSION } from "../src/Data/Save/types";
import { saveNow, setBaseline } from "../src/Data/Save/autosave";
import { serializeGameSave } from "../src/Data/Save/serialize";
import { getIdIssuer } from "../src/Game/State/ids";
import {
  LOCAL_PLAYER_ID,
  restoreLocalPosition,
  setLocalTransform,
  snapshotLocalPosition,
} from "../src/Game/State/participants";
import {
  addItem,
  getCount,
  restoreInventory,
} from "../src/Game/State/inventory";
import {
  clearAllFurniture,
  placeFurniture,
} from "../src/Game/State/world/furniture";
import { getWorld } from "../src/Game/State/worldRuntime";
import { restoreStorages } from "../src/Game/State/storage";
import { createIndexDbRepository } from "../src/Data/IndexDB";
import { emit, on } from "../src/Game/EventBus";

/**
 * 联机会话状态机。**这个文件最重要的职责是房客的存档纪律**
 * （session.ts 自己的文件头就是这么写的）：
 *
 *   入房前抓一份自家世界的快照 → 装存档合成器（玩家侧照抄运行时、
 *   世界侧永远用快照）→ 退出时合成"自家世界 + 现在的背包"灌回去。
 *
 * 顺序错一步，要么丢做客期间的收获，要么把别人家写进自己档。两种都是
 * **静默的**：玩家不会看到报错，只会某天发现家里多了不认识的家具，
 * 或者在朋友家捡的东西回家没了。所以这条路必须有用例守着。
 */

const store = createIndexDbRepository<unknown>("gameSaves");

/** 一份"房主的世界"，和自己的世界能一眼分辨 */
function hostWorld(): WorldSave {
  const mine = serializeGameSave();
  return {
    ...mine.ownWorld,
    worldId: "host-world",
    seed: 99999,
    placedFurniture: [
      {
        instanceId: "p-host:furniture:furniture_bed#1",
        furnitureId: "furniture_bed",
        placement: {
          kind: "floor",
          roomId: getWorld().room.roomId,
          gridPosition: { x: 1, y: 1 },
          facing: Facing.North,
        },
        state: {},
      } as never,
    ],
  };
}

function joinReply(world: WorldSave) {
  return {
    ok: true,
    sessionId: "s-test",
    playerId: "p-guest01",
    hostPlayerId: "p-host001",
    revision: 3,
    world,
    participants: [
      {
        profile: { playerId: "p-host001", name: "房主", avatar: { slots: {} } },
        transform: { mapId: "base", x: 0, y: 0, heading: 0, locomotion: "idle", liftHeight: 0 },
        appearance: { posture: "stand", activity: null, heldItem: null, restingOn: null },
      },
    ],
  };
}

/**
 * 让飘在半空的写盘落地。
 *
 * `exitRemoteWorld` 末尾是 `void saveNow()`（**故意不 await**：回家这件事
 * 不该卡在 IndexedDB 上）。对生产代码没问题，对测试是隔离漏洞——上一个
 * 用例的写盘会落在下一个用例清库之后。所以每次清库前先把它冲干净。
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(async () => {
  await settle();
  fakeSocket.reset();
  fakeSocket.replies.set(NET_EVENTS.c2s.sessionCreate, {
    ok: true,
    sessionId: "s-test",
    joinCode: "ABC234",
    playerId: "p-host001",
    revision: 0,
  });
  fakeSocket.replies.set(NET_EVENTS.c2s.sessionLeave, { ok: true });

  await store.remove(SAVE_KEYS.main);
  await store.remove(SAVE_KEYS.backup);
  restoreInventory([]);
  restoreStorages({});
  clearAllFurniture();
  setBaseline(null);
});

afterEach(async () => {
  if (isInSession()) await leaveSession();
});

/** 从磁盘上把存档读回来（绕开运行时，看的就是"真的写下去了什么"） */
async function readSaveFromDisk(): Promise<GameSave> {
  await settle();
  const record = await store.get(SAVE_KEYS.main);
  expect(record.ok, "磁盘上没有主存档").toBe(true);
  return (record as { data: { value: GameSave } }).data.value;
}

// ---- 开房 ----

describe("开房（房主）", () => {
  test("房主继续在自己家过日子，世界不换", async () => {
    placeFurniture("furniture_table", { x: 3, y: 3 }, Facing.North);
    const before = getWorld().placedFurniture.length;

    const code = await hostSession();

    expect(code).toBe("ABC234");
    expect(getSessionState().kind).toBe("hosting");
    expect(isRemoteWorldActive()).toBe(false);
    expect(getWorld().placedFurniture).toHaveLength(before);
  });

  test("握手带上协议版本、存档版本和自己的位置", async () => {
    await hostSession();

    const create = fakeSocket.outbound.find((o) => o.event === NET_EVENTS.c2s.sessionCreate);
    const payload = create?.payload as Record<string, unknown>;
    expect(payload.protocolVersion).toBeTypeOf("number");
    expect(payload.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(payload.world).toBeTruthy();
    // 带上位置，晚加入的人第一帧就把房主摆对
    expect(payload.transform).toBeTruthy();
  });

  test("拿到服务端身份后，此后新发的对象 id 带上它", async () => {
    expect(getIdIssuer()).toBe(LOCAL_PLAYER_ID);
    await hostSession();
    expect(getIdIssuer()).toBe("p-host001");
  });

  test("已经在房里时再开房要报错", async () => {
    await hostSession();
    await expect(hostSession()).rejects.toThrow();
  });
});

// ---- 做客 ----

describe("做客（房客）", () => {
  test("入房后运行时里是房主的世界", async () => {
    placeFurniture("furniture_table", { x: 3, y: 3 }, Facing.North);
    const host = hostWorld();
    fakeSocket.replies.set(NET_EVENTS.c2s.sessionJoin, joinReply(host));

    const swapped = vi.fn();
    const off = on("net_world_swapped", swapped);

    await joinSession("ABC234");

    expect(getSessionState().kind).toBe("guest");
    expect(isRemoteWorldActive()).toBe(true);
    expect(getWorld().placedFurniture.map((p) => p.furnitureId)).toEqual(["furniture_bed"]);
    expect(swapped).toHaveBeenCalled();
    off();
  });

  test("房里已有的人先进名册，重挂载后第一帧就看得见", async () => {
    fakeSocket.replies.set(NET_EVENTS.c2s.sessionJoin, joinReply(hostWorld()));
    await joinSession("ABC234");

    const { listRemote } = await import("../src/Game/Net/roster");
    expect(listRemote().map((p) => p.playerId)).toEqual(["p-host001"]);
  });

  /**
   * 这一条是整份用例的核心。
   */
  test("做客期间落盘：世界侧是自家的，玩家侧是运行时现状", async () => {
    // 自家有一张桌子
    placeFurniture("furniture_table", { x: 3, y: 3 }, Facing.North);
    addItem("wood", 5);

    fakeSocket.replies.set(NET_EVENTS.c2s.sessionJoin, joinReply(hostWorld()));
    await joinSession("ABC234");

    // 在房主家捡到点东西
    addItem("iron_ingot", 2);
    await saveNow();

    const written = await readSaveFromDisk();

    // 世界侧：自家的桌子，绝不是房主的床
    expect(written.ownWorld.worldId).not.toBe("host-world");
    expect(written.ownWorld.placedFurniture.map((p) => p.furnitureId)).toEqual([
      "furniture_table",
    ]);
    // 玩家侧：做客期间捡的东西实时进档，中途崩溃也不丢
    const stacks = written.player.character.inventory;
    expect(stacks.some((s) => s.itemId === "iron_ingot")).toBe(true);
    expect(stacks.some((s) => s.itemId === "wood")).toBe(true);
  });

  test("做客期间落盘取的是入房前那份坐标，不是房主家的", async () => {
    // 出门前站在自家某个角落
    restoreLocalPosition({ mapId: "base", x: -3.25, y: 7.5, heading: 1.25 });
    const home = snapshotLocalPosition();

    fakeSocket.replies.set(NET_EVENTS.c2s.sessionJoin, joinReply(hostWorld()));
    await joinSession("ABC234");

    // 在房主家走到别处（运行时里的坐标现在是别人家的）
    setLocalTransform(20, -18, 0.5);
    expect(snapshotLocalPosition().x).not.toBeCloseTo(home.x, 5);

    await saveNow();
    const written = await readSaveFromDisk();

    // 写进自己档的仍是出门前那份——否则回家会站进墙里
    expect(written.player.character.position?.x).toBeCloseTo(home.x, 5);
    expect(written.player.character.position?.y).toBeCloseTo(home.y, 5);
    expect(written.player.character.restingOn ?? null).toBeNull();
    // 绑着自家家具的行动也不带走
    expect(written.player.activeActionProcess).toBeUndefined();
  });

  test("回家：世界换回自己的，做客期间的收获留着", async () => {
    placeFurniture("furniture_table", { x: 3, y: 3 }, Facing.North);
    fakeSocket.replies.set(NET_EVENTS.c2s.sessionJoin, joinReply(hostWorld()));
    await joinSession("ABC234");

    addItem("iron_ingot", 2);
    await leaveSession();

    expect(getSessionState().kind).toBe("idle");
    expect(isRemoteWorldActive()).toBe(false);
    expect(getWorld().placedFurniture.map((p) => p.furnitureId)).toEqual(["furniture_table"]);
    expect(getCount("iron_ingot")).toBe(2);
    // 发号方也换回本地
    expect(getIdIssuer()).toBe(LOCAL_PLAYER_ID);
  });

  test("回家之后合成器卸掉，落盘恢复成照抄运行时", async () => {
    fakeSocket.replies.set(NET_EVENTS.c2s.sessionJoin, joinReply(hostWorld()));
    await joinSession("ABC234");
    await leaveSession();
    await settle(); // 等回家那一次 void saveNow() 落地，免得它盖掉下面这次

    // 现在摆一件家具，它必须能进档（做客期间是进不去的）
    placeFurniture("furniture_chair", { x: 5, y: 5 }, Facing.North);
    await saveNow();

    const written = await readSaveFromDisk();
    expect(written.ownWorld.placedFurniture.map((p) => p.furnitureId)).toContain(
      "furniture_chair",
    );
  });

  test("房主跑了：被动结束也走同一条回家路", async () => {
    placeFurniture("furniture_table", { x: 3, y: 3 }, Facing.North);
    fakeSocket.replies.set(NET_EVENTS.c2s.sessionJoin, joinReply(hostWorld()));
    await joinSession("ABC234");
    addItem("iron_ingot", 1);

    fakeSocket.inbound(NET_EVENTS.s2c.sessionEnded, { reason: "host_left" });

    expect(getSessionState().kind).toBe("idle");
    expect(getWorld().placedFurniture.map((p) => p.furnitureId)).toEqual(["furniture_table"]);
    expect(getCount("iron_ingot")).toBe(1);
  });

  test("回标题：房客先把自家世界灌回去，App 的存盘才不会写错", async () => {
    placeFurniture("furniture_table", { x: 3, y: 3 }, Facing.North);
    fakeSocket.replies.set(NET_EVENTS.c2s.sessionJoin, joinReply(hostWorld()));
    await joinSession("ABC234");

    emit("ui_return_to_title", {});

    expect(getSessionState().kind).toBe("idle");
    // 这个监听比 App 那个先注册，所以 App 的 saveNow 读到的已经是自家形状
    await saveNow();
    const written = await readSaveFromDisk();
    expect(written.ownWorld.placedFurniture.map((p) => p.furnitureId)).toEqual([
      "furniture_table",
    ]);
  });

  test("已经在房里时再入房要报错", async () => {
    fakeSocket.replies.set(NET_EVENTS.c2s.sessionJoin, joinReply(hostWorld()));
    await joinSession("ABC234");
    await expect(joinSession("XYZ789")).rejects.toThrow();
  });

  test("服务端拒绝时抛出人话，状态留在 idle", async () => {
    fakeSocket.replies.set(NET_EVENTS.c2s.sessionJoin, {
      ok: false,
      code: "not_found",
      message: "没有这个邀请码的房间",
    });

    await expect(joinSession("QQQQQQ")).rejects.toThrow("没有这个邀请码的房间");
    expect(getSessionState().kind).toBe("idle");
  });
});

// ---- op 通道 ----

describe("op 通道", () => {
  test("单机时本地突变不往外发", async () => {
    fakeSocket.reset();
    placeFurniture("furniture_table", { x: 3, y: 3 }, Facing.North);

    expect(fakeSocket.outbound.filter((o) => o.event === NET_EVENTS.c2s.worldOp)).toEqual([]);
  });

  test("会话中本地突变转发给全房", async () => {
    await hostSession();
    fakeSocket.reset();

    placeFurniture("furniture_table", { x: 3, y: 3 }, Facing.North);
    await Promise.resolve(); // sendOp 走的是 ensureConnected().then

    const ops = fakeSocket.outbound.filter((o) => o.event === NET_EVENTS.c2s.worldOp);
    expect(ops).toHaveLength(1);
    expect((ops[0].payload as { kind: string }).kind).toBe("furniture_placed");
  });

  test("收到别人的 op 在本地重放，且不再广播回去（无回环）", async () => {
    await hostSession();
    fakeSocket.reset();

    fakeSocket.inbound(NET_EVENTS.s2c.worldOp, {
      playerId: "p-guest01",
      op: {
        kind: "furniture_placed",
        placed: {
          instanceId: "p-guest01:furniture:furniture_chair#1",
          furnitureId: "furniture_chair",
          placement: {
            kind: "floor",
            roomId: getWorld().room.roomId,
            gridPosition: { x: 6, y: 6 },
            facing: Facing.North,
          },
          state: {},
        },
      },
    });
    await Promise.resolve();

    expect(getWorld().placedFurniture.map((p) => p.furnitureId)).toContain("furniture_chair");
    // 重放入口不发 world_op，所以没有回环
    expect(fakeSocket.outbound.filter((o) => o.event === NET_EVENTS.c2s.worldOp)).toEqual([]);
  });

  test("重放是幂等的：同一条 op 送两遍只生效一次", async () => {
    await hostSession();
    const op = {
      playerId: "p-guest01",
      op: {
        kind: "furniture_placed",
        placed: {
          instanceId: "p-guest01:furniture:furniture_chair#1",
          furnitureId: "furniture_chair",
          placement: {
            kind: "floor",
            roomId: getWorld().room.roomId,
            gridPosition: { x: 6, y: 6 },
            facing: Facing.North,
          },
          state: {},
        },
      },
    };

    fakeSocket.inbound(NET_EVENTS.s2c.worldOp, op);
    fakeSocket.inbound(NET_EVENTS.s2c.worldOp, op);

    const chairs = getWorld().placedFurniture.filter((p) => p.furnitureId === "furniture_chair");
    expect(chairs).toHaveLength(1);
  });

  test("不在会话里时收到 op 不重放", () => {
    fakeSocket.inbound(NET_EVENTS.s2c.worldOp, {
      playerId: "p-x",
      op: { kind: "furniture_removed", instanceId: "随便" },
    });

    expect(getSessionState().kind).toBe("idle");
  });
});

// ---- 整片刷新 ----

describe("整片刷新", () => {
  test("房客应用房主推来的切片", async () => {
    fakeSocket.replies.set(NET_EVENTS.c2s.sessionJoin, joinReply(hostWorld()));
    await joinSession("ABC234");

    fakeSocket.inbound(NET_EVENTS.s2c.worldRefresh, {
      revision: 4,
      slices: {
        placedFurniture: [
          {
            instanceId: "p-host001:furniture:furniture_bookshelf#1",
            furnitureId: "furniture_bookshelf",
            placement: {
              kind: "floor",
              roomId: getWorld().room.roomId,
              gridPosition: { x: 0, y: 0 },
              facing: Facing.North,
            },
            state: {},
          },
        ],
      },
    });

    expect(getWorld().placedFurniture.map((p) => p.furnitureId)).toEqual([
      "furniture_bookshelf",
    ]);
  });

  test("房主自己收到刷新要无视——世界的权威在他这边", async () => {
    await hostSession();
    placeFurniture("furniture_table", { x: 3, y: 3 }, Facing.North);

    fakeSocket.inbound(NET_EVENTS.s2c.worldRefresh, {
      revision: 9,
      slices: { placedFurniture: [] },
    });

    expect(getWorld().placedFurniture.map((p) => p.furnitureId)).toEqual(["furniture_table"]);
  });
});
