import Phaser from "phaser";
import titleBackground from "../../../Assets/background/title-cottage-dusk.png";
import { GAME_SIZE } from "../../../Hook/usePhaserGame";

const BACKGROUND_TEXTURE = "title-cottage-dusk";
const FIREFLY_TEXTURE = "title-firefly";

export class GameStart extends Phaser.Scene {
  constructor() {
    super("GameStart");
  }

  preload() {
    this.load.image(BACKGROUND_TEXTURE, titleBackground);
  }

  create() {
    this.add
      .image(GAME_SIZE.width / 2, GAME_SIZE.height / 2, BACKGROUND_TEXTURE)
      .setDisplaySize(GAME_SIZE.width, GAME_SIZE.height);

    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.createFireflies();
      this.cameras.main.fadeIn(700, 15, 23, 18);
    }
  }

  private createFireflies() {
    const firefly = this.make.graphics({ x: 0, y: 0 });
    firefly.fillStyle(0xffe67a, 1);
    firefly.fillRect(0, 0, 3, 3);
    firefly.generateTexture(FIREFLY_TEXTURE, 3, 3);
    firefly.destroy();

    this.add.particles(0, 0, FIREFLY_TEXTURE, {
      x: { min: 90, max: 590 },
      y: { min: 330, max: 650 },
      quantity: 1,
      frequency: 520,
      lifespan: { min: 2200, max: 3600 },
      speedX: { min: -5, max: 7 },
      speedY: { min: -12, max: -4 },
      alpha: {
        start: 0.8,
        end: 0,
        ease: "Sine.easeIn",
      },
      scale: { start: 0.5, end: 1.35 },
      blendMode: Phaser.BlendModes.ADD,
    });
  }
}
