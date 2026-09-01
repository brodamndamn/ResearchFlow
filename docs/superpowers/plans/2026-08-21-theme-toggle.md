# 日间／夜间主题切换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 ResearchFlow 增加默认夜间、可持久化切换的日间／夜间主题。

**Architecture:** `Shell` 保存唯一的主题状态，并将 `data-theme` 写到 `.app-shell`。主题值读取和写入浏览器 `localStorage`；CSS 默认变量继续表达夜间主题，`[data-theme="light"]` 仅覆盖全局设计令牌，组件通过令牌获得日间颜色。

**Tech Stack:** React 19、TypeScript、lucide-react、CSS 自定义属性、Vitest、Vite。

**Spec:** `docs/superpowers/specs/2026-08-21-theme-toggle-design.md`

## Global Constraints

- 默认主题固定为夜间模式，`localStorage` 键名固定为 `researchflow:theme`。
- 仅接受 `dark` 与 `light` 两个存储值；缺失、无效值或读写异常均回退夜间模式。
- 不增加依赖、不改变路由、不提交 `.env`、数据库或构建产物。
- 导航按钮使用太阳／月亮图标，并带中文 `aria-label`、`title`、`aria-pressed`。
- 面向用户的文案、测试名称和注释使用简体中文。

---

### Task 1: 主题状态与导航切换按钮

**Files:**
- Modify: `frontend/src/components/Shell.tsx`
- Test: `frontend/src/app.test.tsx`

**Interfaces:**
- Consumes: 浏览器 `localStorage` 的 `researchflow:theme` 值。
- Produces: `.app-shell[data-theme="dark" | "light"]`，以及带 `aria-label="切换到日间模式" | "切换到夜间模式"` 的主题按钮。

- [ ] **Step 1: 写失败测试，覆盖默认主题与切换结果**

在 `frontend/src/app.test.tsx` 增加：

```tsx
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
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd frontend && pnpm vitest run src/app.test.tsx --configLoader runner`

Expected: FAIL，提示找不到“切换到日间模式”按钮或根容器没有 `data-theme`。

- [ ] **Step 3: 在 Shell 实现最小主题状态与按钮**

将 `useState` 加入 React 导入，并从 `lucide-react` 导入 `Moon`、`Sun`。加入只接受合法主题值的读取函数：

```tsx
type Theme = 'dark' | 'light'
const THEME_STORAGE_KEY = 'researchflow:theme'

function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}
```

在 `Shell` 内初始化 `const [theme, setTheme] = useState<Theme>(getStoredTheme)`，将根节点改为：

```tsx
<div className="app-shell" data-theme={theme}>
```

在 `.header-actions` 开头加入：

```tsx
<button
  type="button"
  className="header-nav-button theme-toggle"
  onClick={() => {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    try { localStorage.setItem(THEME_STORAGE_KEY, nextTheme) } catch { /* 存储不可用时仅保留当前会话状态 */ }
  }}
  aria-label={theme === 'dark' ? '切换到日间模式' : '切换到夜间模式'}
  aria-pressed={theme === 'light'}
  title={theme === 'dark' ? '切换到日间模式' : '切换到夜间模式'}
>
  {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
</button>
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `cd frontend && pnpm vitest run src/app.test.tsx --configLoader runner`

Expected: PASS，默认暗色属性、按钮切换、存储值和 `aria-pressed` 全部成立。

- [ ] **Step 5: 提交主题交互切片**

```bash
git add frontend/src/components/Shell.tsx frontend/src/app.test.tsx
git commit -m "feat: add persistent theme toggle"
```

### Task 2: 日间主题设计令牌与响应式按钮

**Files:**
- Modify: `frontend/src/styles.css`
- Test: `frontend/src/app.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `.app-shell[data-theme="light"]` 与 `.theme-toggle`。
- Produces: 日间模式的颜色变量、背景、面板、文字、导航及交互状态样式。

- [ ] **Step 1: 写失败测试，覆盖日间主题令牌与窄屏按钮**

在现有样式断言附近增加：

