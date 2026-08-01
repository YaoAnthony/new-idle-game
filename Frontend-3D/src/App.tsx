import { useCallback, useEffect, useState } from "react";
import { TitleScreen } from "./Components/TitleScreen";
import { TITLE_SCREEN_CONFIG } from "./Components/TitleScreen/config";
import { getSaveRepository, hydrateGameSave, setBaseline } from "./Data/Save";
import { GameView } from "./Game3D";

/**
 * 顶层流程：标题页 → （新游戏 / 继续游戏）→ 房间。
 *
 * "继续游戏"只在本地真的有可读存档时出现（V0.1 的可选小号入口）。
 * 从备份回退时必须明确告诉玩家——治愈游戏里悄悄回退比丢档更糟。
 */

type Stage = "title" | "playing";

function App() {
  const [stage, setStage] = useState<Stage>("title");
  const [canContinue, setCanContinue] = useState(false);
  /** 传给 GameView：true 表示存档已经灌进运行时，不要再铺开局摆设和开场剧情 */
  const [loadedFromSave, setLoadedFromSave] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getSaveRepository()
      .hasSave()
      .then((has) => {
        if (!cancelled) setCanContinue(has);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const startNewGame = useCallback(() => {
    setBaseline(null);
    setLoadedFromSave(false);
    setStage("playing");
  }, []);

  const continueGame = useCallback(async () => {
    const outcome = await getSaveRepository().load();

    if (outcome.kind === "loaded") {
      hydrateGameSave(outcome.save);
      setBaseline(outcome.save);
      setLoadedFromSave(true);

      if (outcome.source === "backup") {
        setNotice("主存档损坏，已从备份恢复到上一次保存的进度。");
      }
      setStage("playing");
      return;
    }

    // 读不出来就退回新游戏路径，但要说清楚发生了什么
    setNotice(
      outcome.kind === "failed"
        ? `读取存档失败：${outcome.message}`
        : "没有找到可继续的存档。",
    );
    setCanContinue(false);
  }, []);

  return (
    <main className="relative h-[100dvh] min-h-0 overflow-hidden bg-[#232b3d]">
      {stage === "title" ? (
        <TitleScreen
          config={TITLE_SCREEN_CONFIG}
          canContinue={canContinue}
          onContinue={() => void continueGame()}
          onSessionSelected={startNewGame}
        />
      ) : (
        <GameView loadedFromSave={loadedFromSave} />
      )}

      {notice ? (
        <div
          className="absolute left-1/2 top-6 z-40 max-w-[520px] -translate-x-1/2 rounded-lg border-2 border-[#8a6239] bg-[#f6ecd0]/95 px-5 py-3 text-center text-[14px] leading-relaxed text-[#4a3020] shadow-lg"
          role="status"
        >
          {notice}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => setNotice(null)}
          >
            知道了
          </button>
        </div>
      ) : null}

    </main>
  );
}

export default App;
