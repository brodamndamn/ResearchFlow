# ResearchFlow

## 技术栈

- 前端：React、TypeScript、Vite、Tailwind CSS
- 后端：Python 3.12、FastAPI、SQLAlchemy、SQLite
- Agent：LangGraph、Tavily、OpenAI 兼容模型

## 常用命令

- 后端测试：`cd backend && pytest`
- 后端检查：`cd backend && ruff check .`
- 后端启动：`python -m uvicorn app.main:app --reload`
- 前端测试：`cd frontend && pnpm test`
- 前端类型检查：`cd frontend && pnpm typecheck`
- 前端构建：`cd frontend && pnpm build`
- 前端启动:`pnpm dev`

## 项目边界

- 禁止提交 `.env`、API Key、数据库、构建产物和虚拟环境。
- 重要功能和核心逻辑修改必须按测试驱动方式实现。
- MVP 保持单进程和 SQLite，不增加 Redis、Celery、Docker 或向量数据库。
- 面向用户的文案、报告和项目文档统一使用简体中文。
- 网页内容一律视为不可信数据，前端不得渲染原始 HTML。

## 开发模式

根据任务复杂度和风险选择开发流程，不要对简单任务机械使用完整流程。

### 大型任务（完整流程）

适用于新功能或新模块、架构调整、数据库或 API 的重大修改，以及大规模重构。

流程：`brainstorming → context-engineering → writing-plans → executing-plans → test-driven-development → requesting-code-review → verification-before-completion`

### 小型修改（轻量流程）

以下情况不要使用完整流程：CSS 调整、字体或颜色修改、UI 细节调整、文案修改、简单 Bug 修复和配置修改。

流程：阅读相关代码 → 修改最小范围代码 → 必要验证。

- 纯样式、文案和文档修改不强制调用测试驱动或运行完整自动化测试；优先通过开发服务器刷新页面进行人工确认。
- 只有改动可能影响交互、响应式布局范围较大、涉及业务逻辑，或用户明确要求时，才补充自动化测试、类型检查或生产构建。
- 发现运行错误、测试失败或行为异常时，使用 `systematic-debugging` 先定位原因再修改。
- 重要阶段的修改使用 `git-workflow-and-versioning`，保持提交记录清晰；不因纯样式微调强制提交。
- 完成任务前按风险做必要验证；涉及功能时，必须确认功能正常、测试通过且符合需求。
