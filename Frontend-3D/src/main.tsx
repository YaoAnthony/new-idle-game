import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { auditStoryContent } from 'core'
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
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
