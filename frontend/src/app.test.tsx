import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from './app'
import type { ResearchSnapshot, Showcase } from './lib/types'

const showcases: Showcase[] = [
  {
    id: 'case-1',
    runId: 'case-run-1',
    title: 'AI 搜索产品格局',
    summary: '比较主流 AI 搜索产品的能力与差异。',
    mode: 'deep',
  },
  {
    id: 'case-2',
    runId: 'case-run-2',
    title: '低空经济机会',
    summary: '梳理产业链与政策机会。',
    mode: 'deep',
  },
  {
    id: 'case-3',
    runId: 'case-run-3',
    title: '开源模型趋势',
    summary: '分析开源模型的技术与生态趋势。',
    mode: 'quick',
  },
]

const waitingSnapshot: ResearchSnapshot = {
  id: 'research-1',
  topic: '比较主流大模型的中文研究能力',
  mode: 'deep',
  status: 'waiting_for_review',
  focus: '中文事实核查能力',
  subqueries: ['准确率如何？', '来源质量如何？'],
  events: [
    {
      phase: 'planning',
      message: '研究计划已生成',
      timestamp: '2026-08-20T08:01:00Z',
      status: 'completed',
    },
  ],
  createdAt: '2026-08-20T08:00:00Z',
  updatedAt: '2026-08-20T08:01:00Z',
}

const completedSnapshot: ResearchSnapshot = {
  ...waitingSnapshot,
  status: 'completed',
  events: [
    ...waitingSnapshot.events,
    {
      phase: 'completed',
      message: '中文研究报告已完成',
      timestamp: '2026-08-20T08:03:00Z',
      status: 'completed',
    },
  ],
  report: {
    title: '主流大模型中文研究能力比较',
    markdown:
      '## 核心结论\n\n中文事实核查仍需高质量来源支持。[1]\n\n[可信链接](https://example.com) [恶意链接](javascript:alert(1))\n\n<img src=x onerror="alert(1)">',
    sources: [
      {
        id: 1,
        title: '模型评测方法说明',
        url: 'https://example.com/evaluation',
        domain: 'example.com',
        snippet: '介绍事实核查评测方法。',
      },
      {
        id: 2,
        title: '恶意来源',
        url: 'javascript:alert(1)',
        domain: '不可信域名',
      },
    ],
    sourceCount: 2,
    citationCount: 1,
    durationSeconds: 73,
    completedAt: '2026-08-20T08:03:00Z',
  },
}

