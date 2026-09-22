import { findResidentDefinition, type AvatarConfig } from "core";
import {
  Box3,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { iconUrl } from "../../Assets/icons";
import { disposeTree } from "../Visual/primitives";
import { buildVisual } from "../Visual/VisualRegistry";
import { buildCharacter } from "../World/CharacterView";

/**
 * 头像快照（2026-09-16，对话面板用）：把 3D 造型的**正脸**渲到一张 256×256 的图上。
 *
 * 玩家的脸从捏出来的骨架里拍（换了发型 / 衣服头像自动跟着变，不用为每套外观出图）；
 * 居民优先用画好的立绘（`Assets/icons/residents/<definitionId>.png`），没画的也从造型里拍——
 * 石傀儡、水獭、舒舒今天都没有立绘，拍出来至少是这只活物本人，不是一个问号。
 *
 * 一个独立的小场景 + 离屏渲染器（不复用 RoomScene：那边挂着整间屋子），灯照抄捏脸预览台，
 * 预览里挑的颜色到头像里不变味。镜头正对 +z（造型的"前面"，heading 0 = +z），
 * 框住头部节点（找不到就框整体的上半段）。结果按外观 / 物种缓存，一份外观只拍一次。
 */

const SIZE = 256;
const FOV_DEG = 30;
/** 各物种造型里头部节点的命名（recipes 里各自起的），按顺序找 */
const HEAD_NODE_NAMES = ["golem-head", "head-pivot", "head", "headPivot"];

type Studio = { renderer: WebGLRenderer; scene: Scene; camera: PerspectiveCamera; canvas: HTMLCanvasElement };

let studio: Studio | null | undefined;

function getStudio(): Studio | null {
  if (studio !== undefined) return studio;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    const scene = new Scene();
    scene.add(new HemisphereLight("#ffffff", "#d8cbb4", 0.75));
    const sun = new DirectionalLight("#fff4e0", 1.35);
    sun.position.set(1.6, 2.4, 2.2);
    scene.add(sun);
    const camera = new PerspectiveCamera(FOV_DEG, 1, 0.05, 50);
    studio = { renderer, scene, camera, canvas };
  } catch {
    // 没有 WebGL（测试环境、被禁的浏览器）：头像退到兜底，不炸面板
    studio = null;
  }
  return studio;
}

function findHead(root: Object3D): Object3D | null {
  for (const name of HEAD_NODE_NAMES) {
    const node = root.getObjectByName(name);
    if (node) return node;
  }
  return null;
}

/** 把 object 摆进小场景、正面拍一张、拆掉。focus 为空 = 框整体的上半段 */
function snapshot(object: Object3D, focus: Object3D | null): string | null {
  const s = getStudio();
  if (!s) return null;
  s.scene.add(object);
  object.updateMatrixWorld(true);
  const box = new Box3().setFromObject(focus ?? object);
  if (!focus) {
    const height = box.max.y - box.min.y;
    box.min.y = box.max.y - height * 0.45;
  }
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const radius = Math.max(size.x, size.y) * 0.62 + 0.04;
  const distance = radius / Math.tan(MathUtils.degToRad(FOV_DEG) / 2);
  s.camera.position.set(center.x, center.y + radius * 0.05, center.z + distance);
  s.camera.lookAt(center);
  s.renderer.render(s.scene, s.camera);
  const url = s.canvas.toDataURL("image/png");
  s.scene.remove(object);
  disposeTree(object);
  return url;
}

const playerCache = new Map<string, string | null>();
const residentCache = new Map<string, string | null>();

/** 玩家自己的正脸。按外观缓存 */
export function playerPortrait(config: AvatarConfig): string | null {
  const key = JSON.stringify(config);
  const cached = playerCache.get(key);
  if (cached !== undefined) return cached;
  const rig = buildCharacter(config);
  const url = snapshot(rig.root, rig.parts.head);
  playerCache.set(key, url);
  return url;
}

/** 居民的脸：有立绘用立绘，没有就从造型里拍。按物种缓存 */
export function residentPortrait(definitionId: string): string | null {
  const drawn = iconUrl(`residents/${definitionId}`);
  if (drawn) return drawn;
  const cached = residentCache.get(definitionId);
  if (cached !== undefined) return cached;
  const definition = findResidentDefinition(definitionId);
  const model = definition ? buildVisual(definition.visualId) : null;
  let url: string | null = null;
  if (model) {
    // 石傀儡开局没头、头是装上去的：头像里当然要有头
    // 图鉴上是齐全的他（22：头 + 两只手）。没这个钩子的物种静默跳过
    const setPart = model.userData.setPartAttached as ((part: string, on: boolean) => void) | undefined;
    for (const part of ["head", "arm_left", "arm_right"]) setPart?.(part, true);
    url = snapshot(model, findHead(model));
  }
  residentCache.set(definitionId, url);
  return url;
}

/** 测试 / 换外观系统时清缓存 */
export function resetPortraitCache(): void {
  playerCache.clear();
  residentCache.clear();
}
