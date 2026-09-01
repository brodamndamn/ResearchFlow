import { expect, test } from '@playwright/test'

test('从创建深度研究到审核计划并阅读中文报告', async ({ page }) => {
  const waiting = snapshot('waiting_for_review')
  const completed = snapshot('completed')
  let current = waiting

  await page.route('**/research/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    if (path === '/research/api/showcases') {
      await route.fulfill({ json: [] })
      return
    }
    if (path === '/research/api/research' && request.method() === 'POST') {
      await route.fulfill({ status: 201, json: waiting })
      return
    }
    if (path === '/research/api/research/research-1/plan' && request.method() === 'PUT') {
      expect(request.postDataJSON()).toEqual({
        focus: '重点验证中文来源的可靠性',
        subqueries: ['准确率如何？', '高质量来源是否支持结论？'],
      })
      current = completed
      await route.fulfill({ json: completed })
      return
    }
    if (path === '/research/api/research/research-1/events') {
      // 浏览器层模拟 SSE 连接中断，客户端必须通过 GET 快照恢复。
      await route.abort('connectionclosed')
      return
    }
    if (path === '/research/api/research/research-1') {
      await route.fulfill({ json: current })
      return
    }
    await route.fulfill({ status: 404, json: { detail: '未找到' } })
  })

  await page.goto('/research/')
  await page.getByLabel('研究主题').fill('比较主流大模型在中文事实核查任务中的能力')
  await page.getByRole('radio', { name: /深度研究/ }).check()
  await page.getByRole('button', { name: '开始研究' }).click()

  await expect(page.getByRole('heading', { name: '审核研究计划' })).toBeVisible()
  await page.getByLabel('研究重点').fill('重点验证中文来源的可靠性')
  await page.getByRole('textbox', { name: '子问题 2', exact: true }).fill('高质量来源是否支持结论？')
  await page.getByRole('button', { name: '确认并继续' }).click()

  await expect(page.getByRole('link', { name: '查看报告' })).toBeVisible()
  await page.getByRole('link', { name: '查看报告' }).click()
  await expect(page.getByRole('heading', { name: '主流大模型中文研究能力比较' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '报告目录' })).toContainText('核心结论')
  await expect(page.getByRole('link', { name: /模型评测方法说明/ })).toHaveAttribute(
    'href',
    'https://example.com/evaluation',
  )
})

function snapshot(status: 'waiting_for_review' | 'researching' | 'completed') {
  return {
    id: 'research-1',
    topic: '比较主流大模型在中文事实核查任务中的能力',
    mode: 'deep',
    status,
    focus: '中文事实核查能力',
    subqueries: ['准确率如何？', '来源质量如何？'],
    events: [
      {
        phase: status === 'completed' ? 'completed' : 'planning',
        message: status === 'completed' ? '中文研究报告已完成' : '研究计划已生成',
        timestamp: '2026-08-20T08:01:00Z',
        status: 'completed',
      },
    ],
    createdAt: '2026-08-20T08:00:00Z',
    updatedAt: '2026-08-20T08:03:00Z',
    report:
      status === 'completed'
        ? {
            title: '主流大模型中文研究能力比较',
            markdown: '## 核心结论\n\n中文事实核查仍需高质量来源支持。[1]',
            sources: [
              {
                id: 1,
                title: '模型评测方法说明',
                url: 'https://example.com/evaluation',
                domain: 'example.com',
              },
            ],
            sourceCount: 1,
            citationCount: 1,
            durationSeconds: 73,
            completedAt: '2026-08-20T08:03:00Z',
          }
        : undefined,
  }
}
