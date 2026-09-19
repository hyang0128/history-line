# 多模型评测记录（A1）

> 目标（PLAN §6.7）：在候选模型上跑 M0 的 10 个唐朝样例节点，记录 token 用量与人工核对发现的出处错误数，据此定下 `models.yaml` 的档位映射（低价 / 中价 / 高价）。
>
> **状态**：评测管线已就绪（`npm run gen:eval`）、方法与本表即本文档；真实评测待 `scripts/generate/eval.ts` 在放入各家 API key 后执行并回填"结果"一节。

## 候选模型与档位初判

| 档位 | 当前指向 | 用途（PLAN §6.7 任务分级） |
|---|---|---|
| cheap | `deepseek-v4-flash`（Ark，同规划会话通道） | 事件/人物起草：概述 + 正史 + 野史（成本大头） |
| medium | `deepseek-v4-flash`（暂同 cheap） | 批注块（含 AI 综述）、抽检交叉复核 |
| high | `claude-sonnet-5` | importance=5 节点、审核打回重写、少量高价值工作 |

`models.yaml` 中的单价均为 **示例值**，本表结论出来后替换为官网核对价。
注：`tierByImportance` 默认关闭，确认后按本表打开即可让 5 级节点自动走高价档。

## 评测方法（eval.ts）

1. 取 `content/events/tang/` 的 10 个样例事件元数据（不含正文，避免污染结论）。
2. 每模型 × 每样例：用与 `run.ts` 完全一致的提示词组装（`scripts/lib/prompt.ts`），温度 0 起草一条。
3. 自动打分（结构层面）：
   - frontmatter 通过 zod schema（同 `src/content.config.ts`）
   - 正文四块可解析；正史 2–4 条；野史 ≤3；批注 2–4；含 AI 综述
   - license 与 category 匹配（非公版不得引 quote）
4. 输出每个模型每节点的**出处清单**到 `.cache/eval/report.md` —— 这是人工核对的重点。
5. `--determinism` 额外判断同提示词两次输出是否一致。

**人工核对维度**（缺一不可，对应 style-guide §7）：
- source 的书名、卷次是否真实存在（用回连通鉴/两《唐书》等核对）
- 学者观点是否张冠李戴（同 M0 曾出现的"卷次待核"问题）
- credibility 与来源类型是否相符
- 年份 / 干支 / 年号换算
- 近现代从简规则是否被遵守

## 运行方式

```bash
npm run gen:eval                      # 计划与费用估算（不调用模型）
npm run gen:eval -- --run             # 实际评测（会花费 token/额度，先看估算）
npm run gen:eval -- --models deepseek-chat,glm-4-flash   # 指定子集
npm run gen:eval -- --run --determinism
```

## 结论判定原则

- 低价档必须：结构合格率接近 100%（结构不合格的草稿 won't 通过 run.ts 自检，浪费重跑）、出处错误（编造卷次/张冠李戴）在可审核范围内。
- 中价/高价档判定批注块质量（AI 综述的分寸感、学者观点转述准确度）。
- 按"出处准确率 / 单价"决定各档位对应模型，回填本表与 `models.yaml`。
- 出错集中的节点类型（如某模型对晚唐年号换算易错），在 style-guide 或提示词里加规则。

## 结果

_待填入：各模型结构合格率、平均 token/费用、人工抽查发现的出处问题清单、档位定稿结论。_