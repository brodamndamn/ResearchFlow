import { FlaskConical } from 'lucide-react'
import type { PropsWithChildren } from 'react'
import { Link } from 'react-router-dom'

export function Shell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="ResearchFlow 首页">
          <span className="brand-mark"><FlaskConical size={20} /></span>
          <span>Research<span>Flow</span></span>
        </Link>
        <div className="header-note">中文深度研究 Agent</div>
      </header>
      <main>{children}</main>
      <footer>ResearchFlow · 研究结果由 AI 生成，请核验关键事实与来源</footer>
    </div>
  )
}
