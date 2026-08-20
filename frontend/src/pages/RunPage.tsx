import { AlertTriangle, Check, Circle, FileText, LoaderCircle, Plus, X } from 'lucide-react'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { cancelResearch, getResearch, subscribeToResearch, updateResearchPlan } from '../lib/api'
import { saveRecentResearch } from '../lib/recent'
import type { ResearchSnapshot, ResearchStatus } from '../lib/types'

const labels: Record<ResearchStatus, string> = {
  queued: '排队中',
  planning: '正在制定计划',
  waiting_for_review: '等待审核',
  researching: '正在搜索与整理证据',
  writing: '正在撰写报告',
  verifying: '正在校验引用',
  completed: '研究完成',
  failed: '研究失败',
  cancelled: '研究已取消',
  expired: '研究已过期',
}

export function RunPage() {
  const { id = '' } = useParams()
  const [snapshot, setSnapshot] = useState<ResearchSnapshot>()
  const [focus, setFocus] = useState('')
  const [subqueries, setSubqueries] = useState<string[]>([])
  const [pageError, setPageError] = useState('')
  const [saving, setSaving] = useState(false)
  const initializedPlanId = useRef('')

  useEffect(() => {
    let active = true
    const accept = (next: ResearchSnapshot) => {
      if (!active) return
      setSnapshot(next)
      saveRecentResearch(next)
      if (next.status === 'waiting_for_review' && initializedPlanId.current !== next.id) {
        initializedPlanId.current = next.id
        setFocus(next.focus)
        setSubqueries(next.subqueries)
      }
    }
    getResearch(id)
      .then(accept)
      .catch((error) => active && setPageError(error instanceof Error ? error.message : '研究加载失败'))
    const unsubscribe = subscribeToResearch(id, {
      onSnapshot: accept,
      onError: (error) => active && setPageError(error.message),
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [id])

  async function confirmPlan(event: FormEvent) {
    event.preventDefault()
    const cleanQuestions = subqueries.map((item) => item.trim()).filter(Boolean)
    if (!focus.trim() || cleanQuestions.length === 0) return
    setSaving(true)
    setPageError('')
    try {
      const next = await updateResearchPlan(id, { focus: focus.trim(), subqueries: cleanQuestions })
      setSnapshot(next)
      saveRecentResearch(next)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : '确认计划失败')
    } finally {
      setSaving(false)
    }
  }

  async function cancel() {
    setPageError('')
    try {
      const next = await cancelResearch(id)
      setSnapshot(next)
      saveRecentResearch(next)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : '取消研究失败')
    }
  }

  if (!snapshot && !pageError) return <PageState text="正在加载研究…" />
  if (!snapshot) return <PageState text={pageError} danger />

  const terminal = ['completed', 'failed', 'cancelled', 'expired'].includes(snapshot.status)

  return (
    <section className="section-wrap workspace-page">
      <div className="workspace-header">
        <div>
          <span className={`status-badge status-${snapshot.status}`}>{labels[snapshot.status]}</span>
          <h1>{snapshot.topic}</h1>
          <p>{snapshot.mode === 'deep' ? '深度研究' : '快速研究'} · 任务 {snapshot.id}</p>
        </div>
        {!terminal && <button className="ghost-button danger-button" onClick={cancel}>取消研究</button>}
      </div>

      {pageError && <p className="error-banner" role="alert">{pageError}</p>}
      {snapshot.status === 'failed' && (
        <div className="terminal-card danger-card">
          <AlertTriangle size={25} /><div><h2>研究失败</h2><p role="alert">{snapshot.error || '研究执行失败，请稍后重试'}</p></div>
        </div>
      )}
      {snapshot.status === 'cancelled' && (
        <div className="terminal-card"><X size={25} /><div><h2>研究已取消</h2><p>任务已停止，不会继续消耗研究额度。</p></div></div>
      )}
      {snapshot.status === 'expired' && (
        <div className="terminal-card"><X size={25} /><div><h2>研究已过期</h2><p>匿名研究报告仅保留 7 天，请返回首页创建新的研究。</p></div></div>
      )}
      {snapshot.status === 'completed' && (
        <div className="terminal-card success-card">
          <FileText size={25} /><div><h2>中文研究报告已生成</h2><p>报告包含引用来源、研究指标和完整结论。</p></div>
          <Link className="primary-button compact-button" to={`/report/${id}`}>查看报告</Link>
        </div>
      )}

      <div className="workspace-grid">
        <aside className="timeline-panel panel">
          <span className="kicker">实时进度</span>
          <h2>研究时间线</h2>
          <div className="timeline">
            {snapshot.events.length === 0 ? <p className="muted">等待第一个进度事件…</p> : null}
            {snapshot.events.map((event, index) => (
              <div className="timeline-item" key={`${event.timestamp}-${index}`}>
                <span className="timeline-dot">
                  {event.status === 'completed' ? <Check size={13} /> : event.status === 'failed' ? <X size={13} /> : <LoaderCircle size={13} />}
                </span>
                <div><strong>{event.message}</strong><time>{formatTime(event.timestamp)}</time></div>
              </div>
            ))}
            {!terminal && snapshot.status !== 'waiting_for_review' && (
              <div className="timeline-item active"><span className="timeline-dot"><LoaderCircle size={13} /></span><div><strong>{labels[snapshot.status]}</strong><time>进度会自动更新</time></div></div>
            )}
          </div>
        </aside>

        <div className="workspace-main">
          {snapshot.status === 'waiting_for_review' ? (
            <form className="review-card panel" onSubmit={confirmPlan}>
              <div className="review-title"><span className="review-icon"><Circle size={19} /></span><div><span className="kicker">需要你的确认</span><h2>审核研究计划</h2></div></div>
              <p>搜索尚未开始。你可以调整重点和子问题，确认后任务会自动继续。</p>
              <label htmlFor="focus">研究重点</label>
              <textarea id="focus" rows={3} value={focus} onChange={(event) => setFocus(event.target.value)} />
              <fieldset className="subquery-list">
                <legend>子问题</legend>
                {subqueries.map((query, index) => (
                  <div className="subquery-row" key={index}>
                    <span>{index + 1}</span>
                    <input aria-label={`子问题 ${index + 1}`} value={query} onChange={(event) => setSubqueries((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />
                    {subqueries.length > 1 && <button type="button" aria-label={`删除子问题 ${index + 1}`} onClick={() => setSubqueries((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X size={16} /></button>}
                  </div>
                ))}
              </fieldset>
              <button className="text-button" type="button" onClick={() => setSubqueries((items) => [...items, ''])}><Plus size={16} /> 添加子问题</button>
              <button className="primary-button" type="submit" disabled={saving || !focus.trim() || subqueries.every((item) => !item.trim())}>{saving ? '正在确认…' : '确认并继续'}</button>
            </form>
          ) : !terminal ? (
            <div className="panel progress-card">
              <span className="pulse-ring"><LoaderCircle size={30} /></span>
              <h2>{labels[snapshot.status]}</h2>
              <p>{terminal ? '本次任务已经结束。' : '你可以停留在此页面观察进度，也可以稍后从首页的最近研究返回。'}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function PageState({ text, danger = false }: { text: string; danger?: boolean }) {
  return <section className="section-wrap page-state"><p className={danger ? 'error-banner' : ''} role={danger ? 'alert' : undefined}>{text}</p></section>
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
