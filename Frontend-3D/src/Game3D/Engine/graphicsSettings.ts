/**
 * 画质设置（2026-09-18）。第一项：雨天积水与倒影。
 *
 * 积水的倒影是 Reflector 每帧把整个场景多渲一遍（几百个 draw call），机器一般的话
 * 雨天会掉帧——所以它是**画质里的一档**，默认关，想看的时候开。同音频设置一个路子：
 * localStorage 存、`get / update` 读写、订阅者（PuddleField）自己接。
 */

export type GraphicsSettings = {
  /** 雨天积水 + 倒影（费性能）。默认关 */
  puddles: boolean;
};

const STORAGE_KEY = "idle-game:graphics";
const DEFAULTS: GraphicsSettings = { puddles: false };

let current: GraphicsSettings | null = null;
type Listener = (settings: GraphicsSettings) => void;
const listeners = new Set<Listener>();

function load(): GraphicsSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...DEFAULTS, ...(JSON.parse(stored) as Partial<GraphicsSettings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getGraphicsSettings(): GraphicsSettings {
  if (!current) current = load();
  return current;
}

export function updateGraphicsSettings(patch: Partial<GraphicsSettings>): GraphicsSettings {
  current = { ...getGraphicsSettings(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // 存不了就只在这一次会话里生效
  }
  for (const listener of listeners) listener(current);
  return current;
}

export function onGraphicsSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
