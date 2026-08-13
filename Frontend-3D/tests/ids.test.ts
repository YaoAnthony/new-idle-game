import { beforeEach, expect, test } from "vitest";

import {
  getIdIssuer,
  nextObjectId,
  parseObjectId,
  resetIdCounters,
  setIdIssuer,
  syncIdCounters,
} from "../src/Game/State/ids";
import { LOCAL_PLAYER_ID } from "../src/Game/State/participants";

/**
 * 耐久对象的发号处。集中在这里是**为了联机**：两处各有一个模块级计数器时，
 * 房主和房客同时扔一份米饭都会得到 `drop:rice#8`，服务端分不清是一份还是两份。
 *
 * 三条纪律各自对应一类事故：
 * - 计数器按 kind 分开（共用一个的话，扔十次东西下一把椅子叫 chair#11）；
 * - `resetIdCounters` 和 `syncIdCounters` **必须分开**（报数的有好几家，
 *   谁自带清空谁就抹掉先报的那家）；
 * - `syncIdCounters` **只认自己发的号**（否则进一趟别人家，自己的号白跳一大截）。
 */

beforeEach(() => {
  setIdIssuer(LOCAL_PLAYER_ID);
  resetIdCounters();
});

test("单机时发号方是 local，格式是 <issuer>:<kind>:<name>#<n>", () => {
  expect(getIdIssuer()).toBe(LOCAL_PLAYER_ID);
  expect(nextObjectId("drop", "rice")).toBe(`${LOCAL_PLAYER_ID}:drop:rice#1`);
  expect(nextObjectId("drop", "rice")).toBe(`${LOCAL_PLAYER_ID}:drop:rice#2`);
});