```tsx
expect(styles).toMatch(/\.app-shell\[data-theme="light"\]\s*\{[\s\S]*?--navy:\s*#eef5f8/)
expect(styles).toMatch(/\.app-shell\[data-theme="light"\]\s*\{[\s\S]*?--panel:\s*rgba\(255, 255, 255, 0\.88\)/)
expect(styles).toMatch(/\.theme-toggle\s*\{[^}]*min-width:\s*46px/)
```

在 `@media (max-width: 520px)` 的样式片段中断言：

```tsx
expect(phoneStyles).toMatch(/\.theme-toggle\s*\{[^}]*width:\s*36px/)
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd frontend && pnpm vitest run src/app.test.tsx --configLoader runner`

Expected: FAIL，提示未找到日间主题变量与 `.theme-toggle` 尺寸。

- [ ] **Step 3: 添加日间变量与主题局部覆盖**

在 `frontend/src/styles.css` 的默认变量后加入：

```css
.app-shell[data-theme="light"] {
  color: #183044;
  --navy: #eef5f8;
  --panel: rgba(255, 255, 255, 0.88);
  --panel-strong: #ffffff;
  --line: rgba(48, 94, 122, 0.2);
  --cyan: #098f82;
  --cyan-soft: #087b71;
  --muted: #587286;
}

.app-shell[data-theme="light"] .site-header {
  background: rgba(247, 252, 253, 0.8);
}

.app-shell[data-theme="light"] .panel,
.app-shell[data-theme="light"] .showcase-card,
.app-shell[data-theme="light"] .recent-list a,
.app-shell[data-theme="light"] .source-card,
.app-shell[data-theme="light"] .terminal-card {
  background: var(--panel);
  box-shadow: 0 18px 48px rgba(45, 89, 112, 0.12);
}
```

将 `body` 的固定渐变替换为使用 `var(--navy)` 的背景，并追加日间渐变覆盖；把固定浅色标题和固定暗色输入背景改为对应 CSS 变量，以覆盖首页、工作台和报告页。

添加按钮尺寸：

```css
.theme-toggle { min-width: 46px; padding: 0; }
@media (max-width: 520px) { .theme-toggle { width: 36px; } }
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `cd frontend && pnpm vitest run src/app.test.tsx --configLoader runner`

Expected: PASS，日间变量、桌面按钮尺寸和手机按钮尺寸均被断言覆盖。

- [ ] **Step 5: 提交日间样式切片**

```bash
git add frontend/src/styles.css frontend/src/app.test.tsx
git commit -m "feat: add light theme styling"
```

### Task 3: 存储恢复、异常回退与完整验证

**Files:**
- Modify: `frontend/src/app.test.tsx`
- Modify: `frontend/src/components/Shell.tsx`（仅当 Task 1 测试暴露存储异常未处理时）

**Interfaces:**
- Consumes: Task 1 的 `getStoredTheme` 和主题切换按钮。
- Produces: 可预测的刷新恢复与存储异常降级行为。

- [ ] **Step 1: 写失败测试，覆盖恢复和非法值**

```tsx
it('从本地存储恢复日间模式，并忽略非法主题值', () => {
  localStorage.setItem('researchflow:theme', 'light')
  const { unmount } = renderApp('/')
  expect(document.querySelector('.app-shell')).toHaveAttribute('data-theme', 'light')
  unmount()

  localStorage.setItem('researchflow:theme', 'neon')
  renderApp('/')
  expect(document.querySelector('.app-shell')).toHaveAttribute('data-theme', 'dark')
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd frontend && pnpm vitest run src/app.test.tsx --configLoader runner`

Expected: 若未恢复主题或未过滤非法值，测试失败。

- [ ] **Step 3: 仅在失败时收敛主题读取逻辑**

确保读取逻辑严格使用：

```tsx
return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
```

不要接受任意字符串，也不要在存储不可用时阻塞首次渲染。

- [ ] **Step 4: 运行完整验证**

Run: `cd frontend && pnpm test`

Run: `cd frontend && pnpm typecheck`

Run: `cd frontend && pnpm build`

Expected: 三条命令全部退出码为 0；主题切换、日间配色和原有路由测试无回归。

- [ ] **Step 5: 审查差异并提交验证切片**

```bash
git diff --check
git status --short
git add frontend/src/app.test.tsx frontend/src/components/Shell.tsx
git commit -m "test: cover theme persistence fallback"
```
