import { useEffect, useState } from "react";

import { on } from "../../Game/EventBus";
import { getGold, getGoldCapacity } from "../../Game/State/gold";
import { useCountUp } from "./useCountUp";

/**
 * 金币条：**一根空玻璃管，钱涨上去黄色跟着填满**（2026-08-23）。
 *
 * ## 三版的账
 *
 * ① 最早是塞在需求卡里的一条灰底细杠，和饱食/精力同形。推理是"金币也是
 *    一个有上限的量"——推理没错但**读法**错了：那两条是会自己往下掉的
 *    状态，扫一眼看"还剩多少"；金币是资源，要看的是**具体数字**。混在
 *    一叠灰杠里数字小得看不清。
 *
 * ② 第二版改成金色胶囊 + 压边金币，形状对了，但**整条一上来就是满的金色**
 *    ——用户的原话："一开始应该是空玻璃材质，随着金币的增加，他逐渐填满
 *    黄色才对，而不是上来就是满的"。一根始终金色的条表达不了"装了多少"，
 *    那是装饰不是仪表。
 *
 * ③ 现在：**玻璃管 + 液面**。空的时候透过管看得见背后的景，钱涨上去
 *    黄液从左往右填。和金币罐那边"币堆高度 = 存了多少"是同一套读法——
 *    HUD 上这根管子就是场上那些罐子的总和。
 *
 * ## 玻璃是四层叠出来的（不用贴图）
 *
 * `backdrop-blur` 让背后的景发虚（这是"透明物体"最强的信号）、上下两道
 * inset 阴影给出管壁的厚度、顶部一道白色高光条是打在弧面上的反光。
 * **少了高光那条就只是一块半透明色板**，不像玻璃。
 */

/** 三位一撇。参考图上是 `7 524 545`，用窄空格不用逗号——数字更容易连读 */
function groupDigits(value: number): string {
  return value.toLocaleString("en-US").replace(/,/g, " ");
}

export function GoldHud() {
  const [state, setState] = useState({
    gold: getGold(),
    capacity: getGoldCapacity(),
  });

  useEffect(() => {
    const refresh = () =>
      setState({ gold: getGold(), capacity: getGoldCapacity() });
    // 余额变了走 gold_changed；建罐/拆罐/升罐改的是上限，走 world_changed
    const offGold = on("gold_changed", refresh);
    const offWorld = on("world_changed", ({ reason }) => {
      if (reason === "buildings" || reason === "restored") refresh();
    });
    return () => {
      offGold();
      offWorld();
    };
  }, []);

  const ratio =
    state.capacity > 0 ? Math.min(1, state.gold / state.capacity) : 0;
  const full = state.capacity > 0 && state.gold >= state.capacity;

  /*
   * 数字滚上去，黄液同时往右填。两者**时长接近但不强求一致**：
   * 数字按变化量定时长（进账 3 和进账 300 该不一样），黄液是固定 600ms
   * 的 CSS 过渡。硬要同步就得把 width 也交给 rAF 逐帧写，为了一件
   * 没人看得出差别的事多一条动画管线，不划算。
   */
  const goldRef = useCountUp(state.gold, groupDigits);
  const capRef = useCountUp(state.capacity, groupDigits);

  return (
    <div className="relative flex h-[34px] items-center pr-[15px]">
      {/* ---- 玻璃管 ---- */}
      <div
        className="relative flex h-[30px] min-w-[116px] items-center overflow-hidden rounded-full border-[3px] border-[#5a4324] pl-4 pr-7"
        style={{
          // 背后的景发虚 = "这是透明的"最强的信号
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          // 管壁本身只有极淡的一点色，立体感全靠高光和阴影
          backgroundColor: "rgba(58, 44, 26, 0.26)",
          boxShadow:
            "inset 0 2px 0 rgba(255,255,255,0.42), inset 0 -4px 7px rgba(0,0,0,0.28), 0 2px 3px rgba(0,0,0,0.35)",
        }}
      >
        {/* 黄液：从左往右填。空的时候宽度 0，管子就是空的 */}
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-[600ms] ease-out"
          style={{
            width: `${ratio * 100}%`,
            backgroundImage: full
              ? "linear-gradient(180deg, #ffc46b, #f0a845 55%, #d9781f)"
              : "linear-gradient(180deg, #ffe692, #f2b32e 55%, #d99b28)",
            // 液面那道亮边：液体和空气的交界，比液体本身亮
            boxShadow:
              ratio > 0 && !full ? "inset -2px 0 0 rgba(255,255,255,0.55)" : "none",
          }}
        />

        {/* 顶部高光：打在弧面上的一道反光。少了它就只是一块半透明色板 */}
        <div
          className="pointer-events-none absolute inset-x-[6px] top-[2px] h-[8px] rounded-full"
          style={{
            backgroundImage:
              "linear-gradient(180deg, rgba(255,255,255,0.6), rgba(255,255,255,0))",
          }}
        />

        {/*
          * tabular-nums：数字滚动时每一位等宽，管子不会跟着一格一格晃。
          * 内容由 useCountUp 每帧直接写 textContent（不走 React），
          * 所以这两个 span 里**不放子节点**。
          */}
        <span className="relative whitespace-nowrap text-[15px] font-bold leading-none tabular-nums text-[#fffaf0] [text-shadow:0_1px_0_rgb(0_0_0_/_0.7),0_0_3px_rgb(0_0_0_/_0.55)]">
          <span ref={goldRef} />
          <span className="opacity-80">
            /<span ref={capRef} />
          </span>
        </span>
      </div>

      {/* ---- 金币：压在管子右端一半探出去。它是图例，所以始终实心 ---- */}
      <div
        className="absolute right-0 grid h-[30px] w-[30px] place-items-center rounded-full border-[3px] border-[#5a4324] shadow-[0_2px_3px_rgb(0_0_0_/_0.35)]"
        style={{ backgroundImage: "linear-gradient(#f9df8a, #e0a52c)" }}
        aria-hidden
      >
        {/* 内圈：币面上那道压印 */}
        <span className="block h-[13px] w-[13px] rounded-full border-[2.5px] border-[#c4881c]/75" />
      </div>
    </div>
  );
}