test("计数器按 kind + name 分开数", () => {
  nextObjectId("drop", "rice");
  nextObjectId("drop", "rice");

  // 扔了两次米，下一把椅子仍然是 #1
  expect(nextObjectId("furniture", "furniture_chair")).toMatch(/#1$/);
  // 同 kind 不同名字也各数各的
  expect(nextObjectId("drop", "wood")).toMatch(/#1$/);
});

test("换发号方只影响此后新发的号", () => {
  const before = nextObjectId("drop", "rice");
  setIdIssuer("p-abcd1234");
  const after = nextObjectId("drop", "rice");

  expect(before.startsWith(`${LOCAL_PLAYER_ID}:`)).toBe(true);
  expect(after).toBe("p-abcd1234:drop:rice#2");
  expect(getIdIssuer()).toBe("p-abcd1234");
});

test("不撞号靠的是前缀，不是序号——计数器是本机的，换身份不重置", () => {
  setIdIssuer("p-aaaa1111");
  const mine = nextObjectId("drop", "rice");
  setIdIssuer("p-bbbb2222");
  const afterSwitch = nextObjectId("drop", "rice");

  expect(mine).not.toBe(afterSwitch);
  expect(parseObjectId(mine)?.issuer).toBe("p-aaaa1111");
  expect(parseObjectId(afterSwitch)?.issuer).toBe("p-bbbb2222");

  /*
   * 序号接着往下走（1 → 2）而不是归零。这是对的：计数器数的是
   * "**这台机器**发过几个号"，防撞完全交给前缀。归零反而危险——
   * 换身份前后同一台机器会发出两个序号相同的号，一旦哪天前缀被去掉
   * （日志截断、老存档迁移），它们就重合了。
   */
  expect(parseObjectId(afterSwitch)?.serial).toBe(2);

  // 真正要保证的是：不同发号方发的号，整串永不相等
  setIdIssuer("p-aaaa1111");
  const another = nextObjectId("drop", "rice");
  expect(another).not.toBe(afterSwitch);
});

// ---- 解析 ----

test("parseObjectId 拆得出四段", () => {
  expect(parseObjectId("local:drop:rice#8")).toEqual({
    issuer: "local",
    kind: "drop",
    name: "rice",
    serial: 8,
  });
});

test("name 里带冒号也要拆对（从左边切两刀，不是 split）", () => {
  expect(parseObjectId("local:furniture:some:weird:name#3")).toEqual({
    issuer: "local",
    kind: "furniture",
    name: "some:weird:name",
    serial: 3,
  });
});

test("认不出来返回 null 而不是抛——一条坏记录不该带崩整次读档", () => {
  for (const bad of [
    "",
    "没有井号",
    "local:drop:rice#abc",
    "local:drop:rice#1.5",
    "只有一段#1",
    "两段:而已#1",
  ]) {
    expect(parseObjectId(bad), `${bad} 不该被解析成功`).toBeNull();
  }
});

test("序号取最后一个井号后面的数字", () => {
  expect(parseObjectId("local:drop:a#b#7")?.serial).toBe(7);
  expect(parseObjectId("local:drop:a#b#7")?.name).toBe("a#b");
});

// ---- 续号 ----

test("syncIdCounters 把计数器推到已有对象之后", () => {
  syncIdCounters([`${LOCAL_PLAYER_ID}:drop:rice#8`, `${LOCAL_PLAYER_ID}:drop:rice#3`]);

  expect(nextObjectId("drop", "rice")).toBe(`${LOCAL_PLAYER_ID}:drop:rice#9`);
});

test("syncIdCounters 是累加不是清空——两家分别报数不能互相抹掉", () => {
  syncIdCounters([`${LOCAL_PLAYER_ID}:drop:rice#5`]);
  syncIdCounters([`${LOCAL_PLAYER_ID}:furniture:furniture_chair#7`]);

  // 后报的那家没把先报的抹掉
  expect(nextObjectId("drop", "rice")).toMatch(/#6$/);
  expect(nextObjectId("furniture", "furniture_chair")).toMatch(/#8$/);
});

test("只认自己发的号：别人的高号不该把我的计数器顶上去", () => {
  syncIdCounters([
    `${LOCAL_PLAYER_ID}:drop:rice#2`,
    "p-host9999:drop:rice#500", // 房主发的，用的是他自己的计数器
  ]);

  expect(nextObjectId("drop", "rice")).toBe(`${LOCAL_PLAYER_ID}:drop:rice#3`);
});

test("换了发号方之后，同步只认新身份的号", () => {
  setIdIssuer("p-me00001");
  syncIdCounters([`${LOCAL_PLAYER_ID}:drop:rice#99`, "p-me00001:drop:rice#4"]);

  expect(nextObjectId("drop", "rice")).toBe("p-me00001:drop:rice#5");
});

test("认不出的 id 在同步时被跳过，不影响其余", () => {
  syncIdCounters(["垃圾数据", `${LOCAL_PLAYER_ID}:drop:rice#4`, "another#bad"]);

  expect(nextObjectId("drop", "rice")).toMatch(/#5$/);
});

test("resetIdCounters 清空所有 kind（换一份世界时用）", () => {
  nextObjectId("drop", "rice");
  nextObjectId("furniture", "furniture_chair");

  resetIdCounters();

  expect(nextObjectId("drop", "rice")).toMatch(/#1$/);
  expect(nextObjectId("furniture", "furniture_chair")).toMatch(/#1$/);
});

test("发出来的 id 一定能被自己解析回去（往返）", () => {
  setIdIssuer("p-abcd1234");

  for (const [kind, name] of [
    ["drop", "rice"],
    ["furniture", "furniture_chair"],
    ["drop", "fried_tomato_egg"],
  ]) {
    const id = nextObjectId(kind, name);
    const parsed = parseObjectId(id);

    expect(parsed, id).not.toBeNull();
    expect(parsed?.issuer).toBe("p-abcd1234");
    expect(parsed?.kind).toBe(kind);
    expect(parsed?.name).toBe(name);
  }
});
