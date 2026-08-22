import { useEffect, useState } from "react";

import { on } from "../../Game/EventBus";
import { getGold, getGoldCapacity } from "../../Game/State/gold";

/**
 * 金币条。**和饥饿/疲劳条完全同形**（图标 + 数字 + 条），因为它现在
 * 就是同一类东西：一个有上限的量。
 *
 * 期 0 定过"金币不画条"，理由是金币无上限、画条得编一个假上限。
 * 罐给了真上限之后那条理由不成立了——**条满 = 该升罐或多建罐**，
 * 一眼看得出，这正是画条的全部意义。
 *
 * 没有罐时条为空、数字 0：那不是异常状态而是开局的样子，玩家看到
 * 一条空到底的金币条，就知道钱没地方装。
 */
export function GoldHud() {
  const [state, setState] = useState({ gold: getGold(), capacity: getGoldCapacity() });

  useEffect(() => {
    const refresh = () => setState({ gold: getGold(), capacity: getGoldCapacity() });
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

  const ratio = state.capacity > 0 ? state.gold / state.capacity : 0;

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[13px] leading-none" aria-hidden>
        🪙
      </span>
      {/* tabular-nums：数字跳动时条不跟着左右晃 */}
      <span className="w-8 text-right text-[11px] tabular-nums text-[var(--ink-soft)]">
        {state.gold}
      </span>
      <div className="h-[9px] flex-1 overflow-hidden rounded-full bg-[var(--cream-3)]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.min(100, ratio * 100)}%`,
            // 满了换个颜色：该升罐了，别让玩家自己去算 340/340
            backgroundColor: ratio >= 1 ? "#e0803a" : "#d9a441",
          }}
        />
      </div>
    </div>
  );
}
