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
```

## 目录

```
content/            Markdown 内容（分期、事件、人物、专题、世界史）
src/content.config.ts   内容 schema（不可变接口）
src/lib/parse-blocks.ts 正文四块解析（不可变接口）
src/pages/          首页、分期页、节点页、凡例
scripts/generate/   内容生成提示词；批量脚本由 A1 任务包实现
docs/               规范、提示词记录、工作记录
```

## 参与方式

每个任务包对应一个新的 Claude Code 会话，启动指令见 PLAN.md §10.3。开工先读 PLAN.md 与 docs/style-guide.md，完工追加 docs/worklog.md。
