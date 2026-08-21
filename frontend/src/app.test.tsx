import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from './app'
import type { ResearchSnapshot, Showcase } from './lib/types'
import styles from './styles.css?raw'
import indexHtml from '../index.html?raw'

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
  it('浏览器标签页使用绿色烧杯品牌图标', () => {
    expect(indexHtml).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"\s*\/>/)
  })

  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('EventSource', SilentEventSource)
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('首页在开始研究前说明适合范围与高风险主题边界', async () => {
    vi.stubGlobal('fetch', createFetchRouter({ showcases }))
    renderApp('/')

    expect(await screen.findByText('适合研究')).toBeInTheDocument()
    expect(screen.getByText('技术、行业、学习、公开信息')).toBeInTheDocument()
    expect(screen.getByText('谨慎使用')).toBeInTheDocument()
    expect(screen.getByText('医疗、法律、投资仅作资料整理')).toBeInTheDocument()
  })

  it('精选案例与最近研究的模式标签沿用对应的研究模式图标', async () => {
    localStorage.setItem(
      'researchflow:recent',
      JSON.stringify([
        {
          id: 'recent-quick-mode',
          topic: '用于验证快速研究图标的最近任务',
          status: 'completed',
          mode: 'quick',
          updatedAt: '2026-08-20T08:01:00Z',
        },
        {
          id: 'recent-deep-mode',
          topic: '用于验证深度研究图标的最近任务',
          status: 'completed',
          mode: 'deep',
          updatedAt: '2026-08-20T08:02:00Z',
        },
      ]),
    )
    vi.stubGlobal('fetch', createFetchRouter({ showcases }))
    renderApp('/')

    const showcaseDeep = (await screen.findByText('AI 搜索产品格局')).closest('a')
    const showcaseQuick = screen.getByText('开源模型趋势').closest('a')
    const recentQuick = screen.getByText('用于验证快速研究图标的最近任务').closest('a')
    const recentDeep = screen.getByText('用于验证深度研究图标的最近任务').closest('a')

    expect(showcaseDeep?.querySelector('[data-mode-icon="deep"] .lucide-search-check')).not.toBeNull()
    expect(showcaseQuick?.querySelector('[data-mode-icon="quick"] .lucide-gauge')).not.toBeNull()
    expect(recentQuick?.querySelector('[data-mode-icon="quick"] .lucide-gauge')).not.toBeNull()
    expect(recentDeep?.querySelector('[data-mode-icon="deep"] .lucide-search-check')).not.toBeNull()
  })

  it('首屏承诺徽标与首页标签使用一致的视觉层级', () => {
    vi.stubGlobal('fetch', createFetchRouter({ showcases }))
    renderApp('/')

    expect(screen.getByText('可观察、可审核、有引用')).toHaveClass('eyebrow')
    expect(styles).toMatch(/\.hero \.eyebrow\s*\{[^}]*font-size:\s*16px/)
    expect(styles).toMatch(/\.hero \.eyebrow\s*\{[^}]*gap:\s*8px/)
    expect(styles).toMatch(/\.hero \.eyebrow\s*\{[^}]*padding:\s*8px 14px/)
    expect(styles).toMatch(/\.hero \.eyebrow svg\s*\{[^}]*width:\s*18px[^}]*height:\s*18px/)
    expect(styles).toMatch(/\.hero\s*\{[^}]*padding-top:\s*24px/)

    const tabletStart = styles.indexOf('@media (max-width: 800px)')
    const phoneStart = styles.indexOf('@media (max-width: 520px)')
    const tabletStyles = styles.slice(tabletStart, phoneStart)
    const phoneStyles = styles.slice(phoneStart)
    expect(tabletStyles).toMatch(/\.hero\s*\{[^}]*padding-top:\s*24px/)
    expect(phoneStyles).toMatch(/\.hero\s*\{[^}]*padding-top:\s*24px/)
  })

  it('桌面研究表单与案例区等宽并使用更大的输入控件', () => {
    vi.stubGlobal('fetch', createFetchRouter({ showcases }))
    renderApp('/')

    const textarea = screen.getByLabelText('研究主题')
    const form = textarea.closest('form')
    const quickCard = screen.getByRole('radio', { name: /快速研究/ }).closest('label')
    const submit = screen.getByRole('button', { name: '开始研究' })

    expect(form).not.toBeNull()
    expect(quickCard).not.toBeNull()
    expect(form).toHaveClass('research-form')
    expect(form!.closest('.section-wrap')).not.toBeNull()
    expect(quickCard).toHaveClass('mode-card')
    expect(styles).toMatch(/\.section-wrap\s*\{[^}]*width:\s*min\(1120px,/)
    expect(styles).toMatch(/\.research-form\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none[^}]*padding:\s*32px/)
    expect(styles).toMatch(/\.research-form\s*>\s*textarea\s*\{[^}]*font-size:\s*18px/)
    expect(styles).toMatch(/\.mode-card\s*\{[^}]*min-height:\s*88px/)
    expect(styles).toMatch(/\.research-form\s*>\s*\.primary-button\s*\{[^}]*min-height:\s*52px/)

    const tabletStart = styles.indexOf('@media (max-width: 800px)')
    const phoneStart = styles.indexOf('@media (max-width: 520px)')
    const tabletStyles = styles.slice(tabletStart, phoneStart)
    expect(tabletStart).toBeGreaterThan(-1)
    expect(phoneStart).toBeGreaterThan(tabletStart)
    expect(tabletStyles).toMatch(/\.research-form\s*\{[^}]*padding:\s*24px/)
    expect(tabletStyles).toMatch(/\.research-form\s*>\s*textarea\s*\{[^}]*min-height:\s*160px/)
    expect(tabletStyles).toMatch(/\.mode-card\s*\{[^}]*min-height:\s*78px/)
  })

  it('导航栏在桌面放大品牌与导航操作，并在窄屏保持紧凑', () => {
    vi.stubGlobal('fetch', createFetchRouter({ showcases }))
    renderApp('/')

    expect(screen.getByRole('link', { name: 'ResearchFlow 首页' })).toHaveClass('brand')
    expect(screen.getByRole('link', { name: '返回主页' })).toHaveClass('header-nav-button')
    expect(styles).toMatch(/\.site-header\s*\{[^}]*height:\s*84px/)
    expect(styles).toMatch(/\.brand\s*\{[^}]*font-size:\s*24px/)
    expect(styles).toMatch(/\.brand-mark\s*\{[^}]*width:\s*42px[^}]*height:\s*42px/)
    expect(styles).toMatch(/\.brand-mark svg\s*\{[^}]*width:\s*24px[^}]*height:\s*24px/)
    expect(styles).toMatch(/\.header-note\s*\{[^}]*font-size:\s*16px/)
    expect(styles).toMatch(/\.header-nav-button\s*\{[^}]*min-height:\s*46px[^}]*padding:\s*0 16px[^}]*font-size:\s*16px/)
    expect(styles).toMatch(/\.header-nav-button svg\s*\{[^}]*width:\s*20px[^}]*height:\s*20px/)
    expect(styles).toMatch(/\.app-shell\[data-theme="light"\]\s*\{[\s\S]*?--navy:\s*#eef5f8/)
    expect(styles).toMatch(/\.app-shell\[data-theme="light"\]\s*\{[\s\S]*?--panel:\s*rgba\(255, 255, 255, 0\.88\)/)
    expect(styles).toMatch(/\.theme-toggle\s*\{[^}]*min-width:\s*46px/)

    const tabletStart = styles.indexOf('@media (max-width: 800px)')
    const phoneStart = styles.indexOf('@media (max-width: 520px)')
    const tabletStyles = styles.slice(tabletStart, phoneStart)
    expect(tabletStyles).toMatch(/\.site-header\s*\{[^}]*height:\s*76px/)
    expect(tabletStyles).toMatch(/\.brand\s*\{[^}]*font-size:\s*21px/)
    expect(tabletStyles).toMatch(/\.header-nav-button\s*\{[^}]*min-height:\s*42px[^}]*font-size:\s*14px/)

    const phoneStyles = styles.slice(phoneStart)
    expect(phoneStyles).toMatch(/\.site-header\s*\{[^}]*height:\s*70px/)
    expect(phoneStyles).toMatch(/\.theme-toggle\s*\{[^}]*width:\s*36px/)
    expect(phoneStyles).toMatch(/\.theme-toggle\s*\{[^}]*min-width:\s*36px/)
    expect(styles).toMatch(/\.app-shell\[data-theme="light"\]\s+\.mode-card span\s*,\s*\.app-shell\[data-theme="light"\]\s+\.scope-item strong\s*\{[^}]*color:\s*#183044/)
    expect(styles).toMatch(/\.app-shell\[data-theme="light"\]\s+\.ghost-button\s*\{[^}]*color:\s*#183044/)
    expect(styles).toMatch(/\.app-shell\[data-theme="light"\]\s+\.danger-button\s*\{[^}]*color:\s*#b4232f/)
    expect(styles).toMatch(/\.app-shell\[data-theme="light"\]\s+\.scope-item\s*\{[^}]*background:\s*#f7fcfd/)
    expect(styles).toMatch(/\.app-shell\[data-theme="light"\]\s+\.scope-item p\s*,\s*\.app-shell\[data-theme="light"\]\s+\.scope-item span\s*\{[^}]*color:\s*#35566c/)
    expect(styles).toMatch(/\.app-shell\[data-theme="light"\]\s+\.confirm-dialog\s*\{[^}]*border-color:\s*rgba\(180, 35, 47, 0\.28\)[^}]*background:\s*#fff8f8/)
    expect(styles).toMatch(/\.app-shell\[data-theme="light"\]\s+\.confirm-dialog h2\s*\{[^}]*color:\s*#183044/)
    expect(styles).toMatch(/\.app-shell\[data-theme="light"\]\s+\.confirm-dialog p\s*\{[^}]*color:\s*#35566c/)
    expect(styles).toMatch(/\.app-shell\[data-theme="light"\]\s+\.confirm-dialog-actions \.danger-button\s*\{[^}]*color:\s*#ffffff[^}]*background:\s*#b4232f/)
    expect(styles).toMatch(/\.app-shell\[data-theme="light"\]\s+\.confirm-dialog-actions \.danger-button:hover\s*\{[^}]*background:\s*#8f1b24/)
  })

  it('研究流程在桌面和手机端都保持清晰可读', () => {
    vi.stubGlobal('fetch', createFetchRouter({ showcases }))
    renderApp('/')

    expect(screen.getByLabelText('研究流程')).toHaveClass('process-strip')
    expect(styles).toMatch(/\.process-strip\s*\{[^}]*gap:\s*20px[^}]*font-size:\s*17px/)
    expect(styles).toMatch(/\.process-strip span\s*\{[^}]*gap:\s*8px/)
    expect(styles).toMatch(/\.process-strip span svg\s*\{[^}]*width:\s*21px[^}]*height:\s*21px/)

    const phoneStart = styles.indexOf('@media (max-width: 520px)')
    const phoneStyles = styles.slice(phoneStart)
    expect(phoneStyles).toMatch(/\.process-strip\s*\{[^}]*gap:\s*10px[^}]*font-size:\s*14px/)
    expect(phoneStyles).toMatch(/\.process-strip span svg\s*\{[^}]*width:\s*18px[^}]*height:\s*18px/)
  })

  it('研究范围提示使用更大的卡片与文字，同时保持原有图标尺寸', () => {
    vi.stubGlobal('fetch', createFetchRouter({ showcases }))
    renderApp('/')

    const scope = screen.getByLabelText('研究范围提示')
    expect(scope.querySelector('.scope-suitable')).toHaveTextContent('适合研究')
    expect(scope.querySelector('.scope-caution')).toHaveTextContent('谨慎使用')
    expect(styles).toMatch(/\.scope-item\s*\{[^}]*min-height:\s*92px[^}]*padding:\s*18px 20px/)
    expect(styles).toMatch(/\.scope-item strong\s*\{[^}]*font-size:\s*18px/)
    expect(styles).toMatch(/\.scope-item span\s*\{[^}]*font-size:\s*15px/)
    expect(styles).toMatch(/\.scope-item > svg\s*\{[^}]*width:\s*20px[^}]*height:\s*20px/)
  })

  it('精选案例和最近研究使用与首屏匹配的大尺寸层级', async () => {
    localStorage.setItem(
      'researchflow:recent',
      JSON.stringify([
        {
          id: 'recent-large-layout',
          topic: '用于验证最近研究卡片尺寸的主题',
          status: 'completed',
          mode: 'deep',
          updatedAt: '2026-08-20T08:01:00Z',
        },
      ]),
    )
    vi.stubGlobal('fetch', createFetchRouter({ showcases }))
    renderApp('/')

    const showcaseCard = (await screen.findByText('AI 搜索产品格局')).closest('a')
    const recentCard = screen.getByText('用于验证最近研究卡片尺寸的主题').closest('a')
    expect(showcaseCard).toHaveClass('showcase-card')
    expect(showcaseCard?.closest('.home-section')).not.toBeNull()
    expect(recentCard?.closest('.recent-section.home-section')).not.toBeNull()
    expect(styles).toMatch(/\.section-heading h2\s*\{[^}]*font-size:\s*28px/)
    expect(styles).toMatch(/\.home-section \.section-heading h2\s*\{[^}]*font-size:\s*36px/)
    expect(styles).toMatch(/\.home-section \.section-heading p\s*\{[^}]*font-size:\s*18px/)
    expect(styles).toMatch(/\.showcase-card\s*\{[^}]*min-height:\s*320px[^}]*padding:\s*32px/)
    expect(styles).toMatch(/\.showcase-card h3\s*\{[^}]*font-size:\s*24px/)
    expect(styles).toMatch(/\.showcase-card p\s*\{[^}]*font-size:\s*18px/)
    expect(styles).toMatch(/\.recent-card\s*\{[^}]*min-height:\s*96px[^}]*padding:\s*20px 22px/)
    expect(styles).toMatch(/\.recent-copy strong\s*\{[^}]*font-size:\s*18px/)
    expect(styles).toMatch(/\.home-section \.kicker\s*\{[^}]*font-size:\s*16px/)
    expect(styles).toMatch(/\.showcase-card \.mode-pill\s*\{[^}]*padding:\s*6px 12px[^}]*font-size:\s*14px/)
    expect(styles).toMatch(/\.recent-section \.recent-mode-pill\s*\{[^}]*padding:\s*6px 12px[^}]*font-size:\s*14px/)
    expect(styles).toMatch(/\.home-section\s*\{[^}]*padding-top:\s*64px/)

    const tabletStart = styles.indexOf('@media (max-width: 800px)')
    const phoneStart = styles.indexOf('@media (max-width: 520px)')
    const tabletStyles = styles.slice(tabletStart, phoneStart)
    expect(tabletStyles).toMatch(/\.home-section\s*\{[^}]*padding-top:\s*48px/)
    expect(tabletStyles).toMatch(/\.showcase-card\s*\{[^}]*min-height:\s*280px[^}]*padding:\s*24px/)
    expect(tabletStyles).toMatch(/\.recent-card\s*\{[^}]*min-height:\s*84px[^}]*padding:\s*18px/)

    const phoneStyles = styles.slice(phoneStart)
    expect(phoneStyles).toMatch(/\.home-section \.section-heading h2\s*\{[^}]*font-size:\s*28px/)
    expect(phoneStyles).toMatch(/\.showcase-card\s*\{[^}]*min-height:\s*260px[^}]*padding:\s*22px/)
    expect(phoneStyles).toMatch(/\.recent-card\s*\{[^}]*gap:\s*12px[^}]*padding:\s*16px/)
    expect(phoneStyles).toMatch(/\.recent-section \.recent-mode-pill\s*\{[^}]*font-size:\s*14px/)
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

  it('删除已完成的最近研究时只移除当前浏览器的本地记录', async () => {
    localStorage.setItem(
      'researchflow:recent',
      JSON.stringify([
        {
          id: 'recent-delete',
          topic: '需要删除的已完成报告',
          mode: 'quick',
          status: 'completed',
          updatedAt: '2026-08-20T08:01:00Z',
        },
        {
          id: 'recent-keep',
          topic: '需要保留的本地研究记录',
          mode: 'deep',
          status: 'completed',
          updatedAt: '2026-08-20T08:02:00Z',
        },
      ]),
    )
    const fetcher = createFetchRouter({ showcases })
    vi.stubGlobal('fetch', fetcher)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderApp('/')

    await user.click(screen.getByRole('button', { name: '删除最近研究：需要删除的已完成报告' }))

    expect(window.confirm).toHaveBeenCalledWith('您确定要移除此记录吗？')
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
    expect(screen.queryByText('需要删除的已完成报告')).not.toBeInTheDocument()
    expect(screen.getByText('需要保留的本地研究记录')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('researchflow:recent') || '[]')).toEqual([
      expect.objectContaining({ id: 'recent-keep' }),
    ])
  })

  it('删除未完成的最近研究时只移除本地记录', async () => {
    localStorage.setItem(
      'researchflow:recent',
      JSON.stringify([
        {
          id: 'recent-cancelled',
          topic: '已经取消的本地研究记录',
          mode: 'quick',
          status: 'cancelled',
          updatedAt: '2026-08-20T08:01:00Z',
        },
      ]),
    )
    const fetcher = createFetchRouter({ showcases })
    vi.stubGlobal('fetch', fetcher)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderApp('/')

    await user.click(screen.getByRole('button', { name: '删除最近研究：已经取消的本地研究记录' }))

    expect(window.confirm).toHaveBeenCalledWith('您确定要移除此记录吗？')
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
    expect(screen.queryByText('已经取消的本地研究记录')).not.toBeInTheDocument()
    expect(localStorage.getItem('researchflow:recent')).toBe('[]')
  })

  it('最近研究为终态与进行中任务显示不同的状态徽标', async () => {
    localStorage.setItem(
      'researchflow:recent',
      JSON.stringify([
        { id: 'recent-completed', topic: '已完成的研究主题', mode: 'quick', status: 'completed', updatedAt: '2026-08-20T08:01:00Z' },
        { id: 'recent-failed', topic: '失败的研究主题', mode: 'quick', status: 'failed', updatedAt: '2026-08-20T08:02:00Z' },
        { id: 'recent-cancelled', topic: '已取消的研究主题', mode: 'deep', status: 'cancelled', updatedAt: '2026-08-20T08:03:00Z' },
        { id: 'recent-expired', topic: '已过期的研究主题', mode: 'deep', status: 'expired', updatedAt: '2026-08-20T08:04:00Z' },
        { id: 'recent-writing', topic: '正在撰写的研究主题', mode: 'quick', status: 'writing', updatedAt: '2026-08-20T08:05:00Z' },
      ]),
    )
    vi.stubGlobal('fetch', createFetchRouter({ showcases }))
    renderApp('/')

    expect(screen.getByText('已完成')).toHaveClass('recent-status', 'status-completed')
    expect(screen.getByText('失败')).toHaveClass('recent-status', 'status-failed')
    expect(screen.getByText('已取消')).toHaveClass('recent-status', 'status-cancelled')
    expect(screen.getByText('已过期')).toHaveClass('recent-status', 'status-expired')
    expect(screen.getByText('正在撰写报告')).toHaveClass('recent-status', 'status-writing')
    expect(styles).toMatch(/\.recent-status\s*\{[^}]*border-radius:\s*999px/)
    expect(styles).toMatch(/\.recent-status\.status-completed\s*\{[^}]*color:\s*var\(--cyan\)/)
    expect(styles).toMatch(/\.recent-status\.status-failed\s*\{[^}]*color:\s*#ffaaaa/)
    expect(styles).toMatch(/\.recent-status\.status-cancelled\s*\{[^}]*color:\s*#b1c0ca/)
    expect(styles).toMatch(/\.recent-status\.status-expired\s*\{[^}]*color:\s*#ffd166/)
    expect(styles).toMatch(/\.recent-status\.status-writing,[\s\S]*?\{[^}]*color:\s*#b8a7ff/)
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

  it('旧记录模式请求超时时会取消底层连接', async () => {
    vi.useFakeTimers()
    localStorage.setItem(
      'researchflow:recent',
      JSON.stringify([
        {
          id: 'research-timeout',
          topic: '需要取消连接的研究',
          status: 'planning',
          updatedAt: '2026-08-20T08:00:00Z',
        },
      ]),
    )
    let abortCount = 0
    const router = createFetchRouter({ showcases })
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).endsWith('/research-timeout')) return router(input, init)
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            abortCount += 1
            reject(new DOMException('请求已取消', 'AbortError'))
          })
        })
      }),
    )

    renderApp('/')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_200)
    })

    expect(abortCount).toBe(2)
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

  it('工作台使用与首页一致的较大标题、时间线和审核卡层级', async () => {
    vi.stubGlobal('fetch', createFetchRouter({ snapshots: { 'research-1': waitingSnapshot } }))
    renderApp('/run/research-1')

    const title = await screen.findByRole('heading', { name: waitingSnapshot.topic })
    expect(title.closest('.workspace-page')).not.toBeNull()
    expect(screen.getByText('研究时间线').closest('.timeline-panel')).not.toBeNull()
    expect(screen.getByText('审核研究计划').closest('.review-card')).not.toBeNull()
    expect(styles).toMatch(/\.workspace-page\s*\{[^}]*padding-top:\s*24px/)
    expect(styles).toMatch(/\.workspace-header h1\s*\{[^}]*font-size:\s*42px/)
    expect(styles).toMatch(/\.workspace-header p\s*\{[^}]*font-size:\s*16px/)
    expect(styles).toMatch(/\.workspace-page \.status-badge\s*\{[^}]*padding:\s*8px 14px[^}]*font-size:\s*16px/)
    expect(styles).toMatch(/\.workspace-page \.status-badge\.status-completed\s*\{[^}]*border-color:\s*rgba\(56, 217, 197, 0\.25\)[^}]*background:\s*rgba\(56, 217, 197, 0\.06\)/)
    expect(styles).toMatch(/\.workspace-grid\s*\{[^}]*grid-template-columns:\s*390px minmax\(0, 1fr\)[^}]*gap:\s*24px/)
    expect(styles).toMatch(/\.workspace-page \.timeline-panel\s*\{[^}]*padding:\s*30px/)
    expect(styles).toMatch(/\.workspace-page \.timeline-panel h2\s*\{[^}]*font-size:\s*28px/)
    expect(styles).toMatch(/\.workspace-page \.timeline-item\s*\{[^}]*min-height:\s*84px[^}]*grid-template-columns:\s*30px 1fr/)
    expect(styles).toMatch(/\.workspace-page \.timeline-item strong\s*\{[^}]*font-size:\s*18px/)
    expect(styles).toMatch(/\.workspace-page \.timeline-item time\s*\{[^}]*font-size:\s*14px/)
    expect(styles).toMatch(/\.workspace-page \.review-card\s*\{[^}]*padding:\s*32px/)
    expect(styles).toMatch(/\.workspace-page \.review-card h2\s*\{[^}]*font-size:\s*28px/)
    expect(styles).toMatch(/\.workspace-page \.review-card > p\s*\{[^}]*font-size:\s*16px/)
    expect(styles).toMatch(/\.workspace-page \.terminal-card\s*\{[^}]*padding:\s*28px/)

    const tabletStart = styles.indexOf('@media (max-width: 800px)')
    const phoneStart = styles.indexOf('@media (max-width: 520px)')
    const tabletStyles = styles.slice(tabletStart, phoneStart)
    const phoneStyles = styles.slice(phoneStart)
    expect(tabletStyles).toMatch(/\.workspace-page\s*\{[^}]*padding-top:\s*24px/)
    expect(phoneStyles).toMatch(/\.workspace-page\s*\{[^}]*padding-top:\s*24px/)
    expect(tabletStyles).not.toMatch(/\.workspace-page \.status-badge\s*\{[^}]*font-size:\s*(?:1[0-5]|[0-9])px/)
    expect(tabletStyles).toMatch(/\.workspace-page \.timeline-panel\s*\{[^}]*padding:\s*24px/)
  })

  it('默认使用夜间模式，并可切换和保存日间模式', async () => {
    const user = userEvent.setup()
    renderApp('/run/research-1')

    expect(document.querySelector('.app-shell')).toHaveAttribute('data-theme', 'dark')
    const button = screen.getByRole('button', { name: '切换到日间模式' })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    await user.click(button)

    expect(document.querySelector('.app-shell')).toHaveAttribute('data-theme', 'light')
    expect(localStorage.getItem('researchflow:theme')).toBe('light')
    expect(screen.getByRole('button', { name: '切换到夜间模式' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('从本地存储恢复日间模式，并忽略非法主题值', () => {
    localStorage.setItem('researchflow:theme', 'light')
    const { unmount } = renderApp('/')
    expect(document.querySelector('.app-shell')).toHaveAttribute('data-theme', 'light')
    unmount()

    localStorage.setItem('researchflow:theme', 'neon')
    renderApp('/')
    expect(document.querySelector('.app-shell')).toHaveAttribute('data-theme', 'dark')
  })

  it('主题读取异常时回退夜间模式，写入异常时仍在当前会话切换', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
      if (key === 'researchflow:theme') throw new Error('存储读取失败')
      return null
    })
    const firstView = renderApp('/')
    expect(document.querySelector('.app-shell')).toHaveAttribute('data-theme', 'dark')
    firstView.unmount()
    vi.restoreAllMocks()

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key) => {
      if (key === 'researchflow:theme') throw new Error('存储写入失败')
    })
    const user = userEvent.setup()
    renderApp('/')

    await user.click(screen.getByRole('button', { name: '切换到日间模式' }))

    expect(document.querySelector('.app-shell')).toHaveAttribute('data-theme', 'light')
  })

  it('主题按钮是导航操作首项，并同步提供标题与太阳月亮图标', async () => {
    const user = userEvent.setup()
    renderApp('/')

    const actions = screen.getByRole('navigation', { name: '页面导航' })
    const toggle = screen.getByRole('button', { name: '切换到日间模式' })
    expect(within(actions).getAllByRole('button')[0]).toBe(toggle)
    expect(toggle).toHaveAttribute('title', '切换到日间模式')
    expect(toggle.querySelector('svg.lucide-sun')).not.toBeNull()

    await user.click(toggle)

    const nightToggle = screen.getByRole('button', { name: '切换到夜间模式' })
    expect(nightToggle).toHaveAttribute('title', '切换到夜间模式')
    expect(nightToggle.querySelector('svg.lucide-moon')).not.toBeNull()
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

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('搜索服务暂时不可用')
    expect(error.closest('.terminal-card-content')).not.toBeNull()
    expect(screen.getByRole('heading', { name: '研究失败' })).toBeInTheDocument()
    expect(styles).toMatch(/\.workspace-page \.terminal-card-content\s*\{[^}]*min-width:\s*0/)
    expect(styles).toMatch(/\.workspace-page \.terminal-card h2,[\s\S]*?\.workspace-page \.terminal-card p\s*\{[^}]*overflow-wrap:\s*anywhere/)
  })

  it('工作台取消与过期状态使用与首页一致的灰蓝和黄色徽标', async () => {
    vi.stubGlobal('fetch', createFetchRouter({ snapshots: { 'research-1': { ...waitingSnapshot, status: 'cancelled' } } }))
    const { unmount } = renderApp('/run/research-1')

    expect(await screen.findByText('研究已取消', { selector: '.status-badge' })).toHaveClass('status-cancelled')
    unmount()

    vi.stubGlobal('fetch', createFetchRouter({ snapshots: { 'research-1': { ...waitingSnapshot, status: 'expired' } } }))
    renderApp('/run/research-1')

    expect(await screen.findByText('研究已过期', { selector: '.status-badge' })).toHaveClass('status-expired')
    expect(styles).toMatch(/\.workspace-page \.status-badge\.status-cancelled\s*\{[^}]*color:\s*#b1c0ca/)
    expect(styles).toMatch(/\.workspace-page \.status-badge\.status-expired\s*\{[^}]*color:\s*#ffd166/)
    expect(styles).toMatch(/\.recent-status\.status-expired\s*\{[^}]*color:\s*#ffd166/)
  })

  it('工作台顶部为每种研究状态显示对应图标', async () => {
    const cases = [
      ['queued', 'ellipsis'],
      ['planning', 'compass'],
      ['waiting_for_review', 'circle'],
      ['researching', 'search'],
      ['writing', 'file'],
      ['verifying', 'shield'],
      ['completed', 'check'],
      ['failed', 'alert'],
      ['cancelled', 'x'],
      ['expired', 'clock'],
    ] as const

    for (const [status, icon] of cases) {
      vi.stubGlobal('fetch', createFetchRouter({ snapshots: { 'research-1': { ...waitingSnapshot, status } } }))
      const view = renderApp('/run/research-1')
      expect(await screen.findByTestId('workspace-status-icon')).toHaveAttribute('data-status-icon', icon)
      view.unmount()
    }
  })

  it('工作台时间线为后端长事件文本保留安全换行空间', async () => {
    vi.stubGlobal('fetch', createFetchRouter({ snapshots: { 'research-1': waitingSnapshot } }))
    renderApp('/run/research-1')

    const timeline = await screen.findByText('研究时间线')
    expect(timeline.closest('.timeline-panel')).not.toBeNull()
    expect(styles).toMatch(/\.workspace-page \.timeline-item > div\s*\{[^}]*min-width:\s*0/)
    expect(styles).toMatch(/\.workspace-page \.timeline-item strong\s*\{[^}]*overflow-wrap:\s*anywhere/)
  })

  it('已完成研究在时间线右侧展示不可编辑的已确认计划', async () => {
    vi.stubGlobal('fetch', createFetchRouter({ snapshots: { 'research-1': completedSnapshot } }))
    renderApp('/run/research-1')

    expect(await screen.findByRole('heading', { name: '已确认的研究计划' })).toBeInTheDocument()
    expect(screen.getByText('此计划已用于生成当前报告，不能再修改。')).toBeInTheDocument()
    expect(screen.getByLabelText('已确认的研究重点')).toBeDisabled()
    expect(screen.getByLabelText('已确认的子问题 1')).toHaveValue('准确率如何？')
    expect(screen.getByLabelText('已确认的子问题 1')).toBeDisabled()
    expect(screen.getByRole('button', { name: '计划已确认' })).toBeDisabled()
    expect(screen.getByText('已锁定').closest('.locked-plan-card')).not.toBeNull()
    expect(styles).toMatch(/\.locked-plan-card\s*\{[^}]*filter:\s*grayscale\(0\.45\)/)
    expect(styles).toMatch(/\.locked-plan-card textarea:disabled,[\s\S]*?\.locked-plan-card input:disabled\s*\{[^}]*cursor:\s*not-allowed/)
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
    expect(screen.getByRole('link', { name: '模型评测方法说明' }).querySelector('.source-title')).not.toBeNull()
    expect(screen.getByText('恶意来源').closest('a')).toBeNull()
    expect(screen.getByText('恶意来源')).toHaveClass('source-title')
    expect(screen.getByText('快速导航').closest('.report-toc')).not.toBeNull()
    expect(styles).toMatch(/\.report-page\s*\{[^}]*padding-top:\s*0/)
    expect(styles).toMatch(/\.report-header\s*\{[^}]*padding:\s*24px 0 40px/)
    expect(styles).toMatch(/\.report-header \.eyebrow\s*\{[^}]*gap:\s*8px[^}]*padding:\s*8px 14px[^}]*font-size:\s*16px/)
    expect(styles).toMatch(/\.report-header \.eyebrow svg\s*\{[^}]*width:\s*18px[^}]*height:\s*18px/)
    expect(screen.getByText('[1]').closest('.source-card')).not.toBeNull()
    expect(styles).toMatch(/\.report-toc\s*\{[^}]*padding:\s*28px/)
    expect(styles).toMatch(/\.report-toc \.kicker\s*\{[^}]*font-size:\s*16px/)
    expect(styles).toMatch(/\.report-toc a\s*\{[^}]*font-size:\s*18px[^}]*padding:\s*12px 0 12px 16px/)
    expect(styles).toMatch(/\.source-list\s*\{[^}]*gap:\s*16px/)
    expect(styles).toMatch(/\.source-card\s*\{[^}]*grid-template-columns:\s*52px minmax\(0, 1fr\)[^}]*gap:\s*16px[^}]*padding:\s*24px/)
    expect(styles).toMatch(/\.source-number\s*\{[^}]*font-size:\s*24px/)
    expect(styles).toMatch(/\.source-card a,\s*\.source-card strong\s*\{[^}]*font-size:\s*20px/)
    expect(styles).toMatch(/\.source-card p\s*\{[^}]*font-size:\s*16px/)
    expect(styles).toMatch(/\.source-card div > span\s*\{[^}]*font-size:\s*14px/)

    const tabletStart = styles.indexOf('@media (max-width: 800px)')
    const phoneStart = styles.indexOf('@media (max-width: 520px)')
    const tabletStyles = styles.slice(tabletStart, phoneStart)
    const phoneStyles = styles.slice(phoneStart)
    expect(tabletStyles).toMatch(/\.report-page\s*\{[^}]*padding-top:\s*0/)
    expect(phoneStyles).toMatch(/\.report-page\s*\{[^}]*padding-top:\s*0/)
    expect(tabletStyles).toMatch(/\.report-toc\s*\{[^}]*padding:\s*24px/)
    expect(tabletStyles).toMatch(/\.source-card\s*\{[^}]*grid-template-columns:\s*44px minmax\(0, 1fr\)[^}]*padding:\s*20px/)

    expect(phoneStyles).toMatch(/\.report-toc nav\s*\{[^}]*grid-template-columns:\s*1fr/)
    expect(styles).toMatch(/\.report-toc a\s*\{[^}]*overflow-wrap:\s*anywhere/)
    expect(styles).toMatch(/\.source-card > div\s*\{[^}]*min-width:\s*0/)
    expect(styles).toMatch(/\.source-card a\s*\{[^}]*display:\s*flex[^}]*min-width:\s*0/)
    expect(styles).toMatch(/\.source-title\s*\{[^}]*overflow-wrap:\s*anywhere/)

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
