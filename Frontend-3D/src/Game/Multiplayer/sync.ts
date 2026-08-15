import {
  sendAppearance,
  sendChat,
  sendGesture,
  sendTransform,
} from "../../Api/game/websocket";
import { on } from "../EventBus";
import {
  LOCAL_PLAYER_ID,
  getLocalParticipant,
  onParticipantGesture,
} from "../State/participants";

/**
 * 出站同步泵：把本地玩家的三层状态按各自的节奏推给服务器。
 *
 * | 层         | 节奏                     | 判据                       |
 * |------------|--------------------------|----------------------------|
 * | transform  | 12.5Hz 定时，**变了才发** | 位置/朝向/移动态和上次不同 |
 * | appearance | 跟着 transform 的拍子查，变了才发 | JSON 串对比（对象很小） |
 * | gesture    | 事件驱动，发生即发        | onParticipantGesture       |
 * | chat       | 事件驱动（player_said）   | ChatPanel 发话时           |
 *
 * 数据源全部是 State/participants——渲染层每帧写进去的那份权威投影。
 * 泵不认识 CharacterController，也不认识会话状态：session 说开就开、
 * 说停就停。
 */

const PUMP_INTERVAL_MS = 80;

/** 位置变化小于这个就当没动，别拿浮点噪声刷流量 */
const POSITION_EPSILON = 0.003;
const HEADING_EPSILON = 0.005;

let pump: ReturnType<typeof setInterval> | null = null;
let offGesture: (() => void) | null = null;
let offChat: (() => void) | null = null;

export function startSyncPump(): void {
  stopSyncPump();

  let lastSent: {
    x: number;
    y: number;
    heading: number;
    locomotion: string;
    liftHeight: number;
  } | null = null;
  let lastAppearanceKey = "";

  pump = setInterval(() => {
    const { transform, appearance } = getLocalParticipant();

    const moved =
      !lastSent ||
      Math.abs(transform.x - lastSent.x) > POSITION_EPSILON ||
      Math.abs(transform.y - lastSent.y) > POSITION_EPSILON ||
      Math.abs(transform.heading - lastSent.heading) > HEADING_EPSILON ||
      transform.locomotion !== lastSent.locomotion ||
      Math.abs(transform.liftHeight - lastSent.liftHeight) > POSITION_EPSILON;

    if (moved) {
      lastSent = {
        x: transform.x,
        y: transform.y,
        heading: transform.heading,
        locomotion: transform.locomotion,
        liftHeight: transform.liftHeight,
      };
      sendTransform(transform);
    }

    // appearance 变化极低频，序列化对比的开销（一个小对象 @12.5Hz）
    // 远小于为它单独铺一套事件订阅的复杂度
    const appearanceKey = JSON.stringify(appearance);
    if (appearanceKey !== lastAppearanceKey) {
      lastAppearanceKey = appearanceKey;
      sendAppearance(appearance);
    }
  }, PUMP_INTERVAL_MS);

  offGesture = onParticipantGesture((playerId, gesture) => {
    if (playerId !== LOCAL_PLAYER_ID) return;
    sendGesture(gesture);
  });

  // ChatPanel 发话时已经乐观入了本地记录，这里只负责递出去。
  // 命令（/开头）不进这条：player_said 本来就只对"说的话"发
  offChat = on("player_said", ({ text }) => {
    sendChat(text);
  });
}

export function stopSyncPump(): void {
  if (pump) {
    clearInterval(pump);
    pump = null;
  }
  offGesture?.();
  offGesture = null;
  offChat?.();
  offChat = null;
}
