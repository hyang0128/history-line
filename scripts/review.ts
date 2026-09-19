#!/usr/bin/env tsx
/**
 * review.ts —— 审核辅助：把 draft 节点的出处清单与机械自查项抽取成一份核对报告。
 *
 * 用法：npm run review [--all] [--out <file>]
 *   --all   连已 reviewed 的也列出（默认只列 draft）
 *   --out   同时把 Markdown 写到文件（默认只打印）
 *
 * 机械自查项（不判断"真伪"，只标可疑）：
 *   - 日期：end<start；人物年龄 >110 或出生不详；事件日期是否落在朝代跨度内
 *   - 概述字数、三块条数、AI 综述、region（world）
 *   - note 是否含"待核"（高优先人工核对信号）
 *   - related 指向未生成的节点数量
 */
import { readFile } from 'node:fs/promises';
import { scanContent } from './lib/content';
import { parseFrontmatter } from './lib/frontmatter';
import { nodeSchemaFor } from './lib/frontmatter-schema';
import { parseBlocks } from '../src/lib/parse-blocks';
import { charLen } from './lib/markdown';

const DYNASTY_SPAN: Record<string, [number, number]> = {
  tang: [618, 907],
};

function fmtYear(y: number): string {
  return y < 0 ? `前 ${-y}` : `${y}`;
}
function fmtRange(d: { start: number; end?: number }): string {
  if (d.end != null && d.end !== d.start) return `${fmtYear(d.start)}–${fmtYear(d.end)}`;
  return fmtYear(d.start);
}

function hasDaike(s: string): boolean {
  return /待核|待查|存疑|不确定|seems|probably/i.test(s);
}

