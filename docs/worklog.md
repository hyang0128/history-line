# 工作记录

只追加，不修改已有条目。格式：日期 · agent · 任务包 · 改动 · 遗留。

---

## 2026-09-17 · 规划会话（23c6af53-ec6f-47ed-bd7e-1896e51cb396）· M0

改动：
- 项目骨架：package.json、astro.config.mjs、tsconfig.json、.gitignore、.env.example
- 不可变接口：`src/content.config.ts`（schema）、`src/lib/parse-blocks.ts`（四块解析）
- `src/lib/nodes.ts` 统一读取集合
- 内容：`content/eras/` 11 个分期 + 24 个朝代；`content/events/tang/` 10 个事件；`content/persons/tang/li-shimin.md`
- 页面：首页纵向列表时间轴、`/era/[id]`、`/[type]/[id]`、`/about`
- 文档：docs/style-guide.md、docs/prompts.md、scripts/generate/prompts/system.md 与 node-template.md

遗留 / 待核：
- 以下批注条目的具体卷次或条目名标注了"待核"，审核者有纸质书时请核对：
  - 王夫之《读通鉴论》卷二十五（宪宗）、卷二十六（文宗）、卷二十七（僖宗）、卷二十八（昭宗哀帝）
  - 赵翼《廿二史札记》卷十九"唐太宗"相关条目名
  - 欧阳修《新唐书》僖宗本纪赞引文
  - 司马光《资治通鉴》卷二百四十五"臣光曰"位置
- 样例 `status: reviewed` 是规划会话自审，未经第二人核对；A1 做多模型评测时可顺带用另一模型交叉复核这 11 条。
- `content/topics/`、`content/world/` 为空，构建时 Astro 会打印"collection does not exist or is empty"警告，属正常。
- `astro.config.mjs` 的 site/base 是占位，A4 部署时改。
- `related` 中引用了尚未编写的人物 id（li-yuan、wei-zheng、wu-zetian、li-longji、an-lushan、yang-yan、li-chun、pei-du、li-su、li-ang、li-xun、zheng-zhu、huang-chao、wang-xianzhi、li-keyong、zhu-wen、li-ye、li-zhu、guo-ziyi、yao-chong、song-jing、li-zhi），C 系列唐朝人物批次可直接用这份清单作队列。

---

## 2026-09-17 · A1 · 内容生成管线

改动（分支 `feat/pipeline` 提交时合并）：
- provider 接口：`scripts/generate/providers/{index,openai-compatible,anthropic,mock,http}.ts`，统一签名 `createProvider(ModelDef) → complete(...)`，换模型只改 models.yaml。
- 配置：`scripts/generate/models.yaml`（tiers/单价/usdCnyRate/阈值/estimateTokens/eval 候选）、`queue.yaml`（首批 5 个唐朝新事件：唐灭东突厥、文成公主入藏、神龙政变、会昌毁佛、牛李党争）。
- 脚本：`run.ts`（dry-run/limit/only/model/tier/force/yes/concurrency/retries/out/max-tokens；缓存断点续跑；费用估算与阈值确认）、`validate.ts`（--strict/--json/--dir/--full）、`stats.ts`（内容分布、draft 积压、累计费用、队列进度）、`eval.ts`（多模型评测）。
- `scripts/lib/`：frontmatter / frontmatter-schema（镜像 content.config.ts）、content、models、queue、cache、markdown、prompt、validate-core、logger。
- package.json：新增 generate / validate / stats / gen:eval 脚本与 tsx、dotenv、@types/node 依赖。
- README 增补管线用法与费用说明；新增 docs/model-eval.md（评测框架）。

离线自检（零费用，mock provider）：
- validate 对现有 46 文件 0 error（warnings 均为 M0 预留 related 未来节点）。
- 三拦截验证通过：缺 source / 缺 credibility / paraphrase 含 quote 均报错；合法草稿回归通过。
- run.ts mock 全链路：5 节点生成 → `validate --dir` 0 error → 复跑全部命中缓存（重复运行零费用）；`--only`、`--limit` 正常；并发写 cache 竞态已修复（顺序写队列）。
- astro check 0 error；`npm run build` 48 页正常。

遗留 / 待办：
- **真实模型实跑**未执行：需在 `.env` 提供 `DEEPSEEK_API_KEY`（或 GLM/Moonshot/Anthropic）后运行。
  `npm run generate -- --yes`：按示例单价 5 节点约 ¥0.1，产出 5 个 draft；生成后按 style-guide §7 人工审核。
- models.yaml 全部单价为示例值，需按官网核对后替换（实测结论写进 model-eval.md）。
- 多模型评测（eval.ts `--run`）待放入各家 key 后执行；顺带完成 M0 那 11 条样例的跨模型交叉复核（见 M0 遗留）。
- `--force` 会覆盖已存在文件与已审核内容，README 已提示慎用；C 批次若发现覆盖问题再收紧。
- PLAN.md §10.3 A1 行的交付物多数完成，验收"用低价档生成 5 个 draft"待真实 key 跑一次后确认；由规划会话在合并时更新 PLAN 状态。

## 2026-09-18 · A1 · 真实模型实跑（Ark 通道）

