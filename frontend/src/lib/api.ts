import type {
  CreateResearchInput,
  ReportSource,
  ResearchEvent,
  ResearchSnapshot,
  Showcase,
  UpdatePlanInput,
} from './types'

type Fetcher = typeof fetch
const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`

function apiPath(path: string): string {
  return `${API_BASE}/${path}`
}

interface EventSourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null
  onerror: ((event: Event) => void) | null
  addEventListener?: (
    type: string,
    listener: (event: MessageEvent<string>) => void,
  ) => void
  close(): void
}

type EventSourceFactory = (url: string) => EventSourceLike

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  fetcher: Fetcher = fetch,
): Promise<T> {
  const response = await fetcher(path, init)
  if (!response.ok) {
    let message = `请求失败（${response.status}）`
    try {
      const body = (await response.json()) as { detail?: string }
      message = body.detail || message
    } catch {
      // 非 JSON 错误响应使用稳定的中文兜底说明。
    }
    throw new ApiError(response.status, message)
  }
  return (await response.json()) as T
}

export function createResearch(
  input: CreateResearchInput,
  fetcher?: Fetcher,
): Promise<ResearchSnapshot> {
  return request<unknown>(
    apiPath('research'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    fetcher,
  ).then(normalizeSnapshot)
}

export function getResearch(
  id: string,
  fetcher?: Fetcher,
  signal?: AbortSignal,
): Promise<ResearchSnapshot> {
  return request<unknown>(
    apiPath(`research/${encodeURIComponent(id)}`),
    signal ? { signal } : undefined,
    fetcher,
  ).then(normalizeSnapshot)
}

export function updateResearchPlan(
  id: string,
  input: UpdatePlanInput,
  fetcher?: Fetcher,
): Promise<ResearchSnapshot> {
  return request<unknown>(
    apiPath(`research/${encodeURIComponent(id)}/plan`),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    fetcher,
  ).then(normalizeSnapshot)
}

export function cancelResearch(
  id: string,
  fetcher?: Fetcher,
): Promise<ResearchSnapshot> {
  return request<unknown>(
    apiPath(`research/${encodeURIComponent(id)}/cancel`),
    { method: 'POST' },
    fetcher,
  ).then(normalizeSnapshot)
}

export function getShowcases(fetcher?: Fetcher): Promise<Showcase[]> {
  return request<unknown>(apiPath('showcases'), undefined, fetcher).then((value) => {
    const items = Array.isArray(value) ? value : []
    return items.map((item): Showcase => {
      const raw = asRecord(item)
      return {
        id: asString(raw.id),
        runId: asString(raw.runId ?? raw.run_id),
        title: asString(raw.title),
        summary: asString(raw.summary),
        mode: raw.mode === 'deep' ? 'deep' : 'quick',
      }
    })
  })
}

interface SubscriptionOptions {
  onSnapshot: (snapshot: ResearchSnapshot) => void
  onError: (error: Error) => void
  fetcher?: Fetcher
  eventSourceFactory?: EventSourceFactory
  retryDelayMs?: number
}

export function subscribeToResearch(
  id: string,
  options: SubscriptionOptions,
): () => void {
  const createSource: EventSourceFactory =
    options.eventSourceFactory ?? ((url: string) => new EventSource(url))
  const encodedId = encodeURIComponent(id)
  let stopped = false
  let source: EventSourceLike | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  const connect = () => {
    if (stopped) return
    const nextSource = createSource(apiPath(`research/${encodedId}/events`))
    source = nextSource
    const handleSnapshot = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as unknown
        const record = asRecord(payload)
        const rawSnapshot = record.snapshot ?? record.data ?? payload
        options.onSnapshot(normalizeSnapshot(rawSnapshot))
      } catch {
        options.onError(new Error('收到无法解析的研究进度'))
      }
    }
    nextSource.onmessage = handleSnapshot
    nextSource.addEventListener?.('snapshot', handleSnapshot)
    nextSource.onerror = () => {
      nextSource.close()
      void recover()
    }
  }

  const recover = async () => {
    try {
      const snapshot = await getResearch(id, options.fetcher)
      if (stopped) return
      options.onSnapshot(snapshot)
      retryTimer = setTimeout(connect, options.retryDelayMs ?? 1_000)
    } catch (error) {
      if (stopped) return
      options.onError(
        error instanceof Error ? error : new Error('恢复研究进度失败'),
      )
      retryTimer = setTimeout(connect, options.retryDelayMs ?? 1_000)
    }
  }

  connect()
  return () => {
    stopped = true
    if (retryTimer) clearTimeout(retryTimer)
    source?.close()
  }
}

function normalizeSnapshot(value: unknown): ResearchSnapshot {
  const raw = asRecord(value)
  const plan = asRecord(raw.plan)
  const rawSources = Array.isArray(raw.sources) ? raw.sources : []
  const sources = rawSources.map((source) => normalizeSource(source))
  const updatedAt = asString(raw.updatedAt ?? raw.updated_at)
  const report = raw.report
    ? normalizeReport(raw.report, sources, raw.metrics, updatedAt)
    : undefined

  return {
    id: asString(raw.id ?? raw.run_id),
    topic: asString(raw.topic ?? raw.query),
    mode: raw.mode === 'deep' ? 'deep' : 'quick',
    status: asStatus(raw.status),
    focus: asString(raw.focus ?? plan.focus),
    subqueries: asStringArray(raw.subqueries ?? plan.subqueries),
    events: Array.isArray(raw.events)
      ? raw.events.map((event) => normalizeEvent(event))
      : [],
    createdAt: asString(raw.createdAt ?? raw.created_at),
    updatedAt,
    error: raw.error ? asString(raw.error) : undefined,
    report,
  }
}

function normalizeReport(
  value: unknown,
  allSources: ReportSource[],
  metricsValue: unknown,
  completedAt: string,
) {
  const raw = asRecord(value)
  const metrics = asRecord(metricsValue)
  const embeddedSources = Array.isArray(raw.sources)
    ? raw.sources.map((source) => normalizeSource(source))
    : allSources
  const sourceIds = new Set(asStringArray(raw.source_ids ?? raw.sourceIds))
  const sources = sourceIds.size
    ? embeddedSources.filter((source) => sourceIds.has(String(source.id)))
    : embeddedSources
  return {
    title: asString(raw.title),
    markdown: asString(raw.markdown),
    sources,
    sourceCount: asNumber(
      metrics.source_count ?? metrics.sourceCount ?? raw.sourceCount,
      sources.length,
    ),
    citationCount: asNumber(
      metrics.citation_count ?? metrics.citationCount ?? raw.citationCount,
      sourceIds.size,
    ),
    durationSeconds: asNumber(
      metrics.duration_seconds ?? metrics.durationSeconds ?? raw.durationSeconds,
      0,
    ),
    completedAt: asString(
      metrics.completed_at ?? metrics.completedAt ?? raw.completedAt ?? completedAt,
    ),
  }
}

function normalizeSource(value: unknown): ReportSource {
  const raw = asRecord(value)
  const url = asString(raw.url)
  let domain = asString(raw.domain)
  if (!domain) {
    try {
      domain = new URL(url).hostname
    } catch {
      domain = '未知来源'
    }
  }
  return {
    id: typeof raw.id === 'number' ? raw.id : asString(raw.id),
    title: asString(raw.title),
    url,
    domain,
    publishedAt: raw.published_at
      ? asString(raw.published_at)
      : raw.publishedAt
        ? asString(raw.publishedAt)
        : undefined,
    snippet: raw.snippet ? asString(raw.snippet) : undefined,
  }
}

function normalizeEvent(value: unknown): ResearchEvent {
  const raw = asRecord(value)
  const status = raw.status
  return {
    phase: asString(raw.phase ?? raw.type),
    message: asString(raw.message),
    timestamp: asString(raw.timestamp),
    status:
      status === 'pending' ||
      status === 'active' ||
      status === 'completed' ||
      status === 'failed'
        ? status
        : undefined,
  }
}

function asStatus(value: unknown): ResearchSnapshot['status'] {
  const allowed: ResearchSnapshot['status'][] = [
    'queued',
    'planning',
    'waiting_for_review',
    'researching',
    'writing',
    'verifying',
    'completed',
    'failed',
    'cancelled',
    'expired',
  ]
  return allowed.includes(value as ResearchSnapshot['status'])
    ? (value as ResearchSnapshot['status'])
    : 'queued'
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asString) : []
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
