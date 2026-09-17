# 用户消息模板 v0.1

把下面的元数据填入后作为用户消息发送。`{{...}}` 由脚本替换。参考样例见 `content/events/tang/an-lushan-rebellion.md`，脚本可把该文件全文作为 few-shot 附在系统提示之后。

---

请为以下节点起草条目，严格按模板输出完整 Markdown 文件内容（含 frontmatter），不要输出其他文字。

节点元数据：
- id: {{id}}
- type: {{type}}
- title: {{title}}
- 分期 era: {{era}}
- 朝代 dynasty: {{dynasty}}
- 大致年份: {{year_hint}}
- importance: {{importance}}
- 备注: {{hint}}

模板：

```markdown
---
id: {{id}}
type: {{type}}
title: {{title}}
aliases: []
summary: 一句话摘要，40 字以内
date: { start: 0, end: 0, precision: year }
era: {{era}}
dynasty: {{dynasty}}
importance: {{importance}}
tags: []
location:
related: []
status: draft
generated_by: {{model}}
---

## 概述

（两段白话）

## 正史

- source:
  credibility:
  text:
  quote:
  note:

## 野史

- source:
  credibility:
  text:
  note:

## 批注

- author:
  source:
  category:
  license:
  text:
  quote:
- author: AI 综述
  source: 综合……
  category: ai
  license: ai-synthesis
  text: 学界共识：……。主要分歧：……。
```

字段为空时整行删除，不要留空值。人物节点增加 `titles: []`，世界史节点增加 `region:`。