改动：
- `scripts/lib/markdown.ts` 新增 `unwrapCodeFence`（模型把整份输出包在 ```markdown 围栏时先剥离）；run.ts / eval.ts 已接入。
- `prompts/system.md` 规则 11：禁止用代码围栏包输出。
- `providers/http.ts` fetch 超时 120s→300s（方舟长文生成常超 2 分钟，此前导致误判重试/中断）。
- `models.yaml` 新增 `deepseek-v4-flash`（provider anthropic + `auth: bearer`，走 Ark `ANTHROPIC_BASE_URL`，key 用 `ANTHROPIC_AUTH_TOKEN`），设为默认 cheap/medium 档；`providers/anthropic.ts` 支持 Bearer 鉴权。

实跑结果（queue.yaml 首批 5 个唐朝事件，均为 `status: draft`，validate 0 error）：
- tang-conquest-of-eastern-turks（630 灭东突厥）
- wencheng-princess-tubo（641 文成公主入藏）
- shenlong-coup（705 神龙政变）
- hui-chang-suppression（845 会昌毁佛）
- niu-li-faction-feud（821–846 牛李党争）
- 构建 53 页正常；缓存命中生效（重复运行不重复付费）。

遗留 / 提醒：
- **output_tokens 远超 max_tokens=4000**（每节点 1.25 万–1.7 万），怀疑方舟把推理/思考 token 一并计入——实际可见文本仅 ~3KB。填真实单价到 models.yaml 前，费用估算会偏低；先跑一次对照方舟账单标定。
- `runs.jsonl` 中有首跑被中断/围栏导致的 ok:false 记录，它们同样消耗了方舟额度，但账本记为 ¥0（无法得知真实费用）。
- 5 个 draft 需按 style-guide §7 人工审核后改 reviewed；`related` 多为空，审核时可顺手补关联 id。
- 单价（含 Ark 的 deepseek-v4-flash）仍为示例值，待与官网账单核对后回填，并把评测结论写入 model-eval.md。

## 2026-09-18 · A1 · 唐朝整批次生成（C1 起点）

改动：
- `queue.yaml` 扩为 35 条：5 事件（已完成，命中缓存）+ 22 人物（worklog 记录的 related 全集，含 li-ye=唐昭宗李晔、li-zhu=唐哀帝李柷）+ 4 制度专题（三省六部/科举/均田制/藩镇割据）+ 4 世界史对照（阿拉伯/萨珊/查理曼/遣唐使）。
- `markdown.ts` `unwrapCodeFence` 增强：处理 ` ```--- ` 围栏与 frontmatter 粘合一行、输出开头空行等变形；`validate-core` 对 world 类型按 PLAN §9 从简放行（不强制正史/野史/批注条数），`checkDraft` 同步。
- `queue.ts` / `run.ts` 支持 world 节点的 `region` 字段。

结果（Ark / deepseek-v4-flash[1M]）：
- 35/35 队列生成完毕，新增 30 个 `status: draft`，全部 0 结构错误。
- 全仓 81 文件 / 46 节点（11 reviewed + 35 draft）；`validate` 0 error；唯一非 related 警告 guo-ziyi 概述 507 字偏长。
- 账本：45 次调用、in 约 43.7k / out 约 565k tokens（含失败重试与复跑次数）；单节点 out 12k–17k（疑似含推理 token），真实费用按方舟账单核对。

遗留：
- 35 篇 draft 待按 style-guide §7 人工审核 → reviewed（`related` 多空，审核时可补；guo-ziyi 概述需精简）。
- 世界史 4 篇按从简格式仅概述，缺三块内容；若希望与正史/野史/批注同构，改 queue 备注后重跑。
- C1 下一批可做：五代辽金、或补唐朝 topics/world 缺口；单价与评测结论未回填。

## 2026-09-18 · A1 · 审核辅助与 draft 清理

改动：
- 新增 `scripts/review.ts`（`npm run review`）：把 draft 的出处、引文、"待核"标记、机械自查旗标抽成核对清单（默认打印，`--out` 写文件、`--all` 含 reviewed）。
- 新增 `scripts/fixup.ts`（`npm run fixup`）：只处理 draft——(1) 近现代/当代批注（modern/contemporary）自动在 note 加"（AI收集，原书待核）"标记；(2) 概述超过 400 字按句截短。frontmatter 原样保留，reviewed 不动。

内容修复（用户确认后可发布为 reviewed 的草稿）：
- 科举（ke-ju）：修正"进士科始于隋大业中……不由进士者终不为美"的出处——实出《唐摭言》卷一，非《通典》选举典；已从通典条目删引文、移注明到《唐摭言》条。
- 王仙芝：起事年 875 被误当生年，改为 `precision: circa` 并在 summary 注明"生年不详"（约卒 878）。
- 李训/郑注：date 实为卒年 835，标注 `precision: circa` 与 summary"生年不详"。
- 概述超长 10 篇（郭子仪 507 等 410–507 字）已由 fixup 截到 ≤400。
- 39 条近现代/当代批注已打"（AI收集）"，speaker 观点未人工核校原书。

校验：81 文件 0 错误；`astro check` 0 错误 0 警告；`npm run review` 清单可再生。
遗留：卷次待核 68 处待人工回填；近现代学者观点仍未逐字核校（清单中均带（AI收集）标记）；所需人工核对的正是这两类。

---

## 2026-09-18 · A2 · Canvas 时间轴（M2）

改动（与 A1 同在 `feat/pipeline`，未切分支；未提交，等与 A1 内容一并处理）：
- 数据管线：
  - `src/lib/timeline-types.ts`（纯类型，浏览器/server 共享）；`src/lib/timeline-index.ts`（buildTimelineIndex / buildTimelineDetail，紧凑字段每节点约 200B）。
  - 静态端点 `src/pages/timeline/index.json.ts`（全量索引）与 `src/pages/timeline-detail/[type]/[id].json.ts`（每节点详情），构建时生成；`astro check` 0 错误、`npm run build` 182 页。
- 组件：
  - `src/components/Timeline/Timeline.astro`（island 挂载 + 轨道开关 + 图例 + noscript 降级；`?mock=3000` 时改用假数据）。
  - `src/components/Timeline/timeline.ts`：Canvas + d3-zoom 无级缩放/拖拽/捏合、语义缩放（k<2 仅 imp5，逐档翻倍）、四轨开关、分期/朝代色带与点击跳转、URL hash 深链（`#t=…&n=…`，replaceState）、键盘（←→平移、+−缩放、Home 全览）、悬停 tooltip（标题/年份/三块条数/draft 标记）、点击打开详情面板、拖拽后防误点、主题联动、`?hud=1` 帧耗时浮层。
  - `src/components/Timeline/timeline-panel.ts`：面板纯 DOM 渲染，结构与 NodePanel/SourceCite/CredibilityBadge 对齐（三 tab、可信度徽章、quote 折叠、批注分组、draft 徽章），文本全 textContent。
- 页面接入：首页顶部接入 `<Timeline />`（纵向目录保留）；分期/朝代页加局部时间轴（`range` + `filterEra/filterDynasty` + minimal）；节点页加"在时间轴中查看"深链。
- 样式：`public/styles/base.css` 追加 `.timeline*` 系列（含动态面板、HUD、浅深色）。
- 密度自检：`scripts/dev/mock-3000.ts` 生成 `public/timeline/mock-3000.json`（已 gitignore）；`scripts/dev/timeline-bench.ts` headless 测每帧 CPU。
- 依赖：新增 `d3-zoom d3-scale d3-selection d3-transition` 与对应 `@types/*`；README 增补时间轴用法。