describe('ResearchFlow 路由', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('EventSource', SilentEventSource)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('首页要求 10–300 字主题并提供三个精选案例', async () => {
    vi.stubGlobal('fetch', createFetchRouter({ showcases }))
    const user = userEvent.setup()
    renderApp('/')

    expect(await screen.findByText('AI 搜索产品格局')).toBeInTheDocument()
    expect(screen.getAllByTestId('showcase-card')).toHaveLength(3)

    const topic = screen.getByLabelText('研究主题')
    await user.type(topic, '太短')
    expect(screen.getByRole('button', { name: '开始研究' })).toBeDisabled()
    expect(screen.getByText('还需输入 8 个字')).toBeInTheDocument()

    fireEvent.change(topic, { target: { value: '研'.repeat(301) } })
    expect(screen.getByText('最多输入 300 个字')).toBeInTheDocument()
  })

  it('创建深度研究后保存最近记录并进入工作台', async () => {
    const fetcher = createFetchRouter({
      showcases,
      snapshots: { 'research-1': waitingSnapshot },
    })
    vi.stubGlobal('fetch', fetcher)
    const user = userEvent.setup()
    renderApp('/')

    await user.type(
      screen.getByLabelText('研究主题'),
      '比较主流大模型的中文研究能力',
    )
    await user.click(screen.getByRole('radio', { name: /深度研究/ }))
    await user.click(screen.getByRole('button', { name: '开始研究' }))

    expect(await screen.findByText('审核研究计划')).toBeInTheDocument()
    const createCall = fetcher.mock.calls.find(([path]) => path === '/research/api/research')
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      topic: '比较主流大模型的中文研究能力',
      mode: 'deep',
    })
    expect(JSON.parse(localStorage.getItem('researchflow:recent') || '[]')).toEqual([
      expect.objectContaining({ id: 'research-1', mode: 'deep' }),
    ])
  })

  it('最近研究显示模式，并自动补全旧记录缺失的模式', async () => {
    localStorage.setItem(
      'researchflow:recent',
      JSON.stringify([
        {
          id: 'research-1',
          topic: '浏览器里保存的研究主题',
          status: 'waiting_for_review',
          updatedAt: '2026-08-20T08:01:00Z',
        },
        {
          id: 'research-2',
          topic: '快速了解的新研究主题',
          mode: 'quick',
          status: 'completed',
          updatedAt: '2026-08-20T08:02:00Z',
        },
      ]),
    )
    vi.stubGlobal(
      'fetch',
      createFetchRouter({ showcases, snapshots: { 'research-1': waitingSnapshot } }),
    )
    renderApp('/')

    const recentSection = screen
      .getByRole('heading', { name: '最近研究' })
      .closest('section')
    expect(recentSection).not.toBeNull()
    expect(screen.getByText('浏览器里保存的研究主题')).toBeInTheDocument()
    expect(within(recentSection!).getByText('快速研究')).toBeInTheDocument()
    expect(await within(recentSection!).findByText('深度研究')).toBeInTheDocument()
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('researchflow:recent') || '[]')
      expect(saved).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'research-1', mode: 'deep' }),
        ]),
      )
    })
  })

  it('某条旧记录请求挂起时，其他模式仍能独立补全', async () => {
    localStorage.setItem(
      'researchflow:recent',
      JSON.stringify([
        {
          id: 'research-hanging',
          topic: '暂时无法响应的研究',
          status: 'planning',
          updatedAt: '2026-08-20T08:00:00Z',
        },
        {
          id: 'research-1',
          topic: '可以正常补全的研究',
          status: 'waiting_for_review',
          updatedAt: '2026-08-20T08:01:00Z',
        },
      ]),
    )
    const router = createFetchRouter({
      showcases,
      snapshots: { 'research-1': waitingSnapshot },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        String(input).endsWith('/research-hanging')
          ? new Promise<Response>(() => undefined)
          : router(input, init),
      ),
    )

    renderApp('/')

    const recentSection = screen
      .getByRole('heading', { name: '最近研究' })
      .closest('section')
    expect(await within(recentSection!).findByText('深度研究')).toBeInTheDocument()
  })

  it('旧记录模式请求临时失败时会重试一次', async () => {
    localStorage.setItem(
      'researchflow:recent',
      JSON.stringify([
        {
          id: 'research-1',
          topic: '需要重试的研究',
          status: 'waiting_for_review',
          updatedAt: '2026-08-20T08:01:00Z',
        },
      ]),
    )
    let researchRequests = 0
    const router = createFetchRouter({ showcases, snapshots: { 'research-1': waitingSnapshot } })
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/research-1')) {
        researchRequests += 1
        if (researchRequests === 1) return Promise.resolve(json({ detail: '暂时失败' }, 503))
      }
      return router(input, init)
    })
    vi.stubGlobal('fetch', fetcher)

    renderApp('/')

    const recentSection = screen
      .getByRole('heading', { name: '最近研究' })
      .closest('section')
    expect(await within(recentSection!).findByText('深度研究')).toBeInTheDocument()
    expect(researchRequests).toBe(2)
  })

  it('StrictMode 下同一条旧记录只发起一次成功请求', async () => {
    localStorage.setItem(
      'researchflow:recent',
      JSON.stringify([
        {
          id: 'research-1',
          topic: '开发模式去重研究',
          status: 'waiting_for_review',
          updatedAt: '2026-08-20T08:01:00Z',
        },
      ]),
    )
    const fetcher = createFetchRouter({
      showcases,
      snapshots: { 'research-1': waitingSnapshot },
    })
    vi.stubGlobal('fetch', fetcher)

    renderStrictApp('/')

    const recentSection = screen
      .getByRole('heading', { name: '最近研究' })
      .closest('section')
    expect(await within(recentSection!).findByText('深度研究')).toBeInTheDocument()
    expect(
      fetcher.mock.calls.filter(([path]) => String(path).endsWith('/research-1')),
    ).toHaveLength(1)
  })

  it('站内进入工作台后可以真实返回上一页，主页链接与 Logo 保留 basename', async () => {
    localStorage.setItem(
      'researchflow:recent',
      JSON.stringify([
        {
          id: 'research-1',
          topic: '浏览器历史导航测试',
          status: 'waiting_for_review',
          updatedAt: '2026-08-20T08:01:00Z',
        },
      ]),
    )
    vi.stubGlobal(
      'fetch',
      createFetchRouter({
        showcases,
        snapshots: { 'research-1': waitingSnapshot },
      }),
    )
    const user = userEvent.setup()
    renderBrowserApp('/research/')

    await user.click(await screen.findByText('浏览器历史导航测试'))

    expect(await screen.findByText('审核研究计划')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/research/run/research-1')
    expect(screen.getByRole('link', { name: '返回主页' })).toHaveAttribute(
      'href',
      '/research',
    )
    expect(screen.getByRole('link', { name: 'ResearchFlow 首页' })).toHaveAttribute(
      'href',
      '/research',
    )

    await user.click(screen.getByRole('button', { name: '返回上一页' }))

    expect(
      await screen.findByRole('heading', { name: /把一个问题，研究成/ }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/research/')
    expect(screen.queryByRole('button', { name: '返回上一页' })).toBeNull()

    await user.click(
      await screen.findByRole('link', {
        name: new RegExp(waitingSnapshot.topic),
      }),
    )
    expect(await screen.findByText('审核研究计划')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'ResearchFlow 首页' }))
    expect(
      await screen.findByRole('heading', { name: /把一个问题，研究成/ }),
    ).toBeInTheDocument()
  })

  it('直接打开工作台时返回按钮安全回到站内主页', async () => {
    vi.stubGlobal(
      'fetch',
      createFetchRouter({
        showcases,
        snapshots: { 'research-1': waitingSnapshot },
      }),
    )
    const user = userEvent.setup()
    renderBrowserApp('/research/run/research-1')

    expect(await screen.findByText('审核研究计划')).toBeInTheDocument()
    expect(window.history.state.idx).toBe(0)
    await user.click(screen.getByRole('button', { name: '返回上一页' }))

    expect(
      await screen.findByRole('heading', { name: /把一个问题，研究成/ }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/research')
  })

  it('待审核工作台允许编辑计划、确认并取消', async () => {
    const fetcher = createFetchRouter({
      snapshots: { 'research-1': waitingSnapshot },
    })
    vi.stubGlobal('fetch', fetcher)
    const user = userEvent.setup()
    renderApp('/run/research-1')

    await user.clear(await screen.findByLabelText('研究重点'))
    await user.type(screen.getByLabelText('研究重点'), '对中文来源进行交叉验证')
    const secondQuestion = screen.getByLabelText('子问题 2')
    await user.clear(secondQuestion)
    await user.type(secondQuestion, '结论是否可复现？')
    await user.click(screen.getByRole('button', { name: '确认并继续' }))

    const planCall = fetcher.mock.calls.find(
      ([path, init]) =>
        path === '/research/api/research/research-1/plan' && init?.method === 'PUT',
    )
    expect(JSON.parse(String(planCall?.[1]?.body))).toEqual({
      focus: '对中文来源进行交叉验证',
      subqueries: ['准确率如何？', '结论是否可复现？'],
    })

    await user.click(screen.getByRole('button', { name: '取消研究' }))
    expect(fetcher).toHaveBeenCalledWith('/research/api/research/research-1/cancel', {
      method: 'POST',
    })
  })

  it('失败状态展示后端错误且不伪装为进行中', async () => {
    vi.stubGlobal(
      'fetch',
      createFetchRouter({
        snapshots: {
          'research-1': {
            ...waitingSnapshot,
            status: 'failed',
            error: '搜索服务暂时不可用',
          },
        },
      }),
    )
    renderApp('/run/research-1')

    expect(await screen.findByRole('alert')).toHaveTextContent('搜索服务暂时不可用')
    expect(screen.getByRole('heading', { name: '研究失败' })).toBeInTheDocument()
  })

  it('报告渲染目录、来源与指标，但不执行 Markdown 原始 HTML', async () => {
    vi.stubGlobal(
      'fetch',
      createFetchRouter({ snapshots: { 'research-1': completedSnapshot } }),
    )
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    renderApp('/report/research-1')

    expect(
      await screen.findByRole('heading', { name: '主流大模型中文研究能力比较' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '报告目录' })).toHaveTextContent(
      '核心结论',
    )
    expect(screen.getByText('2 个来源')).toBeInTheDocument()
    expect(screen.getByText('1 处引用')).toBeInTheDocument()
    expect(screen.getByText('73 秒')).toBeInTheDocument()
    expect(screen.getByText('[1]')).toBeInTheDocument()
    expect(screen.getByText('[2]')).toBeInTheDocument()
    expect(within(screen.getByTestId('markdown-report')).queryByRole('img')).toBeNull()
    expect(screen.getByRole('link', { name: '可信链接' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
    expect(screen.getByText('恶意链接').closest('a')).toBeNull()
    expect(screen.getByRole('link', { name: '模型评测方法说明' })).toHaveAttribute(
      'href',
      'https://example.com/evaluation',
    )
    expect(screen.getByText('恶意来源').closest('a')).toBeNull()

    await user.click(screen.getByRole('button', { name: '复制报告链接' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/research/report/research-1'))
  })
})

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

function renderBrowserApp(path: string) {
  window.history.replaceState({ idx: 0 }, '', path)
  return render(
    <BrowserRouter basename="/research">
      <AppRoutes />
    </BrowserRouter>,
  )
}

function renderStrictApp(path: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </StrictMode>,
  )
}

class SilentEventSource {
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: (() => void) | null = null
  close() {}
}

interface FetchFixtures {
  showcases?: Showcase[]
  snapshots?: Record<string, ResearchSnapshot>
}

function createFetchRouter(fixtures: FetchFixtures) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    if (path === '/research/api/showcases') return json(fixtures.showcases ?? [])
    if (path === '/research/api/research' && init?.method === 'POST') {
      return json(fixtures.snapshots?.['research-1'] ?? waitingSnapshot, 201)
    }
    if (path.endsWith('/plan') && init?.method === 'PUT') {
      return json({ ...waitingSnapshot, status: 'researching' })
    }
    if (path.endsWith('/cancel') && init?.method === 'POST') {
      return json({ ...waitingSnapshot, status: 'cancelled' })
    }
    const match = path.match(/^\/research\/api\/research\/([^/]+)$/)
    if (match) {
      const snapshot = fixtures.snapshots?.[match[1]]
      if (snapshot) return json(snapshot)
    }
    return json({ detail: '未找到' }, 404)
  })
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
