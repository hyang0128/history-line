# 中国历史时间线（history-line）实现计划

> 版本 0.5 · 2026-09-19 · 由三轮需求梳理形成，作为后续开发的基准文档。会话与 agent 分工见 §10，模型与成本策略见 §6.7。**M0、A1、A2、C1–C10（全史起草）已完成**；当前瓶颈是 318 篇 draft 的人工审核，下一步见 §11。历史状态：版本 0.4（2026-09-17，M0 完成、A1/A2 可以启动）。

---

## 1. 项目定位

**一句话**：一个以时间轴为骨架的中国历史自学网站，每个节点同时呈现正史记载、野史轶闻和名家评注，并标注史料可信度，让学习者既知道"发生了什么"，也知道"谁这么说、可信几分"。

**目标用户**：作者本人，自学用途。不做多人协作，不做账号系统。

**部署形态**：纯静态站，本地预览 + GitHub Pages。

**非目标（明确不做）**：
- 不做后端、数据库、登录、评论。
- 不做学术级考证，只做"有出处、可追溯"的学习资料。
- 第一版不做地图、关系图、测验，这些进入后续阶段。
- 不收录演义小说与民间传说（如《三国演义》情节），野史只取古代笔记、杂史。

---

## 2. 需求决策表

| 议题 | 决策 |
|---|---|
| 时间范围 | 上古（传说时代）至 2000 年前后 |
| 近现代粒度 | 从简：只收关键节点，正史以官方公开史料为主，野史与批注从严 |
| 主轴粒度 | 分期 → 朝代 → 事件/人物 三层 |
| 节点类型 | 事件（主体）、人物、制度/专题、同期世界史对照 |
| 三类内容生产 | AI 辅助起草，人工逐条审核后才发布 |
| AI 生成方式 | 先在 Claude Code 会话中磨模板，再固化为脚本批量调用 Claude API |
| 第一版体量 | 300–500 个节点 |
| 名家批注来源 | 古代史论（公版，可引原文）、近现代学者（转述观点，标出处）、政治人物与当代普及作者（转述）、AI 综述学界共识与分歧（单独标记） |
| 野史范围 | 古代笔记、杂史（《世说新语》《酉阳杂俎》《唐语林》《万历野获编》等） |
| 可信度 | 每条内容标注可信度等级 |
| 引文形式 | 正文以白话为主；公版古籍允许短句引原文并附白话（见 §3.4 假设） |
| 技术栈 | Astro + Markdown 内容集合；时间轴、地图等交互作为独立"岛"组件补充 |
| 炫酷范围 | 可缩放无级时间轴（第一版核心体验）、地图/疆域变迁（后续）、关系图/测验/进度（后续） |

---

## 3. 内容模型

### 3.1 分期骨架

主轴顶层固定为以下分期（era），每个分期下挂朝代（dynasty），朝代下挂节点。分期和朝代本身也是节点，有自己的页面和概述。

| 分期 id | 名称 | 大致区间 |
|---|---|---|
| prehistoric | 传说与上古 | 约前 2100 之前 |
| xia-shang-zhou | 夏商周 | 前 2070–前 771 |
| spring-autumn-warring | 春秋战国 | 前 770–前 221 |
| qin-han | 秦汉 | 前 221–220 |
| wei-jin-nanbei | 三国两晋南北朝 | 220–589 |
| sui-tang-wudai | 隋唐五代 | 581–960 |
| song-liao-jin-yuan | 宋辽金元 | 960–1368 |
| ming | 明 | 1368–1644 |
| qing | 清 | 1636–1912 |
| republic | 民国 | 1912–1949 |
| prc | 新中国（至 2000 年前后） | 1949–2000 |

近现代两个分期采用"从简"规则：只收教科书级关键节点，每节点野史块可为空，批注块以公开出版的学者著作转述为主。

### 3.2 节点类型

| type | 说明 | 轴上表现 | 时间字段 |
|---|---|---|---|
| event | 有明确年份的事件，时间轴基本单位 | 点 | start（end 可选） |
| person | 帝王、名臣、思想家等 | 生卒区间横条 | start=生年, end=卒年 |
| topic | 跨朝代制度或专题（科举、均田制、三省六部） | 跨越多朝的横条，单独轨道 | start, end |
| world | 同期世界史对照（罗马、伊斯兰扩张、大航海） | 独立对照轨道上的点 | start |
| era / dynasty | 分期与朝代 | 背景色带 | start, end |