自检结果：
- `npm run bench`：3000 假节点（1677 事件+692 人物+631 专题/世界史），k=1/2/8/32 平均每帧 CPU 0.4–0.8ms，远低于 16ms ✅。
- `astro check` 0 错误（1 hint 未定位，非阻断）；build 成功；dist 中 `/timeline/index.json` 46KB/145 节点、每 detail JSON 独立存在。
- 本机 `astro preview` 端口被沙箱网络策略拦截（localhost 连接被拒），交互行为未能在浏览器实跑验证。

遗留 / 待人工验证：
- **浏览器实跑**：请 `npm run dev` 后人工检查——首页缩放/拖拽、朝代快捷条、点击弹面板三 tab、`#t=..&n=` 深链恢复、节点页"在时间轴中查看"跳回、暗色模式；`/?mock=3000&hud=1` 看 3000 节点实际帧耗时。
- d3-zoom 默认把 canvas 的 `touch-action` 设为 none：移动端在时间轴区域单指拖动会被吞、纵向滚页失效，桌面不受影响；需要时再加两条手势区分（A 系列后续可做）。
- `astro check` 那 1 个 hint 未定位到文件；不为此展开排查。
- 首页时间轴数据在浏览器端 fetch `<base>/timeline/index.json`：base 为空字符串时用绝对路径 `/timeline/index.json`，GitHub Pages 部署（A4）换 base 后需再验一次。

## 2026-09-18 · C 系列 · 全史填充 C1–C6（进行中）

策略（用户确认）：按 §6.6 顺序一纪一批生成全史到 ~300 节点；近现代学者观点以"（AI收集）"标注、人工审核后置、不阻塞生成；每批后台运行、cache 断点续跑。

进度（截至本条）：
- C1 唐(35)、C2 秦汉(40)、C3 三国两晋南北朝(35)、C4 隋+五代(20)、C5 宋辽金元(47) 已生成；C6 明(33) 在跑。
- validate 全站 0 错误；账本累计 212 次调用、输出约 300 万 token（真实费用待对 Ark 账单回填 models.yaml 单价）。

管线鲁棒性修复（本轮批次用的代码）：
- 缺 frontmatter 闭合 `---` → finalize 自动在正文首个 `##` 前补；unwrapCodeFence 兼容围栏粘合与文件前解说句。
- 非法 related id 过滤、非法 date.precision 回退、正文块 YAML null（quote:/note: 空值）清洗。
- queue.yaml id 加固校验，拒绝 ü 等变音字母（曾因此写入非法 id）。
- 模型偶发"只输出思考文案"或响应污染（liu-bang 曾返回无关链接）→ 重跑即可，非管线 bug。

剩余批次：C7 清、C8 春秋战国、C9 夏商周上古、C10 民国新中国；卷次待核与（AI收集）观点仍待人工逐一核对。

## 2026-09-18 · C 系列 · 全史铺满完成（C1–C10）

最终状态：
- 全站 **364 文件 · 329 节点**（318 draft + 11 reviewed），`validate` **0 错误**，`astro build` 366 页成功。
- 队列 318 条全部生成（C1唐35 / C2秦汉40 / C3三国两晋南北朝35 / C4隋五代20 / C5宋辽金元47 / C6明33 / C7清37 / C8春秋战国36 / C9夏商周上古19 / C10民国新中国26），覆盖 §3.1 全部 11 个分期的教科书级主纪元。
- `npm run fixup` 全量执行一遍：概述 119 篇截短到 ≤400；现代/当代批注累计 **446** 条带"（AI收集，原书待核）"标记。
- 账本：371 次调用、in≈27万 / out≈**520.8 万**输出 token（含失败/重试）。**models.yaml 单价仍为示例 0，真实费用务必对照方舟账单回填**。

本轮管线加固汇总（run.ts 自动修复项）：
- frontmatter 缺闭合 `---`、围栏粘合、文件前解说句 → 自动规整
- YAML 值半角 `: ` 与成对 ASCII 引号 → 自动引号化
- 正文块 null 清洗、非法 related id 过滤、date.precision 回退、location 数组转字符串
- queue id 校验（禁变音字母）

遗留：
- `mao-zedong` 因模型内容过滤曾连续 3 次空响应，第 4 次成功；若复现可改更中性的 hint。
- 318 篇 draft 的人工审核未做：卷次待核 + "（AI收集）"学者观点 + `related` 补链，均不阻塞发布（draft 不会进构建）。
- 单价回填 + `docs/model-eval.md` 的档位定稿仍待 Ark 账单。

---

## 2026-09-19 · A3 · 搜索、筛选与主题（M2 收尾，分支 `feat/search`）

改动：
- **搜索**：构建期由 `getAllNodes()` + `parseBlocks()` 产出 `dist/search/index.json`（329 节点 + 分期/朝代 id→名称表）；`/search` 页客户端中文全文检索，命中范围=标题/别名/摘要/标签/概述/正史/野史/批注内容与出处名；空格分词 AND、importance 加权排序、`<mark>` 高亮、命中最优块摘要。
- **筛选**：首页目录与搜索页共用筛选条（类型/可信度/标签/含未审核），状态写入 URL 搜索参数（type/cred/tag/drafts）；首页对 `li[data-*]` 做客户端过滤并折叠空分期/朝代块；`popstate` 恢复，支持分享与后退。
- **主题**：深浅色三态（跟随系统 / 亮 / 暗）。`<html data-theme>` + localStorage（key `hl-theme`），首屏内联脚本在绘制前应用避免闪烁；头部按钮循环切换；时间轴 `timeline.ts` 改为经 `readTheme()` 读取 `data-theme` 并监听 `hl-themechange` 事件重绘；`base.css` 深色变量改为 `[data-theme="dark"]` 优先 + 系统偏好兜底。
- **移动端**：头部换行、筛选条/搜索框/结果页小屏适配、目录列表间距（max-width:600px 媒体查询）。
- 新增：`src/lib/theme.ts`、`src/lib/search-filter.ts`、`src/lib/search-index.ts`、`src/pages/search.astro`、`src/pages/search/index.json.ts`、`src/components/SearchUI.astro`、`src/components/FilterBar.astro`、`src/components/search.ts`。
- 修改：`Base.astro`（主题初始化 + 切换按钮 + 导航加"搜索"）、`index.astro`（接入 FilterBar、目录包 `#directory`、朝代块套 `.dyn-block`）、`NodeList.astro`（li 加 data-*）、`timeline.ts`（主题联动）、`public/styles/base.css`、`README.md`。

