import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Facing, worldToRoomCell, type GameSave, type WorldSave } from "core";

// ---- 假 Api 层。必须在 import session 之前声明 ----

type Listener = (payload: never) => void;

/**
 * 假的 `Api/game/websocket`：记录出站、可手动灌入站，不碰真网络。
 *
 * **mock 的是 Api 而不是 socket**——`Game/Multiplayer` 现在只认识那一层
 * 类型化函数，连事件名都不知道。用例因此也不用再拼协议载荷，
 * 读起来就是"调了哪个函数、收到了什么"。
 *
 * 真实链路（前端载荷 ↔ 真后端）由 `Backend/tests` 那 91 个用例守着。
 */
const fakeApi = {
  /** 出站记录。kind 是 Api 的函数名，不是线上事件名 */
  outbound: [] as Array<{ kind: string; payload: unknown }>,
  /** 测试塞 create / join 的应答 */
  replies: new Map<string, unknown>(),
  listeners: new Map<string, Listener[]>(),

  record(kind: string, payload?: unknown) {
    this.outbound.push({ kind, payload });
  },
  async ack(kind: string, payload: unknown) {
    this.record(kind, payload);
    const reply = this.replies.get(kind);
    if (!reply) throw new Error(`测试没有为 ${kind} 准备应答`);
    return reply;
  },
  subscribe(kind: string, listener: Listener) {
    const list = this.listeners.get(kind) ?? [];
    list.push(listener);
    this.listeners.set(kind, list);
    return () => {
      this.listeners.set(kind, (this.listeners.get(kind) ?? []).filter((l) => l !== listener));
    };
  },
  /** 从"服务端"推一条下来 */
  inbound(kind: string, payload: unknown) {
    for (const listener of this.listeners.get(kind) ?? []) (listener as (p: unknown) => void)(payload);
  },
  reset() {
    this.outbound = [];
  },
};

vi.mock("../src/Api/game/websocket", () => ({
  ensureConnected: async () => {},
  disconnect: () => {},
  isConnected: () => true,

  createSession: (r: unknown) => fakeApi.ack("create", r),
  joinSession: (r: unknown) => fakeApi.ack("join", r),
  leaveSession: async () => fakeApi.record("leave"),

  sendTransform: (p: unknown) => fakeApi.record("transform", p),
  sendAppearance: (p: unknown) => fakeApi.record("appearance", p),
  sendGesture: (p: unknown) => fakeApi.record("gesture", p),
  sendChat: (p: unknown) => fakeApi.record("chat", p),
  sendWorldOp: (p: unknown) => fakeApi.record("op", p),
  sendWorldRefresh: (p: unknown) => fakeApi.record("refresh", p),
  sendResidentKeyframes: (p: unknown) => fakeApi.record("residents", p),

  onParticipantJoined: (l: Listener) => fakeApi.subscribe("participantJoined", l),
  onParticipantLeft: (l: Listener) => fakeApi.subscribe("participantLeft", l),
  onTransform: (l: Listener) => fakeApi.subscribe("transform", l),
  onAppearance: (l: Listener) => fakeApi.subscribe("appearance", l),
  onGesture: (l: Listener) => fakeApi.subscribe("gesture", l),
  onChat: (l: Listener) => fakeApi.subscribe("chat", l),
  onWorldOp: (l: Listener) => fakeApi.subscribe("worldOp", l),
  onWorldRefresh: (l: Listener) => fakeApi.subscribe("worldRefresh", l),
  onResidentKeyframes: (l: Listener) => fakeApi.subscribe("residents", l),
  onSessionEnded: (l: Listener) => fakeApi.subscribe("sessionEnded", l),
  onDisconnect: (l: Listener) => fakeApi.subscribe("disconnect", l),
}));

import {
  getSessionState,
  hostSession,
  isInSession,
  isRemoteWorldActive,
  joinSession,
  leaveSession,
} from "../src/Game/Multiplayer/session";
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
import { getCurrentMap, getRoom, getWorld } from "../src/Game/State/worldRuntime";
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

