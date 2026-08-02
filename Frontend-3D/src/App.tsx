import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { LoadingScreen } from "./Components/Loading/LoadingScreen";
import { TitleScreen } from "./Components/TitleScreen";
import { TITLE_SCREEN_CONFIG } from "./Components/TitleScreen/config";
import { getSaveRepository, hydrateGameSave, setBaseline } from "./Data/Save";
import { saveNow } from "./Data/Save/autosave";
import { on } from "./Game/EventBus";
import { GameView } from "./Game3D";
import { preloadWorldAudio } from "./Game3D/Engine/worldPreload";

/**
 * 顶层流程：标题页 → 加载 → 房间。
 *
 * "继续游戏"只在本地真的有可读存档时出现（V0.1 的可选小号入口）。
 * 从备份回退时必须明确告诉玩家——治愈游戏里悄悄回退比丢档更糟。
 *
 * 加载这一步**在存档灌进运行时之后**：要先知道这是哪个地区、屋里摆了
 * 哪些会响的家具，才知道该预热哪些素材（见 Game3D/Engine/worldPreload）。
 * 顺序反了就只能全量加载，加载时间会随内容量一直涨。
 */

type Stage = "title" | "loading" | "playing";

function App() {
  const [stage, setStage] = useState<Stage>("title");
  const [canContinue, setCanContinue] = useState(false);
  /** 传给 GameView：true 表示存档已经灌进运行时，不要再铺开局摆设和开场剧情 */
  const [loadedFromSave, setLoadedFromSave] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  /**
   * 进世界前把这个世界的声音解码好。
   *
   * 只有**加载页在场**的时候才跑：stage 是别的值时提前返回，
   * 免得回到标题再进来时叠一份还在跑的预载。
   */
  useEffect(() => {
    if (stage !== "loading") return;

    let cancelled = false;
    setProgress(0);

    void preloadWorldAudio((done, total) => {
      if (cancelled) return;
      // 一条素材都不用加载时 total 是 0，别算出 NaN
      setProgress(total === 0 ? 1 : done / total);
    }).then(() => {
      if (cancelled) return;
      setProgress(1);
      /**
       * 填满之后停一下再进去。
       *
       * 不是拖时间——clip-path 是 spring 推的，进度跳到 1 的那一帧
       * 动画才刚开始追，立刻切场景的话玩家看到的是"填到一半就没了"。
       * 这段刚好够那条 spring 走完。
       */
      setTimeout(() => {
        if (!cancelled) setStage("playing");
      }, 420);
    });

    return () => {
      cancelled = true;
    };
  }, [stage]);

  /**
   * ESC 菜单的"回到标题"。**先存盘再切**——切回标题会把整个 GameView
   * 卸掉，运行时状态跟着没，不先落盘就等于丢掉这一段游玩。
   */
  useEffect(
    () =>
      on("ui_return_to_title", () => {
        void saveNow().then(() => {
          setLoadedFromSave(false);
          setCanContinue(true);
          setStage("title");
        });
      }),
    [],
  );

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
    setStage("loading");
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
      // hydrate 已经跑完，这时候才问得出"这个世界要预热什么"
      setStage("loading");
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

      {/*
        加载页盖在最上层，而不是替换 GameView。
        GameView 挂载本身要花几百毫秒（建模、建场景），盖着的话这段时间
        玩家看到的还是加载页；替换的话会先黑一下再突然出现房间。
      */}
      <AnimatePresence>
        {stage === "loading" && <LoadingScreen key="loading" progress={progress} />}
      </AnimatePresence>

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