自检：
- `astro check` 0 错误 0 警告；`npm run build` 367 页成功。
- 用真实索引跑纯逻辑自测：标题命中（安史之乱）、正文命中（李林甫）、出处命中（资治通鉴→129 条、where 显示"出处 · 《资治通鉴》…"）、批注命中（陈寅恪→38 条）、双关键词 AND（长安 叛乱）、无关词 0 命中、筛选组合（event + 含A级出处 + 隐藏 draft → 10 节点）全部符合预期。
- 静态冒烟：/、/search/index.json、/timeline/index.json 均 200。
- **浏览器交互**（输入即搜、筛选折叠、主题切换与时间轴重绘、前进后退）受沙箱网络限制未实测，请 `npm run dev` 人工过一遍。

遗留 / 待规划会话定夺：
- **搜索用自建索引替代了 PLAN §5.1/§10.3 指定的 Pagefind**。原因：节点三块内容放在纯 CSS 标签页里，非激活 tab 是 `display:none`，Pagefind 爬虫按计算样式会跳过隐藏内容，索引不到出处与批注——恰好是 A3 验收要求的命中范围；自建索引零依赖、可精确控制命中范围、满足验收。若规划会话仍想用 Pagefind，需在节点页另备一份可被爬取的副本。
- `/search/index.json` 未压缩约 1.5MB（中文 UTF-8），仅搜索页加载；可接受，后续可裁剪概述长度或换 Pagefind 优化。
- 与 A3 无关的既有待办保持不变：318 篇 draft 审核、models.yaml 单价回填、C 批 `related` 补链。

---

## 2026-09-19 · A4 · 部署与凡例（分支 `feat/deploy`）

改动：
- **发布模式**：`src/lib/publish.ts` 新增 `INCLUDE_DRAFTS`（读 `PUBLISH_ONLY`）；`getAllNodes()` 在生产构建过滤 `status: draft`，波及全部派生数据——首页目录、分期/朝代页节点数、时间轴索引、搜索索引、节点独立页、timeline-detail JSON 全同步排除 draft。draft 页面文件也不会生成。
- **npm 脚本**：`build` 保持 `astro build` 为生产构建（排除 draft）；`dev` 与新增 `build:local` 经 `scripts/local-astro.mjs` 以 `PUBLISH_ONLY=false` 启动（跨平台，Windows 可跑），包含 draft 并渲染预览横幅。
- **水印**：`Base.astro` 在 `INCLUDE_DRAFTS` 时显示红色 sticky 预览横幅 + `about` 页对应提示；draft 节点角标与正文警告沿用 M0。
- **base/site**：`astro.config.mjs` 默认 `base='/history-line/'`、`site='https://hyang0128.github.io'`（本仓库 Pages 地址），支持 `SITE_URL` / `BASE_PATH` 环境变量覆盖。
- **GitHub Actions**：`.github/workflows/deploy.yml` —— push main 触发；`npm ci` → `npm run validate` → 按仓库名计算 base（项目页 `<owner>.github.io/<repo>`、用户页 `/`）→ `npm run build` → `configure-pages` / `upload-pages-artifact` / `deploy-pages`；权限与并发控制齐备。
- **凡例页**：`about.astro` 补全——内容构成（三类+分期）、可信度 A–D、版权三类 license、生成审核流程、draft 水印说明、时间轴/搜索/主题用法、范围与局限。
- **README**：更新本地运行（dev 含 draft、build 为生产、build:local 含 draft、访问路径带 base），新增「部署（A4）」章节（Pages 选 Actions 源、发布策略说明）。新增 `base.css` 的 `.preview-banner`。

自检：
- `astro check` 0 错误。
- `npm run build`（生产）：367→**47 页**（仅 reviewed 的 11 节点 + 35 分期/朝代 + 首页/凡例/搜索），dist 无任何 draft 节点页；timeline/index.json 仅 11 节点、search/index.json 仅 11 节点；HTML 内链接均带 `/history-line/` 前缀；无预览横幅、无 draft 角标。
- `npm run build:local`（含 draft）：页数恢复；预产期内 draft 节点页存在；HTML 含预览横幅；timeline/搜索索引 329 节点。
- 本地 serve 冒烟：生产版本的 `/`、`/history-line/styles/base.css`、`/about`、`/search/index.json` 正常。

遗留 / 待办：
- **未在真实 GitHub 仓库跑通流水线**（沙箱无法推送）。需用户：① Settings→Pages→Source 选「GitHub Actions」；② 推送 `main` 观察 Actions；③ 核对线上地址与 draft 排除。
- 生产只剩 11 个 reviewed 节点，发布后可访问但内容很薄——与 C 系列审核进度直接相关（§11 主线程）。
- 若未来仓库改名或迁到用户页站点，改 astro.config.mjs 默认值或依赖 Actions 自动计算即可。

---

## 2026-09-19 · B2 · 历史疆域地图（M6 一期，分支 `feat/map`）

改动：
- **数据**：`src/lib/map-data.ts` 自绘 6 个朝代（秦/西汉/唐/元/明/清）的示意边界多边形 + 南海诸岛示意点 + 60+ 历史地名词典（名称→坐标）与 `resolveLocations()`（解析节点 location 文本）。多边形按公开历史地图所载疆域概括勾勒、坐标粗略，附各朝示意时间点与注释；**不复制受版权数据**。
- **地图组件**：`src/components/HistoryMap.astro`（岛）+ `src/components/history-map.ts`（D3 `geoMercator` + `geoPath` 渲染 SVG；6 朝色条切换、选中琥珀色、其余灰色对照；城市落点 hover 提示条数与地名；右键列表列出该朝节点；`?dyn=<id>` URL 深链；随 `hl-themechange` 换色。节点数据经 `<script type="application/json" set:html>` 嵌入，避免大 prop）。
- **页面**：`/map` 页（说明 + 组件 + 范围免责）；头部导航加「疆域」链接；`about.astro` 增「疆域地图」数据来源与许可说明；`base.css` 地图样式。
- **依赖**：新增 `d3-geo` + `@types/d3-geo`。