/**
 * 院子里一个**落在开局领地（C3）内**的格。
 *
 * 期 1 起院子的网格盖住整块领地（60×45），但开局只拥有 C3 一格，别处
 * 放置会被 `outside_territory` 拒掉。硬写格号会和格盘一起走散，所以从
 * **世界坐标**反算：(−2, 10) 是 C3 中央，也是新档的出生点。
 */
/**
 * 院子的 roomId。**摆进院子要显式说**：默认的家现在开局就立着，
 * `defaultPlacementRoom()` 会选主屋，而院子格号在 9×12 的屋里是出界的。
 */
function yardId(): string {
  return getCurrentMap().outdoorRoomId;
}

function homeCell(dx = 0, dy = 0): { x: number; y: number } {
  const yard = getRoom(getCurrentMap().outdoorRoomId)!;
  const cell = worldToRoomCell(yard, 3.5, 16.5);
  return { x: cell.x + dx, y: cell.y + dy };
}

/**
 * 一个**此刻在场**的房间 id。
 *
 * 不能写 `getWorld().room.roomId`（主房间）：期 1 起房子默认收起（T9），
 * 而收起房间里的家具不进 `presentFurniture`——这几条用例断言的正是
 * `getWorld().placedFurniture`，拿主房间当落点会让它们全部读到空数组，
 * 看起来像"世界没换过去"，其实只是东西装在一个不在场的屋子里。
 *
 * 院子永远在场，所以用它。这些用例要验的是"世界换没换、op 重放对不对"，
 * 家具具体摆在哪一间与之无关。
 */
