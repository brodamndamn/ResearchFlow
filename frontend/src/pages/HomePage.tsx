import { ArrowRight, Clock3, Compass, Gauge, SearchCheck, Sparkles } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ApiError, createResearch, getResearch, getShowcases } from '../lib/api'
import {
  readRecentResearch,
  saveRecentResearch,
  updateRecentResearchMode,
} from '../lib/recent'
import type { ResearchMode, Showcase } from '../lib/types'

const MIN_TOPIC = 10
const MAX_TOPIC = 300
const RECENT_MODE_TIMEOUT_MS = 5_000
const RECENT_MODE_RETRY_DELAY_MS = 150
const recentModeRequests = new Map<string, Promise<ResearchMode>>()

function timeoutAfter<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error('读取研究模式超时')),
      timeoutMs,
    )
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
      const snapshot = await timeoutAfter(getResearch(id), RECENT_MODE_TIMEOUT_MS)
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

        <div className="process-strip" aria-label="研究流程">
          <span><Compass size={17} /> 规划问题</span>
          <span>→</span>
          <span><SearchCheck size={17} /> 搜索证据</span>
          <span>→</span>
          <span><Sparkles size={17} /> 撰写校验</span>
        </div>
      </section>

      <section className="section-wrap section-block">
        <div className="section-heading">
          <div><span className="kicker">精选案例</span><h2>看看 ResearchFlow 能研究什么</h2></div>
          <p>案例报告公开展示，便于你在创建研究前了解结果形式。</p>
        </div>
        {showcaseError ? <p className="error-banner" role="alert">{showcaseError}</p> : null}
        <div className="showcase-grid">
          {showcases.map((item, index) => (
            <Link className="showcase-card" data-testid="showcase-card" key={item.id} to={`/report/${item.runId}`}>
              <span className="case-index">0{index + 1}</span>
              <span className="mode-pill">{item.mode === 'deep' ? '深度研究' : '快速研究'}</span>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
              <span className="text-link">阅读报告 <ArrowRight size={15} /></span>
            </Link>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="section-wrap section-block recent-section">
          <div className="section-heading">
            <div><span className="kicker">仅当前浏览器可见</span><h2>最近研究</h2></div>
          </div>
          <div className="recent-list">
            {recent.map((item) => (
              <Link key={item.id} to={`/run/${item.id}`}>
                <Clock3 size={17} />
                <span className="recent-copy">
                  <strong>{item.topic}</strong>
                  <small>{statusText(item.status)}</small>
                </span>
                {item.mode ? (
                  <span className={`recent-mode-pill mode-${item.mode}`}>
                    {item.mode === 'deep' ? '深度研究' : '快速研究'}
                  </span>
                ) : null}
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function statusText(status: string) {
  return ({
    waiting_for_review: '等待审核',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
  } as Record<string, string>)[status] || '研究中'
}