节点之间用 `related` 字段互相链接（事件↔人物、事件↔专题），第一版只做链接，关系图放到后续阶段。

### 3.3 节点文件格式

内容存放为 Markdown，一个节点一个文件，frontmatter 用 Astro 内容集合的 zod schema 校验。

```
content/
  eras/            分期与朝代
  events/          事件
  persons/         人物
  topics/          制度与专题
  world/           世界史对照
```

示例 `content/events/tang/anshi-zhi-luan.md`：

```markdown
---
id: anshi-zhi-luan
type: event
title: 安史之乱
date:
  start: 755
  end: 763
  precision: year        # year | month | day | circa | century
era: sui-tang-wudai
dynasty: tang
importance: 5            # 1–5，缩放时决定显示层级
tags: [战争, 藩镇, 转折点]
location: 范阳、长安、洛阳
related: [an-lushan, tang-xuanzong, guo-ziyi, fanzhen]
status: draft            # draft | reviewed | published
generated_by: claude-fable-5-1
reviewed_at:
---

## 概述
（白话，200–400 字，说明起因、经过、结果与影响。）

## 正史
- source: 《资治通鉴》卷二百一十七
  credibility: A
  text: 天宝十四载十一月，安禄山以诛杨国忠为名起兵范阳……
  quote: 甲子，禄山发所部兵及同罗、奚、契丹、室韦凡十五万众……
- source: 《旧唐书·安禄山传》
  credibility: A
  text: ……

## 野史
- source: 《开元天宝遗事》
  credibility: C
  text: 记载安禄山进京时的种种异象……
  note: 五代人所辑，多附会之说。

## 批注
- author: 司马光
  source: 《资治通鉴》卷二百一十六"臣光曰"
  license: public-domain
  quote: ……
  text: 司马光认为玄宗晚年怠于政事、用人失当是祸乱根源。
- author: 陈寅恪
  source: 《唐代政治史述论稿》中篇
  license: paraphrase
  text: 陈寅恪从种族与文化角度分析河北藩镇……（转述，不引原文）
- author: AI 综述
  license: ai-synthesis
  text: 学界共识：……。分歧点：……。
```

三类内容块用 Markdown 二级标题固定为"正史 / 野史 / 批注"，每块正文是一个 YAML 列表，构建时由 `src/lib/parse-blocks.ts` 用 zod 校验并解析为结构化数据。M0 已按此实现，字段定义以 `docs/style-guide.md` §3 为准（批注条目比上面示例多一个 `category` 字段，用于前端分组）。

### 3.4 可信度等级

| 等级 | 含义 | 典型来源 |
|---|---|---|
| A | 正史或同时代官方记录，多源印证 | 二十四史、《资治通鉴》、实录、档案 |
| B | 正史记载但存在争议，或后世重要史书转录 | 《资治通鉴》晚出部分、《续资治通鉴》 |
| C | 笔记、杂史、私人著述，有一定史料价值 | 《世说新语》《万历野获编》 |
| D | 传说、孤证、明显附会 | 谶纬、志怪类记载 |

**关于引原文的假设**：你在批注来源里勾选了"古代史论可引原文"，但在引文处理里没有勾"保留文言原文 + 白话译"。计划采用的折中：正文一律白话；公版古籍的关键句可在 `quote` 字段保留原文，前端默认折叠、点击展开。非公版来源不设 `quote`。若你想全站都不出现文言，删掉 `quote` 字段即可。

### 3.5 版权规则

| license | 适用 | 允许做的事 |
|---|---|---|
| public-domain | 作者逝世超过 50 年的古籍与史论 | 引原文、白话翻译 |
| paraphrase | 陈寅恪（1969 年卒，部分已公版）、钱穆、吕思勉、黄仁宇、当代学者与普及作者 | 只转述观点，标注书名与章节，不成段引用 |
| ai-synthesis | AI 综述的学界共识与分歧 | 必须标为 AI 综述，不冒充具体学者 |

政治人物的读史批注归入 paraphrase，并在展示时加"观点鲜明、存在争议"提示。

---

