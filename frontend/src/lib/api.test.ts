import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ApiError,
  createResearch,
  getResearch,
  getShowcases,
  subscribeToResearch,
} from './api'
import type { ResearchSnapshot } from './types'

const waitingSnapshot: ResearchSnapshot = {
  id: 'research-1',
  topic: '比较主流大模型的中文研究能力',
  mode: 'deep',
  status: 'waiting_for_review',
  focus: '中文事实核查能力',
  subqueries: ['准确率如何？', '来源质量如何？'],
  events: [],
  createdAt: '2026-08-20T08:00:00Z',
  updatedAt: '2026-08-20T08:01:00Z',
}

describe('API 客户端', () => {
  afterEach(() => vi.restoreAllMocks())

  it('创建研究时发送后端契约需要的主题和模式', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(waitingSnapshot), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await createResearch(
      { topic: waitingSnapshot.topic, mode: 'deep' },
      fetcher,
    )

    expect(result).toEqual(waitingSnapshot)
    expect(fetcher).toHaveBeenCalledWith('/research/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: waitingSnapshot.topic, mode: 'deep' }),
    })
  })

  it('保留后端错误状态和中文说明', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: '今日深度研究额度已用完' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(
      createResearch({ topic: waitingSnapshot.topic, mode: 'deep' }, fetcher),
    ).rejects.toEqual(
      expect.objectContaining<ApiError>({
        name: 'ApiError',
        status: 429,
        message: '今日深度研究额度已用完',
      }),
    )
  })

  it('把后端 snake_case 快照规范化为前端视图模型', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          run_id: 'research-1',
          mode: 'deep',
          status: 'completed',
          query: waitingSnapshot.topic,
          plan: {
            focus: '中文事实核查能力',
            subqueries: ['准确率如何？'],
          },
          sources: [
            {
              id: 'source-1',
              url: 'https://example.com/evaluation',
              title: '模型评测方法说明',
              snippet: '介绍评测方法。',
            },
          ],
          report: {
            title: '中文研究能力报告',
            markdown: '## 结论\n\n证据支持该结论。[1]',
            source_ids: ['source-1'],
          },
          metrics: {
            source_count: 1,
            citation_count: 1,
            duration_seconds: 73,
          },
          created_at: '2026-08-20T08:00:00Z',
          updated_at: '2026-08-20T08:03:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const result = await getResearch('research-1', fetcher)

    expect(result).toEqual(
      expect.objectContaining({
        id: 'research-1',
        topic: waitingSnapshot.topic,
        focus: '中文事实核查能力',
        subqueries: ['准确率如何？'],
        createdAt: '2026-08-20T08:00:00Z',
        updatedAt: '2026-08-20T08:03:00Z',
      }),
    )
    expect(result.report).toEqual(
      expect.objectContaining({
        title: '中文研究能力报告',
        sourceCount: 1,
        citationCount: 1,
        durationSeconds: 73,
        sources: [
          expect.objectContaining({
            id: 'source-1',
            domain: 'example.com',
          }),
        ],
      }),
    )
  })

  it('保留精选案例对应的研究任务 run_id', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 'showcase-1',
            run_id: 'research-1',
            title: 'AI 搜索产品格局',
            summary: '比较产品能力。',
            mode: 'deep',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await expect(getShowcases(fetcher)).resolves.toEqual([
      {
        id: 'showcase-1',
        runId: 'research-1',
        title: 'AI 搜索产品格局',
        summary: '比较产品能力。',
        mode: 'deep',
      },
    ])
  })
})

describe('研究事件订阅', () => {
  it('断线后先读取最新快照，再建立下一次订阅', async () => {
    const sources: FakeEventSource[] = []
    const sourceFactory = (url: string) => {
      const source = new FakeEventSource(url)
      sources.push(source)
      return source
    }
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(waitingSnapshot), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const received: ResearchSnapshot[] = []

    const unsubscribe = subscribeToResearch('research-1', {
      onSnapshot: (snapshot) => received.push(snapshot),
      onError: vi.fn(),
      fetcher,
      eventSourceFactory: sourceFactory,
      retryDelayMs: 0,
    })
    sources[0].emitError()
    await vi.waitFor(() => expect(sources).toHaveLength(2))

    expect(fetcher).toHaveBeenCalledWith('/research/api/research/research-1', undefined)
    expect(received).toEqual([waitingSnapshot])
    expect(sources[0].closed).toBe(true)
    expect(sources[1].url).toBe('/research/api/research/research-1/events')
    unsubscribe()
    expect(sources[1].closed).toBe(true)
  })

  it('把 SSE snapshot 事件解析为真实任务快照', () => {
    const source = new FakeEventSource('/events')
    const received: ResearchSnapshot[] = []

    const unsubscribe = subscribeToResearch('research-1', {
      onSnapshot: (snapshot) => received.push(snapshot),
      onError: vi.fn(),
      eventSourceFactory: () => source,
    })
    source.emitMessage(JSON.stringify(waitingSnapshot))

    expect(received).toEqual([waitingSnapshot])
    unsubscribe()
  })

  it('支持后端使用命名 snapshot SSE 事件', () => {
    const source = new FakeEventSource('/events')
    const received: ResearchSnapshot[] = []

    const unsubscribe = subscribeToResearch('research-1', {
      onSnapshot: (snapshot) => received.push(snapshot),
      onError: vi.fn(),
      eventSourceFactory: () => source,
    })
    source.emitNamedSnapshot(JSON.stringify(waitingSnapshot))

    expect(received).toEqual([waitingSnapshot])
    unsubscribe()
  })
})

class FakeEventSource {
  readonly url: string
  closed = false
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: (() => void) | null = null
  private snapshotListener?: (event: MessageEvent<string>) => void

  constructor(url: string) {
    this.url = url
  }

  close() {
    this.closed = true
  }

  emitMessage(data: string) {
    this.onmessage?.(new MessageEvent('message', { data }))
  }

  emitError() {
    this.onerror?.()
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    if (type === 'snapshot') this.snapshotListener = listener
  }

  emitNamedSnapshot(data: string) {
    this.snapshotListener?.(new MessageEvent('snapshot', { data }))
  }
}
