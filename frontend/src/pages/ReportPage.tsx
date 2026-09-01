import { Check, Clock3, Copy, ExternalLink, Link2, Quote, SearchCheck } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useParams } from 'react-router-dom'
import remarkGfm from 'remark-gfm'

import { EvidencePath } from '../components/EvidencePath'
import { getResearch } from '../lib/api'
import type { ReportSource, ResearchReport } from '../lib/types'

export function ReportPage() {
  const { id = '' } = useParams()
  const [report, setReport] = useState<ResearchReport>()
  const [error, setError] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [highlightedSource, setHighlightedSource] = useState<number | null>(null)
  const highlightTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let active = true
    getResearch(id)
      .then((snapshot) => {
        if (!active) return
        if (snapshot.status !== 'completed' || !snapshot.report) {
          setError('该研究报告尚未生成')
          return
        }
        setReport(snapshot.report)
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : '报告加载失败'))
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => () => window.clearTimeout(highlightTimer.current), [])

  const headings = useMemo(() => extractHeadings(report?.markdown || ''), [report])
  const linkedMarkdown = useMemo(
    () => linkCitations(report?.markdown || '', report?.sources.length || 0),
    [report],
  )

  async function copyLink() {
    const url = new URL(`/research/report/${id}`, window.location.origin).toString()
    try {
      await copyText(url)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    window.setTimeout(() => setCopyState('idle'), 1_800)
  }

  function focusSource(sourceIndex: number) {
    window.clearTimeout(highlightTimer.current)
    setHighlightedSource(sourceIndex)
    window.history.replaceState(null, '', `#source-${sourceIndex}`)
    document.getElementById(`source-${sourceIndex}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    highlightTimer.current = window.setTimeout(() => setHighlightedSource(null), 2_600)
  }

  if (error) return <section className="section-wrap page-state"><p className="error-banner" role="alert">{error}</p></section>
  if (!report) return <section className="section-wrap page-state"><p>正在加载中文报告…</p></section>

  return (
    <section className="section-wrap report-page">
      <header className="report-header report-cover">
        <div className="eyebrow"><Check size={15} /> 研究已完成</div>
        <h1>{report.title}</h1>
        <div className="metric-row">
          <span><SearchCheck size={17} /> {report.sourceCount} 个来源</span>
          <span><Quote size={17} /> {report.citationCount} 处引用</span>
          <span><Clock3 size={17} /> {report.durationSeconds} 秒</span>
        </div>
        <EvidencePath currentStage="report" label="已完成研究证据路径" />
        <button
          className={`ghost-button copy-link-button ${copyState === 'copied' ? 'is-copied' : ''} ${copyState === 'failed' ? 'is-failed' : ''}`}
          onClick={copyLink}
        >
          {copyState === 'copied' ? <Check size={17} /> : <Copy size={17} />}
          {copyState === 'copied' ? '链接已复制' : copyState === 'failed' ? '复制失败，请手动复制' : '复制报告链接'}
        </button>
      </header>

      <div className="report-layout">
        <aside className="report-toc panel">
          <span className="kicker">快速导航</span>
          <nav aria-label="报告目录">
            {headings.map((heading) => <a key={heading.id} className={`toc-level-${heading.level}`} href={`#${heading.id}`}>{heading.text}</a>)}
            <a href="#sources">参考来源</a>
          </nav>
        </aside>

        <article className="report-article">
          <div className="markdown-body" data-testid="markdown-report">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h2: ({ children }) => <h2 id={slugify(String(children))}>{children}</h2>,
                h3: ({ children }) => <h3 id={slugify(String(children))}>{children}</h3>,
                a: ({ children, href }) => {
                  const sourceIndex = citationIndex(href || '')
                  if (sourceIndex) {
                    return <a className="citation-link" href={href} onClick={(event) => { event.preventDefault(); focusSource(sourceIndex) }}>{children}</a>
                  }
                  return safeExternalUrl(href || '') ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span>
                },
              }}
            >
              {linkedMarkdown}
            </ReactMarkdown>
          </div>

          <section className="sources-section" id="sources">
            <div className="section-heading"><div><span className="kicker">证据可追溯</span><h2>参考来源</h2></div></div>
            <div className="source-list">
              {report.sources.map((source, index) => (
                <SourceCard source={source} index={index} highlighted={highlightedSource === index + 1} key={source.id} />
              ))}
            </div>
          </section>
        </article>
      </div>
    </section>
  )
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // HTTP 页面或浏览器权限限制下，继续使用兼容方案。
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none;'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Clipboard copy failed')
}

function SourceCard({ source, index, highlighted }: { source: ReportSource; index: number; highlighted: boolean }) {
  const hasSafeUrl = safeExternalUrl(source.url)
  const content = (
    <>
      <span className="source-number">[{index + 1}]</span>
      <div>
        <div className="source-card-heading">
          <strong className="source-title">{source.title}</strong>
          {hasSafeUrl && <ExternalLink className="source-open-icon" aria-hidden="true" />}
        </div>
        <p>{source.snippet}</p>
        <span><Link2 size={13} /> {source.domain}</span>
      </div>
    </>
  )

  return hasSafeUrl ? (
    <a
      className={`source-card source-card-link ${highlighted ? 'citation-highlight' : ''}`}
      id={`source-${index + 1}`}
      href={source.url}
      target="_blank"
      rel="noreferrer"
      aria-label={source.title}
    >
      {content}
    </a>
  ) : (
    <div className={`source-card ${highlighted ? 'citation-highlight' : ''}`} id={`source-${index + 1}`}>{content}</div>
  )
}

function extractHeadings(markdown: string) {
  return markdown.split('\n').flatMap((line) => {
    const match = /^(##|###)\s+(.+)$/.exec(line.trim())
    return match ? [{ level: match[1].length, text: match[2], id: slugify(match[2]) }] : []
  })
}

function linkCitations(markdown: string, sourceCount: number) {
  let insideCodeBlock = false
  return markdown.split('\n').map((line) => {
    if (line.trimStart().startsWith('```')) insideCodeBlock = !insideCodeBlock
    if (insideCodeBlock) return line
    return line.replace(/\[(\d+)]/g, (citation, value: string) => {
      const sourceIndex = Number(value)
      return sourceIndex >= 1 && sourceIndex <= sourceCount ? `[\\[${sourceIndex}\\]](#source-${sourceIndex})` : citation
    })
  }).join('\n')
}

function citationIndex(href: string) {
  const match = /^#source-(\d+)$/.exec(href)
  return match ? Number(match[1]) : null
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
}

function safeExternalUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
