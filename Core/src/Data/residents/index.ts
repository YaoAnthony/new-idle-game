import {
  CreatureRole,
  GiftTier,
  type ResidentDefinition,
  type ResidentTaste,
} from "../../types/residents.js";

/**
 * 宠物物种注册表。
 *
 * 设定：**元素凝聚体**——它们不是动物，是环境自己长出来的东西。
 * 苔灵是林间湿气和苔藓凝成的，沫灵是浪沫收不回去的那一口气，
 * 烬灵是石缝里没冷透的余温。所以三种屋子风格各配一只，
 * 不是"这个地区住着这种动物"，而是"这种地方会长出这种东西"。
 *
 * 造型全部走 visualId → Frontend 的 VisualRegistry 解析。
 * 名字分两层：localizationKey 是物种名（图鉴用），
 * defaultNicknameKey 是初见时给的昵称（玩家之后能改，存 ResidentSave.nickname）。
 */
export const residentDefinitions = [
  {
    id: "moss_wisp",
    localizationKey: "pet.moss_wisp",
    defaultNicknameKey: "pet.moss_wisp.nickname",
    visualId: "moss_wisp",
    species: "wisp",
    /*
     * dialogues / bondEventId 随旧剧情一起摘掉了（2026-08-13）。
     *
     * 这两个字段是**对话在哪、认没认识过**的认领口——RoomScene 的 F 交互
     * 按它们查，不认识具体物种（原来那处理写死了苔灵两个字面量 id，
     * 加舒舒才发现只认得一只）。新剧情写好对话之后填回来即可，
     * 交互那段一行不用动。字段空着时按 F 静默不出对话。
     */
  },
  {
    id: "foam_wisp",
    localizationKey: "pet.foam_wisp",
    defaultNicknameKey: "pet.foam_wisp.nickname",
    visualId: "foam_wisp",
    species: "wisp",
  },
  {
    id: "ember_wisp",
    localizationKey: "pet.ember_wisp",
    defaultNicknameKey: "pet.ember_wisp.nickname",
    visualId: "ember_wisp",
    species: "wisp",
  },

  /**
   * 水獭商人（期 3）。**三天来一趟收家具**，顺便卖你种不出来的食材。
   *
   * `role: Merchant` 让他跳过吃/喝/亲近三支（同石傀儡），但比石傀儡多
   * 一件事：**他会走**。在不在场由 `Systems/trading` 按固定周期算，
   * 不在的那几天整只从运行时移除——不是藏起来，藏起来碰撞体还在，
   * 玩家会撞到一团空气。
   *
   * 造型见 `Visual/recipes/otter.ts`（用户 2026-08-24 给了两张参考图）。
   */
  /*
   * 旅行商人「小鱼人」（期 6）。八天一趟的稀客，**身后拖着一辆浮筏车**。
   *
   * 和水獭的分工是硬的：水獭三天一趟收家具（熟人），这只八天一趟卖
   * 永久升级（稀客）。一密一疏、一收一卖、一暖一冷，玩家分得出来。
   */
  {
    id: "fish_trader",
    localizationKey: "pet.fish_trader",
    defaultNicknameKey: "pet.fish_trader.nickname",
    visualId: "fish_trader",
    species: "fishfolk",
    role: CreatureRole.Merchant,
    // 车在身后，碰撞半径按"人 + 车"给，不然玩家会从车里穿过去
    collisionRadius: 0.9,
    trailing: { visualId: "raft_cart", distance: 1.15 },
    behavior: {
      moveSpeed: 0.9,
      // 拖着车的人不会满院子跑
      wanderRadius: 1.8,
      sleepiness: 0,
    },
  },
  {
    id: "otter_trader",
    localizationKey: "pet.otter_trader",
    defaultNicknameKey: "pet.otter_trader.nickname",
    visualId: "otter_trader",
    species: "otter",
    role: CreatureRole.Merchant,
    /*
     * 碰撞半径 0.5：他本人只有 0.25 宽，但**背着那个包**——
     * 按身体算的话玩家会从包里穿过去，那一下"这是个活物"的错觉就碎了
     * （舒舒那条注释里的同一个判据）。
     */
    collisionRadius: 0.5,
    behavior: {
      moveSpeed: 1.1,
      // 摊位边上转两步就够。他是来做生意的，不是来溜达的
      wanderRadius: 2.5,
      // 商人不打盹：玩家走过去他要是睡着的，"来做生意"就不成立
      sleepiness: 0,
    },
    // dialogues 等 3B 写完对话数据一起填——content.test 查引用必须存在
  },

  /**
   * 小龙「青涟」（期 3 的贼）。灵渊小龙、幼年期，喜探索水域，爱偷金币。
   *
   * **不常驻**：只在偷窃链的"被抓回来"那一幕登场（spawn_resident），
   * 事件结了就从运行时移除。造型见 `Visual/recipes/dragon.ts`
   * （用户 2026-08-24 给的设定稿：三视图 + 表情 + 细节 + 比例）。
   *
   * role 走缺省的 Pet 而不是 Worker——Worker 会去认领工地（石傀儡的
   * 行为），龙站在院子里等发落的时候跑去搬砖就穿帮了。吃喝用零衰减
   * 关掉：它只站一两天，不该饿。
   */
  {
    id: "coin_dragon",
    localizationKey: "pet.coin_dragon",
    defaultNicknameKey: "pet.coin_dragon.nickname",
    visualId: "coin_dragon",
    species: "spirit_dragon",
    collisionRadius: 0.35,
    behavior: {
      moveSpeed: 1.4,
      // 被抓回来的贼站在原地等发落，不游荡
      wanderRadius: 1.2,
      sleepiness: 0,
      hungerPerHour: 0,
      thirstPerHour: 0,
    },
    // 按 F 听它道歉（剧情主动拉起的也是这一段；没有 bondEventId，永远是它）
    dialogues: { firstMeet: "dragon_caught" },
  },

  /*
   * ==== 三位居民（期 4）====
   *
   * 到来走抽签池（storyRules 里共享 poolId "resident_arrival"，同一天
   * 最多来一位）。**造型都是占位**——用户还没给这三只的参考图，
   * visualId 指向的是 `recipes/residentPlaceholder`（一颗带问号气质的
   * 小圆球，各染各的色）。图到了换 VisualRegistry 一行，定义不动。
   *
   * 搬入前驻地在出生点附近；房子建成那一刻 `Systems/residents` 把
   * home 重定向到他家门口（进存档，不漂移）。
   */
  {
    id: "slime_neighbor",
    localizationKey: "pet.slime_neighbor",
    defaultNicknameKey: "pet.slime_neighbor.nickname",
    visualId: "slime_neighbor",
    species: "slime",
    role: CreatureRole.Resident,
    residence: { buildingId: "slime_house" },
    collisionRadius: 0.3,
    behavior: { moveSpeed: 0.9, wanderRadius: 3, sleepiness: 0.3, napSeconds: [60, 150] },
    dialogues: { firstMeet: "slime_asks_to_stay", casual: "slime_casual" },
  },
  {
    id: "fox_neighbor",
    localizationKey: "pet.fox_neighbor",
    defaultNicknameKey: "pet.fox_neighbor.nickname",
    visualId: "fox_neighbor",
    species: "fox",
    role: CreatureRole.Resident,
    residence: { buildingId: "fox_house" },
    collisionRadius: 0.35,
    behavior: { moveSpeed: 1.5, wanderRadius: 4, sleepiness: 0.15 },
    dialogues: { firstMeet: "fox_asks_to_stay", casual: "fox_casual" },
  },
  {
    /*
     * 精灵：**尖耳朵人形，像个小人**（用户 2026-08-24 定）。
     * 不是 wisp 那一支（wisp 是环境凝出来的元素体）——它是全游戏
     * 第一个"像人"的角色（除玩家），文明设定期 7 写播报员对话时一起立。
     */
    id: "spirit_neighbor",
    localizationKey: "pet.spirit_neighbor",
    defaultNicknameKey: "pet.spirit_neighbor.nickname",
    visualId: "spirit_neighbor",
    species: "spirit_folk",
    role: CreatureRole.Resident,
    residence: { buildingId: "spirit_house" },
    collisionRadius: 0.3,
    behavior: { moveSpeed: 1.2, wanderRadius: 3.5, sleepiness: 0.2 },
    dialogues: { firstMeet: "spirit_asks_to_stay", casual: "spirit_casual" },
  },

  /**
   * 舒舒：一只两个人那么大的巨猫，几乎总在地上睡（对照 整体架构.md
   * 开头那句"一只龙猫正躺在角落里呼呼大睡"——就是这个位置的生物）。
   *
   * 它和 wisp 是刻意的两极：wisp 小、无碰撞、飘来飘去；舒舒巨大、
   * 挡路、一动不动。屋子里有个又大又懒的东西躺着，空间才有"被住着"的感觉。
   */
  {
    id: "shushu",
    localizationKey: "pet.shushu",
    defaultNicknameKey: "pet.shushu.nickname",
    visualId: "shushu",
    species: "giant_cat",
    behavior: {
      /** 大家伙迈不开步。快了像滑行，慢下来每一步才显得沉 */
      moveSpeed: 0.85,
      /** 懒到家：闲下来十次有八次选择接着睡 */
      sleepiness: 0.8,
      /** 一觉几分钟（现实时间）。醒来溜达一圈，很快又困了 */
      napSeconds: [90, 240],
    },
    /** 体宽约 1.6 米，圆形碰撞半径取到肩宽略收——蹭着毛边走得过去 */
    collisionRadius: 0.95,
    // 同上：对话与羁绊事件等新剧情写好再认领
  },

  /**
   * 石傀儡：领地上那尊会干活的石头人。
   *
   * 它和前面四只的分别不在数字上，在**身份**上——`role: Worker` 让它
   * 不吃不喝不亲近，也不涨好感度。玩家和它的关系是雇佣不是养育。
   *
   * 开场它**没有头，坐在地上休眠**；头在领地另一头。装上头才醒，
   * 醒了才能说话、才会去工地。这段调度不写在这里（数据只描述"它是什么"），
   * 由开局摆设和剧情安排，见 Frontend 的 `seedInitialCreatures`。
   */
  {
    id: "stone_golem",
    localizationKey: "pet.stone_golem",
    defaultNicknameKey: "pet.stone_golem.nickname",
    visualId: "stone_golem",
    species: "golem",
    role: CreatureRole.Worker,
    behavior: {
      /** 石头做的，比舒舒还沉。慢是它的性格，不是待优化的数值 */
      moveSpeed: 0.55,
      /** 干活的不打盹。开场那段休眠是剧情摆的，不是它自己困了 */
      sleepiness: 0,
      napSeconds: [60, 120],
      /** 在自己那块地方转悠，不满院子跑。等接了工地再让他走远 */
      wanderRadius: 5,
    },
    /** 比舒舒宽一圈：它是一堵会走路的墙 */
    collisionRadius: 1.1,
    /**
     * 但这堵墙**穿得过别的墙**。半径 1.1 的家伙在一个越堆越满的院子里
     * 迟早哪儿都去不了，而它的全部意义就是去工地。代价见类型声明。
     */
    ignoresObstacles: true,
  },
] satisfies ResidentDefinition[];

