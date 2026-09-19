# 史线 · 中国历史时间线学习站

以时间轴为骨架，每个节点同时呈现正史记载、野史轶闻和名家批注，并标注史料可信度。自学用途，纯静态站。

- 计划与分工：[PLAN.md](PLAN.md)
- 编写规范与审核清单：[docs/style-guide.md](docs/style-guide.md)
- 工作记录：[docs/worklog.md](docs/worklog.md)

## 本地运行

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # 输出到 dist/
npm run preview
npm run mock     # 生成本地密度测试假数据（不进生产）
npm run bench    # 3000 节点每帧 CPU 自检
```

## 时间轴（A2）

首页为 Canvas 无级缩放时间轴，数据构建时写入 `dist/timeline/index.json`，详情按需从 `dist/timeline-detail/<type>/<id>.json` 加载（见 PLAN.md §5.3）。

- 拖拽平移、滚轮/捏合缩放；← → 平移、+ / − 缩放、Home 回到全览。
- 语义缩放：最缩显示 importance 5 的事件，逐档放大——每翻倍多放一级（§5.3）。
- 顶部快捷条跳分期；四轨道（事件/人物/专题/世界史）可开关；URL hash 深链 `#t=700..800&n=anshi`。
- 密度自检：`npm run mock && npm run dev`，访问 `/?mock=3000&hud=1` 看帧耗时；`npm run bench` 是 headless 版本。

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

## 参与方式

每个任务包对应一个新的 Claude Code 会话，启动指令见 PLAN.md §10.3。开工先读 PLAN.md 与 docs/style-guide.md，完工追加 docs/worklog.md。
