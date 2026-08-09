/**
 * 世界运行时（V0.13 从单文件 worldRuntime.ts 拆开）。
 *
 * - maps       当前地图 / 房间几何 / 风格 / 存档往返
 * - furniture  家具增删 + 槽位内容（op 通道的落点）
 * - placement  放置校验（预览和提交同一份代码）
 * - obstacles  活物障碍（玩家 / 宠物的圆形碰撞体）
 * - walkable   通行与高度查询
 * - state      共享可变状态，**不从这里导出**——外界只许走上面的函数
 */
export * from "./maps.js";
export * from "./furniture.js";
export * from "./placement.js";
export * from "./obstacles.js";
export * from "./walkable.js";
