# 内容编写规范与审核清单

> 适用于 `content/` 下所有节点。10 个唐朝样例（`content/events/tang/`）与 `content/persons/tang/li-shimin.md` 是格式与质量基准，生成与审核时对照它们。

## 1. 文件与命名

- 一个节点一个文件，路径 `content/<集合>/<朝代 id>/<节点 id>.md`。集合为 `events` `persons` `topics` `world`；`topics` 与 `world` 跨朝代时放在 `content/topics/` 与 `content/world/` 根下。
- `id` 用小写英文拼音或意译、连字符分隔，与文件名一致，全站唯一。事件优先意译（`an-lushan-rebellion`），人物用拼音（`li-shimin`）。
- 分期与朝代在 `content/eras/`，`type` 为 `era` 或 `dynasty`，朝代用 `parent` 指向分期。

## 2. frontmatter 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| id, type, title | 是 | type 与所在集合一致 |
| aliases | 否 | 别名、旧称、常见误写，供搜索 |
| summary | 建议 | 一句话，40 字以内，列表与悬停用 |
| date.start / end | 是 / 否 | 公元纪年，公元前为负数（前 221 = -221）。人物为生卒年 |
| date.precision | 否 | year（默认）、month、day、circa、century |
| era | 是 | 分期 id |
| dynasty | 建议 | 朝代 id；跨朝代专题可不填 |
| importance | 是 | 1–5。5 教科书级大事；4 该朝代必知；3 一般；2 补充；1 细节 |
| tags | 建议 | 中文，3–5 个，复用已有标签 |
| location | 否 | 地名，用当时名并可括注今地 |
| related | 建议 | 关联节点 id，可指向尚未编写的节点 |
| status | 是 | draft → reviewed → published。AI 生成一律 draft |
| generated_by | 是 | 模型 id |
| reviewed_at | 审核后 | YYYY-MM-DD |

人物额外有 `titles`（庙号、谥号、字号），世界史额外有 `region`。

## 3. 正文四块

正文只允许四个二级标题，顺序固定：`## 概述` `## 正史` `## 野史` `## 批注`。未知标题会被忽略。

### 概述

白话，200–400 字，两段为宜。第一段讲起因、经过、结果；第二段讲影响，或指出史料上需要注意的问题。不引原文，不列出处。

### 正史 / 野史

YAML 列表，每项字段：

```yaml
- source: 《资治通鉴》卷二百一十七 唐纪三十三 天宝十四载   # 必填，书名 + 卷次/篇名
  credibility: A          # 必填，A/B/C/D
  text: 白话叙述该来源记了什么   # 必填，1–3 句
  quote: 原文短句           # 可选，仅公版，一般不超过 60 字
  note: 对来源本身的说明    # 可选，如成书年代、作者立场、真伪
  ref: https://...        # 可选，可查证链接
```

- 正史块：二十四史、《资治通鉴》、实录、会要、通典、出土文献。2–4 条。
- 野史块：古代笔记、杂史、私人著述。1–3 条，没有合适材料可以留空。文学作品（诗、檄文）偶尔可收，`note` 必须注明"文学作品"。
- 不收演义小说与民间传说。
- 近现代节点野史块留空。

### 批注

YAML 列表，每项字段：

```yaml
- author: 司马光          # 必填；AI 综述固定写 "AI 综述"
  source: 《资治通鉴》卷一百九十一 臣光曰
  category: classical    # classical / modern / contemporary / ai
  license: public-domain # public-domain / paraphrase / ai-synthesis
  text: 转述其观点         # 必填，2–4 句
  quote: 原文短句          # 仅 public-domain 允许
  note: 说明              # 可选
```

- `classical`：古代史论，作者逝世超过 50 年，`license: public-domain`，可引原文。
- `modern`：近现代学者，`license: paraphrase`，只转述，不成段引用。
- `contemporary`：政治人物与当代普及作者，`license: paraphrase`，前端会加"观点鲜明"提示。
- `ai`：`author: AI 综述`，`license: ai-synthesis`，`text` 必须写成"学界共识：……。主要分歧：……。"两部分。
- 每个节点至少 1 条古代或近现代批注 + 1 条 AI 综述。

## 4. YAML 注意事项

- 值不要以英文双引号 `"` 或单引号开头，否则 YAML 会当作带引号字符串而报错。中文引号 `“”` 可以。需要以引号开头时改写句子或整个值用引号包起来。
- 值中含冒号加空格（`: `）时整个值用引号包起来。
- 多行值用 `>-` 折叠。

## 5. 可信度等级

| 等级 | 含义 |
|---|---|
| A | 正史或同时代官方记录，多源印证 |
| B | 正史记载但有争议；后世重要史书转录；同时代官方文书或出土文献但未经正史采纳 |
| C | 笔记、杂史、私人著述，有一定史料价值；文学作品 |
| D | 传说、孤证、明显附会；去事久远的猎奇笔记 |

## 6. 引用与出处

- 出处写到卷次或篇名，格式 `《书名》卷X 篇名`。不确定卷次时写 `（卷次待核）` 放在 `note` 里，不要猜。
- 引原文只取短句，一般不超过 60 字，必须与通行本一致。
- 转述近现代学者时用"某某认为 / 指出 / 强调"，不能加入学者没有说过的判断。
- 年份换算：干支、年号纪年一律换算为公元，并在 text 中保留原纪年（如"天宝十四载（755 年）"）。

## 7. 审核清单

审核 draft 时逐条核对，通过后把 `status` 改为 `reviewed` 并填 `reviewed_at`：

1. 每条 `source` 的书名、卷次能在中国哲学书电子化计划、维基文库、国学大师或纸质书中查到。
2. `quote` 与原书一致，无增删字。
3. 转述的学者观点与其著作一致，没有张冠李戴。
4. `credibility` 与来源类型相符。
5. 年份换算正确，`date` 与正文一致。
6. `license` 与 `category` 匹配，非公版无 `quote`。
7. AI 综述写成"共识 / 分歧"两部分，没有冒充具体学者。
8. 近现代节点符合从简规则。
9. `related` 中的 id 命名符合规范（可暂不存在）。
10. 概述没有明显的价值判断和情绪化用词。

出处存疑但暂时无法核实的，保留条目，在 `note` 写明"待核"，并在 `docs/worklog.md` 记录。