## 4. 三类内容的呈现方案比较

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| A. 展开面板分三个标签页 | 轴上一个节点；点开后面板顶部有"正史 / 野史 / 批注"三个 tab | 轴上干净；三类内容天然平级；实现简单 | 不点开看不到某节点是否有野史或批注 |
| B. 三条平行轨道 | 正史、野史、批注各占一条横向轨道，同一时间点上下对齐 | 一眼看出"谁在说什么" | 野史和批注都是围绕同一事件的，拆成三条轨会大量出现重复标题；批注往往针对一个时代而不是单个时间点，放不到轨上 |
| C. 正史为主，野史批注作旁注 | 主轴只放正史；面板里野史与批注是折叠的旁注 | 突出"正史为纲" | 弱化了野史与批注的地位，与"三类平等呈现"的初衷有出入 |

**推荐：A 为主，吸收 B 的信息密度。**
- 轴上节点用三个小色标（例如青、赭、金）表示该节点分别有无正史、野史、批注内容，鼠标悬停显示各自条数。
- 展开面板默认打开"正史"标签；野史标签内每条前置可信度徽章；批注标签按"古代史论 / 近现代学者 / 当代 / AI 综述"分组。
- "平行轨道"的思路留给不同**节点类型**：人物轨、专题轨、世界史轨，而不是同一事件的不同叙述。

---

## 5. 技术架构

### 5.1 选型

| 层 | 选型 | 理由 |
|---|---|---|
| 站点框架 | Astro 5 + TypeScript | 内容集合原生支持 Markdown + schema 校验；默认零 JS，交互按需加岛；GitHub Pages 官方支持 |
| 内容存储 | Markdown + YAML frontmatter | 可读、可 diff、AI 与人都容易编辑 |
| 时间轴组件 | 原生 TS 岛组件，Canvas 渲染 + d3-zoom / d3-scale | 无级缩放、拖拽、语义缩放需要自己控制绘制；500 节点 Canvas 轻松，后期万级也不怕 |
| 详情面板 | Astro 组件 + 少量原生 JS | 内容是静态 HTML，SEO 与可读性好 |
| 搜索 | Pagefind | 纯静态全文搜索，构建时生成索引，支持中文 |
| 样式 | 原生 CSS 变量 + 少量工具类 | 不引入 Tailwind，减少构建依赖；支持深浅色 |
| 地图（后续） | 2D 先行：MapLibre GL 或 D3 地理投影 + 历史疆域 GeoJSON；three.js 只用于首页地球或视觉演出 | 历史疆域数据本身是大工程，先 2D 验证 |
| 关系图（后续） | 基于 `related` 字段用 d3-force 生成 | 数据已有，只加视图 |
| 进度/收藏（后续） | localStorage | 单人使用，不需要后端 |
| AI 生成脚本 | Node + TypeScript，通过统一的 provider 接口调用模型 | 与站点同一语言，脚本与 schema 共用类型；provider 可插拔，支持 DeepSeek、GLM、Kimi、Claude 等，见 §6.7 |
| 部署 | GitHub Actions → GitHub Pages | 推送即发布 |

### 5.2 目录结构

```
history-line/
  PLAN.md
  README.md
  package.json
  astro.config.mjs
  content/                    内容（见 §3.3）
    eras/ events/ persons/ topics/ world/
  src/
    content.config.ts         zod schema（Astro 5 要求放在 src/ 下）
    components/
      Timeline/               Canvas 时间轴岛组件（A2）
      NodePanel.astro         展开面板（三 tab，M0 已实现）
      NodeList.astro          纵向列表（M0）
      CredibilityBadge.astro
      SourceCite.astro / CommentaryCite.astro
    layouts/
    pages/
      index.astro             时间轴主页
      era/[id].astro          分期与朝代页
      [type]/[id].astro       节点独立页，type 为 event/person/topic/world
      about.astro             凡例：可信度、版权、AI 生成说明
    lib/
      parse-blocks.ts         解析"概述/正史/野史/批注"四块（不可变接口）
      nodes.ts                统一读取集合、排序、年份格式化
      timeline-index.ts       构建时输出精简 JSON 供时间轴用（A2）
  public/styles/base.css      全站样式与深浅色变量
  scripts/
    generate/
      prompts/                系统提示词与模板
      providers/              统一模型接口：openai-compatible、anthropic
      models.yaml             模型登记表：端点、单价、档位映射
      queue.yaml              待生成清单
      run.ts                  批量调用模型产出 draft，带费用估算与本地缓存
    validate.ts               schema、来源、可信度、状态校验
    stats.ts                  各朝代节点数、审核进度、累计花费
  docs/
    style-guide.md            编写规范与审核清单
    prompts.md                提示词演进记录
    model-eval.md             多模型评测结果与档位决定
    worklog.md                各 agent 工作记录
```

