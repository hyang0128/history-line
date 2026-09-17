import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * 内容 schema —— 不可变接口（PLAN.md §10.4）。
 * 新增字段需先在 docs/worklog.md 提出，由规划会话修改。
 */

export const PRECISIONS = ['year', 'month', 'day', 'circa', 'century'] as const;
export const NODE_TYPES = ['event', 'person', 'topic', 'world'] as const;
export const STATUSES = ['draft', 'reviewed', 'published'] as const;
export const CREDIBILITIES = ['A', 'B', 'C', 'D'] as const;
export const LICENSES = ['public-domain', 'paraphrase', 'ai-synthesis'] as const;
export const COMMENTARY_CATEGORIES = ['classical', 'modern', 'contemporary', 'ai'] as const;

/** 公元纪年，公元前为负数（前 221 年 = -221）。 */
const dateSchema = z.object({
  start: z.number().int(),
  end: z.number().int().optional(),
  precision: z.enum(PRECISIONS).default('year'),
});

const idSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id 只能用小写字母、数字和连字符');

const nodeBase = {
  id: idSchema,
  title: z.string().min(1),
  /** 别名、旧称、常见误写，供搜索使用 */
  aliases: z.array(z.string()).default([]),
  /** 一句话摘要，时间轴悬停与列表使用，建议 40 字以内 */
  summary: z.string().max(120).optional(),
  date: dateSchema,
  era: idSchema,
  dynasty: idSchema.optional(),
  /** 1–5，语义缩放时决定显示层级，5 为教科书级大事 */
  importance: z.number().int().min(1).max(5).default(3),
  tags: z.array(z.string()).default([]),
  location: z.string().optional(),
  /** 关联节点 id，可跨类型。是否存在由 scripts/validate.ts 校验 */
  related: z.array(idSchema).default([]),
  status: z.enum(STATUSES).default('draft'),
  generated_by: z.string().optional(),
  reviewed_at: z.coerce.date().optional(),
};

const events = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/events' }),
  schema: z.object({ ...nodeBase, type: z.literal('event') }),
});

const persons = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/persons' }),
  schema: z.object({
    ...nodeBase,
    type: z.literal('person'),
    /** 庙号、谥号、字号等 */
    titles: z.array(z.string()).default([]),
  }),
});

const topics = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/topics' }),
  schema: z.object({ ...nodeBase, type: z.literal('topic') }),
});

const world = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/world' }),
  schema: z.object({
    ...nodeBase,
    type: z.literal('world'),
    /** 地区或文明，如 罗马、阿拉伯、日本 */
    region: z.string(),
  }),
});

const eras = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/eras' }),
  schema: z.object({
    id: idSchema,
    type: z.enum(['era', 'dynasty']),
    title: z.string().min(1),
    aliases: z.array(z.string()).default([]),
    date: dateSchema,
    /** dynasty 所属的 era id；era 本身不填 */
    parent: idSchema.optional(),
    /** 同一层级内的排序 */
    order: z.number().int(),
    summary: z.string().max(120).optional(),
    /** 显示用主色，缺省由前端按 order 分配 */
    color: z.string().optional(),
  }),
});

export const collections = { events, persons, topics, world, eras };
