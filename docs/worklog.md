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
