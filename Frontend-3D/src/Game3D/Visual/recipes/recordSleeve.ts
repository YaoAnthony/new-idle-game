import {
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
  type Object3D,
} from "three";
import { PALETTE } from "../palette.js";
import { box, cylinder, group } from "../primitives.js";
import { albumById } from "../../../Data/music/albums.js";

/**
 * 唱片（物品形态）：方形封套 + 露出半张的黑胶。
 *
 * 封面是**真贴图**（专辑文件夹里的 curver.png，见曲库生成脚本）——
 * 全游戏第一件带贴图的物品。加载是异步的：先给一张奶油底的素封套，
 * 图到了再换上去；404（专辑没放封面）就一直素着，不报错——
 * 封面是锦上添花，不是渲染的前提条件。
 *
 * 贴图材质**不进 flatMaterial 的缓存**：那个缓存按颜色做键，
 * 两张不同专辑的封面会互相顶掉，所以这里每次自己建材质。
 */

const loader = new TextureLoader();

export function buildRecordSleeve(albumId: string): Object3D {
  // 封套本体：一张薄方板，奶油底
  const sleeve = box([0.34, 0.34, 0.02], {
    color: PALETTE.boardCream,
    position: [0, 0.17, 0],
  });

  // 封面贴图面：贴在封套正面，异步换图
  const coverMaterial = new MeshLambertMaterial({ color: PALETTE.boardCream });
  const cover = new Mesh(new PlaneGeometry(0.31, 0.31), coverMaterial);
  cover.position.set(0, 0.17, 0.011);

  const coverUrl = albumById(albumId)?.coverUrl;
  if (coverUrl) {
    loader.load(coverUrl, (texture) => {
      texture.colorSpace = SRGBColorSpace;
      coverMaterial.map = texture;
      coverMaterial.color.set("#ffffff"); // 底色不再参与，否则封面被染黄
      coverMaterial.needsUpdate = true;
    });
  }

  // 黑胶从封套右侧探出半张——不露胶的话就只是"一张画"
  const vinyl = cylinder(0.15, 0.15, 0.012, 28, {
    color: PALETTE.gramVinyl,
    position: [0.1, 0.17, -0.018],
  });
  vinyl.rotation.x = Math.PI / 2;
  const label = cylinder(0.045, 0.045, 0.014, 18, {
    color: PALETTE.gramLabelRed,
    position: [0.1, 0.17, -0.018],
  });
  label.rotation.x = Math.PI / 2;

  return group(`record-sleeve-${albumId}`, [sleeve, cover, vinyl, label]);
}