/** 有自己房子的那几位（`residence` 填了的）。指令候选和搬入判定都问它 */
export function listResidentDefinitions(): ResidentDefinition[] {
  return (residentDefinitions as readonly ResidentDefinition[]).filter((resident) => resident.residence);
}

/** 这栋房型是谁的家。没人认领（金库、店铺）返回 undefined */
export function findResidentOfHouse(buildingId: string): ResidentDefinition | undefined {
  return listResidentDefinitions().find((resident) => resident.residence?.buildingId === buildingId);
}

export function findResidentDefinition(id: string): ResidentDefinition | undefined {
  return residentDefinitions.find((resident) => resident.id === id);
}

/**
 * 喜好表。判定见 `logic/giftRules.ts`，四档的**反应**由对话与 storyRules 声明——
 * 这张表只回答"它对这样东西是什么态度"，不决定后果。
 *
 * 喜好是从**设定**推出来的，不是随手分的：苔灵是林间湿气凝的，
 * 所以偏清淡潮湿的东西；沫灵是浪沫的那口气，白的软的最合它；
 * 烬灵是石缝里没冷透的余温，重口、热的才对味，汤会浇灭它。
 * 这样玩家试错时能试出**规律**，而不是背一张随机表。
 *
 * 生食材（生蛋、生米、生肉）一律列 inedible：不是口味问题，是真的没法吃。
 * 生番茄这种本来就能生吃的例外，照常参与口味分档。
 */