function inSceneRoomId(): string {
  return getCurrentMap().outdoorRoomId;
}

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
          roomId: inSceneRoomId(),
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
  fakeApi.reset();
  fakeApi.replies.set("create", {
    ok: true,
    sessionId: "s-test",
    joinCode: "ABC234",
    playerId: "p-host001",
    revision: 0,
  });
  

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
    placeFurniture("furniture_table", homeCell(), Facing.North, yardId());
    const before = getWorld().placedFurniture.length;

    const code = await hostSession();

    expect(code).toBe("ABC234");
    expect(getSessionState().kind).toBe("hosting");
    expect(isRemoteWorldActive()).toBe(false);
    expect(getWorld().placedFurniture).toHaveLength(before);
  });

  test("建房请求带上存档版本、世界和自己的位置", async () => {
    await hostSession();

    const create = fakeApi.outbound.find((o) => o.kind === "create");
    const payload = create?.payload as Record<string, unknown>;
    expect(payload.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(payload.world).toBeTruthy();
    // 带上位置，晚加入的人第一帧就把房主摆对
    expect(payload.transform).toBeTruthy();

    /*
     * **`protocolVersion` 不在这儿**——它由 `Api/game/websocket/session.ts`
     * 填，这一层压根不知道有协议版本这回事（少一个能忘的地方）。
     * 它真的填对了由 Backend 的端到端用例验：版本不匹配服务端会拒连。
     */
    expect(payload.protocolVersion).toBeUndefined();
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
    placeFurniture("furniture_table", homeCell(), Facing.North, yardId());
    const host = hostWorld();
    fakeApi.replies.set("join", joinReply(host));

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
    fakeApi.replies.set("join", joinReply(hostWorld()));
    await joinSession("ABC234");

    const { listRemote } = await import("../src/Game/Multiplayer/roster");
    expect(listRemote().map((p) => p.playerId)).toEqual(["p-host001"]);
  });

  /**
   * 这一条是整份用例的核心。
   */
  test("做客期间落盘：世界侧是自家的，玩家侧是运行时现状", async () => {
    // 自家有一张桌子
    placeFurniture("furniture_table", homeCell(), Facing.North, yardId());
    addItem("wood", 5);

    fakeApi.replies.set("join", joinReply(hostWorld()));
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

    fakeApi.replies.set("join", joinReply(hostWorld()));
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
    placeFurniture("furniture_table", homeCell(), Facing.North, yardId());
    fakeApi.replies.set("join", joinReply(hostWorld()));
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
    fakeApi.replies.set("join", joinReply(hostWorld()));
    await joinSession("ABC234");
    await leaveSession();
    await settle(); // 等回家那一次 void saveNow() 落地，免得它盖掉下面这次

    // 现在摆一件家具，它必须能进档（做客期间是进不去的）
    placeFurniture("furniture_chair", homeCell(0, -3), Facing.North, yardId());
    await saveNow();

    const written = await readSaveFromDisk();
    expect(written.ownWorld.placedFurniture.map((p) => p.furnitureId)).toContain(
      "furniture_chair",
    );
  });

  test("房主跑了：被动结束也走同一条回家路", async () => {
    placeFurniture("furniture_table", homeCell(), Facing.North, yardId());
    fakeApi.replies.set("join", joinReply(hostWorld()));
    await joinSession("ABC234");
    addItem("iron_ingot", 1);

    fakeApi.inbound("sessionEnded", { reason: "host_left" });

    expect(getSessionState().kind).toBe("idle");
    expect(getWorld().placedFurniture.map((p) => p.furnitureId)).toEqual(["furniture_table"]);
    expect(getCount("iron_ingot")).toBe(1);
  });

  test("回标题：房客先把自家世界灌回去，App 的存盘才不会写错", async () => {
    placeFurniture("furniture_table", homeCell(), Facing.North, yardId());
    fakeApi.replies.set("join", joinReply(hostWorld()));
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
    fakeApi.replies.set("join", joinReply(hostWorld()));
    await joinSession("ABC234");
    await expect(joinSession("XYZ789")).rejects.toThrow();
  });

  test("服务端拒绝时抛出人话，状态留在 idle", async () => {
    fakeApi.replies.set("join", {
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
    fakeApi.reset();
    placeFurniture("furniture_table", homeCell(), Facing.North, yardId());

    expect(fakeApi.outbound.filter((o) => o.kind === "op")).toEqual([]);
  });

  test("会话中本地突变转发给全房", async () => {
    await hostSession();
    fakeApi.reset();

    placeFurniture("furniture_table", homeCell(), Facing.North, yardId());
    await Promise.resolve(); // sendOp 走的是 ensureConnected().then

    const ops = fakeApi.outbound.filter((o) => o.kind === "op");
    expect(ops).toHaveLength(1);
    expect((ops[0].payload as { kind: string }).kind).toBe("furniture_placed");
  });

  test("收到别人的 op 在本地重放，且不再广播回去（无回环）", async () => {
    await hostSession();
    fakeApi.reset();

    fakeApi.inbound("worldOp", {
      playerId: "p-guest01",
      op: {
        kind: "furniture_placed",
        placed: {
          instanceId: "p-guest01:furniture:furniture_chair#1",
          furnitureId: "furniture_chair",
          placement: {
            kind: "floor",
            roomId: inSceneRoomId(),
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
    expect(fakeApi.outbound.filter((o) => o.kind === "op")).toEqual([]);
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
            roomId: inSceneRoomId(),
            gridPosition: { x: 6, y: 6 },
            facing: Facing.North,
          },
          state: {},
        },
      },
    };

    fakeApi.inbound("worldOp", op);
    fakeApi.inbound("worldOp", op);

    const chairs = getWorld().placedFurniture.filter((p) => p.furnitureId === "furniture_chair");
    expect(chairs).toHaveLength(1);
  });

  test("不在会话里时收到 op 不重放", () => {
    fakeApi.inbound("worldOp", {
      playerId: "p-x",
      op: { kind: "furniture_removed", instanceId: "随便" },
    });

    expect(getSessionState().kind).toBe("idle");
  });
});

// ---- 整片刷新 ----

describe("整片刷新", () => {
  test("房客应用房主推来的切片", async () => {
    fakeApi.replies.set("join", joinReply(hostWorld()));
    await joinSession("ABC234");

    fakeApi.inbound("worldRefresh", {
      revision: 4,
      slices: {
        placedFurniture: [
          {
            instanceId: "p-host001:furniture:furniture_bookshelf#1",
            furnitureId: "furniture_bookshelf",
            placement: {
              kind: "floor",
              roomId: inSceneRoomId(),
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
    placeFurniture("furniture_table", homeCell(), Facing.North, yardId());

    fakeApi.inbound("worldRefresh", {
      revision: 9,
      slices: { placedFurniture: [] },
    });

    expect(getWorld().placedFurniture.map((p) => p.furnitureId)).toEqual(["furniture_table"]);
  });
});
