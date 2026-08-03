/**
 * 房屋模块的唯一入口（2026-07-30 应用户要求收拢）。
 *
 * 房子的全部建模——外墙、地板、天花板、内墙、木构架、门、窗——
 * 都住在这个目录里，外界只从这里 import。将来"装修换风格"或者
 * 整栋换成精模，替换的边界就是这个目录，外面一行不用动。
 *
 * 分工：
 * - HouseBuilder：把 Core 的 RoomSave（纯数据）变成网格体，
 *   附带网格坐标 ↔ 世界坐标的换算工具（家具放置也用它）
 * - WindowView：窗户本体（木框、玻璃、雨天水光、窗边尘埃）
 * - DoorView：门板与开合动画（宠物派遣的仪式感）
 */
export {
  WALL_ROTATION,
  buildHouse,
  gridToWorld,
  wallCellToWorld,
  wallInwardNormal,
  worldToWallCell,
  type BuiltHouse,
  type WindowAnchor,
} from "./HouseBuilder.js";
export { DoorView } from "./DoorView.js";
export { RoomDoorView } from "./RoomDoorView.js";
export { WindowView } from "./WindowView.js";
