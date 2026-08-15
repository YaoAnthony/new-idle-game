import { useState } from "react";
import type { SaveHead } from "core";

import { GameBtn } from "../../Components/GameBtn";

/**
 * 云存档冲突的二选一。**没有默认选项、没有倒计时**——两边都是玩家的
 * 真实进度，选错一次的代价是几小时游玩，这里慢就是快。
 * "用云端"之前本地主档已被转存 world.conflict（syncController 负责），
 * 文案里要把这层后悔药讲清楚，玩家才敢点。
 */

function formatTime(utc: string | null): string {
  if (!utc) return "（无存档）";
  try {
    return new Date(utc).toLocaleString();
  } catch {
    return utc;
  }
}

export function ConflictDialog({
  cloudHead,
  localUpdatedAtUtc,
  reason,
  onChoose,
  busy,
}: {
  cloudHead: SaveHead;
  localUpdatedAtUtc: string | null;
  reason: "diverged" | "account_switched";
  onChoose: (choice: "use_cloud" | "use_local") => void;
  busy: boolean;
}) {
  const [confirming, setConfirming] = useState<"use_cloud" | "use_local" | null>(null);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgb(9_14_12_/_0.72)] p-5">
      <div className="pixel-panel w-[min(560px,94vw)] bg-[#f0dfad] p-[clamp(18px,4vw,28px)] text-[#3a281d]">
        <h2 className="m-0 text-[clamp(18px,3vw,24px)] font-black text-[#352219]">
          两份进度对不上了
        </h2>
        <p className="mb-4 mt-2 text-[13px] leading-relaxed">
          {reason === "account_switched"
            ? "这台设备上的本地进度和你账户的云端进度不是同一份。"
            : "这台设备和云端（可能是另一台设备）各自都有新的进度。"}
          选择要继续哪一份——另一份不会立刻消失：本机进度会先备份一份在本地。
        </p>

        <div className="mb-4 grid grid-cols-2 gap-3 text-[13px]">
          <div className="border-2 border-[#65452f] bg-[#e5cc93] p-3">
            <p className="m-0 font-black">本机进度</p>
            <p className="m-0 mt-1">{formatTime(localUpdatedAtUtc)}</p>
          </div>
          <div className="border-2 border-[#65452f] bg-[#e5cc93] p-3">
            <p className="m-0 font-black">云端进度</p>
            <p className="m-0 mt-1">{formatTime(cloudHead.updatedAtUtc)}</p>
          </div>
        </div>

        {confirming ? (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-[13px] font-bold">
              {confirming === "use_cloud"
                ? "用云端进度继续？本机当前进度会备份，之后云端为准。"
                : "用本机进度继续？云端会被本机覆盖（服务器还留有上一份）。"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <GameBtn size="md" disabled={busy} onClick={() => onChoose(confirming)}>
                {busy ? "……" : "确定"}
              </GameBtn>
              <GameBtn size="md" disabled={busy} onClick={() => setConfirming(null)}>
                返回
              </GameBtn>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <GameBtn size="md" onClick={() => setConfirming("use_local")}>
              用本机进度
            </GameBtn>
            <GameBtn size="md" onClick={() => setConfirming("use_cloud")}>
              用云端进度
            </GameBtn>
          </div>
        )}
      </div>
    </div>
  );
}
