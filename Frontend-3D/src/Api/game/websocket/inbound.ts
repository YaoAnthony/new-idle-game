import {
  NET_EVENTS,
  type AppearanceEvent,
  type ChatMessageEvent,
  type GestureEvent,
  type ParticipantJoinedEvent,
  type ParticipantLeftEvent,
  type SessionEndedEvent,
  type TransformEvent,
  type WorldOpEvent,
  type WorldRefreshEvent,
  type ResidentKeyframesEvent,
} from "core";

import { rawSocket } from "./connection.js";

/**
 * 入站的九种消息，每种一个类型化订阅口。
 *
 * **为什么是回调而不是直接发 EventBus**：EventBus 住在 `Game/`，
 * 让 `Api/` 去发它就等于让传输层反向依赖游戏层，这条边界立起来就是为了
 * 不出现这种穿透。这一层只做"把 socket 上那串字符串事件翻译成带类型的
 * 回调"，谁想听谁订阅。
 *
 * 返回退订函数（和 `Game/EventBus` 的 `on` 同一个约定）——会话结束时
 * 要能干净摘掉，否则换一次世界就叠一份监听。
 */

type Off = () => void;

function subscribe<T>(event: string, listener: (payload: T) => void): Off {
  const socket = rawSocket();
  socket.on(event, listener as (payload: unknown) => void);
  return () => {
    socket.off(event, listener as (payload: unknown) => void);
  };
}

export function onParticipantJoined(cb: (e: ParticipantJoinedEvent) => void): Off {
  return subscribe(NET_EVENTS.s2c.participantJoined, cb);
}

export function onParticipantLeft(cb: (e: ParticipantLeftEvent) => void): Off {
  return subscribe(NET_EVENTS.s2c.participantLeft, cb);
}

export function onTransform(cb: (e: TransformEvent) => void): Off {
  return subscribe(NET_EVENTS.s2c.transform, cb);
}

export function onAppearance(cb: (e: AppearanceEvent) => void): Off {
  return subscribe(NET_EVENTS.s2c.appearance, cb);
}

export function onGesture(cb: (e: GestureEvent) => void): Off {
  return subscribe(NET_EVENTS.s2c.gesture, cb);
}

export function onChat(cb: (e: ChatMessageEvent) => void): Off {
  return subscribe(NET_EVENTS.s2c.chat, cb);
}

export function onWorldOp(cb: (e: WorldOpEvent) => void): Off {
  return subscribe(NET_EVENTS.s2c.worldOp, cb);
}

export function onWorldRefresh(cb: (e: WorldRefreshEvent) => void): Off {
  return subscribe(NET_EVENTS.s2c.worldRefresh, cb);
}

export function onSessionEnded(cb: (e: SessionEndedEvent) => void): Off {
  return subscribe(NET_EVENTS.s2c.sessionEnded, cb);
}

/**
 * 自己断线。**对本地来说和"房主跑了"是一回事**——世界的来源没了，
 * 所以上层接这条和接 `onSessionEnded` 走同一段收尾。
 */
export function onDisconnect(cb: () => void): Off {
  return subscribe("disconnect", cb);
}

export function onResidentKeyframes(cb: (e: ResidentKeyframesEvent) => void): Off {
  return subscribe(NET_EVENTS.s2c.residents, cb);
}
