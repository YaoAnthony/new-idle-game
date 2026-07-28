import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/fusion-pixel-12px-proportional-sc'
import '@fontsource/fusion-pixel-12px-proportional-jp'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