### 5.3 时间轴交互设计

- **语义缩放**：最缩小只显示分期色带与 importance=5 的节点；每放大一档多显示一级 importance；最大放大显示全部节点与人物生卒条。
- **轨道**：从上到下为 事件轨、人物轨、专题轨、世界史轨，可分别开关。
- **导航**：顶部朝代快捷条点击跳转；键盘左右键移动、加减键缩放。
- **深链**：URL hash 记录当前视口区间与选中节点，如 `#t=700..800&n=anshi-zhi-luan`，方便回到上次位置。
- **详情**：点击节点在右侧或下方打开面板，面板内容来自预渲染的节点页面片段，不需要额外请求整站数据。
- **筛选**：按 tags、可信度、是否有批注筛选。
- **性能**：时间轴只加载 `timeline-index.json`（每节点约 200 字节，500 节点约 100 KB），详情按需取。

### 5.4 页面清单（第一版）

1. 首页：全站时间轴。
2. 分期/朝代页：概述 + 该朝代节点列表 + 局部时间轴。
3. 节点页：完整三类内容 + 关联节点 + 上一个/下一个。
4. 搜索页。
5. 凡例页：可信度定义、版权说明、AI 生成与审核流程说明。

---

## 6. 内容生产管线

### 6.1 总流程

```
queue.yaml（待生成清单）
   ↓ scripts/generate/run.ts 调用 Claude API
content/**/xxx.md（status: draft）
   ↓ 人工审核：核对出处、删改、补充
content/**/xxx.md（status: reviewed）
   ↓ scripts/validate.ts 通过
构建时只发布 reviewed 与 published；draft 在本地预览可见但带醒目水印
```

### 6.2 阶段一：会话磨模板

在 Claude Code 会话中手工生成 10 个样例节点（建议选唐朝：玄武门之变、贞观之治、武周代唐、开元盛世、安史之乱、两税法、元和中兴、甘露之变、黄巢起义、朱温篡唐），目的：
- 定下 Markdown 模板与字段。
- 定下每类内容的字数、语气、引用格式。
- 摸清 AI 在出处上的可靠程度，形成审核清单。
- 把最终提示词沉淀到 `scripts/generate/prompts/`。

### 6.3 阶段二：脚本批量生成

- `queue.yaml` 每行一个节点：id、type、title、朝代、粗略年份、importance。清单本身可先让 AI 按朝代拟出，再人工删减。
- `run.ts`：读取队列 → 拼装提示词（系统提示 + 模板 + 节点元数据）→ 要求结构化输出 → 写入 Markdown → 标记 draft。支持断点续跑、并发上限、失败重试、成本统计。
- 模型选择：见 §6.7，默认走国产低价模型，Claude 只用于抽检和疑难节点。

### 6.4 提示词约束（写进系统提示）

- 只引用真实存在的书名、卷次、篇名；不确定时写"出处待核"，禁止编造。
- 公版来源可给原文短句；非公版来源只转述，不得输出成段原文。
- 每条必须给可信度等级和理由。
- 批注块必须区分"某人观点"与"AI 综述"，AI 综述要写明共识与分歧。
- 近现代节点：野史块留空，批注只用公开出版物。
- 输出严格按模板，方便解析。

### 6.5 审核清单

1. 每条出处能在中国哲学书电子化计划、维基文库或纸质书中查到。
2. 引原文的地方与原书一致。
3. 转述的学者观点与其著作一致，没有张冠李戴。
4. 可信度等级与来源类型相符。
5. 年份与公元换算正确（尤其干支、年号纪年）。
6. 近现代节点符合从简规则。

审核通过后把 `status` 改为 reviewed 并填 `reviewed_at`。`validate.ts` 强制：reviewed 节点每条内容必须有 source、credibility、license。

