import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import './index.css'
import App from './App.tsx'
import { initAuth } from './Features/Auth/authBridge.ts'
import { initCloudSync } from './Features/CloudSave/syncController.ts'
import { persistor, store } from './Redux/store.ts'
import {
  auditAvatarContent,
  auditBuildings,
  auditDoorContent,
  auditStoryContent,
  auditTerritory,
} from 'core'
import { buildingDefinitions } from './Buildings/index.ts'
import { baseMapDefinition } from './Maps/base/index.ts'
import { TERRITORY_RECT } from './Maps/base/layout.ts'
import { spawnPosition } from './Game/State/participants.ts'
import { auditItemVisuals } from './Game3D/Visual/VisualRegistry.ts'
import { hasLocalizationKey } from './i18n/t.ts'

// 开机点一次名。全齐时一声不吭。
// 放在这里而不是场景构造里，是因为它们问的是**注册表对不对**，
// 和有没有开局、进没进屋子无关——换句话说该在最早的地方跑，跑一次。
if (import.meta.env.DEV) {
  auditItemVisuals()

  /*
   * 剧情数据里的 id 全是 string，写错了编译器一声不吭，运行时表现是
   * **静默地永远不触发**。已经出过一次：教程第二步的 subject 停在
   * V0.4 之前的 ordinary_workbench，教程永远卡在 2/6，
   * 而它看起来只是"还没做到那一步"。
   */
  const problems = auditStoryContent({ hasLocalizationKey })
  if (problems.length > 0) {
    console.warn(
      `[story] 剧情数据有 ${problems.length} 处对不上：\n  ${problems.join('\n  ')}`,
    )
  }

  // 捏人注册表同一套体检：零件 id、调色板、默认配置全是字符串引用
  const avatarProblems = auditAvatarContent({ hasLocalizationKey })
  if (avatarProblems.length > 0) {
    console.warn(
      `[avatar] 捏人注册表有 ${avatarProblems.length} 处对不上：\n  ${avatarProblems.join('\n  ')}`,
    )
  }

  // 门注册表：自动开/关半径这类裸数字配错了是"门永远不自动开"的哑巴病
  const doorProblems = auditDoorContent({ hasLocalizationKey })
  if (doorProblems.length > 0) {
    console.warn(
      `[door] 门注册表有 ${doorProblems.length} 处对不上：\n  ${doorProblems.join('\n  ')}`,
    )
  }

  /*
   * 建筑型号：**图的校验比链多两条**——环（升级变成死循环）和孤岛
   * （永远升不到的死内容）。两者都不炸编译，都要玩到那一级才发现。
   *
   * 这不是假想的风险：金币罐第一版就漏了 l1 的 nextLevelIds，l2/l3 直接
   * 成了孤岛，而型号文件看起来完全正常（三级都写齐了）。
   */
  const buildingProblems = auditBuildings(
    buildingDefinitions.map((definition) => ({
      buildingId: definition.buildingId,
      levels: definition.levels.map((level) => ({
        levelId: level.levelId,
        footprint: level.footprint,
        nextLevelIds: level.nextLevelIds,
        upgradeCost: level.upgradeCost,
        requires: level.requires,
      })),
    })),
    {
      hasBuilding: (id) => buildingDefinitions.some((d) => d.buildingId === id),
      hasLevel: (id, levelId) =>
        buildingDefinitions
          .find((d) => d.buildingId === id)
          ?.levels.some((l) => l.levelId === levelId) ?? false,
    },
  )
  if (buildingProblems.length > 0) {
    console.warn(
      `[buildings] 建筑注册表有 ${buildingProblems.length} 处对不上：`,
      buildingProblems,
    )
  }

  // 领地格盘：出生点落在锁定格里的话，开新档人会站着走不动——
  // 那看起来像"寻路坏了"，而不像"格盘配错了"
  // 出生点是**房本地**坐标，要先经默认房子的锚点世界化再对照格盘——
  // 直接拿原始数对的话，锚点一挪审计就在说另一个点
  const spawnWorld = spawnPosition()
  const territoryProblems = baseMapDefinition.territory
    ? auditTerritory(baseMapDefinition.territory, {
        spawn: { x: spawnWorld.x, z: spawnWorld.y },
        hasLocalizationKey,
        // 地块表是手写的（不再是公式生成的均匀网格），少一块、边界写错
        // 都没有编译期信号，只能靠这条把它和院子网格对齐
        expectedHull: TERRITORY_RECT,
      })
    : []
  if (territoryProblems.length > 0) {
    console.warn(
      `[territory] 领地格盘有 ${territoryProblems.length} 处对不上：`,
      territoryProblems,
    )
  }
}

// 顺序有讲究：云同步先装好存档仓库的工厂，authBridge 校验 token 触发的
// auth_changed 才能拿到已经会"云挂点"的仓库
initCloudSync()
// persist 恢复完（PersistGate 放行前）就开始校验 token——
// 校验是静默的，不阻塞标题页渲染
initAuth()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <App />
      </PersistGate>
    </Provider>
  </StrictMode>,
)
