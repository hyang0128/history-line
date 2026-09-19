/**
 * 校验内核。validate.ts（CLI）与 run.ts（生成后自检）共用。
 * 规则依据 docs/style-guide.md 与 src/content.config.ts。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CONTENT_DIR, scanContent, type ContentFile } from './content';
import { parseFrontmatter } from './frontmatter';
import { nodeSchemaFor, eraSchema } from './frontmatter-schema';
import { parseBlocks, splitSections, KNOWN_HEADINGS } from '../../src/lib/parse-blocks';
import { charLen } from './markdown';

export interface Finding {
  rel: string;
  level: 'error' | 'warning';
  code: string;
  message: string;
}

export interface ValidateResult {
  findings: Finding[];
  filesChecked: number;
  nodeCount: number;
  eraCount: number;
}

export interface ValidateOptions {
  strict?: boolean;
  /** 只校验这些相对路径（相对扫描根） */
  targets?: string[];
  /** 从独立目录扫描（测试用）。此时不校验朝代/分期引用与 related 存在性。 */
  baseDir?: string;
}

type Raw = Record<string, unknown>;

function formatIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('；');
}

const TYPE_BY_COLLECTION: Record<string, string> = {
  events: 'event',
  persons: 'person',
  topics: 'topic',
  world: 'world',
};

function basenameId(rel: string): string {
  return path.basename(rel, '.md');
}

export async function validateContent(opts: ValidateOptions = {}): Promise<ValidateResult> {
  const root = opts.baseDir ?? CONTENT_DIR;
  let files = await scanContent(root);
  if (opts.targets) {
    const set = new Set(opts.targets);
    files = files.filter((f) => set.has(f.rel));
  }
  const findings: Finding[] = [];
  const push = (rel: string, level: 'error' | 'warning', code: string, message: string) => {
    findings.push({ rel, level, code, message });
  };
  /** 是否检查跨文件引用（独立目录测试时为 false） */
  const crossRefs = !opts.baseDir || opts.baseDir === CONTENT_DIR;

  // —— 第一遍：建立索引 ——
  const eraIds = new Set<string>();
  const dynastyIds = new Set<string>();
  const allEraIds = new Set<string>(); // 分期与朝代的并集：明/清/民国/新中国等"分期即政权"
  const idMap = new Map<string, string>(); // 节点 id → rel（仅在节点集合内去重）
  const parsed = new Map<string, { rf: ContentFile; data: Raw; body: string }>();

  let eraCount = 0;
  for (const f of files) {
    let raw: string;
    try {
      raw = await readFile(f.file, 'utf8');
    } catch (e) {
      push(f.rel, 'error', 'unreadable', `读取失败：${(e as Error).message}`);
      continue;
    }
    let p;
    try {
      p = parseFrontmatter(raw);
    } catch (e) {
      push(f.rel, 'error', 'frontmatter', (e as Error).message);
      continue;
    }
    if (!p.hadFrontmatter || p.data == null) {
      push(f.rel, 'error', 'frontmatter', '缺少 frontmatter（文件应以 --- 开头）');
      continue;
    }
    const data = p.data as Raw;
    parsed.set(f.rel, { rf: f, data, body: p.body });

    if (f.collection === 'eras') {
      eraCount++;
      if (typeof data.id === 'string') {
        allEraIds.add(data.id);
        if (data.type === 'era') eraIds.add(data.id);
        if (data.type === 'dynasty') dynastyIds.add(data.id);
      }
    } else if (typeof data.id === 'string') {
      const existing = idMap.get(data.id);
      if (existing) push(f.rel, 'error', 'dup-id', `id “${data.id}” 与 ${existing} 重复`);
      else idMap.set(data.id, f.rel);
    }
  }

  // —— 第二遍：逐文件校验 ——
  for (const { rf, data, body } of parsed.values()) {
    if (rf.collection === 'eras') {
      checkEra(rf.rel, data);
    } else {
      checkNode(rf.rel, rf.collection, data, body);
    }
  }

  function checkEra(rel: string, data: Raw): void {
    const r = eraSchema.safeParse(data);
    if (!r.success) {
      push(rel, 'error', 'frontmatter', formatIssues(r.error));
      return;
    }
    const e = r.data;
    if (e.id !== basenameId(rel)) push(rel, 'warning', 'file-id-mismatch', `文件名 ${basenameId(rel)}.md 与 id “${e.id}” 不一致`);
    if (e.date.end != null && e.date.end < e.date.start) {
      push(rel, 'error', 'date-range', `end(${e.date.end}) < start(${e.date.start})`);
    }
    if (e.type === 'dynasty') {
      if (crossRefs) {
        if (!e.parent) push(rel, 'error', 'no-parent', 'dynasty 必须填写 parent（所属分期）');
        else if (!eraIds.has(e.parent)) push(rel, 'error', 'bad-parent', `parent “${e.parent}” 不是已存在的 era`);
      }
    } else if (e.parent) {
      push(rel, 'warning', 'era-parent', 'era 不应设置 parent（只有 dynasty 有）');
    }
  }

  function checkNode(rel: string, collection: string, data: Raw, body: string): void {
    const expectedType = TYPE_BY_COLLECTION[collection];
    if (!expectedType) {
      push(rel, 'error', 'bad-collection', `目录 ${collection} 不是已知节点集合`);
      return;
    }
    if (data.type && data.type !== expectedType) {
      push(rel, 'error', 'bad-type', `type=“${data.type}” 与所在集合 ${collection} 不符（应为 ${expectedType}）`);
      return;
    }
    const schema = nodeSchemaFor(expectedType);
    const r = schema.safeParse(data);
    if (!r.success) {
      push(rel, 'error', 'frontmatter', formatIssues(r.error));
      return;
    }
    const node = r.data;

    if (node.id !== basenameId(rel)) push(rel, 'warning', 'file-id-mismatch', `文件名 ${basenameId(rel)}.md 与 id “${node.id}” 不一致`);
    if (node.date.end != null && node.date.end < node.date.start) {
      push(rel, 'error', 'date-range', `end(${node.date.end}) < start(${node.date.start})`);
    }
    if (crossRefs) {
      if (node.era && !eraIds.has(node.era)) push(rel, 'error', 'unknown-era', `era=“${node.era}” 不存在于 content/eras/`);
      if (node.dynasty && !allEraIds.has(node.dynasty)) push(rel, 'error', 'unknown-dynasty', `dynasty=“${node.dynasty}” 不存在于 content/eras/`);
      for (const rid of node.related ?? []) {
        if (!idMap.has(rid)) push(rel, 'warning', 'unknown-related', `related=“${rid}” 未找到对应节点（允许指向未来节点）`);
      }
    }

    if (node.status !== 'draft') {
      if (node.reviewed_at == null) push(rel, 'error', 'no-reviewed-at', `status=${node.status} 但缺少 reviewed_at`);
      if (!node.generated_by) push(rel, 'error', 'no-generated-by', `status=${node.status} 但缺少 generated_by`);
    } else if (node.reviewed_at != null) {
      push(rel, 'warning', 'draft-reviewed-at', 'draft 状态不应填 reviewed_at（审核通过后再填）');
    }

    // —— 正文四块 ——
    let blocks;
    try {
      blocks = parseBlocks(body, rel);
    } catch (e) {
      push(rel, 'error', 'blocks', (e as Error).message);
      return;
    }
    const ol = charLen(blocks.overview);
    if (ol < 200 || ol > 400) push(rel, 'warning', 'overview-len', `概述 ${ol} 字（规范 200–400）`);
    // 世界史节点（world）按 PLAN §9 从简：只写一段白话概述，不要求三块条数
    const isWorld = expectedType === 'world';
    if (!isWorld) {
      if (blocks.official.length < 2 || blocks.official.length > 4) push(rel, 'warning', 'official-count', `正史 ${blocks.official.length} 条（规范 2–4）`);
      if (blocks.unofficial.length > 3) push(rel, 'warning', 'unofficial-count', `野史 ${blocks.unofficial.length} 条（规范 0–3）`);
      if (blocks.commentary.length < 2 || blocks.commentary.length > 4) push(rel, 'warning', 'commentary-count', `批注 ${blocks.commentary.length} 条（规范 2–4）`);
      if (!blocks.commentary.some((c) => c.category === 'ai')) {
        push(rel, 'warning', 'no-ai-commentary', '批注缺少 AI 综述条目（author: AI 综述, category: ai）');
      }
    }
    for (const c of blocks.commentary) {
      if (c.quote && charLen(c.quote) > 60) {
        push(rel, 'warning', 'quote-len', `引文 ${charLen(c.quote)} 字，超过 60 字建议截短`);
      }
    }
    if (blocks.official.some((s) => s.quote && charLen(s.quote) > 60)) {
      push(rel, 'warning', 'quote-len', '正史/野史存在超过 60 字的引文，建议截短');
    }
    const unknownHeadings = [...splitSections(body).keys()].filter((h) => !KNOWN_HEADINGS.includes(h));
    for (const h of unknownHeadings) {
      push(rel, 'warning', 'unknown-heading', `正文含未知二级标题 “## ${h}”，会被解析器忽略`);
    }
  }

  const nodeCount = [...parsed.keys()].filter((rel) => rel.split('/')[0] !== 'eras').length;
  return { findings, filesChecked: files.length, nodeCount, eraCount };
}

