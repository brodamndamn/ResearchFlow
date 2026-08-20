# 精选案例包含需要保持可读性的 Markdown 表格与官方来源 URL。
# ruff: noqa: E501

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RateUsage, ResearchRun, Showcase, Source
from app.schemas import ResearchMode, ResearchStatus


@dataclass(frozen=True, slots=True)
class CleanupResult:
    runs_deleted: int
    usage_rows_deleted: int
    deleted_run_ids: tuple[str, ...] = ()


async def cleanup_expired_data(
    session: AsyncSession,
    *,
    now: datetime,
    retention_days: int = 7,
) -> CleanupResult:
    cutoff = now - timedelta(days=retention_days)
    expired_ids = tuple(
        await session.scalars(
            select(ResearchRun.id).where(
                ResearchRun.created_at < cutoff,
                ~ResearchRun.showcase.has(),
            )
        )
    )
    runs_result = await session.execute(
        delete(ResearchRun).where(ResearchRun.id.in_(expired_ids))
    )
    usage_result = await session.execute(
        delete(RateUsage).where(RateUsage.usage_date < cutoff.date())
    )
    return CleanupResult(
        runs_deleted=runs_result.rowcount,
        usage_rows_deleted=usage_result.rowcount,
        deleted_run_ids=expired_ids,
    )


async def recover_interrupted_runs(session: AsyncSession, *, now: datetime) -> int:
    active_statuses = (
        ResearchStatus.QUEUED,
        ResearchStatus.PLANNING,
        ResearchStatus.RESEARCHING,
        ResearchStatus.WRITING,
        ResearchStatus.VERIFYING,
    )
    result = await session.execute(
        update(ResearchRun)
        .where(ResearchRun.status.in_(active_statuses))
        .values(
            status=ResearchStatus.FAILED,
            error="服务重启，研究任务执行中断",
            updated_at=now,
        )
    )
    return result.rowcount


