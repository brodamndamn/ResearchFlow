import {
  ArrowRight,
  CircleCheck,
  Clock3,
  Compass,
  Gauge,
  SearchCheck,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  ApiError,
  createResearch,
  getResearch,
  getShowcases,
} from '../lib/api'
import {
  readRecentResearch,
  removeRecentResearch,
  saveRecentResearch,
  updateRecentResearchMode,
} from '../lib/recent'
import type { ResearchMode, Showcase } from '../lib/types'

const MIN_TOPIC = 10
const MAX_TOPIC = 300
const RECENT_MODE_TIMEOUT_MS = 5_000
const RECENT_MODE_RETRY_DELAY_MS = 150
const recentModeRequests = new Map<string, Promise<ResearchMode>>()

function timeoutAfter<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      onTimeout()
      reject(new Error('读取研究模式超时'))
    }, timeoutMs)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function retryable(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status === 429 || error.status >= 500
}

async function requestRecentMode(id: string): Promise<ResearchMode> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const controller = new AbortController()
      const snapshot = await timeoutAfter(
        getResearch(id, undefined, controller.signal),
        RECENT_MODE_TIMEOUT_MS,
        () => controller.abort(),
      )
      return snapshot.mode
    } catch (error) {
      if (attempt === 1 || !retryable(error)) throw error
      await new Promise((resolve) => window.setTimeout(resolve, RECENT_MODE_RETRY_DELAY_MS))
    }
  }
  throw new Error('无法读取研究模式')
}

function getRecentMode(id: string): Promise<ResearchMode> {
  const existing = recentModeRequests.get(id)
  if (existing) return existing

  const request = requestRecentMode(id).finally(() => {
    if (recentModeRequests.get(id) === request) recentModeRequests.delete(id)
  })
  recentModeRequests.set(id, request)
  return request
}

