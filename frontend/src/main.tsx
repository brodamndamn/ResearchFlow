import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { AppRoutes } from './app'
import './styles.css'
import './evidence-workbench.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/research">
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>,
)