### 6.6 内容分批顺序

按学习兴趣和史料丰富度排序，建议：唐 → 秦汉 → 三国两晋南北朝 → 宋 → 明 → 清 → 春秋战国 → 夏商周与上古 → 元 → 五代辽金 → 民国 → 新中国。每批完成后跑 `stats.ts` 看分布，避免某朝代过密。

### 6.7 模型与成本策略

**原则**：内容生成的成本大头在批量起草，起草阶段用国产低价模型；Claude 只做少量高价值工作。所有模型调用都经过统一 provider 接口，换模型只改配置不改代码。

**provider 接口**（`scripts/generate/providers/`）：

- 统一签名：`complete({ system, messages, temperature, maxTokens }) → { text, usage }`。
- 首批实现：`openai-compatible`（覆盖 DeepSeek、GLM、Kimi/Moonshot，它们都提供 OpenAI 兼容端点，只需 baseURL、model、apiKey 三个配置项）和 `anthropic`。
- 配置文件 `scripts/generate/models.yaml`：每个模型登记 provider、baseURL、model id、输入/输出单价、上下文长度、是否支持 JSON 输出。单价在实现时从各家官网核对后填入，不凭记忆写死。
- API key 一律从环境变量读取，不入库。

**按任务分级用模型**（`queue.yaml` 每条可覆盖，未指定时按此默认）：

| 任务 | 默认模型档位 | 说明 |
|---|---|---|
| 拟节点队列（列朝代大事清单） | 低价档 | 输出短，人工删减为主 |
| 事件/人物起草：概述 + 正史 + 野史 | 低价档 | 体量最大，占总成本 80% 以上 |
| 批注块（含 AI 综述） | 中价档 | 需要更强的知识面与分寸感 |
| importance=5 节点或人工审核打回重写 | 高价档（Claude） | 数量少 |
| 抽检：随机 10% draft 让第二个模型复核出处 | 中价档 | 交叉验证比单模型自审更可靠 |

档位到具体模型的映射放在 `models.yaml`，初始建议：低价档 DeepSeek 或 GLM 系列，中价档 Kimi 或 DeepSeek 推理型，高价档 Claude。实测后按"出处准确率 / 单价"调整。

**成本控制手段**：

- 先用 10 个样例节点在候选模型上各跑一遍，记录 token 用量与人工审核发现的错误数，据此定档位映射并写入 `docs/model-eval.md`。
- `run.ts` 每次运行前按队列条数与历史平均 token 估算费用，超过阈值（默认 ¥20）需要 `--yes` 确认。
- 系统提示词精简且固定，利于各家的前缀缓存；节点元数据放在用户消息末尾。
- 输出用紧凑模板，`maxTokens` 按任务上限设置，避免模型发挥。
- 断点续跑与失败重试基于本地缓存，同一节点同一提示词不重复付费。
- `stats.ts` 汇总累计花费，按模型与任务分类。

**Claude Code 会话本身的成本**：

- 各 agent 会话只领一个任务包，开工先读 PLAN.md 与 style-guide，不做全仓探索。
- 内容审核（C 系列）主要是人工核对出处，不要让 agent 逐条"重新生成"，agent 只负责跑脚本、汇总待核对清单、按人工意见修改。
- 大批量生成一律走脚本，不在会话里逐条让 agent 写内容；会话内生成只限 M0 的 10 个样例。

---

## 7. 路线图

| 里程碑 | 内容 | 产出 | 预估 | 执行者 |
|---|---|---|---|---|
| M0 脚手架 | Astro 初始化、内容 schema、解析三块的脚本、分期与朝代数据、10 个唐朝样例节点、纵向简单时间轴、节点页 | 本地可跑的最小站点 | 1 周 | 规划会话（本会话） |
| M1 内容管线 | 提示词固化、`run.ts`、`validate.ts`、`stats.ts`、审核流程文档、唐朝 50 节点 | 可批量产内容并校验 | 1–2 周 | A1 + 首个 C 批次 |
| M2 时间轴 | Canvas 无级缩放、四条轨道、语义缩放、深链、筛选、Pagefind 搜索、深浅色 | 第一版核心体验完成 | 2 周 | A2、A3 |
| M3 内容铺满 | 按 §6.6 顺序生成并审核到 300–500 节点；人物、专题、世界史节点补齐 | 内容达标 | 4–8 周，与 M2 并行 | C 系列 |
| M4 部署 | GitHub Actions、Pages、README、凡例页 | 公网可访问 | 2 天 | A4 |
| M5 炫酷一期 | 关系图（d3-force）、学习进度与收藏（localStorage） | 学习辅助上线 | 1–2 周 | B1 |
| M6 炫酷二期 | 2D 历史疆域地图，事件面板联动地图；首页 three.js 视觉演出 | 地图上线 | 3–4 周，疆域数据是主要工作量 | B2、B3 |
| M7 炫酷三期（可选） | 测验生成、three.js 3D 地图 | 视精力而定 | 未估 | 待定 |

