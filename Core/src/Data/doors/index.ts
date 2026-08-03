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
     * 大门能锁但不自动开：它是"家的边界"，宠物出入走派遣流程
     * （那边有自己的开门仪式），平时不该被路过的宠物碰开。
     */
    lockable: true,
    defaultLocked: false,
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
