/** 新家具的 headless 守门：定义 / 外观 / 文案 / 能落 / 规则一致 */
import { Facing, PlacementSurface, SURFACE_CELL_METERS, buildRoomOccupancy, checkPlacement, checkSurfacePlacement, findPlaceableItem, placeableItems, roomStyleDefinitions } from "core";
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
  const bb = visual ? new Box3().setFromObject(visual) : null;
  if (visual && bb && p.surface === PlacementSurface.Floor) {
    const size = bb.getSize(new Vector3());
    const halfW = p.footprint.width / 2, halfD = p.footprint.height / 2;
    console.log(`   模型尺寸 ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} 米，底 y=${bb.min.y.toFixed(2)}`);
    check("模型不出占地（留 5cm 余量）", bb.min.x >= -halfW - 0.05 && bb.max.x <= halfW + 0.05 && bb.min.z >= -halfD - 0.05 && bb.max.z <= halfD + 0.05, [bb.min, bb.max]);
    check("底面贴地（y≈0）", Math.abs(bb.min.y) < 0.05, bb.min.y);
    const r = checkPlacement(room, { kind: PlacementSurface.Floor, gridPosition: { x: 14, y: 4 }, facing: Facing.North }, item, occ);
    check("客厅空地能落", r.ok === true, r);
  }
  // 能上桌的（声明了 surfaceFootprint，或本来就只认台面）：模型得装进
  // 它在桌上占的那几个**半格**里。地面占地 1×1 = 1 米很宽松，
  // 桌上 1×1 = 0.5 米才是真正的紧箍——不查这条，灯会压到邻座的盘子上
  if (bb && (p.surfaceFootprint || p.surface === PlacementSurface.Surface)) {
    const cells = p.surfaceFootprint ?? p.footprint;
    const halfW = (cells.width * SURFACE_CELL_METERS) / 2;
    const halfD = (cells.height * SURFACE_CELL_METERS) / 2;
    console.log(`   台面占地 ${(halfW * 2).toFixed(2)}×${(halfD * 2).toFixed(2)} 米`);
    check("模型不出台面占地（留 2cm 余量）", bb.min.x >= -halfW - 0.02 && bb.max.x <= halfW + 0.02 && bb.min.z >= -halfD - 0.02 && bb.max.z <= halfD + 0.02, [bb.min, bb.max]);
    check("底面贴桌面（y≈0）", Math.abs(bb.min.y) < 0.05, bb.min.y);
  }
  // **每一张台面都试摆一次**。"能放桌上"是要求，不是摆完看一眼的印象——
  // 一件声明了 surfaceFootprint 却被某张桌子整张拒收的东西（比那张桌子的
  // 网格还大、或者只剩死格），只有真跑一遍 checkSurfacePlacement 才会露出来。
  // 判据是"这张台面上**至少有一格**放得下"，不是某个固定格：橱柜是 L 形，
  // (0,0) 落在缺口里本来就该被拒——那是规则对了，不是家具坏了。
  if (p.surfaceFootprint) {
    const hosts = placeableItems().filter((h) => h.placement.surfaceGrid);
    const rejected = hosts
      .map((host) => {
        const placedHost = [{
          instanceId: "host-under-test",
          furnitureId: host.id,
          placement: { kind: PlacementSurface.Floor, roomId: room.id, gridPosition: { x: 14, y: 4 }, facing: Facing.North },
          state: {},
        }] as never;
        const grid = host.placement.surfaceGrid!;
        for (let gx = 0; gx < grid.width; gx += 1) {
          for (let gy = 0; gy < grid.height; gy += 1) {
            const r = checkSurfacePlacement(
              { kind: PlacementSurface.Surface, hostInstanceId: "host-under-test" as never, gridPosition: { x: gx, y: gy }, facing: Facing.North },
              item,
              placedHost,
              findPlaceableItem,
            );
            if (r.ok === true) return null;
          }
        }
        return host.id;
      })
      .filter(Boolean);
    check(`每张台面都摆得上（${hosts.length} 张）`, rejected.length === 0, rejected);
  }
}
console.log(failures === 0 ? "\nALL OK" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