M0 到 M2 完成即为"可用第一版"，M3 是持续过程。

---

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| AI 编造出处或篡改引文 | 系统提示禁止编造；每条必须人工核对；未审核内容不发布；凡例页公开说明生成流程 |
| 版权 | license 字段强制；非公版只转述；构建时校验 paraphrase 条目不含 quote |
| 近现代内容敏感或争议 | 从简规则；野史留空；批注只用公开出版物；争议节点只写事实脉络 |
| 内容量上来后时间轴卡顿 | Canvas 渲染 + 索引 JSON + 语义缩放，设计时按 5000 节点考虑 |
| 范围蔓延（地图、3D 等） | 严格按里程碑，M2 之前不碰 three.js |
| 审核疲劳导致质量下滑 | 每批不超过 50 节点；`stats.ts` 显示 draft 积压；先审 importance 高的 |
| 生成费用失控 | provider 可插拔，默认低价国产模型；运行前费用估算与阈值确认；本地缓存避免重复付费；`stats.ts` 累计花费；详见 §6.7 |
| 低价模型编造出处比例更高 | 10 样例多模型对比评测后再定档位；批注块与高重要度节点升档；随机 10% 交叉复核 |
| 干支年号换算错误 | 提示词要求同时给出年号纪年与公元，validate 抽查；后续可加换算表校验 |

---

## 9. 待确认与假设

1. **原文引用**：按 §3.4 的折中执行，默认折叠原文。
2. **三类呈现**：按 §4 推荐方案 A + 色标执行。
3. **人物节点**：第一版只做帝王与 importance≥4 的关键人物，约 60–80 人；其余人物以"提及"方式出现在事件文本里。
4. **世界史对照**：第一版约 40–60 条，只做点不做展开三块，内容为一段白话概述。
5. **语言**：简体中文；界面文案不做多语言。
6. **AI 模型与费用**：按 §6.7 执行，档位到模型的映射在 A1 的多模型评测后确定；本会话的 10 个样例由 Claude Code 会话直接生成，不产生 API 费用。
7. **provider 实现范围**：第一版只做 OpenAI 兼容与 Anthropic 两种协议，覆盖 DeepSeek、GLM、Kimi、Claude；其他厂商如有需要再加。

---

## 10. 会话与 agent 分工

### 10.1 总原则

- **规划会话**只做两件事：产出样例（内容模板 + 最小可跑的样例站）和维护本计划。它是所有其他 agent 的"标准来源"。
- **实现 agent** 各自新开会话，只领取本节列出的任务包，不改内容模型和目录结构；需要改的先回到规划会话讨论并更新 PLAN.md。
- 每个 agent 开工时先读 `PLAN.md` 和 `docs/style-guide.md`，完工时在 `docs/worklog.md` 追加一条记录（日期、agent 名、任务包、改动文件、遗留问题）。
- 各 agent 在自己的 git 分支工作，规划会话负责合并到 main。

### 10.2 规划会话（本会话）

| 项 | 值 |
|---|---|
| 角色 | 规划与样例 |
| session id | `23c6af53-ec6f-47ed-bd7e-1896e51cb396` |
| 恢复方式 | 在 `D:\AItest\history-line` 目录下执行 `claude --resume 23c6af53-ec6f-47ed-bd7e-1896e51cb396` |
| 交付物 | 见下 |

本会话的交付物（即 M0 的全部内容，**2026-09-17 已完成**，细节见 docs/worklog.md）：

