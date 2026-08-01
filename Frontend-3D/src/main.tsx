import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { auditItemVisuals } from './Game3D/Visual/VisualRegistry.ts'

// 开机点一次名：哪些物品还没有模型。全齐时一声不吭。
// 放在这里而不是场景构造里，是因为它问的是**注册表对不对**，
// 和有没有开局、进没进屋子无关——换句话说它该在最早的地方跑，跑一次。
if (import.meta.env.DEV) auditItemVisuals()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