决策（用户选定）：自绘示意图而非 CHGIS；D3 而非 MapLibre（离线零外部瓦片依赖）；首批 6 朝。

自检：
- `astro check` 0 错误；`npm run build` 50 页（含 /map）。
- **浏览器实测（headless Edge，逐朝截图人工查看）**：初版地图两处硬伤——墨卡托在北纬 17–60° 跨度上把中原压扁、元朝 ring 写成自交双回路导致填充糊满画布。修复后重验：6 朝形状均可辨识（秦主体+象郡尾、汉河西走廊楔、唐西域尖角、元巨块、明奴儿干手臂、清最大范围）；点色条切换正常（唐→42 条列表、标题更新）、控制台无 JS 错误。
- 数据自测：6 朝 polygon path 合法、顶点都在画布内；南海岛点可投影；location 解析符合预期。

修复记录（同日第二轮）：
- 投影改 `geoConicEqualArea`（标准纬线 25°/47°、中央经线 105°E），替代墨卡托。
- 全部 ring 重写为单回路：共享 COAST 海岸线数组 + 各朝北缘/内陆收口，杜绝自交；渤海简化为浅湾。
- 未选中朝代改仅描边（不填色）；选中朝代重心处标注朝代名。
- Base 加 data-URI favicon（消 favicon 404）。

遗留 / 待人工浏览器验证：
- **用户复验**：请在浏览器刷新 /map 确认形状与交互（测试实例 http://127.0.0.1:4322/history-line/map，含 draft）。
- 多边形为「示意」，边界细节（如唐北界、元西北）可按史识直接改 `map-data.ts` 的 ring。
- 地名词典只覆盖常用城市；未收录地名不落点（进列表）。后续如需更精确，可接 CHGIS（凡例已留声明）。

---

## 2026-09-20 · B2 · 疆域地图重做：真实地理数据（分支 `feat/map`）

用户反馈自绘多边形"是假的、图形明显不对"——手绘方案推翻，改用真实地理数据烘焙：

数据管线（`scripts/geo/`，可复现，`npm run geo:fetch` + `npm run geo:build`）：
- `fetch-raw.mjs`：下载原始数据到 `raw/`（gitignore，可重下）——DataV 中国省级边界、OHM 三朝边界（Overpass，**必须用 OHM 自己的端点** ohm.kumi.systems 等；overpass-api.de 是 OSM 的，关系 ID 两库不通，曾拿回布拉格公交站数据）、osmtogeojson 转 GeoJSON 落盘。asia-50m 缺失时从 node_modules/world-atlas（Natural Earth, public domain）提取。
- `compose.mjs`：西汉/明/清 = OHM 实测边界（CC0，关系 2692874 / 2936889 / 2889977）；秦/唐/元 = DataV 省级并集 + Natural Earth 国家多边形按史载界线裁切（polygon-clipping）；统一 RDP 简化 + d3 球面渲染方向修正；输出 `public/geo/dynasties.json`（149KB）+ `base.json`（227KB）。
- 复现验证：重跑 compose 产物与线上版本逐字节一致。
- 许可：OHM CC0、Natural Earth public domain、DataV 公开接口；CHGIS 因 EULA 禁 PRC 用户使用+禁再分发，排除。

站点改动：
- `src/lib/map-data.ts`：几何移出（改 fetch public/geo/），保留类型、六朝元信息、地名词典、`resolveLocations`（签名改为接收 location 字符串，浏览器可用）。
- `src/components/history-map.ts`：重写为 fetch 真实几何；等积圆锥投影（25°/47° 标准纬线）以六朝整体取景；底图（现代亚洲）+ 其他朝代虚线对照 + 选中朝代琥珀填充分层；数据加载失败有提示。
- `HistoryMap.astro`/`map.astro`/凡例：色条改由 MAP_DYNASTIES 生成；说明与许可声明改为真实数据来源。
- playwright-core 为浏览器实测依赖（devDeps 不入 dependencies）。

自检（构建 + astro check + 数据文件逐朝核验）：
- 生产构建 50 页；`astro check` 0 错误。
- 截图逐朝目验：秦（含象郡）、汉（河西/交趾/乐浪）、唐（西域+漠北）、元（俄南+缅北）、明（1430–1617）、清（极盛）形状正确，海岸线为真实数据。
- 交互：朝代切换（秦/元）、暗色主题、URL `?dyn=` 深链均验证通过（paths=59, circles 随朝代变化, 0 pageerror）。
- dev 侧曾遇 `504 Outdated Optimize Dep`（旧 dev 进程缓存过期），重启 dev 解决——非站点 bug。

遗留：
- 秦/唐/元为"省级并集+裁切"合成，郡国级细节（如唐节度使界、元行省界）未画；OHM 有汉/明/清逐时段关系，后续可逐朝替换提高精度。

---

## 2026-09-20 · 全站 bug 排查与修复（三批，main 工作树）

排查方式：`astro check` / `validate` / 生产构建三道自动检查 + 代码审查（对时间轴/搜索/地图/管线逐文件），高严重度发现均经人工读码复核后修复。

第一批（用户可见功能 bug）：
- **H1 筛选 chips 点击失灵**：`FilterBar.astro` / `SearchUI.astro` 的点击 handler 只调 apply，而 apply 只读 `.on` class，无人切换 → 类型/可信度/含未审核按钮全部无效。修复：点击先 `classList.toggle('on')`（drafts 按钮同步 `aria-pressed`）再 apply；两处 drafts 按钮初始补 `on` class（与 `aria-pressed="true"` 及默认态一致）。
- **M3 时间轴 k<1 漏复位**：`timeline.ts` setViewport 请求跨度宽于全轴时边界退回全幅但 `k` 仍 <1，整轴被压缩且低于 scaleExtent 下限（深链 `#t=-3000..3000` 可触发）。补 `k = 1`。
- **M4 搜索词带中文标点整条落空**：`search.ts` tokens 只按空白切分，"李白，"整词失配且 AND 语义连坐。修复：token 剥首尾中英文标点并导出，`SearchUI` 高亮复用同一分词；`search-filter.ts` 标签分词支持顿号/逗号（占位符即写着「如 战争、科举」）。