1. `PLAN.md`：本文件，持续补全。✅
2. `git init` 与 `.gitignore`，首个提交。✅
3. Astro 项目骨架：`package.json`、`astro.config.mjs`、`src/content.config.ts`（zod schema）、`src/lib/parse-blocks.ts`。✅
4. 分期与朝代数据：`content/eras/` 全部 11 个分期加 24 个朝代。✅
5. 10 个唐朝样例事件 + 1 个人物样例（李世民），status 为 reviewed，但为规划会话自审，卷次待核项已列入 worklog。✅
6. 最小可跑页面：首页纵向列表时间轴、节点页（三 tab 面板）、分期页、凡例页。`npm run build` 生成 48 页，`astro check` 无错误。✅
7. `docs/style-guide.md`：编写规范、字段含义、审核清单。✅
8. `scripts/generate/prompts/system.md` 与 `node-template.md`，`docs/prompts.md` 记录演进。✅
9. `docs/worklog.md` 初始化。✅

本会话**不做**：Canvas 时间轴、批量生成脚本、部署、任何炫酷功能。

### 10.3 实现 agent 任务包

每个任务包对应一个新会话。启动时的第一条指令统一为：

> 读取 `PLAN.md` 与 `docs/style-guide.md`，领取任务包 `<编号>`，在分支 `<分支名>` 上实现，完成后更新 `docs/worklog.md`。不修改 `content.config.ts` 与 `content/` 目录结构；如需修改，停下来说明原因。

| 编号 | 名称 | 里程碑 | 分支 | 依赖 | 范围 | 交付物与验收 |
|---|---|---|---|---|---|---|
| A1 | 内容生成管线 | M1 | `feat/pipeline` | M0 完成 | provider 接口与 `openai-compatible`、`anthropic` 两个实现；`models.yaml` 与档位映射；`scripts/generate/run.ts`、`queue.yaml` 格式、断点续跑、本地缓存、并发与重试、费用估算与阈值确认、成本统计；`scripts/validate.ts`；`scripts/stats.ts`；用 10 个样例做多模型评测并写 `docs/model-eval.md` | 用队列在低价档模型上生成 5 个新唐朝节点为 draft 且通过 validate；切换 `models.yaml` 即可换模型，代码不改；validate 能拦截缺 source、缺 credibility、paraphrase 含 quote 三种错误；重复运行同一队列不产生新费用；README 写明用法与费用说明 |
| A2 | Canvas 时间轴 | M2 | `feat/timeline` | M0 完成 | `src/components/Timeline/`：Canvas + d3-zoom 无级缩放、四条轨道开关、语义缩放（按 importance）、URL hash 深链、键盘导航、点击打开节点面板；`src/lib/timeline-index.ts` 构建时输出精简 JSON | 用 M0 的样例与分期数据跑通；用脚本造 3000 个假节点测试不掉帧；面板三 tab 与色标按 §4 实现 |
| A3 | 搜索、筛选、主题 | M2 | `feat/search` | A2 合并后 | Pagefind 集成、按 tags/可信度/内容类型筛选、深浅色主题、移动端适配 | 中文搜索可命中正文与出处；筛选状态写入 URL |
| A4 | 部署与凡例 | M4 | `feat/deploy` | A2 合并后 | GitHub Actions 构建到 Pages、`about.astro` 凡例页、README、构建时只发布 reviewed/published 且本地预览 draft 带水印 | 推送 main 后公网可访问；draft 节点不出现在线上 |
| C1…Cn | 内容批次 | M3 | `content/<朝代>` | A1 合并后 | 按 §6.6 顺序，每个会话领取一个朝代或一个 50 节点以内的批次：拟队列 → 跑 run.ts → 逐条人工审核 → reviewed | 每批通过 validate；stats 显示该批 draft 为 0；worklog 记录出处存疑的条目 |
| B1 | 关系图与学习进度 | M5 | `feat/graph` | A2、至少 200 个 reviewed 节点 | d3-force 关系图页、localStorage 收藏与已读进度 | 关系图能从 `related` 字段生成并可从节点页跳转 |
| B2 | 历史疆域地图 | M6 | `feat/map` | A2 合并后 | 2D 地图（MapLibre 或 D3 投影）、疆域 GeoJSON 数据来源调研与整理、节点面板联动 | 至少 5 个朝代疆域可切换；数据来源与许可写入凡例 |
| B3 | 首页视觉演出 | M6 | `feat/hero` | A2 合并后 | three.js 首页入场与朝代过渡效果，必须可关闭且不阻塞时间轴加载 | 关闭效果后首页首屏 JS 不增加；低性能设备自动降级 |

