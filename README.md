# 史线 · 中国历史时间线学习站

以时间轴为骨架，每个节点同时呈现正史记载、野史轶闻和名家批注，并标注史料可信度。自学用途，纯静态站。

- 计划与分工：[PLAN.md](PLAN.md)
- 编写规范与审核清单：[docs/style-guide.md](docs/style-guide.md)
- 工作记录：[docs/worklog.md](docs/worklog.md)

## 本地运行

```bash
npm install
npm run dev        # 开发预览，包含未审核（draft）内容，带预览横幅
npm run build      # 生产构建：只发布 reviewed / published，输出到 dist/
npm run build:local # 本地完整构建：含 draft（与线上行为相反，用于本地检查全量）
npm run preview    # 预览 dist/
npm run mock       # 生成本地密度测试假数据（不进生产）
npm run bench      # 3000 节点每帧 CPU 自检
```

> base 默认 `/history-line/`，对应 GitHub Pages 地址 `https://hyang0128.github.io/history-line/`。访问本地站点请用 `http://localhost:4321/history-line/`；用 `SITE_URL` / `BASE_PATH` 环境变量可覆盖（部署工作流自动按仓库名设置）。

## 时间轴（A2）

首页为 Canvas 无级缩放时间轴，数据构建时写入 `dist/timeline/index.json`，详情按需从 `dist/timeline-detail/<type>/<id>.json` 加载（见 PLAN.md §5.3）。

- 拖拽平移、滚轮/捏合缩放；← → 平移、+ / − 缩放、Home 回到全览。
- 语义缩放：最缩显示 importance 5 的事件，逐档放大——每翻倍多放一级（§5.3）。
- 顶部快捷条跳分期；四轨道（事件/人物/专题/世界史）可开关；URL hash 深链 `#t=700..800&n=anshi`。
- 密度自检：`npm run mock && npm run dev`，访问 `/?mock=3000&hud=1` 看帧耗时；`npm run bench` 是 headless 版本。

## 搜索、筛选与主题（A3）

- **搜索**（`/search`）：构建期产出 `dist/search/index.json`，客户端全文检索标题、别名、概述与正史/野史/批注内容、出处名，命中位置与可信度一并展示；空词时按重要度浏览全站。
- **筛选**：首页"节点目录"与搜索页均有筛选条（类型 / 可信度 / 标签 / 含未审核），状态写入 URL（`?type=..&cred=..&tag=..&drafts=0`），可分享、可后退。
- **主题**：头部 ☀/☾ 按钮在"跟随系统 → 亮 → 暗"三态间循环，选择存 `localStorage`，时间轴同步换色。
- 说明：搜索为自建索引而非 Pagefind（节点三块内容位于 `display:none` 的标签页，Pagefind 爬虫会跳过，见 docs/worklog.md 2026-09-19 A3 遗留）。

## 历史疆域地图（B2）

- `/map`：六个朝代（秦/西汉/唐/元/明/清）的示意边界切换，琥珀色为当前朝代、灰色对照；城市点来自节点 `location` 与内置地名词典，右侧列出该朝节点。
- 边界为**自绘示意多边形**（`src/lib/map-data.ts`），非精确测绘；数据来源与许可见[凡例](/history-line/about)。
- URL 深链 `?dyn=tang` 可直选朝代；主题切换联动换色。

## 目录

```
content/            Markdown 内容（分期、事件、人物、专题、世界史）
src/content.config.ts   内容 schema（不可变接口）
src/lib/parse-blocks.ts 正文四块解析（不可变接口）
src/pages/          首页、分期页、节点页、凡例
scripts/generate/   内容生成：queue.yaml（待生成清单）、models.yaml（模型登记）、run.ts（批量生成）、eval.ts（多模型评测）
scripts/lib/        脚本通用库（frontmatter、缓存、校验内核等）
scripts/validate.ts 内容校验
scripts/stats.ts    内容与费用统计
docs/               规范、提示词记录、评测记录、工作记录
```

## 内容生成管线（A1）

按 `scripts/generate/queue.yaml` 批量起草内容，输出到 `content/` 为 `status: draft`，人工审核合格后改为 `reviewed`。

```bash
npm run generate                      # 默认：队列全部 + 费用确认
npm run generate -- --dry-run         # 只展示计划与费用估算，不调用模型
npm run generate -- --only <id>       # 只生成指定节点
npm run generate -- --limit 5 --yes   # 前 5 条、跳过费用确认
npm run generate -- --model glm-4-flash # 换模型（只影响本次运行）
npm run validate                      # 校验 content/：缺 source / 缺 credibility / 非公版引原文 一律报错
npm run validate -- --strict          # 警告也计为失败（CI 用）
npm run review                        # 审核辅助：抽取全部出处/引文/待核标记，生成核对清单
npm run fixup                         # draft 发布前清理：近现代批注加（AI收集）标记、概述超长截短
npm run stats                         # 内容分布、draft 积压、累计生成费用
npm run gen:eval                      # 多模型评测（计划）；加 --run 才实际调用
```

### 模型与费用

- **换模型不改代码**：provider 可插拔（OpenAI 兼容 / Anthropic / mock，见 `scripts/generate/models.yaml`），档位映射、单价、阈值都在配置里。
- 默认低价档起草（当前 `defaults` 指向 `deepseek-v4-flash`，即规划会话所用的 Ark 通道；用 `--model` 或改 models.yaml 切换），importance→档位映射默认关闭（见 models.yaml `tierByImportance`）。
- models.yaml 里的**单价目前是示例值**，务必从各家官网核对后更新，并把实测结论记入 `docs/model-eval.md`；费用按 `币种 × usdCnyRate` 换算成人民币统计。
- API key 入 `.env`（复制 `.env.example`），不入库；单次运行预估超过 `costThresholdYuan`（默认 ¥20）会要求确认，`--yes` 跳过。
- 本地缓存（`scripts/generate/.cache/`，已 gitignore）：同一队列重复运行不重复付费；需重写时加 `--force`（会覆盖已存在文件，慎用）。
- `mock` provider 只用于离线自检管线，`--model mock` 跑通全流程但不产生真实调用与费用。

## 部署（A4）

推送 `main` 后由 GitHub Actions 自动构建并发布到 Pages（`.github/workflows/deploy.yml`）：

1. 仓库 Settings → Pages → **Source 选「GitHub Actions」**（不是 Deploy from a branch）。
2. 工作流执行：`npm ci` → `npm run validate`（内容校验，阻止结构错误上线）→ 按仓库名计算 `base` → `npm run build`（生产构建，**只发布 reviewed/published**）→ 上传 `dist/` 到 Pages。
3. 发布地址为 `https://<owner>.github.io/<repo>/`（本仓库 `https://hyang0128.github.io/history-line/`）。

**发布策略**：draft 内容不会出现在线上；需要在部署前核对的条目请先在本地 `npm run dev` 逐条看，改 `status` 为 `reviewed` 再推送。凡「出处待核 / 原书待核」标记的节点不应改为 reviewed。

## 参与方式

每个任务包对应一个新的 Claude Code 会话，启动指令见 PLAN.md §10.3。开工先读 PLAN.md 与 docs/style-guide.md，完工追加 docs/worklog.md。
