# ResearchFlow MVP 实施计划

> **供执行者使用：** 每个任务都必须测试先行，并在每次提交前完成验证。

**目标：** 构建一个可部署的研究 Agent，支持计划编辑、实时进度、可追溯引用、匿名限额和精选案例。

**架构：** React SPA 调用 FastAPI REST/SSE API。单个进程内 worker 驱动带 checkpoint 的 LangGraph，模型和搜索服务均可注入；SQLAlchemy 将任务状态和报告保存到 SQLite。

**技术栈：** Python 3.12、FastAPI、SQLAlchemy、LangGraph、Tavily、React、TypeScript、Vite、Tailwind CSS、pytest、Vitest、Playwright。

**设计文档：** `docs/superpowers/specs/2026-08-20-researchflow-design.md`

## 实施任务

1. 建立配置、持久化、领域模型和测试夹具。
2. 实现限额、数据保留、重启恢复和有界任务队列。
3. 实现 Provider 契约以及带 checkpoint 的快速/深度研究图。
4. 提供研究创建、计划审核、取消、精选案例、健康检查和 SSE 接口。
5. 构建首页、任务工作台和报告三个前端路由。
6. 添加 Fake Provider 集成测试、Playwright 流程、部署文件和中文文档。
7. 运行完整验证和只读代码审查，修复严重与重要问题。