export const residentTastes: Record<string, ResidentTaste> = {
  moss_wisp: {
    /**
     * `cheese` 在这里换了一条轴：不是"清淡潮湿"推出来的，是**好奇心**——
     * 它把玩家当成"外面世界"的信息源（见 `Data/dialogues/index.ts` 的定调）。
     *
     * ⚠️ 这一项不要"纠正"回不喜欢：奶酪是 `ItemOrigin.Real`，全作的题眼就是
     * 玩家递上现实里换来的、它连见都没见过的东西。记忆条目只在**爱吃**档写，
     * 所以这个演出能不能成立，取决于 cheese 对它是不是 loved。
     */
    loved: ["baby_cabbage_soup", "cheese"],
    liked: [
      "fried_tomato_egg",
      "cooked_rice",
      "fried_egg",
      "tomato",
      "baby_cabbage",
      "green_pepper",
    ],
    disliked: ["pepper_pork", "century_egg"],
    inedible: ["egg", "rice", "pork"],
    fallback: GiftTier.Liked,
  },

  foam_wisp: {
    loved: ["cooked_rice", "fried_egg"],
    liked: ["fried_tomato_egg", "baby_cabbage_soup", "tomato", "baby_cabbage", "cheese"],
    disliked: ["pepper_pork", "green_pepper", "century_egg"],
    inedible: ["egg", "rice", "pork"],
    fallback: GiftTier.Liked,
  },

  ember_wisp: {
    loved: ["pepper_pork", "century_egg"],
    liked: ["fried_tomato_egg", "fried_egg", "cooked_rice", "green_pepper"],
    // 汤会浇灭它。挑食，所以 fallback 也落在不喜欢那一档
    disliked: ["baby_cabbage_soup", "baby_cabbage", "tomato", "cheese"],
    inedible: ["egg", "rice", "pork"],
    fallback: GiftTier.Disliked,
  },

  shushu: {
    /**
     * 猫的口味从物种直接推：荤的爱，素的懒得碰——**除了番茄**。
     *
     * 2026-08-02 改过一次：原来番茄和青椒白菜一起归在 disliked（"素的懒得碰"
     * 那条通则）。写初见剧情时发现这条通则和剧情本身打架——新手开局
     * 背包里唯一现成能送的就是番茄，初见那段写的是它眼睛一亮、
     * 从没吃过这么好吃的东西、当场认你做朋友，这必须是 loved 档的反应
     * （四档回应的措辞是按档位写的，塞一份 loved 的台词给 disliked 判定
     * 会文不对题）。所以破例：番茄挪进 loved，其余素菜维持不喜欢。
     * 不是每一条通则都要一路贯彻到底——剧情需要的具体反应优先于分类的整洁。
     */
    loved: ["fried_egg", "pepper_pork", "tomato"],
    liked: ["fried_tomato_egg", "cooked_rice", "cheese"],
    disliked: ["baby_cabbage", "green_pepper", "baby_cabbage_soup", "century_egg"],
    inedible: ["egg", "rice", "pork"],
    /** 没见过的东西先闻闻再说，不挑衅也不热情 */
    fallback: GiftTier.Disliked,
  },
};

export function findResidentTaste(definitionId: string): ResidentTaste | undefined {
  return residentTastes[definitionId];
}