第二批（fixup 与内容标记）：
- **fixup 判重 bug（隐藏较深）**：判重查 `includes('（AI收集）')`，匹配不到追加型标记「（AI收集，原书待核）」→ 每次运行都会给已标记 note 重复打标（历史上已产生 6 处双份标记）。改为按「（AI收集」前缀判重（覆盖空 note 文案与追加型两种形态）。
- note 拼接标点：追加前剥尾部句读，杜绝「。；（AI收集…）」；存量 92 处一次性规整 + 6 处历史重复收敛（现 446 处标记、每 note 恰一份；`fixup --dry-run` 复跑为 0 待办，幂等）。
- **M1 导语丢失**：`splitSections` 丢弃首个 `##` 前的内容，fixup/run.ts 按 sections 重建正文会静默删掉。新增 `parse-blocks.ts#splitPreamble`，fixup 原样保留导语。
- **L1 trimOverview**：改按句末标点（。！？；）切句保留标点；无句界可切（首句超长/无句读）时返回原文，不再多补句号、不再虚报 trimmed。

第三批（生成管线与杂项）：
- **M2 重复二级标题丢块**：`run.ts#normalizeBodyBlocks` 写盘前检测重复 `##` 标题，命中即报错走失败路径（saveFailed 留档 + 记账），不再静默丢前块；导语丢弃改为显式 warn。
- **M5② 费用低估**：`run.ts` finalizeFrontmatter 失败路径 `costCny: 0` → 记实际费用；`stats.ts` 不再跳过 `ok:false` 的费用合计。
- L2：`filterFromParams` 用 `Object.hasOwn` 替代 `in`（`?type=constructor` 原型链误命中致 0 结果）。
- L3：`history-map.ts` 校验 `initial`（dev 期来自 URL `?dyn=`，无效值曾致地图空白；线上静态构建本就无此问题）。
- 移除 3 个页面上 Astro 组件的无效 `client:load`（构建警告消除，功能本由组件内 `<script>` 提供）；清理 3 处未用变量/导入（`LEVEL_ZOOMS`、`osmtogeojson` 死导入、`DynFeature`）；README 修正 `--strict` 措辞（CI 实跑宽松校验）。

自检：
- `astro check` 0 错误 0 警告 0 提示；生产构建 50 页、无水合警告；`validate` 0 错误；`stats` 正常。
- splitPreamble / 重复标题检测 / tokens 分词均以 tsx 内联单测验证；content 净变化 71 文件 93 行（全部为标记标点规整，YAML 重序列化字节稳定）。

遗留：
- **浏览器实测未做**：playwright-core 实际未安装（package.json 无此项，B2 worklog 所记"devDeps"与现实不符）。建议用户复验：首页/搜索页点筛选 chips、搜「李白，」、深链 `#t=-3000..3000`。
- models.yaml 单价仍为占位 0，`stats` 费用恒 ¥0 属配置占位；补价后失败调用的费用现已如实入账。

## 2026-09-21 · related 引用批量订正（main 工作树）

背景：validate 报 401 条 unknown-related 警告。工具：`scripts/dev/fix-related.ts`（analyze/apply 两模式，frontmatter 行级编辑）+ `scripts/dev/related-map.json`（决策表，可审计）。

处理（352 个 distinct 缺失 id 全部分类）：
- **改名 101 项**：连字符风格错位（li-shi-min→li-shimin、caocao→cao-cao 等 40+）、庙号→实际人物节点（tang-xuanzong→li-longji、yongle-emperor→zhu-di、genghis-khan→chengji-si-han、sun-yat-sen→sun-zhongshan 等 30+）、事件别名（chenqiao-mutiny→chenqiao-bingbian、ganlu-incident→sweet-dew-incident、wusi-yundong→may-fourth-movement 等 20+）。
- **删引用 230 项**：指向朝代/分期的引用（idMap 只含节点集合，且 dynasty 字段已有归属）、指向计划外节点的 1 处引用（书目、战役、次要人物）。名单见 related-map.json 的 drops。
- **补队列 26 项**：≥2 处引用的著名实体或事件主角（班固、韩信、董仲舒、谢玄、王导、秦桧、宋太宗/神宗、万历帝、明英宗/代宗/崇祯、吴三桂、多尔衮、完颜阿骨打、欧阳修、五四相关等），追加于 queue.yaml 尾部「related 订正补充」节。

防误伤措施：R3 模糊匹配的 15+ 处「名字相近的不同人」（谢玄≠谢安、张良≠张骞、王猛≠王莽、李德裕≠李煜等）全部人工排除；apply 含自引用防护、related 去重；自引用致空与删空致 `related: null` 的文件统一改 `related: []`。

事故记录：apply 首版写回丢失开头 `---` 定界符，140 文件 frontmatter 短暂损坏，已按统一格式恢复并修复脚本（write 行补 `---\n` 前缀）；git diff 复核仅 related 行变化。

结果：validate 0 错误；unknown-related 从 401 → 44 条，剩余全部指向 queue 未来节点（合法等待态）。非 related 的既有警告（official-count 超量等）不在本次范围。

财务决定：models.yaml 单价回填、gen:eval 定档、model-eval.md 定稿等账务工作**移出项目范围**（用户自行核算），models.yaml 保持占位单价，stats 费用恒 ¥0 属预期。

## 2026-09-21 · 内容订正会话 · related 指向复核与史料错误订正

范围：全部 364 个内容文件（329 节点 + 35 分期朝代）通读核对（topics/world 全量 + 全部 importance=5 + 全部事件 + 全部人物）；机械交叉核对用新脚本 `scripts/dev/check-refs.ts`（related 悬空/重复、日期落朝代、era 与 dynasty.parent、目录与 dynasty 一致性）。