async def ensure_default_showcases(session: AsyncSession, *, now: datetime) -> int:
    examples = [
        {
            "title": "AI 编程助手是否真正提升研发效率",
            "summary": "综合随机对照实验、真实项目研究与组织效能报告，解释为什么 AI 既可能提速，也可能让资深开发者变慢。",
            "mode": ResearchMode.DEEP,
            "focus": "区分短任务提速、真实仓库交付和组织级研发效能",
            "subqueries": [
                "受控实验中 AI 编程助手带来了多大速度变化？",
                "真实复杂仓库中的结果是否一致？",
                "团队应使用哪些指标评估投入产出？",
                "如何控制代码质量、信任与维护风险？",
            ],
            "sources": [
                {
                    "url": "https://www.microsoft.com/en-us/research/publication/the-impact-of-ai-on-developer-productivity-evidence-from-github-copilot/",
                    "title": "Microsoft Research：GitHub Copilot 对开发效率的影响",
                    "snippet": "随机对照实验比较开发者完成 JavaScript HTTP 服务任务的速度。",
                },
                {
                    "url": "https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/",
                    "title": "METR：AI 对资深开源开发者效率的影响",
                    "snippet": "研究资深开发者在熟悉的真实仓库中使用 AI 工具时的完成时间。",
                },
                {
                    "url": "https://dora.dev/research/2025/dora-report/",
                    "title": "DORA：2025 AI 辅助软件开发报告",
                    "snippet": "从组织与交付系统角度分析 AI 使用、研发效能和团队能力。",
                },
                {
                    "url": "https://www.gov.uk/government/publications/ai-coding-assistant-trial/ai-coding-assistant-trial-uk-public-sector-findings-report",
                    "title": "英国政府：AI 编程助手试点报告",
                    "snippet": "基于公共部门试点的使用遥测、满意度与生产率评估。",
                },
            ],
            "report": (
                "# AI 编程助手是否真正提升研发效率\n\n"
                "> 研究问题：企业采购 AI 编程助手后，能否稳定获得更快、更高质量的软件交付？\n\n"
                "## 核心结论\n\n"
                "AI 编程助手的效果不是一个固定百分比，而是由任务边界、开发者经验、仓库熟悉度和验证成本共同决定。短小、定义清晰的新建任务中，受控实验观察到显著提速；但在资深开发者维护熟悉的大型仓库时，理解上下文、核验建议和修复偏差可能抵消生成速度 [1][2]。\n\n"
                "因此，企业不应只统计生成代码量或建议接受率，而应把交付周期、返工率、缺陷逃逸率、评审时间和开发者认知负担放在同一张指标表中 [3][4]。\n\n"
                "## 证据对照\n\n"
                "| 研究 | 场景 | 观察结果 | 适用边界 |\n"
                "| --- | --- | --- | --- |\n"
                "| Microsoft Research [1] | 受控的 JavaScript HTTP 服务任务 | 使用 Copilot 的实验组平均完成更快 | 任务短、目标清晰，不能直接外推到长期维护 |\n"
                "| METR [2] | 资深开源开发者处理真实仓库任务 | 早期 2025 工具使参与者平均用时增加 | 强调仓库上下文和验证成本 |\n"
                "| DORA [3] | 组织级软件交付系统 | AI 收益依赖平台、流程和团队能力 | 不能把个人体感等同于组织吞吐 |\n"
                "| 英国政府试点 [4] | 多部门真实工作 | 使用者普遍认可价值，但大量输出仍需编辑 | 适合评估采用率、信任与治理 |\n\n"
                "## 企业落地方案\n\n"
                "1. **先按任务分层。** 文档、测试样例、脚手架和局部重构可优先启用；安全关键代码、陌生遗留系统和跨服务变更需要更严格审核。\n"
                "2. **建立对照基线。** 试点前记录需求到合并的周期、评审轮次、线上缺陷和返工工时，避免只依赖主观问卷。\n"
                "3. **把验证纳入成本。** 统计提示、等待、阅读生成内容、补测试和修复错误的总时间，而不是只测首次生成速度。\n"
                "4. **配置工程上下文。** 提供项目规则、测试命令、架构边界和安全约束，减少工具在错误方向上快速产出。\n\n"
                "## 决策建议\n\n"
                "建议采用四周小规模试点，以团队而非个人为分析单位。若交付周期下降，同时评审时间、缺陷率和返工没有上升，再逐步扩大；若只看到代码量增长，应暂停扩张并检查需求拆分与质量门禁。\n\n"
                "## 局限与风险\n\n"
                "现有研究使用的模型、IDE、任务和参与者差异较大，结果会随工具快速迭代。供应商研究可能存在选择偏差，单次实验也无法完整衡量半年后的维护成本。因此，本报告给出的是评估框架，而不是对所有团队都成立的统一提速比例。"
            ),
        },
        {
            "title": "中国低空经济商业化进展",
            "summary": "从国家产业分类、飞行监管、基础设施和深圳实践出发，分析低空经济从政策热度走向可持续商业模式的关键条件。",
            "mode": ResearchMode.DEEP,
            "focus": "识别已经形成收入闭环的场景、基础设施瓶颈与安全监管约束",
            "subqueries": [
                "低空经济的官方产业边界如何定义？",
                "哪些应用场景已具备规模化基础？",
                "商业化依赖哪些飞行服务与数字基础设施？",
                "地方政策试点面临哪些安全和盈利风险？",
            ],
            "sources": [
                {
                    "url": "https://www.ndrc.gov.cn/xxgk/jd/jd/202512/t20251226_1402661_ext.html",
                    "title": "国家发展改革委：低空经济核心产业统计分类解读",
                    "snippet": "将低空经济划分为制造、运营、基建与信息服务、配套四类产业。",
                },
                {
                    "url": "https://www.caac.gov.cn/XWZX/MHYW/202501/t20250103_226313.html",
                    "title": "中国民航局：高质量发展通用航空和低空经济",
                    "snippet": "介绍无人机、通用航空、公共服务和低空物流的发展基础。",
                },
                {
                    "url": "https://sf.sz.gov.cn/ztzl/yhyshj/yhyshjzcwj/content/post_12080392.html",
                    "title": "深圳经济特区低空经济产业促进条例",
                    "snippet": "覆盖基础设施、飞行服务、产业应用、技术创新与安全管理。",
                },
                {
                    "url": "https://www.ndrc.gov.cn/fggz/202503/t20250314_1396569.html",
                    "title": "国家发展改革委：2025 年国民经济和社会发展计划报告",
                    "snippet": "提出完善低空经济规则体系、基础设施和安全监管能力。",
                },
            ],
            "report": (
                "# 中国低空经济商业化进展\n\n"
                "> 研究问题：低空经济应如何从产业概念和示范项目，走向可复制、可监管、可持续盈利的业务？\n\n"
                "## 核心结论\n\n"
                "低空经济已经从单一航空器制造扩展为制造、运营、低空基建与信息服务、配套保障四个相互依赖的产业层级 [1]。商业化的决定因素不只是飞行器性能，而是高频刚需场景、可持续的单位经济性、空域与飞行服务、责任保险及安全监管能否形成闭环。\n\n"
                "现阶段更容易形成稳定付费的场景集中在工业巡检、农林作业、应急救援、测绘和特定区域物流；面向普通消费者的大规模城市空中交通仍需要更成熟的基础设施、适航体系和公众安全验证 [2][4]。\n\n"
                "## 产业链与价值分配\n\n"
                "| 层级 | 典型参与者 | 收入来源 | 主要瓶颈 |\n"
                "| --- | --- | --- | --- |\n"
                "| 低空制造 | 整机、动力、航电、材料企业 | 设备销售与维护 | 适航、可靠性、成本 |\n"
                "| 低空运营 | 物流、巡检、文旅、公共服务运营方 | 按架次、里程或服务付费 | 航线密度和持续订单 |\n"
                "| 基建与信息服务 | 起降设施、通信导航、飞行服务平台 | 建设、订阅和运营服务 | 标准互联与资产利用率 |\n"
                "| 配套保障 | 培训、维修、保险、数据与安全服务 | 专业服务费 | 责任界定与人才供给 |\n\n"
                "## 场景成熟度判断\n\n"
                "民航局披露的应用已覆盖农林植保、基础设施巡查、应急救援、医疗救护、物流和消费娱乐等领域 [2]。判断场景能否规模化，可以依次检查：是否存在高频任务、传统方案成本是否足够高、飞行路线能否标准化、恶劣天气下是否有替代方案，以及事故责任能否被保险和合同覆盖。\n\n"
                "深圳条例把基础设施、飞行服务、产业应用、技术创新和安全管理纳入同一制度框架，说明地方竞争正从单纯补贴制造项目转向建设完整运营环境 [3]。这类制度供给比短期招商数量更能决定产业留存。\n\n"
                "## 商业化路线建议\n\n"
                "1. 优先选择可量化节省人力、时间或安全成本的 B 端和公共服务场景。\n"
                "2. 用固定航线和标准任务积累飞行数据，再扩展动态调度。\n"
                "3. 将飞行器、运营平台、起降点、通信导航和监管接口作为一个系统验收。\n"
                "4. 地方政府应同时考核付费订单、飞行频次和安全记录，避免只统计签约项目。\n\n"
                "## 局限与风险\n\n"
                "低空经济统计口径仍在完善，各地公布的产业规模和项目数量未必可以直接横向比较。示范航线也不等于市场化盈利；补贴退出、空域协调、噪声、隐私、极端天气和事故责任都可能改变商业模型。报告没有使用未经核验的远期市场规模预测。"
            ),
        },
        {
            "title": "新能源汽车动力电池回收的产业闭环",
            "summary": "结合中国责任制度、欧盟电池法规与 IEA 供需研究，对比梯次利用、湿法回收和材料闭环的经济性与风险。",
            "mode": ResearchMode.DEEP,
            "focus": "分析责任主体、回收技术、原料供给和不同电池化学体系的经济性",
            "subqueries": [
                "中国动力电池回收责任体系如何运作？",
                "梯次利用与材料回收分别适合什么电池？",
                "电池化学体系和金属价格如何影响盈利？",
                "国际法规如何推动追溯、再生材料和供应链闭环？",
            ],
            "sources": [
                {
                    "url": "https://wap.miit.gov.cn/zcfg/jdcjxl/art/2026/art_640a0abfac6549feb6ead9c591b7680d.html",
                    "title": "工信部：新能源汽车废旧动力电池回收和综合利用管理暂行办法",
                    "snippet": "明确动力电池回收、综合利用、信息报送与相关主体责任。",
                },
                {
                    "url": "https://www.iea.org/reports/global-ev-outlook-2026/electric-vehicle-batteries",
                    "title": "IEA：Global EV Outlook 2026 电动汽车电池分析",
                    "snippet": "分析退役电池供给、全球回收产能、关键矿物与商业模式。",
                },
                {
                    "url": "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32023R1542",
                    "title": "欧盟电池与废电池法规 2023/1542",
                    "snippet": "规定电池供应链尽职调查、追溯和全生命周期责任框架。",
                },
                {
                    "url": "https://www.iea.org/reports/ev-battery-supply-chain-sustainability",
                    "title": "IEA：电动汽车电池供应链可持续性",
                    "snippet": "从全生命周期排放和关键矿物角度评估回收的作用。",
                },
            ],
            "report": (
                "# 新能源汽车动力电池回收的产业闭环\n\n"
                "> 研究问题：动力电池回收能否同时解决环境责任、关键矿物安全和企业盈利？\n\n"
                "## 核心结论\n\n"
                "动力电池回收的长期价值明确，但短期盈利并不自动成立。决定项目成败的核心变量是合规渠道能否获得稳定废旧电池、电池化学体系所含材料价值、检测拆解成本，以及生产者责任制度能否把环境成本转化为可支付的回收服务 [1][2]。\n\n"
                "当前大量新能源汽车电池仍在使用期，制造废料仍是重要原料来源；大规模退役电池供给存在时间差。与此同时，磷酸铁锂电池的材料价值低于含镍钴体系，使单纯依靠出售回收金属的商业模式承压 [2]。\n\n"
                "## 路径比较\n\n"
                "| 路径 | 适用条件 | 价值来源 | 主要风险 |\n"
                "| --- | --- | --- | --- |\n"
                "| 维修与再制造 | 电池包结构完好、故障可定位 | 延长车用寿命 | 安全责任和质保 |\n"
                "| 梯次利用 | 剩余容量可评估、场景要求较低 | 储能或备用电源收入 | 一致性检测、重组成本、新电池降价 |\n"
                "| 湿法冶金 | 需要回收锂、镍、钴等材料 | 再生金属销售 | 化学品、废水和价格波动 |\n"
                "| 火法及组合工艺 | 来料复杂、需要规模处理 | 合金与后续精炼 | 能耗高、部分材料回收难 |\n\n"
                "## 责任与追溯\n\n"
                "中国暂行办法强调汽车生产、动力电池生产、回收和综合利用等主体的责任衔接 [1]。欧盟法规则把供应链尽职调查、信息透明和全生命周期要求纳入统一框架 [3]。两者共同指向一个趋势：电池编码、流向记录、状态检测和再生材料证明将成为交易基础设施，而不只是合规文档。\n\n"
                "## 商业模式分析\n\n"
                "IEA 指出，回收能够降低对原生关键矿物的长期依赖并改善供应链韧性，但退役原料供给与已建设产能之间可能阶段性错配 [2][4]。因此，更稳健的模式包括与车企或电池厂签订长期回收协议、按处理服务收费、回收材料定向返供，以及把生产废料与退役电池组合运营。\n\n"
                "企业评估项目时应重点追踪：合规回收量、单位预处理成本、不同化学体系占比、金属回收率、材料返供合同覆盖率和安全事故率。\n\n"
                "## 局限与风险\n\n"
                "电池寿命、二手车跨区域流动、金属价格和新电池成本都会改变退役节奏与经济性。梯次利用并非所有电池的必经阶段，检测和重新认证成本可能高于其剩余价值。不同法规的实施日期和细则仍会调整，跨境经营需要持续核验最新要求。"
            ),
        },
    ]

    expected_titles = {example["title"] for example in examples}
    existing_titles = set(
        await session.scalars(
            select(Showcase.title)
            .join(ResearchRun, Showcase.run_id == ResearchRun.id)
            .where(ResearchRun.client_hash == "showcase")
        )
    )
    if existing_titles == expected_titles:
        return 0

    await session.execute(delete(ResearchRun).where(ResearchRun.client_hash == "showcase"))
    await session.flush()

    for example in examples:
        run = ResearchRun(
            client_hash="showcase",
            mode=example["mode"],
            query=example["title"],
            status=ResearchStatus.COMPLETED,
            plan={"focus": example["focus"], "subqueries": example["subqueries"]},
            snapshot={
                "metrics": {
                    "search_calls": len(example["subqueries"]),
                    "source_count": len(example["sources"]),
                    "citation_count": len(example["sources"]),
                    "duration_seconds": 128,
                }
            },
            created_at=now,
            updated_at=now,
        )
        for source_data in example["sources"]:
            run.sources.append(Source(**source_data))
        session.add(run)
        await session.flush()
        run.report = {
            "title": example["title"],
            "markdown": example["report"],
            "source_ids": [source.id for source in run.sources],
        }
        run.showcase = Showcase(
            title=example["title"],
            summary=example["summary"],
            created_at=now,
        )
    return len(examples)
