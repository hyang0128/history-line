#!/usr/bin/env tsx
/**
 * fixup.ts —— draft 发布前清理（A1）。
 *
 * 对 status: draft 的节点做机械化修正：
 *   1) 近现代/当代批注（category: modern | contemporary）在 note 加"（AI收集）"标记，
 *      表明该观点由 AI 转述、未经人工核校原书。
 *   2) 概述超过 400 字时按句子边界截短（保留前文史实，丢弃尾句），
 *      超出规范的问题提示由 review/validate 复核。
 *
 * 已 reviewed 的节点不动。frontmatter 与首个 ## 之前的导语原样保留。
 * 用法：npm run fixup [--dry-run]
 */
import { readFile, writeFile } from 'node:fs/promises';
import YAML from 'yaml';
import { scanContent, CONTENT_DIR } from './lib/content';
import { splitFrontmatter } from './lib/frontmatter';
import { nodeSchemaFor } from './lib/frontmatter-schema';
import { splitSections, splitPreamble, parseBlocks } from '../src/lib/parse-blocks';
import { charLen } from './lib/markdown';

const MARKER = '（AI收集，原书待核）';
const OVERVIEW_MAX = 400;

function trimOverview(text: string): string {
  const t = text.trim();
  if (charLen(t) <= OVERVIEW_MAX) return t;
  // 按句末标点切句（保留标点），逐句累加到预算内
  const parts = t.split(/(?<=[。！？；])/).filter((p) => p.trim() !== '');
  let out = '';
  for (const p of parts) {
    if (charLen(out + p) > OVERVIEW_MAX) break;
    out += p;
  }
  // 无句界可切（首句即超长 / 全文无句读）时返回原文，不加句号不虚报 trimmed，交人工复核
  return out.trim() || t;
}

/** 只改已知四块的正文；未知标题与首个 ## 之前的导语原样保留。返回新 body。 */
function transformBody(body: string, id: string): { body: string; trimmed: boolean; marked: number } {
  const { preamble, rest } = splitPreamble(body);
  const sections = splitSections(rest);
  const kept: string[] = [];
  let trimmed = false;
  let marked = 0;

  for (const [heading, content] of sections) {
    if (heading === '概述') {
      const trimmedText = trimOverview(content);
      if (trimmedText !== content.trim()) trimmed = true;
      kept.push(`## 概述\n\n${trimmedText}`);
    } else if (heading === '批注') {
      const entries = parseBlocks(body, id).commentary;
      const modified = entries.map((c) => {
        // 用「（AI收集」前缀判重：同时覆盖空 note 文案「（AI收集）…」与追加型「（AI收集，原书待核）」两种形态，
        // 只查「（AI收集）」会漏掉追加型，导致重复打标
        if ((c.category === 'modern' || c.category === 'contemporary') && !(c.note ?? '').includes('（AI收集')) {
          marked++;
          // 剥掉 note 结尾已有的句读再拼「；」，避免产生「。；（AI收集…）」
          const base = (c.note ?? '').trim().replace(/[。；;，,、]\s*$/, '');
          c.note = base ? `${base}；${MARKER}` : `（AI收集）AI 转述观点，原书未经人工核校。`;
        }
        return c;
      });
      kept.push(`## 批注\n\n${YAML.stringify(modified, { lineWidth: 0, sortMapEntries: false }).trimEnd()}`);
    } else {
      kept.push(`## ${heading}\n\n${content}`);
    }
  }
  const outBody = kept.join('\n\n').trim() + '\n';
  return { body: (preamble.trim() ? `${preamble.trimEnd()}\n\n` : '') + outBody, trimmed, marked };
}

async function main(): Promise<number> {
  const dry = process.argv.includes('--dry-run');
  const files = await scanContent(CONTENT_DIR);
  let fixedFiles = 0;
  let trimmedCount = 0;
  let markedCount = 0;

  for (const f of files) {
    if (f.collection === 'eras') continue;
    const text = await readFile(f.file, 'utf8');
    let parsed;
    let data: Record<string, unknown>;
    try {
      parsed = splitFrontmatter(text);
      if (parsed.frontmatter === null) continue;
      data = YAML.parse(parsed.frontmatter) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (data.status !== 'draft') continue;
    if (typeof data.type !== 'string') continue;
    let schema;
    try {
      schema = nodeSchemaFor(data.type);
    } catch {
      continue;
    }
    if (!schema.safeParse(data).success) continue;

    const id = String(data.id ?? f.rel);
    let transformed;
    try {
      transformed = transformBody(parsed.body, id);
    } catch (e) {
      console.warn(`  [skip] ${f.rel}：${(e as Error).message}`);
      continue;
    }
    if (!transformed.trimmed && transformed.marked === 0) continue;

    fixedFiles++;
    if (transformed.trimmed) trimmedCount++;
    markedCount += transformed.marked;
    const out = `---\n${parsed.frontmatter}\n---\n\n${transformed.body}`;
    if (dry) {
      console.log(`  [dry] ${f.rel}（trimmed=${transformed.trimmed}, marked=${transformed.marked}）`);
    } else {
      await writeFile(f.file, out, 'utf8');
      console.log(`  [fix] ${f.rel}（trimmed=${transformed.trimmed}, marked=${transformed.marked}）`);
    }
  }
  console.log(`\n共处理 ${fixedFiles} 篇 draft；概述截短 ${trimmedCount} 篇；添加（AI收集）标记 ${markedCount} 条。`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(String(e));
    process.exit(1);
  });