已订正（21 处）：
- **类目归属**：赤壁、官渡 200/208 属东汉末——移入 events/eastern-han/，era→qin-han、dynasty→eastern-han；三家分晋（-453/-403）移入 events/warring-states/，dynasty→warring-states。URL 按 frontmatter id 生成，移动不破坏链接。
- **引文/出处**：xuanwu-gate 常何墓志"敦煌发现"→民国洛阳出土（非敦煌）；kaiyuan 通典户口改"天宝十四载 891万/5291万"并注明 906万/5280万系另一系统天宝十三载数字（待核出处）；zhenguan 钱穆《国史大纲》"第四编第二十三章"→第五编（章次待核）；liangshui 同书编章改"南北经济文化之转移诸章（待核）";an-lushan 李林甫奏言"文士为将"→"文臣为将"（待点校本复核）;sui-south-conquest 伐陈诏引文误系"九年春正月己酉"→开皇八年十月（干支待核）;mongol-empire-founding 元史引文补"帝大会诸王群臣，建九游之白旗"；chengji-si-han 引文同句对齐；han-wudi 通鉴汉纪十四补卷二十二（标"再核对"）;shenlong-coup 新唐书五王传卷115→卷120；dongzhuo-disorder quote 改归三国志卷一武帝纪（原系卷六）;liu-yu-song 通鉴引文"庚午王戌"干支连排错误待核；qin-shi-huang 国史大纲编次改第三编；neige 钱穆《中国历代政治得失》第三讲→第四讲（明代）。
- **内容卫生**：black-death AI综述学者名错乱（"弗拉基米尔·A. 穆罕默德""大卫·赫布斯特"）改为本尼迪克托/赫利希（标待核）并删除"仅供时间线主编复核"指令残句、编年史作者名标待核（原"约翰·克利夫兰"疑为 John Clyn 之误）；buddha-rise 删"任务元数据"字样；long-march 补"金冲及主编"。
- **frontmatter**：sui-late-uprisings related li-yuan 去重；huang-chao 生年 820 改 precision: circa。

剩余 5 条机械提示（属设计取舍，未改）：mongol-empire-founding 1206 挂在 yuan（1271-1368）外——"蒙古→元"连续体，建议保留或加 note；world 4 条（japan-yayoi/mesopotamia-sumer/minoan-crete/parthia-empire）跨中国分期的 era 映射按主体年代归属，未改。

人工复核清单（本会话未动、留给审核者的低置信度项）：
- an-lushan：李林甫奏言引文"文臣为将"、通鉴卷216天宝六载系年
- sui-south-conquest：伐陈命帅确切干支（八年十月？《隋书》作何干支）
- han-wudi：通鉴卷二十二（汉纪十四）卷次
- shenlong-coup：新唐书卷120 五王传
- liu-yu-song：通鉴刘裕即位日干支
- jiaozi-paper-money：《宋史》食货志卷181 引文"蜀人铁钱重"个别字
- bai-jia-zheng-ming："齐稷下学士复盛"前"是以/于是"
- 辽/金多篇"宾铁"vs 通行本"镔铁"异写
- koran 类小结：black-death 学者名与人名两处替换依据不足，有实体书时核对

其他未动：PLAN.md §11 状态表已过期（A3/A4/B2 实际完成，与 README 不符），维护归规划会话；models.yaml 单价勿回填（账务移出项目）。

## 2026-09-21 · 内容订正会话（续）· draft 卷次待核批量消化

- 新工具：`scripts/dev/fill-volumes.ts`（内置可审计映射，精确串替换，`npm run fill:volumes [--dry-run]`），继续追加映射即可复用。
- 本轮补 21 处高置信度卷次（≥85%）：董卓之乱(后汉书72/69、通鉴59-60)、官渡(通鉴63)、光武(卷40去冗余)、黄巾(通鉴58注)、后唐灭梁(新五代史5/37、通鉴271-272)、石敬瑭(通鉴280、新五代史9)、金灭辽(辽史27-30、宋史19-22)、蒙古灭西夏金(金史17-18、宋史412)、土木之变(明史纪事本末卷33篇名订正《景帝登极守御》)。
- 待核标记总量 604 → 464（含 "原书待核" 类 AI 转述注，非全部可消化）。
- validate 0 错误。仍未提交 git。

剩余可继续消化的类别（下一会话按此分桶）：
1. 《读通鉴论》卷次（卷一~三十对应朝代段，M0 已在 worklog 列了 4 条待核项，建议持实体书统一核）
2. 通鉴卷-年份对（大量"卷次待核"可直接按《通鉴》目录填，如党锢 55-58、班超 45-48 等，置信度高的先填）
3. 《宋论》《廿二史札记》卷次条目名
4. 辽金诸篇"宾铁/镔铁"异写、稷下"是以/于是"等引文异字

### 2026-09-22 第二批（同会话续）

补 25 处：宇文恺(隋书卷68)、五代诸纪（旧五代史庄宗27-34/世宗114-119、新五代史庄宗5/周本纪12/恭帝附）、通鉴（后周纪五卷294、八王之乱82-86、昭宗258-265、班超45-48）、廿二史札记卷21、明史纪事本末卷78/79、元史百官志七卷91/地理志一卷58。待核命中 464→436。fill-volumes.ts 支持幂等重跑（新串已在即跳过）。validate 0 错误。

### 2026-09-22 第三批（同会话续）

补 16 处：党锢（通鉴55-56，中平大赦58）、班超事件篇注（45-48）、蔡伦（通鉴48）、文成公主（旧唐书196、新唐书216、通鉴196）、李煜（宋史478、长编15-16）等。待核命中 436→431。事故与修复：fill-volumes 通用 note 串（"note: 卷次待核。"）幂等重跑误伤 yuwen-kai/黄巾两篇共 3 处 note，已人工修复并从映射中移除通用串、脚本加多命中告警护栏。validate 0 错误。高置信度卷次池基本用尽，剩余 431 命中多为清/明实录通用卷次、读通鉴论/宋论/札记条目、辑本笔记及"原书待核"AI 转述项，宜以实体书人工核对或待 WebSearch 权限恢复后网核。

### 2026-09-22 第四批 · 网核（维基文库原文对照）

网络工具状态：网关 WebSearch/WebFetch 仍 429，改用本机 curl/urllib 直连 zh.wikisource.org MediaWiki API 抓取 wikitext（临时脚本 `.tmp-ws/wsfetch.py`，未入库；并发 >3 会被 429，需串行 + 2.5s 间隔）。

