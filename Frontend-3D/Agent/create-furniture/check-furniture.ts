/** 新家具的 headless 守门：定义 / 外观 / 文案 / 能落 / 规则一致 */
import { Facing, PlacementSurface, buildRoomOccupancy, checkPlacement, findPlaceableItem, placeableItems, roomStyleDefinitions } from "core";
import { generateHouse } from "game/Maps/base/layout";
import { resolveVisual, buildItemVisual } from "game/Game3D/Visual/VisualRegistry";
import { hasLocalizationKey } from "game/i18n/t";
import { Box3, Vector3 } from "three";

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) console.log(`  ok  ${name}`);
  else { failures += 1; console.error(`FAIL  ${name}`, detail ?? ""); }
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["furniture_lucky_bamboo"];
const room = generateHouse({ roomId: "living", style: roomStyleDefinitions[0] });
const occ = buildRoomOccupancy(room, [], findPlaceableItem);

for (const id of ids) {
  console.log(`== ${id}`);
  const item = findPlaceableItem(id);
  check("注册表里有且可放置", !!item);
  if (!item) continue;
  const p = item.placement;
  check("文案 item", hasLocalizationKey(item.localizationKey));
  check("文案 desc", hasLocalizationKey(`${item.localizationKey}.desc`));
  if (p.interactHint) check("文案 hint", hasLocalizationKey(p.interactHint.localizationKey));
  check("外观已注册", !!resolveVisual(item.visual.id), item.visual.id);
  const sitting = p.capabilities.some((c) => c === "sitting" || c === "sleep");
  check("坐/睡必有锚点", !sitting || (p.anchors?.length ?? 0) > 0);
  check("surfaceGrid 必配 surfaceHeight", !p.surfaceGrid || typeof p.surfaceHeight === "number");
  // 模型装在占地里（地面件：以占地中心为原点）
  const visual = buildItemVisual(id);
  check("能建出模型", !!visual);
  if (visual && p.surface === PlacementSurface.Floor) {
    const bb = new Box3().setFromObject(visual);
    const size = bb.getSize(new Vector3());
    const halfW = p.footprint.width / 2, halfD = p.footprint.height / 2;
    console.log(`   模型尺寸 ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} 米，底 y=${bb.min.y.toFixed(2)}`);
    check("模型不出占地（留 5cm 余量）", bb.min.x >= -halfW - 0.05 && bb.max.x <= halfW + 0.05 && bb.min.z >= -halfD - 0.05 && bb.max.z <= halfD + 0.05, [bb.min, bb.max]);
    check("底面贴地（y≈0）", Math.abs(bb.min.y) < 0.05, bb.min.y);
    const r = checkPlacement(room, { kind: PlacementSurface.Floor, gridPosition: { x: 14, y: 4 }, facing: Facing.North }, item, occ);
    check("客厅空地能落", r.ok === true, r);
  }
}
console.log(failures === 0 ? "\nALL OK" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
