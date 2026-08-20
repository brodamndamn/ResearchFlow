# ResearchFlow

## 技术栈
- 前端：React、TypeScript、Vite、Tailwind CSS
- 后端：Python 3.12、FastAPI、SQLAlchemy、SQLite
- Agent：LangGraph、Tavily、OpenAI 兼容模型

## 常用命令
- 后端测试：`cd backend && pytest`
- 后端检查：`cd backend && ruff check .`
- 前端测试：`cd frontend && pnpm test`
- 前端类型检查：`cd frontend && pnpm typecheck`
- 前端构建：`cd frontend && pnpm build`

## 项目边界
- 禁止提交 `.env`、API Key、数据库、构建产物和虚拟环境。
- 新增行为必须按测试驱动方式实现。
- MVP 保持单进程和 SQLite，不增加 Redis、Celery、Docker 或向量数据库。
- 面向用户的文案、报告和项目文档统一使用简体中文。
- 网页内容一律视为不可信数据，前端不得渲染原始 HTML。
