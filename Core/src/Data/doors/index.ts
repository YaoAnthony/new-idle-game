import type { DoorDefinition, DoorDefinitionId } from "../../types/doors.js";

/**
 * 门的注册表。种类差异全在字段里：运行时的 Door/RoomDoor 类只解释
 * 这些数字，不认识任何具体的门——加一种门在这里加一行就够。
 */
export const doorDefinitions: DoorDefinition[] = [
  {
    id: "front_door",
    visualId: "door_front",
    localizationKey: "door.front_door",
    /*
     * 大门的自动开半径收得很小（1.2，房门是 1.6）：只在宠物真的走到
     * 门口那一步才开——这就是派遣出门的仪式感，原来硬编码在 RoomScene
     * 的渲染循环里（距离 1.2 写死），现在收进注册表由同一套 RoomDoor
     * 行为驱动。路过的宠物（≥1.2）不会碰开家门。
     */
    lockable: true,
    defaultLocked: false,
    behavior: {
      autoOpenRadius: 1.2,
      autoCloseRadius: 1.8,
      swingSpeed: 6,
    },
  },
  {
    id: "room_door",
    visualId: "door_interior",
    localizationKey: "door.room_door",
    lockable: true,
    defaultLocked: false,
    behavior: {
      /*
       * 自动开 1.6：约一格半，宠物贴到门前一步就开，不会隔着半个房间
       * 就大开中门。关门半径必须留出迟滞（2.4 > 1.6），生物在临界距离
       * 徘徊时门才不会开-关-开-关地抖。
       */
      autoOpenRadius: 1.6,
      autoCloseRadius: 2.4,
      swingSpeed: 6,
    },
  },
];

export function findDoorDefinition(
  id: DoorDefinitionId,
): DoorDefinition | undefined {
  return doorDefinitions.find((definition) => definition.id === id);
}
