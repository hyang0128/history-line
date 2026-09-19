/**
 * 节点 frontmatter 的 zod schema —— 镜像 `src/content.config.ts`（不可变接口，PLAN §10.4）。
 * 脚本不能直接导入 astro:content，因此这里维护一份同等校验。
 * 若 content.config.ts 的 schema 变更，需同步更新本文件（由规划会话协调）。
 * 内容语义接口以 content.config.ts 为准。
 */
import { z } from 'zod';

export function nodeSchemaFor(type: string): z.ZodType {
  switch (type) {
    case 'event':
      return z.object({ ...nodeBase, type: z.literal('event') });
    case 'person':
      return z.object({ ...nodeBase, type: z.literal('person'), titles: z.array(z.string()).default([]) });
    case 'topic':
      return z.object({ ...nodeBase, type: z.literal('topic') });
    case 'world':
      return z.object({ ...nodeBase, type: z.literal('world'), region: z.string().min(1) });
    default:
      throw new Error(`未知节点类型：${type}`);
  }
}

const idSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id 只能用小写字母、数字和连字符');

const dateSchema = z.object({
  start: z.number().int(),
  end: z.number().int().optional(),
  precision: z.enum(['year', 'month', 'day', 'circa', 'century']).default('year'),
});

const nodeBase = {
  id: idSchema,
  title: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  summary: z.string().max(120).optional(),
  date: dateSchema,
  era: idSchema,
  dynasty: idSchema.optional(),
  importance: z.number().int().min(1).max(5).default(3),
  tags: z.array(z.string()).default([]),
  location: z.string().optional(),
  related: z.array(idSchema).default([]),
  status: z.enum(['draft', 'reviewed', 'published']).default('draft'),
  generated_by: z.string().optional(),
  reviewed_at: z.coerce.date().optional(),
};

/** 分期 / 朝代文件（content/eras/） */
export const eraSchema = z.object({
  id: idSchema,
  type: z.enum(['era', 'dynasty']),
  title: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  date: dateSchema,
  parent: idSchema.optional(),
  order: z.number().int(),
  summary: z.string().max(120).optional(),
  color: z.string().optional(),
});

export type EraFrontmatter = z.infer<typeof eraSchema>;
export type NodeFrontmatter = z.infer<ReturnType<typeof nodeSchemaFor>>;