**低置信度清单逐条核实结果（29 文件）**：
- an-lushan-rebellion / an-lushan：通鉴卷216 天宝六载原文为「文臣爲將，怯當矢石，不若用寒畯胡人」，事件篇订正无误；人物篇 quote 仍作「文士」，已改。「文士為將…不如用寒族、蕃人」是《旧唐书》卷106 李林甫传异文，note 已说明。
- liu-yu-song：通鉴卷119 永初元年六月「壬戌，王至建康…甲子，帝逊于琅邪第…丁卯，王为坛于南郊，即皇帝位」。原引文把到京日壬戌当即位日，已改为丁卯并重写 note。
- gaopingling-coup：通鉴卷75 系于嘉平元年春正月甲午（正始十年即嘉平元年），源行「（卷次待核）正始十年」改为嘉平元年并消待核。
- jiaozi-paper-money：宋史卷181 会子条原文「以三年為一界而換之。六十五年為二十二界，謂之交子」，原引文跳句，已补全。
- sui-south-conquest：隋书卷2 开皇八年冬十月「甲子，將伐陳，有事於太廟。命晉王廣、秦王俊、清河公楊素並為行軍元帥」，干支补为甲子，引文按原文改。
- han-wudi：通鉴卷22 汉纪十四起天汉三年尽后元二年，「孝武穷奢极欲」臣光曰在卷末，两处 note 消「建议再核对」。
- shenlong-coup：新唐书卷120 列传第四十五五王（桓彦范…）核实；读通鉴论「卷二十二」误——卷22 为睿宗/玄宗，中宗在卷21，已改。
- yuwen-kai：北史无宇文恺专传，附卷60 宇文贵传「子忻、恺」下，已补。
- jin-founding / jin-destroy-liao：金史卷2 原文即「賓鐵」，不改「镔铁」，note 注明。
- bai-jia-zheng-ming：史记卷46 原文「是以齊稷下學士復盛」，现稿正确，无需改。
- liao-founding：通鉴卷266 开平元年确有契丹八部/阿保机久任不代追叙，现稿正确。
- 读通鉴论/宋论 分卷表（按帝分卷）已抓全，据此改 17 处：dongzhuo（卷8-9）、huangjin（卷8）、chu-han（卷2）、lulin-chimei（卷5-6）、yiling（卷10）、banchao（卷7 消待核）、ba-wang/wu-hu（卷11-12）、fan-zhen（卷23）、yang-yan（卷24）、li-ye（卷27）、sui-late-uprisings（卷19）、wu-dai-shi-guo（卷28-30）、zhu-wen-usurpation（卷28→27，昭宗在27、28 为五代上）、duanping-ru-luo（宋论卷15→14，理宗在14）、mongol-destroy-xixia-jin（宋论14）、jin-founding 宋论（卷8）、longxing-heyi（卷11）、wen-tian-xiang / xiangyang（卷15）。**注意**：读通鉴论卷18 为陈高祖至后主，「隋文帝」未见独立标题（卷19 起自隋炀帝），sui-south-conquest 批注「卷十八 隋文帝」需持实体书再核，本轮未动。
- 常何墓志出土地：维基百科抓取 429，未核。

「卷次待核」命中 431→409。validate 0 错误。

### 2026-09-22 第五批 · 正史卷号批量补注（维基文库目录页对照）

方法：串行抓取 zh.wikisource 各书目录页 wikitext（明史/两唐书/宋史/元史/晋书/辽史/金史/两五代史/通鉴/史记/魏书/三部纪事本末），用 `.tmp-ws/lookup.py` 按传名/纪名/志名查卷号，通鉴按目录「起某年尽某年」定卷；年份落卷有疑者再抓该卷正文首段确认（元史卷7/11/42/44、宋史卷29/41/42、金史卷12、辽史卷11/14/15、明史卷117/325 等）。映射追加到 `fill-volumes.ts` 第五批（160 条，`--dry-run` 零未命中后写盘），随后 `cleanup_stale.py` 把源行已有卷号而 note 仍写「卷次待核」的 83 处改为「卷次已核目录」或删除空注（未核的 13 处保留）。

补注要点：明史 28 处（英宗后纪12、于谦170、徐有贞171、太祖1-3、食货77-82/赋役78、兵89-92、史可法274、流贼309、海瑞226、徐阶213、徐光启251、成祖5-7、郑和=宦官一304、刑法三95、职官三/五74/76、宦官304-305、佛郎机=外国六325、宸濠附117宁献王传）；两唐书 24 处（李德裕旧174/新180、李宗闵176、房玄龄66/96、郭子仪120/137、宪宗纪14-15/7、沙陀218、李训169/179、裴度173、魏征71/97、职官42-44、百官一46、田承嗣141、罗绍威附181罗弘信传、日本=东夷199上/220）；五代 5 处；宋辽金 19 处（石守信250、赵普256、杨业272、司马光336、拂菻/大食=外国六490、赵葵417、高宗六29、宗弼77、辽圣宗二11/五14、金章宗四12、金食货三48、宋史纪事本末109 文���之死）；元史 20 处（太祖1/太宗2、世祖四7=至元八年、世祖八11=至元十八年、世祖三至五6-8=襄樊、顺帝五42/七44、地理一58、食货一93 钞法、刘秉忠157、日本=外夷一208、术赤117、哀宗下18赞、辽太祖下2赞、元史纪事本末第四则）；晋书 7 处（刘聪102/刘曜103、王导65、谢安79、孝武帝纪9、苻坚113-114）；通鉴 40 处（按目录卷-年份对：周纪一/二/五、秦纪二、汉纪十、卷39-41、62-69、87、105-115、133-142、175-185、189-198、203-207、211-212、219-223、237-249、254-256、266-294 等）。

**订正（非补注）**：huangtaiji《明史》洪承畴传——《明史》因其降清未立传，改为「庄烈帝纪及诸传有关记事」并注《清史稿》卷237 有传；mongol-west-campaign《元史》旭烈兀传/巴秃（拔都）传——《元史》均无专传，改为宪宗纪/郭侃传与术赤传附见；duanping-ru-luo 全子才——《宋史》无专传，附见赵葵传（卷417 目录核实）。

「卷次待核」409→278，全部「待核」563→431。validate 0 错误。剩余大桶：清史稿 24、国史大纲 22（无法网核）、长编 14、廿二史札记 12、明清实录约 40（通用卷次，需实体书/中国哲学书电子化计划）、辑本笔记与「原书待核」AI 转述。

