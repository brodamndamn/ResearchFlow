import { ArrowLeft, FlaskConical, House, Moon, Sun } from 'lucide-react'
import { useState, type PropsWithChildren } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

type Theme = 'dark' | 'light'

const THEME_STORAGE_KEY = 'researchflow:theme'

function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function Shell({ children }: PropsWithChildren) {
  const location = useLocation()
  const navigate = useNavigate()
  const isHome = location.pathname === '/'
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  function goBack() {
    const historyIndex = window.history.state?.idx
    if (typeof historyIndex === 'number' && historyIndex > 0) {
      navigate(-1)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="site-header">
        <Link className="brand" to="/" aria-label="ResearchFlow 首页">
          <span className="brand-mark"><FlaskConical size={20} /></span>
          <span>Research<span>Flow</span></span>
        </Link>
        <div className="header-note">中文深度研究 Agent</div>
        <nav className="header-actions" aria-label="页面导航">
          <button
            type="button"
            className="header-nav-button theme-toggle"
            onClick={() => {
              const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark'
              setTheme(nextTheme)
              try {
                localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
              } catch {
                // 存储不可用时仅保留当前会话状态
              }
            }}
            aria-label={theme === 'dark' ? '切换到日间模式' : '切换到夜间模式'}
            aria-pressed={theme === 'light'}
            title={theme === 'dark' ? '切换到日间模式' : '切换到夜间模式'}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
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
      <main className="site-main">{children}</main>
      <footer>ResearchFlow · 研究结果由 AI 生成，请核验关键事实与来源</footer>
    </div>
  )
}
