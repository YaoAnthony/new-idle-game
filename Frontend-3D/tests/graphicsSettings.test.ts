import { beforeEach, expect, test, vi } from "vitest";

import {
  GRAPHICS_QUALITIES,
  effectiveQuality,
  getGraphicsPrefs,
  getGraphicsSettings,
  graphicsPreset,
  isLowPowerActive,
  onGraphicsSettings,
  resetGraphicsSettingsForTest,
  setAutoLowPower,
  setGraphicsOverrides,
  setGraphicsQuality,
  setLowPowerActive,
} from "../src/Game3D/Engine/graphicsSettings";

/**
 * 画质档位（2026-09-18）。要点三条：
 * - 一档是**一整套**参数，玩家只选档；
 * - 自动模式（专注）期间临时压到最低档，**不改玩家选的那档、不落盘**；
 * - 地址栏 / 用例的逐项覆盖压得过档位。
 */

function setDevicePixelRatio(value: number): void {
  Object.defineProperty(window, "devicePixelRatio", { value, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  resetGraphicsSettingsForTest();
  setDevicePixelRatio(1);
});

test("画质_档位从省电到好看单调变贵", () => {
  const cost = GRAPHICS_QUALITIES.map((id) => graphicsPreset(id));
  for (let i = 1; i < cost.length; i += 1) {
    expect(cost[i].pixelRatio).toBeGreaterThanOrEqual(cost[i - 1].pixelRatio);
  }
  expect(graphicsPreset("smooth").postFX).toBe(false);
  expect(graphicsPreset("ultra").puddles).toBe(true);
  // 积水只在最高档：它是每帧把整个场景多渲一遍
  expect(graphicsPreset("high").puddles).toBe(false);
});

test("画质_Retina 屏默认降到均衡档", () => {
  setDevicePixelRatio(2);
  expect(getGraphicsPrefs().quality).toBe("balanced");
  expect(getGraphicsSettings().pixelRatio).toBe(1.5);

  resetGraphicsSettingsForTest();
  setDevicePixelRatio(1);
  expect(getGraphicsPrefs().quality).toBe("high");
});

test("画质_选档落盘、再进来还是那档", () => {
  setGraphicsQuality("smooth");
  expect(getGraphicsSettings().postFX).toBe(false);

  resetGraphicsSettingsForTest();
  expect(getGraphicsPrefs().quality).toBe("smooth");
});

test("画质_旧版只存了积水布尔的档接到极致", () => {
  localStorage.setItem("idle-game:graphics", JSON.stringify({ puddles: true }));
  resetGraphicsSettingsForTest();
  expect(getGraphicsPrefs().quality).toBe("ultra");
  expect(getGraphicsSettings().puddles).toBe(true);
});

test("画质_自动模式压档是借用：玩家选的那档不动，退出就还回去", () => {
  setGraphicsQuality("high");
  const seen: string[] = [];
  const off = onGraphicsSettings(() => seen.push(effectiveQuality()));

  setLowPowerActive(true);
  expect(isLowPowerActive()).toBe(true);
  expect(effectiveQuality()).toBe("smooth");
  expect(getGraphicsSettings().postFX).toBe(false);
  // 玩家的选择没被改写，落盘的也还是 high
  expect(getGraphicsPrefs().quality).toBe("high");
  expect(JSON.parse(localStorage.getItem("idle-game:graphics")!).quality).toBe("high");

  setLowPowerActive(false);
  expect(effectiveQuality()).toBe("high");
  expect(seen).toEqual(["smooth", "high"]);
  off();
});

test("画质_勾没开就不压档；压着的时候关勾立刻弹回来", () => {
  setGraphicsQuality("high");
  setAutoLowPower(false);
  setLowPowerActive(true);
  expect(isLowPowerActive()).toBe(false);
  expect(effectiveQuality()).toBe("high");

  setAutoLowPower(true);
  setLowPowerActive(true);
  expect(effectiveQuality()).toBe("smooth");
  setAutoLowPower(false);
  expect(isLowPowerActive()).toBe(false);
  expect(effectiveQuality()).toBe("high");
});

test("画质_逐项覆盖压得过档位", () => {
  setGraphicsQuality("ultra");
  setGraphicsOverrides({ pixelRatio: 1, postFX: false });
  expect(getGraphicsSettings().pixelRatio).toBe(1);
  expect(getGraphicsSettings().postFX).toBe(false);
  // 覆盖之外的项照档位走
  expect(getGraphicsSettings().puddles).toBe(true);

  setGraphicsOverrides(null);
  expect(getGraphicsSettings().pixelRatio).toBe(2);
});

test("画质_换档通知订阅者拿到的是整套解出来的参数", () => {
  const listener = vi.fn();
  const off = onGraphicsSettings(listener);
  setGraphicsQuality("smooth");
  expect(listener).toHaveBeenCalledWith(
    expect.objectContaining({ pixelRatio: 1, postFX: false, shadows: false, puddles: false }),
  );
  off();
});
