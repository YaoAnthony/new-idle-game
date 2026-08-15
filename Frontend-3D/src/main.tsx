import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import './index.css'
import App from './App.tsx'
import { initAuth } from './Features/Auth/authBridge.ts'
import { initCloudSync } from './Features/CloudSave/syncController.ts'
import { persistor, store } from './Redux/store.ts'
import { auditAvatarContent, auditDoorContent, auditStoryContent } from 'core'
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
