import type { Facing } from "./base.js";

/**
 * **一栋楼在世界里的一个实例**。
 *
 * 和家具是同一套语言，只是抬高一级：家具是「型号 + 摆放 + 状态」，
 * 建筑也是。型号（长什么样、多大、门在哪）住在 Frontend 的
 * `Buildings/<id>.ts`——一栋楼必须连模型一起才完整，而模型是
 * Three.js 代码，进不了这个要给 Backend 复用的包（和箱庭定义
 * 搬出 Core 是同一条理由）。这里只留**实例**，因为它有一天要进存档。
 *
 * ## 为什么不复用 WorldPosition
 *
 * `WorldPosition` 的 `y` **是世界 z 不是高度**（历史命名，portal.landing
 * 和 spawn 都跟着它）。建筑真的需要一个高度——小镇的商业街就坐在
 * 两级台地上。同一个字段名两个意思是最坏的那种复用，所以这里老老实实
 * 写 `x/z/elevation` 三个。`mapId` 也不要：实例本来就长在某张图的
 * 数据里，再存一份就是两个真相。
 *
 * ## 为什么朝向用 Facing 而不是弧度
 *
 * 照 WorldPosition 那段注释自己的判据——**看它是不是本来就离散**。
 * 身体转身是连续的（存四向会让"面朝 40° 存盘读档变 0°"啪地扭一下），
 * 而建筑贴着街、对着铺装、门要正对路，它就是四档的，和家具同类。
 * 能摆成 37° 的房子只会让碰撞和铺装对不齐。
 */
export type BuildingPlacement = {
  /** 实例 id。以后要存档、要联机同步状态，认的是它 */
  instanceId: string;
  /** 型号 id，查 Frontend 的建筑注册表 */
  buildingId: string;

  /** 建筑中心的世界坐标 */
  x: number;
  z: number;
  /** 脚下那层台地的标高。地不是平的 */
  elevation: number;
  /** 朝哪。**正面永远是型号本地的 +z**，由它转到世界里 */
  facing: Facing;

  /**
   * **当前等级 id。** 查型号的 `levels` 里 levelId 相同的那条。
   *
   * 不存"第几级"数字：分叉之后 3a / 3b 都是第三级，数字不唯一。存 id
   * 还顺带解决了"以后在中间插一级"——数组下标会让所有实例集体移位，
   * id 不会。
   *
   * 可选是为了小镇那六家：它们是地图内容（`MapDefinition.buildings`），
   * 不进存档也不会升级，不填就是初始等级。
   */
  levelId?: string;

  /**
   * **正在施工中**（本期恒不出现——升级瞬时完成）。
   *
   * 工人系统那一期填它：目标等级 + 完工时刻 + 占用的工人。结构先留，
   * 接的时候不用给 BuildingPlacement 做存档迁移。CoC 的核心约束是
   * "建筑工小时"而不是材料，这个字段就是给那一天准备的。
   */
  construction?: {
    targetLevelId: string;
    finishUtc: string;
    workerId?: string;
  };

  /**
   * 实例状态（罐里有多少钱、田里种着什么、小屋住着谁…）。
   *
   * **本期起进存档**（`WorldSave.buildings`）。原来这里写着"今天没有
   * 任何玩法会改它，所以它不进存档"——那句话到期了：金币罐的余额和
   * 农田的播种时刻都活在这里。
   *
   * 小镇那六家仍然不进存档：它们是地图内容，每次进图从定义生成，
   * 和 volatileRooms 同一条纪律。
   */
  state?: Record<string, unknown>;
};