内容批次（C 系列）与前端任务包（A、B 系列）互不阻塞，可以并行开会话。A1 与 A2 都只依赖 M0，可同时启动。

### 10.4 交接约定

- **不可变接口**：`src/content.config.ts` 中的 schema、`src/lib/parse-blocks.ts` 输出的数据结构、`timeline-index.json` 的字段。任何 agent 需要新增字段时，先在 worklog 提出，由规划会话改 schema 并更新 PLAN.md。
- **样例即规范**：10 个唐朝样例节点是格式与质量的裁判，内容 agent 生成的内容与其对比。
- **合并顺序**：A1、A2 → A3、A4 → C 系列持续 → B 系列。
- **冲突处理**：多个 agent 同时改 `docs/worklog.md` 时只追加不修改，冲突时保留双方。

## 11. 当前状态与下一步

### 11.1 状态速览（2026-09-19）

| 里程碑 | 状态 |
|---|---|
| M0 骨架与样例 | ✅ 完成（合并 main） |
| M1 内容管线（A1） | ✅ 完成（provider 可插拔、Ark/DeepSeek 真实实跑） |
| M2 时间轴（A2） | ✅ 完成（Canvas 无级缩放/四轨/语义缩放/深链/键盘；3000 假节点 bench <1ms；浏览器实跑待人工复验） |
| M3 内容起草（C1–C10） | 🟡 起草完成但未审核：329 节点（318 draft + 11 reviewed），validate 0 错误；**418 处"（AI收集）"学者观点、565 处"待核"标记待人工核对** |
| A3 搜索/筛选/主题 | ⬜ 未开始 |
| M4 部署（A4） | ⬜ 未开始（含构建时 draft 过滤，上线安全前提） |
| B 系列（M5–M7） | ⬜ 阻塞：B1 需 ≥200 reviewed 节点 |
| 账务 | ⬜ models.yaml 单价仍为示例（Ark=¥0），待账单回填；model-eval.md 定稿未做 |

### 11.2 下一步（决策 · 2026-09-19）

**唯一瓶颈是 318 篇 draft 的人工审核**（含 505 处引文、446 条"（AI收集）"观点）。功能与审核无依赖关系，应并行推进，四条线：

1. **立刻启动 · A3 搜索/筛选/主题**（新会话，分支 `feat/search`，任务包 §10.3）——完成「可用第一版」（M0–M2）。搜索在审核期即可用：按 tags/可信度筛选能帮助定位问题节点，不纯是锦上添花。
2. **同步并行 · A4 部署**（新会话，分支 `feat/deploy`）——构建时只发布 reviewed/published、本地预览 draft 带水印、GitHub Actions → Pages、凡例页。上线前的安全项，建议在首个公网上线前完成。
3. **主线程 · C11 内容审核**（人工 + C 系列会话，按 §6.5 清单）— 优先级按 importance 降序：73 个 importance=5 → 144 个 importance=4 → 101 个 importance=3 → 11 个 importance=2。时间轴基准缩放只显示 imp5，先把 62 个未审核 imp5 审完，站点骨架即成立；累计 ≥200 reviewed 同时解锁 B1。agent 只做机械活（补 `related`、跑 review/fixup、回写审核结果），人工只核出处/引文/学者观点三类实质项。补跑 queue.yaml 剩余 2 条。
4. **顺手账务补齐**（任意会话）：Ark 账单到手后回填 models.yaml 真实单价 → 跑 `gen:eval --run` 定档 → 写 model-eval.md 定稿；顺带用另一模型交叉复核 M0 的 11 条样例（A1 遗留）。

**合并顺序**：A3、A4 各自分支完成后由规划会话合并 main；C11 审核结果按朝代分批提交。A3/A4 与 C11 可同时进行。

---

## 12. 历史决策附注

> 2026-09-19：定稿 §11 时用户的判断——下一任务取 A3；与 A4 并行，C11 审核持续进行。此节留作后续决策的可见附注。
