/**
 * 解析节点正文中的"概述 / 正史 / 野史 / 批注"四块 —— 不可变接口（PLAN.md §10.4）。
 *
 * 正文约定（见 docs/style-guide.md）：
 *   ## 概述      Markdown 段落
 *   ## 正史      YAML 序列，每项为 SourceEntry
 *   ## 野史      YAML 序列，每项为 SourceEntry
 *   ## 批注      YAML 序列，每项为 CommentaryEntry
 *
 * 这个文件不依赖 astro:content，脚本（validate.ts、run.ts）可直接复用。
 */
import YAML from 'yaml';
import { z } from 'zod';

export const CREDIBILITIES = ['A', 'B', 'C', 'D'] as const;
export const LICENSES = ['public-domain', 'paraphrase', 'ai-synthesis'] as const;
export const COMMENTARY_CATEGORIES = ['classical', 'modern', 'contemporary', 'ai'] as const;

export const sourceEntrySchema = z.object({
  /** 书名、卷次或篇名，如 《资治通鉴》卷二百一十七 */
  source: z.string().min(1),
  credibility: z.enum(CREDIBILITIES),
  /** 白话叙述，必填 */
  text: z.string().min(1),
  /** 公版原文短句，前端默认折叠 */
  quote: z.string().optional(),
  /** 对来源本身的说明，如成书年代、作者立场 */
  note: z.string().optional(),
  /** 可查证的链接，如中国哲学书电子化计划 */
  ref: z.string().url().optional(),
});

export const commentaryEntrySchema = z
  .object({
    /** 评注者；AI 综述固定写 "AI 综述" */
    author: z.string().min(1),
    source: z.string().min(1),
    category: z.enum(COMMENTARY_CATEGORIES),
    license: z.enum(LICENSES),
    text: z.string().min(1),
    quote: z.string().optional(),
    note: z.string().optional(),
    ref: z.string().url().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.license !== 'public-domain' && v.quote) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quote'],
        message: '非公版来源不得引用原文，请删除 quote 只保留转述',
      });
    }
    if (v.category === 'ai' && v.license !== 'ai-synthesis') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['license'],
        message: 'category 为 ai 时 license 必须是 ai-synthesis',
      });
    }
  });

export type SourceEntry = z.infer<typeof sourceEntrySchema>;
export type CommentaryEntry = z.infer<typeof commentaryEntrySchema>;

export interface NodeBlocks {
  /** 概述，原始 Markdown */
  overview: string;
  official: SourceEntry[];
  unofficial: SourceEntry[];
  commentary: CommentaryEntry[];
}

const HEADINGS: Record<string, keyof NodeBlocks> = {
  概述: 'overview',
  正史: 'official',
  野史: 'unofficial',
  批注: 'commentary',
};

/** 把正文按二级标题切成段，返回 标题 → 内容 */
export function splitSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  let current: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (current !== null) sections.set(current, buf.join('\n').trim());
  };
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      current = m[1];
      buf = [];
    } else if (current !== null) {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

function parseList<T>(
  raw: string,
  schema: z.ZodType<T>,
  label: string,
  fileId: string,
): T[] {
  if (!raw.trim()) return [];
  let data: unknown;
  try {
    data = YAML.parse(raw);
  } catch (e) {
    throw new Error(`[${fileId}] ${label} 不是合法 YAML：${(e as Error).message}`);
  }
  if (data == null) return [];
  if (!Array.isArray(data)) {
    throw new Error(`[${fileId}] ${label} 必须是 YAML 列表（每条以 "- " 开头）`);
  }
  return data.map((item, i) => {
    const r = schema.safeParse(item);
    if (!r.success) {
      const issues = r.error.issues
        .map((is) => `${is.path.join('.') || '(root)'}: ${is.message}`)
        .join('；');
      throw new Error(`[${fileId}] ${label} 第 ${i + 1} 条不合规：${issues}`);
    }
    return r.data;
  });
}

/**
 * 解析节点正文。fileId 只用于错误信息。
 * 未出现的块返回空数组；概述缺失返回空字符串。
 * 未知的二级标题会被忽略，便于以后扩展。
 */
export function parseBlocks(body: string, fileId = 'unknown'): NodeBlocks {
  const sections = splitSections(body);
  const get = (h: string) => sections.get(h) ?? '';
  return {
    overview: get('概述'),
    official: parseList(get('正史'), sourceEntrySchema, '正史', fileId),
    unofficial: parseList(get('野史'), sourceEntrySchema, '野史', fileId),
    commentary: parseList(get('批注'), commentaryEntrySchema, '批注', fileId),
  };
}

/** 标题映射表导出，供 validate.ts 检查是否有未知标题 */
export const KNOWN_HEADINGS = Object.keys(HEADINGS);
