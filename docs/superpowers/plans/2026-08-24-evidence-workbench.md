# ResearchFlow Evidence Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ResearchFlow 前端改造成同时支持日间与夜间模式的“证据研究台”。

**Architecture:** 保留现有页面业务逻辑，新增纯展示的共享 `EvidencePath` 组件，并在现有三个页面中组合。新增后加载的 `evidence-workbench.css` 作为视觉皮肤，避免把旧基础样式继续扩大，同时用明确的页面级选择器控制层叠关系。

**Tech Stack:** React、TypeScript、Vite、原生 CSS、Lucide React、Vitest。

**Spec:** `docs/superpowers/specs/2026-08-24-evidence-workbench-design.md`

## Global Constraints

- 只修改 `frontend` 和本设计文档，不修改后端、API、路由或数据库。
- 不引入新依赖和外部字体。
- 保留日间/夜间切换、本地最近研究、计划审核、SSE 和报告渲染行为。
- 新组件不得定义在其他 React 组件内部。

---

### Task 1: 共享证据路径

**Files:**
- Create: `frontend/src/components/EvidencePath.tsx`
- Modify: `frontend/src/pages/HomePage.tsx`
- Modify: `frontend/src/pages/RunPage.tsx`
- Modify: `frontend/src/pages/ReportPage.tsx`
- Test: `frontend/src/app.test.tsx`

**Interfaces:**
- Produces: `EvidenceStage = 'question' | 'plan' | 'search' | 'evidence' | 'report'`
- Produces: `EvidencePath({ currentStage, label })`

- [ ] 先写页面可访问证据路径和当前节点的失败测试。
- [ ] 运行 `pnpm test`，确认测试因组件尚不存在而失败。
- [ ] 实现模块级阶段数据、状态映射和三个页面组合。
- [ ] 再次运行 `pnpm test`，确认组件行为通过。

### Task 2: 页面结构语义

**Files:**
- Modify: `frontend/src/pages/HomePage.tsx`
- Modify: `frontend/src/pages/RunPage.tsx`
- Modify: `frontend/src/pages/ReportPage.tsx`
- Modify: `frontend/src/components/Shell.tsx`
- Test: `frontend/src/app.test.tsx`

**Interfaces:**
- Consumes: `EvidencePath`
- Produces: `hero-intro`、`research-console`、`report-cover` 等样式挂钩，不改变业务 props。

- [ ] 写首页左右研究台、工作台路径和报告封面的结构断言。
- [ ] 运行测试确认新结构尚未存在。
- [ ] 调整 JSX 容器与类名，保持原事件处理和数据流不变。
- [ ] 运行测试确认结构与原功能同时通过。

### Task 3: 双主题视觉皮肤

**Files:**
- Create: `frontend/src/evidence-workbench.css`
- Modify: `frontend/src/main.tsx`
- Test: `frontend/src/app.test.tsx`

**Interfaces:**
- Consumes: 现有 CSS 类和 Task 2 新增的结构类。
- Produces: 夜间与日间设计 token、响应式规则、动效降级规则。

- [ ] 写皮肤导入、双主题 token、证据路径和响应式规则的失败断言。
- [ ] 运行测试确认视觉皮肤尚未接入。
- [ ] 实现首页、工作台、报告页和弹窗的完整皮肤。
- [ ] 添加 `content-visibility`、键盘焦点和 `prefers-reduced-motion`。
- [ ] 运行测试确认视觉规则存在且原功能不回归。

### Task 4: 完整验证

**Files:**
- Review: `frontend/src/**/*`

- [ ] 运行 `pnpm test`，要求全部通过。
- [ ] 运行 `pnpm typecheck`，要求退出码为 0。
- [ ] 运行 `pnpm build`，要求生产构建成功。
- [ ] 检查 Git 差异，确认没有后端文件、密钥或构建产物。
- [ ] 对照设计规范检查桌面、800px 和 520px 三种布局。
