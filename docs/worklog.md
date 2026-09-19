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
