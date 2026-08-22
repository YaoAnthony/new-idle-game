import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * **网络边界**：和 server 说话只能在 `src/Api/` 里。
 *
 * 立这条界之前，线上通信散在 `Game/Net/` 的三个文件、19 处 `socket.emit`
 * / `socket.on` 里，552 行的会话状态机同时干着三件事——拼协议载荷、
 * 跑状态机、管房客的存档纪律。想知道"这个游戏一共会往服务器发几种消息"，
 * 得把三个文件读完。
 *
 * 这份用例是那条界的看门人。约定不写下来就等于不存在，而写在文档里的
 * 约定只有人记得时才有效——写成测试才是真的。
 */

// jsdom 环境下 import.meta.url 不是 file: 协议，只能从 cwd 走
// （vitest 的工作目录就是 Frontend-3D）
const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

/**
 * 去掉注释再扫。
 *
 * 不去的话这份用例会被**散文**绊倒：session.ts 里一句"原来走无类型的
 * socket.emit 时这个错位是看不见的"就会被判成违规。而这个项目的注释密度
 * 很高，一条会因为写解释而变红的规矩，结果一定是大家不写解释。
 *
 * 粗暴实现（不处理字符串字面量里的 `//`）。够用：真正的违规是
 * `socket.emit(...)` 这种语句，不会藏在字符串里；而误伤的方向是
 * "少报"不是"多报"，多报才会让人绕着规矩走。
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/**
 * `path` 一律用 `/` 分隔。
 *
 * `relative()` 在 Windows 上吐 `Api\game\websocket\connection.ts`，而下面每一处
 * 判据写的都是 `/`——`startsWith("Api/")` 恒 false，于是 `Api/` 自己没被排除，
 * connection.ts 里那句合法的 `socket.io-client` 被当成违规报出来；
 * `find(f => f.path === "Api/game/websocket/index.ts")` 恒 undefined，
 * `startsWith("Game/Multiplayer/")` 恒 `[]`。
 *
 * 后果不只是误报，更要命的是**瞎**：Multiplayer 那组扫到 0 个文件，
 * 真有人把 socket.emit 泄进 Game/ 也拓不到。这道门神在 Windows 上从来没真过。
 *
 * 归一化放在这一处而不是每个判据里各 replace 一次：`path` 是这份用例对外
 * 的唯一坐标，它的形状只该被定义一次。
 */
const files = walk(SRC).map((full) => ({
  path: relative(SRC, full).split(sep).join("/"),
  text: readFileSync(full, "utf8"),
  code: stripComments(readFileSync(full, "utf8")),
}));

/** `src/Api/` 之外的所有源文件 */
const outsideApi = files.filter((f) => !f.path.startsWith("Api/"));

test("被扫到的文件数量是合理的（防止 walk 写坏导致空跑）", () => {
  expect(files.length).toBeGreaterThan(150);
  expect(outsideApi.length).toBeGreaterThan(100);
});

describe("src/Api/ 之外不许碰传输层", () => {
  test("不许 import socket.io-client", () => {
    const offenders = outsideApi
      .filter((f) => /from\s+["']socket\.io-client["']/.test(f.code))
      .map((f) => f.path);

    expect(offenders, "socket.io-client 只能出现在 src/Api/ 里").toEqual([]);
  });

  test("不许出现 socket.emit / socket.on / emitWithAck", () => {
    const offenders = outsideApi
      .filter((f) => /\bsocket\.(emit|on|off|once)\b|\bemitWithAck\b/.test(f.code))
      .map((f) => f.path);

    expect(offenders, "线上收发只能在 src/Api/ 里").toEqual([]);
  });

  test("不许用 NET_EVENTS（事件名是 Api 的私事）", () => {
    const offenders = outsideApi
      .filter((f) => /\bNET_EVENTS\b/.test(f.code))
      .map((f) => f.path);

    expect(offenders, "事件名只该在 src/Api/ 里出现").toEqual([]);
  });

  test("不许自己拼 protocolVersion（Api 会填）", () => {
    const offenders = outsideApi
      .filter((f) => /\bNET_PROTOCOL_VERSION\b/.test(f.code))
      .map((f) => f.path);

    expect(offenders, "协议版本由 Api/game/websocket/session.ts 一处填").toEqual([]);
  });

  test("不许读 VITE_BACKEND_URL（HTTP 的基址也是 Api 的私事）", () => {
    const offenders = outsideApi
      .filter((f) => /\bVITE_BACKEND_URL\b/.test(f.code))
      .map((f) => f.path);

    expect(offenders, "后端地址只在 Api/ 里读——见 Api/http.ts 和 websocket/connection.ts").toEqual(
      [],
    );
  });

  test("不许碰 auth token 的存储键（凭证不出 Api 层）", () => {
    const offenders = outsideApi
      .filter((f) => /idle-home:auth-token/.test(f.code))
      .map((f) => f.path);

    expect(offenders, "token 只经 Api/auth/tokenStore.ts 存取，Redux 里只放用户信息").toEqual([]);
  });
});

describe("Api 层自己的纪律", () => {
  test("socket 实例不出目录：index.ts 不导出 rawSocket", () => {
    const barrel = files.find((f) => f.path === "Api/game/websocket/index.ts");
    expect(barrel, "找不到 Api/game/websocket/index.ts").toBeTruthy();
    expect(barrel!.code).not.toMatch(/\brawSocket\b/);
  });

  test("Api 不反向依赖 Game/——传输层不该认识玩法", () => {
    const offenders = files
      .filter((f) => f.path.startsWith("Api/"))
      .filter((f) => /from\s+["'][^"']*\/Game\//.test(f.code))
      .map((f) => f.path);

    expect(
      offenders,
      "Api 依赖 Game 就是边界反向穿透了——入站用回调交出去，别在 Api 里发 EventBus",
    ).toEqual([]);
  });
});

describe("Game/Multiplayer 只经由 Api 说话", () => {
  const multiplayer = files.filter((f) => f.path.startsWith("Game/Multiplayer/"));

  test("这一层还在（重构没把文件搞丢）", () => {
    expect(multiplayer.map((f) => f.path).sort()).toEqual([
      "Game/Multiplayer/commands.ts",
      "Game/Multiplayer/opApply.ts",
      "Game/Multiplayer/roster.ts",
      "Game/Multiplayer/session.ts",
      "Game/Multiplayer/sync.ts",
      "Game/Multiplayer/worldLock.ts",
    ]);
  });

  test("凡是发消息的文件，都从 Api/game/websocket 拿函数", () => {
    const senders = multiplayer.filter((f) =>
      /\bsend(Transform|Appearance|Gesture|Chat|WorldOp|WorldRefresh)\b|createSession|apiJoinSession|apiLeaveSession/.test(
        f.text,
      ),
    );
    expect(senders.length, "至少 session.ts 和 sync.ts 该在发消息").toBeGreaterThanOrEqual(2);

    for (const file of senders) {
      expect(file.text, `${file.path} 用了 Api 的函数却没 import 它`).toMatch(
        /from\s+["'][^"']*Api\/game\/websocket["']/,
      );
    }
  });
});
