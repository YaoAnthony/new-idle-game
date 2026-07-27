import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { RefObject } from "react";

export const GAME_SIZE = {
  width: 1280,
  height: 720,
} as const;

type UsePhaserGameOptions = {
  scene: Phaser.Types.Scenes.SceneType | Phaser.Types.Scenes.SceneType[];
  backgroundColor?: string;
};

/**
 * 启动游戏的 Hook
 * @param containerRef 
 * @param param1 
 * @returns 
 */
export function usePhaserGame(
  containerRef: RefObject<HTMLElement | null>,
  { scene, backgroundColor = "#111827" }: UsePhaserGameOptions,
) {
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent || gameRef.current) return;

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor,
      pixelArt: true,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GAME_SIZE.width,
        height: GAME_SIZE.height,
      },
      physics: {
        default: "arcade",
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false,
        },
      },
      scene,
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [backgroundColor, containerRef, scene]);

  return gameRef;
}