async function main(): Promise<number> {
  const all = process.argv.includes('--all');
  const outFile = (() => {
    const i = process.argv.indexOf('--out');
    return i >= 0 ? process.argv[i + 1] : null;
  })();

  const files = await scanContent();
  const lines: string[] = [];
  const push = (s: string) => lines.push(s);

  let draftCount = 0;
  let daikeCount = 0;
  let quoteCount = 0;

  const nodes: Array<{ rel: string; lines: string[]; flags: string[]; daike: string[] }> = [];

  for (const f of files) {
    if (f.collection === 'eras') continue;
    const text = await readFile(f.file, 'utf8');
    let p;
    try {
      p = parseFrontmatter(text);
    } catch {
      continue;
    }
    if (p.data == null) continue;
    const d = p.data as Record<string, unknown>;
    let schema;
    try {
      schema = nodeSchemaFor(d.type as string);
    } catch {
      continue;
    }
    const r = schema.safeParse(d);
    if (!r.success) continue;
    const n = r.data as { id: string; title: string; date: { start: number; end?: number; precision?: string }; status: string; importance: number; dynasty?: string; region?: string; summary?: string; related?: string[] };
    if (n.status !== 'draft' && !all) continue;
    draftCount++;

    const flags: string[] = [];
    const blockText: string[] = [];
    const daike: string[] = [];

    const s = n.date.start;
    const e = n.date.end;
    if (e != null && e < s) flags.push(`日期 end<start（${s} > ${e}）`);
    if (d.type === 'person' && s > 0 && e != null && e - s > 110) flags.push(`年龄 ${e - s} 岁（偏大，核实）`);
    if (d.type !== 'person' && n.dynasty && DYNASTY_SPAN[n.dynasty]) {
      const [ds, de] = DYNASTY_SPAN[n.dynasty];
      if (s && (s < ds - 1 || (e ?? s) > de + 1)) flags.push(`日期不在 ${n.dynasty}（${ds}–${de}）范围内`);
    }
    if (n.region == null && d.type === 'world') flags.push('world 缺 region');

    const idMap = new Map<string, number>();
    for (const rid of n.related ?? []) idMap.set(rid, (idMap.get(rid) ?? 0) + 1);
    let knownRelated = 0;
    for (const rid of n.related ?? []) {
      for (const g of files) {
        if (g.collection !== 'eras' && g.rel.endsWith(`/${rid}.md`)) { knownRelated++; break; }
      }
    }
    const unknownRelated = (n.related ?? []).length - knownRelated;
    if (unknownRelated > 0) flags.push(`related 指向 ${unknownRelated} 个未生成节点`);

    let blocks;
    try {
      blocks = parseBlocks(p.body, n.id);
    } catch (e) {
      flags.push(`正文解析失败：${(e as Error).message}`);
      nodes.push({ rel: f.rel, lines: [], flags, daike });
      continue;
    }
    for (const entry of [...blocks.official, ...blocks.unofficial]) {
      const t = [entry.source, entry.text, entry.note ?? '', entry.quote ?? ''].join(' ');
      if (hasDaike(t)) daike.push(`待核：${entry.source}（${entry.note ?? entry.text.slice(0, 30)}…）`);
      if (entry.quote) quoteCount++;
      blockText.push(`  - 正史/野史 · ${entry.source} · ${entry.credibility}${entry.quote ? ` · 引：“${entry.quote}”` : ''}${entry.note ? ` · ${entry.note}` : ''}`);
    }
    for (const c of blocks.commentary) {
      const t = [c.source, c.text, c.note ?? '', c.quote ?? ''].join(' ');
      if (hasDaike(t)) daike.push(`待核：批注 ${c.author} ${c.source}`);
      if (c.quote) quoteCount++;
      blockText.push(`  - 批注 · ${c.author} · ${c.source} · ${c.category}/${c.license}${c.quote ? ` · 引：“${c.quote}”` : ''}${c.note ? ` · ${c.note}` : ''}`);
    }
    const ol = charLen(blocks.overview);
    if (ol < 200 || ol > 400) flags.push(`概述 ${ol} 字（规范 200–400）`);
    if (d.type !== 'world') {
      if (blocks.official.length < 2 || blocks.official.length > 4) flags.push(`正史 ${blocks.official.length} 条`);
      if (blocks.unofficial.length > 3) flags.push(`野史 ${blocks.unofficial.length} 条`);
      if (!blocks.commentary.some((x) => x.category === 'ai')) flags.push('缺 AI 综述');
    }

    const nodeLines: string[] = [];
    nodeLines.push(`## ${n.title}（${f.rel.split('/').slice(1).join('/')}）`);
    nodeLines.push(
      `- ${d.type} · ${fmtRange({ start: s, end: e })}${n.dynasty ? ` · ${n.dynasty}` : ``} · importance ${n.importance} · ${n.status}${n.summary ? `\n  summary：${n.summary}` : ''}`,
    );
    if (flags.length) nodeLines.push(`- ⚠ ${flags.join('；')}`);
    if (daike.length) {
      daikeCount += daike.length;
      nodeLines.push(`- **待核事项（优先人工核对）：**`);
      for (const x of daike) nodeLines.push(`  - ${x}`);
    }
    nodeLines.push('- 出处清单：');
    nodeLines.push(...blockText);
    nodes.push({ rel: f.rel, lines: nodeLines, flags, daike });
  }

  nodes.sort((a, b) => a.rel.localeCompare(b.rel));
  push(`# 审核核对清单`);
  push(``);
  push(`共列出 ${nodes.length} 篇 draft 节点；引用原文 ${quoteCount} 处；“待核”标记 ${daikeCount} 处。`);
  push(``);
  push(`> 用法：对照书本/ctext.org/维基文库逐条核「source」的书名卷次与「quote」；`);
  push(`> 近现代学者条目（modern/contemporary）只能转述不可引原文，重点核“观点是否其本人所说”。`);
  push(``);
  for (const node of nodes) {
    for (const l of node.lines) push(l);
    push(``);
  }

  if (outFile) {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const path = await import('node:path');
    await mkdir(path.dirname(outFile), { recursive: true });
    await writeFile(outFile, lines.join('\n'), 'utf8');
    console.log(`已写入 ${outFile}`);
  } else {
    console.log(lines.join('\n'));
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(String(e));
    process.exit(1);
  });