import { ArrowLeft, FlaskConical, House } from 'lucide-react'
import type { PropsWithChildren } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

export function Shell({ children }: PropsWithChildren) {
  const location = useLocation()
  const navigate = useNavigate()
  const isHome = location.pathname === '/'

  function goBack() {
    const historyIndex = window.history.state?.idx
    if (typeof historyIndex === 'number' && historyIndex > 0) {
      navigate(-1)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="ResearchFlow 首页">
          <span className="brand-mark"><FlaskConical size={20} /></span>
          <span>Research<span>Flow</span></span>
        </Link>
        <div className="header-note">中文深度研究 Agent</div>
        <nav className="header-actions" aria-label="页面导航">
          {!isHome && (
            <button
              type="button"
              className="header-nav-button"
              onClick={goBack}
              aria-label="返回上一页"
            >
              <ArrowLeft size={17} />
              <span className="header-nav-label">返回</span>
            </button>
          )}
          <Link
            className="header-nav-button"
            to="/"
            aria-label="返回主页"
            aria-current={isHome ? 'page' : undefined}
          >
            <House size={17} />
            <span className="header-nav-label">主页</span>
          </Link>
        </nav>
      </header>
      <main>{children}</main>
      <footer>ResearchFlow · 研究结果由 AI 生成，请核验关键事实与来源</footer>
    </div>
  )
}
