import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { getActiveAction } from "../../Game/Systems/actions";
import {
  describeMixerChannels,
  setChannelGain,
  type MixerChannelView,
} from "../../Game3D/Engine/AudioEngine";
import { t } from "../../i18n/t";

/**
 * 白噪音台：专注（= 有行动在进行）时浮在左边，逐条调周围的声音。
 *
 * **这块面板没有任何一条写死的声音清单。** 行是问引擎"此刻真的有哪些
 * 循环在响"现推出来的（`describeMixerChannels`）——走近壁炉多一行，
 * 走开少一行，下雨多一行，天晴少一行。以后加一件会响的家具、一种会响的
 * 天气，这个文件一个字都不用改。
 *
 * 只在专注时出现：平时走来走去弹一块调音台是噪音，而专注恰恰是唯一
 * "人不动、耳朵在工作"的时刻——白噪音这个需求本来就长在那里。
 *
 * 调的结果**只属于这台机器上的这个人**，不进存档也不上网（见
 * AudioEngine 的 MIXER_STORAGE_KEY）：联机时你把别人家壁炉静音，
 * 只有你自己听不见。
 */

/** 轮询周期。声音的出现/消失是走位和天气驱动的，半秒一次足够跟手 */
const POLL_MS = 500;

export function NoiseMixer() {
  const [active, setActive] = useState(() => Boolean(getActiveAction()));
  const [channels, setChannels] = useState<MixerChannelView[]>([]);

  useEffect(
    () =>
      on("action_changed", ({ status }) => setActive(status === "started")),
    [],
  );

  useEffect(() => {
    if (!active) return;

    const refresh = () => setChannels(describeMixerChannels());
    refresh();

    const timer = setInterval(refresh, POLL_MS);
    // 拖滑块要即刻回显，等下一轮轮询会有半拍延迟
    const off = on("mixer_changed", refresh);
    return () => {
      clearInterval(timer);
      off();
    };
  }, [active]);

  if (!active) return null;

  return (
    /*
     * 不自己定位：它排在左上角那一列里（时钟 → 需求条 → 这块），
     * 由 flex 决定纵向位置。自己 absolute 就得猜上面那堆有多高，
     * 而时钟的天气行、需求条的条目数都会变。
     */
    <div className="mixer ui-bar ui-dash w-[min(236px,44vw)] px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="mixer__title text-[13px] font-bold text-[var(--ink)]">
          {t("ui.mixer.title")}
        </span>
        <span className="mixer__hint text-[10px] text-[var(--ink-soft)]">
          {t("ui.mixer.hint")}
        </span>
      </div>

      {channels.length === 0 ? (
        <div className="py-3 text-center text-[11px] text-[var(--ink-soft)]">
          {t("ui.mixer.empty")}
        </div>
      ) : (
        <div className="mixer__rows mt-2 flex flex-col gap-1.5">
          {channels.map((channel) => (
            <MixerRow key={channel.channel} channel={channel} />
          ))}
        </div>
      )}
    </div>
  );
}

function MixerRow({ channel }: { channel: MixerChannelView }) {
  const muted = channel.gain <= 0;
  const label = channel.localizationKey
    ? t(channel.localizationKey)
    : channel.profileId;

  /**
   * 静音记住的是**静音前那一格**，取消静音回到原位而不是弹回满格。
   * 存在这里而不是引擎里：它是这一次交互的撤销点，不是玩家的偏好，
   * 存进 localStorage 只会在下次开局冒出一个来路不明的数字。
   */
  const [restore, setRestore] = useState(1);

  /*
   * 一行装下：静音钮 + 名字 + 响度点 + 滑块。
   *
   * 第一版把滑块换了一行，桌面上好看，但 667x375 的横屏上这一列扣掉
   * 时钟和需求条只剩 ~87px——两行一条的话连一条都摆不下。而调音台
   * 本来就该是一条一条的推子，横排反而更像那么回事。
   */
  return (
    <div className="mixer__row">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="mixer__mute"
          title={t(muted ? "ui.mixer.unmute" : "ui.mixer.mute")}
          aria-label={t(muted ? "ui.mixer.unmute" : "ui.mixer.mute")}
          onClick={() => {
            if (muted) {
              setChannelGain(channel.channel, restore > 0 ? restore : 1);
            } else {
              setRestore(channel.gain);
              setChannelGain(channel.channel, 0);
            }
          }}
        >
          {muted ? "🔇" : "🔊"}
        </button>

        <span
          className={`min-w-0 flex-1 truncate text-[11px] ${
            muted ? "text-[var(--ink-soft)] line-through" : "text-[var(--ink)]"
          }`}
        >
          {label}
        </span>

        {/*
         * 音景层此刻给这条声音的音量。**不是玩家拧的那个**——它回答的是
         * "这声音离我远不远"（走近壁炉会涨），玩家看着它才知道自己
         * 到底在调什么。两个数字放一起就是一台调音台该有的样子。
         */}
        <span
          className="mixer__meter"
          style={{ opacity: 0.25 + Math.min(channel.ambient, 1) * 0.75 }}
          aria-hidden
        />

        <input
          type="range"
          className="mixer__slider"
          min={0}
          max={100}
          value={Math.round(channel.gain * 100)}
          onChange={(event) =>
            setChannelGain(channel.channel, Number(event.target.value) / 100)
          }
        />
      </div>
    </div>
  );
}
