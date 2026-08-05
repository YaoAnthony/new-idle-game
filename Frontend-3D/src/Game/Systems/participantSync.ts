import { getSelectedStack } from "../State/inventory";
import { getResting } from "../State/posture";
import { setLocalAppearance } from "../State/participants";
import { on } from "../EventBus";

/**
 * 把散在各处的"看得见的状态"汇进 `participants` 的 appearance 层。
 *
 * 为什么需要这么一层搬运工，而不是让 participants 自己去订阅：
 *
 * - `Game/State/*` 是**真相源**，彼此不该互相订阅。posture 知道人坐在哪、
 *   inventory 知道选中哪一格，它们各自完整；让 participants 反过来订阅
 *   这两个，就等于在 State 层内部织出一张依赖网，加一个新状态要改的地方
 *   从一处变成两处。
 * - 而 appearance 本身**不是真相源**，是给渲染和（将来的）网络层读的
 *   一份投影。投影就该由外面的人来刷，不该反噬它投影的对象。
 *
 * 所以接线放在 Systems 层：这一层本来就是"把几个 State 缝起来做一件事"
 * 的地方（resting、kitchen 都是这个角色）。
 *
 * ---- 为什么 appearance 不进存档 ----
 *
 * 这里同步的两样东西，存档里各自已经有了自己的位置：手上拿的是
 * `PlayerSave.character.heldItem`（其实就是选中格），坐姿是
 * `character.restingOn`。appearance 再存一份就是同一件事的第二个真相源，
 * 读档时两份对不上必然出"坐在椅子上但姿势是站着"。
 * 读档后由这里重新推一次就够——它本来就是派生量。
 */

/**
 * 开始同步。返回停止函数。
 *
 * 在游戏世界挂载时调一次。**不是在模块顶层自动跑**：那样 import 一下
 * 就有了副作用，测试和存档校验（Backend 也读同一份 Core 类型）会莫名
 * 多出一个订阅者。
 */
export function startParticipantSync(): () => void {
  const pushHeld = (): void => {
    /*
     * 手上拿的东西 = 选中的那一格（见 State/heldItem 顶部那段）。
     *
     * 转成 VisibleItem 而不是直接推槽位对象：槽位带 stackId
     * （"hotbar:3"），那是我背包里的门牌号，对别人没有意义，
     * 传过去还等于把自己的快捷栏布局漏给对面。
     *
     * 也不用 heldItem.getHeld()——那个返回的是给**厨房规则**用的加工形态
     * （对着锅时会补一块空容器好让规则表分辨"拿着容器"还是"拿着食材"），
     * 而"别人看见我手上有什么"不需要那层加工。
     */
    const stack = getSelectedStack();
    setLocalAppearance({
      heldItem: stack
        ? {
            itemId: stack.itemId,
            quantity: stack.count,
            quality: stack.quality,
            container: stack.container,
          }
        : null,
    });
  };

  const pushResting = (): void => {
    const resting = getResting();
    setLocalAppearance({
      // returnTo（起身退回哪）**不同步**：那是本地的落脚点记录，
      // 别人看你坐在椅子上不需要知道你之前站在哪
      restingOn: resting
        ? { instanceId: resting.instanceId, anchorId: resting.anchorId }
        : null,
    });
  };

  pushHeld();
  pushResting();

  const offs = [
    on("held_changed", pushHeld),
    // 换格子、格子里的东西变了（吃掉一半、锅里熟了）都要重推：
    // 手上那份的**内容**变了，别人看到的模型也该跟着变
    on("inventory_changed", pushHeld),
    on("posture_changed", pushResting),
  ];

  return () => {
    for (const off of offs) off();
  };
}
