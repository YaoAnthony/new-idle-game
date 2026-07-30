import { useRef } from "react";
import titleBackground from "../Assets/background/title-cottage-dusk.png";
import { usePhaserGame } from "../Hook/usePhaserGame";
import { GameStart } from "./Features/Scene/GameStart";

const TITLE_SCENES = [GameStart];

type GameProps = {
  backgroundColor: string;
};

export function Game({ backgroundColor }: GameProps) {
  const gameContainerRef = useRef<HTMLDivElement>(null);

  usePhaserGame(gameContainerRef, {
    scene: TITLE_SCENES,
    backgroundColor,
  });

  return (
    <div
      ref={gameContainerRef}
      className="absolute inset-0 overflow-hidden bg-cover bg-center [&>canvas]:!block [&>canvas]:[image-rendering:pixelated]"
      style={{ backgroundImage: `url(${titleBackground})` }}
      aria-hidden="true"
    />
  );
}
