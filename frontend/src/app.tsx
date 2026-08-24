import { Navigate, Route, Routes } from 'react-router-dom'

import { Shell } from './components/Shell'
import { HomePage } from './pages/HomePage'
import { ReportPage } from './pages/ReportPage'
import { RunPage } from './pages/RunPage'

export function AppRoutes() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/run/:id" element={<RunPage />} />
        <Route path="/report/:id" element={<ReportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  )
}
