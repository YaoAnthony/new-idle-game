/**
 * Stable Phaser scene entrypoint imported by the React game shell.
 */
import { GameSceneRuntime } from './runtime/GameSceneRuntime';

/**
 * Thin Phaser scene entrypoint used by React.
 *
 * The large runtime implementation lives under runtime/ so this file stays as
 * the stable public import target for the rest of the app.
 */
export class GameScene extends GameSceneRuntime {}
