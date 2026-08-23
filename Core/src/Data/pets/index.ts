import {
  CreatureRole,
  GiftTier,
  type PetDefinition,
  type PetTaste,
} from "../../types/pets.js";

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
 * defaultNicknameKey 是初见时给的昵称（玩家之后能改，存 PetSave.nickname）。
 */
export const petDefinitions = [
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
    },
    /** 比舒舒宽一圈：它是一堵会走路的墙 */
    collisionRadius: 1.1,
  },
] satisfies PetDefinition[];

export function findPetDefinition(id: string): PetDefinition | undefined {
  return petDefinitions.find((pet) => pet.id === id);
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
export const petTastes: Record<string, PetTaste> = {
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

export function findPetTaste(definitionId: string): PetTaste | undefined {
  return petTastes[definitionId];
}