/** 错误数（strict 时把 warning 一并计入） */
export function errorCount(result: ValidateResult, strict: boolean): number {
  return result.findings.filter((f) => (strict ? true : f.level === 'error')).length;
}

/**
 * 对单篇草稿做结构校验（run.ts 写盘前用）。不校验跨文件引用。
 * 返回的错误即"缺 source / 缺 credibility / paraphrase 含 quote"等必须拦截的问题。
 */
export function checkDraft(text: string, expectedType: string): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  let parsed;
  try {
    parsed = parseFrontmatter(text);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message], warnings: [] };
  }
  if (!parsed.hadFrontmatter || parsed.data == null) {
    return { ok: false, errors: ['缺少 frontmatter（模型未按模板输出）'], warnings: [] };
  }
  const r = nodeSchemaFor(expectedType).safeParse(parsed.data);
  if (!r.success) {
    errors.push(`frontmatter 不合规：${formatIssues(r.error)}`);
    return { ok: false, errors, warnings };
  }
  try {
    const blocks = parseBlocks(parsed.body, 'draft');
    const isWorld = expectedType === 'world';
    if (!blocks.overview.trim()) warnings.push('概述为空');
    if (!isWorld) {
      if (blocks.official.length < 2) warnings.push(`正史仅 ${blocks.official.length} 条（规范 2–4）`);
      if (blocks.unofficial.length > 3) warnings.push(`野史 ${blocks.unofficial.length} 条（规范 0–3）`);
      if (!blocks.commentary.some((c) => c.category === 'ai')) warnings.push('批注缺 AI 综述条目');
      if (!blocks.official.length && !blocks.unofficial.length) errors.push('正史与野史均为空，缺少可核对的出处');
    }
  } catch (e) {
    errors.push((e as Error).message);
  }
  return { ok: errors.length === 0, errors, warnings };
}