export function HomePage() {
  const navigate = useNavigate()
  const [topic, setTopic] = useState('')
  const [mode, setMode] = useState<ResearchMode>('quick')
  const [showcases, setShowcases] = useState<Showcase[]>([])
  const [showcaseError, setShowcaseError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recent, setRecent] = useState(readRecentResearch)
  const length = topic.trim().length
  const valid = length >= MIN_TOPIC && length <= MAX_TOPIC

  useEffect(() => {
    let active = true
    getShowcases()
      .then((items) => active && setShowcases(items.slice(0, 3)))
      .catch(() => active && setShowcaseError('精选案例暂时无法加载'))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const legacyItems = recent.filter((item) => !item.mode)
    if (legacyItems.length === 0) return

    let active = true
    legacyItems.forEach((item) => {
      void getRecentMode(item.id).then((mode) => {
        if (!active) return
        updateRecentResearchMode(item.id, mode)
        setRecent(readRecentResearch())
      }).catch(() => {
        // 旧任务可能已过期；保留记录但不显示未经确认的模式。
      })
    })
    return () => {
      active = false
    }
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || submitting) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const snapshot = await createResearch({ topic: topic.trim(), mode })
      saveRecentResearch(snapshot)
      navigate(`/run/${snapshot.id}`)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '创建研究失败')
      setSubmitting(false)
    }
  }

  function removeRecent(item: typeof recent[number]) {
    if (!window.confirm('您确定要移除此记录吗？')) return
    removeRecentResearch(item.id)
    setRecent((current) => current.filter((entry) => entry.id !== item.id))
  }

  return (
    <>
      <section className="hero section-wrap">
        <div className="eyebrow"><Sparkles size={15} /> 可观察、可审核、有引用</div>
        <h1>把一个问题，研究成<br /><span>有证据的中文报告</span></h1>
        <p className="hero-copy">
          ResearchFlow 会规划问题、搜索可信来源、整理证据并生成可追溯引用的报告。
          在搜索前，你可以审核并修改研究计划。
        </p>

        <form className="research-form panel" onSubmit={submit}>
          <label htmlFor="topic">研究主题</label>
          <textarea
            id="topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="例如：比较主流大模型在中文事实核查任务中的能力、方法与局限"
            rows={4}
          />
          <div className="input-meta">
            <span className={length > MAX_TOPIC ? 'danger-text' : ''}>
              {length < MIN_TOPIC && length > 0
                ? `还需输入 ${MIN_TOPIC - length} 个字`
                : length > MAX_TOPIC
                  ? `最多输入 ${MAX_TOPIC} 个字`
                  : '请用 10–300 个字描述问题'}
            </span>
            <span>{length}/{MAX_TOPIC}</span>
          </div>

          <fieldset className="mode-grid">
            <legend>研究模式</legend>
            <label className={mode === 'quick' ? 'mode-card selected' : 'mode-card'}>
              <input
                type="radio"
                name="mode"
                value="quick"
                checked={mode === 'quick'}
                onChange={() => setMode('quick')}
              />
              <Gauge size={21} />
              <span><strong>快速研究</strong><small>约 4 个来源 · 适合快速了解</small></span>
            </label>
            <label className={mode === 'deep' ? 'mode-card selected' : 'mode-card'}>
              <input
                type="radio"
                name="mode"
                value="deep"
                checked={mode === 'deep'}
                onChange={() => setMode('deep')}
              />
              <SearchCheck size={21} />
              <span><strong>深度研究</strong><small>6–8 个来源 · 含补充检索与校验</small></span>
            </label>
          </fieldset>
          {submitError && <p className="error-banner" role="alert">{submitError}</p>}
          <button className="primary-button" type="submit" disabled={!valid || submitting}>
            {submitting ? '正在创建…' : '开始研究'} <ArrowRight size={18} />
          </button>
        </form>

        <aside className="research-scope" aria-label="研究范围提示">
          <div className="scope-item scope-suitable">
            <CircleCheck aria-hidden="true" />
            <div><strong>适合研究</strong><span>技术、行业、学习、公开信息</span></div>
          </div>
          <div className="scope-item scope-caution">
            <ShieldAlert aria-hidden="true" />
            <div><strong>谨慎使用</strong><span>医疗、法律、投资仅作资料整理</span></div>
          </div>
        </aside>

        <div className="process-strip" aria-label="研究流程">
          <span><Compass size={17} /> 规划问题</span>
          <span>→</span>
          <span><SearchCheck size={17} /> 搜索证据</span>
          <span>→</span>
          <span><Sparkles size={17} /> 撰写校验</span>
        </div>
      </section>

      <section className="section-wrap section-block home-section">
        <div className="section-heading">
          <div><span className="kicker">精选案例</span><h2>看看 ResearchFlow 能研究什么</h2></div>
          <p>案例报告公开展示，便于你在创建研究前了解结果形式。</p>
        </div>
        {showcaseError ? <p className="error-banner" role="alert">{showcaseError}</p> : null}
        <div className="showcase-grid">
          {showcases.map((item, index) => (
            <Link className="showcase-card" data-testid="showcase-card" key={item.id} to={`/report/${item.runId}`}>
              <span className="case-index">0{index + 1}</span>
              <span className="mode-pill"><ModeIcon mode={item.mode} />{modeText(item.mode)}</span>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
              <span className="text-link">阅读报告 <ArrowRight size={15} /></span>
            </Link>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="section-wrap section-block recent-section home-section">
          <div className="section-heading">
            <div><span className="kicker">仅当前浏览器可见</span><h2>最近研究</h2></div>
          </div>
          <div className="recent-list">
            {recent.map((item) => (
              <div className="recent-card" key={item.id}>
                <Link to={`/run/${item.id}`}>
                <Clock3 size={17} />
                <span className="recent-copy">
                  <strong>{item.topic}</strong>
                  <small className={`recent-status status-${item.status}`}>{statusText(item.status)}</small>
                </span>
                {item.mode ? (
                  <span className={`recent-mode-pill mode-${item.mode}`}>
                    <ModeIcon mode={item.mode} />{modeText(item.mode)}
                  </span>
                ) : null}
                <ArrowRight size={17} />
                </Link>
                <button
                  className="recent-delete-button"
                  type="button"
                  aria-label={`删除最近研究：${item.topic}`}
                  onClick={() => removeRecent(item)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function ModeIcon({ mode }: { mode: ResearchMode }) {
  const Icon = mode === 'deep' ? SearchCheck : Gauge
  return <span className="mode-icon" data-mode-icon={mode} aria-hidden="true"><Icon size={15} /></span>
}

function modeText(mode: ResearchMode) {
  return mode === 'deep' ? '深度研究' : '快速研究'
}

function statusText(status: string) {
  return ({
    queued: '正在排队',
    planning: '正在制定计划',
    waiting_for_review: '等待审核',
    researching: '正在搜索证据',
    writing: '正在撰写报告',
    verifying: '正在校验引用',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
    expired: '已过期',
  } as Record<string, string>)[status] || '研究中'
}
