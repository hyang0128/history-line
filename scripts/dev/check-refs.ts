#!/usr/bin/env tsx
/**
 * check-refs.ts —— 交叉核对 related 指向与日期/朝代一致性（人工订正辅助）。
 * 用法：npm run check:refs [--json]
 *   --json 输出 JSON
 *
 * 检查项：
 *   a. related 重复条目
 *   b. related 指向不存在的节点且不在生成队列 → 悬空指针
 *   c. 节点 date 落在所在朝代（或分期）跨度之外（容差 ±1 年）
 *   d. frontmatter era 与 dynasty.parent 不一致
 *   e. 目录中的朝代子目录与 frontmatter dynasy 不一致
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { scanContent, CONTENT_DIR } from '../lib/content';
import { parseFrontmatter } from '../lib/frontmatter';
import { nodeSchemaFor, eraSchema } from '../lib/frontmatter-schema';

type Finding = { rel: string; msg: string };

function between(v: number, lo: number, hi: number): boolean {
  return v >= lo && v <= hi;
}

async function main(): Promise<number> {
  const json = process.argv.includes('--json');
  const files = await scanContent();

  // 1) 收集 era/dynasty 的跨度与层级
  const spans = new Map<string, { start: number; end: number; parent?: string }>();
  for (const f of files) {
    if (f.collection !== 'eras') continue;
    const text = await readFile(f.file, 'utf8');
    try {
      const p = parseFrontmatter(text);
      const d = eraSchema.safeParse(p.data).data;
      if (d) spans.set(d.id, { start: d.date.start, end: d.date.end ?? d.date.start, parent: d.parent });
    } catch {}
  }

  // 2) 已生成节点 id 与队列 id
  const generated = new Map<string, { rel: string; type: string; collection: string }>();
  const queueIds = new Set<string>();
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
    const d = p.data as { id?: string; type?: string };
    if (d.id) generated.set(d.id, { rel: f.rel, type: d.type ?? '', collection: f.collection });
  }
  try {
    const q = await readFile(path.join(CONTENT_DIR, '..', 'scripts', 'generate', 'queue.yaml'), 'utf8');
    for (const m of q.matchAll(/^\s*-\s*id:\s*([a-z0-9-]+)/gm)) queueIds.add(m[1]);
  } catch {}

  const findings: Finding[] = [];

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
    let n;
    try {
      n = nodeSchemaFor((p.data as any).type).safeParse(p.data).data;
    } catch {
      continue;
    }
    if (!n) continue;
    const id: string = n.id;
    const dynasty: string | undefined = n.dynasty;
    const era: string = n.era;
    const type: string = n.type;
    const s: number = n.date.start;
    const e: number = n.date.end ?? s;

    // 目录朝代一致性：events/<子目录>/ 的第三段子目录（第二段若为朝代）
    const segments = f.rel.split('/');
    const folderDyn = segments.length >= 3 && segments[1] !== undefined && ['events', 'persons'].includes(segments[0]) ? segments[1] : undefined;
    if (folderDyn && folderDyn !== dynasty) {
      findings.push({ rel: f.rel, msg: `目录朝代 “${folderDyn}” 与 frontmatter dynasty “${dynasty}” 不一致` });
    }

    // era 与 dynasty.parent 一致性
    if (dynasty && spans.has(dynasty)) {
      const sp = spans.get(dynasty)!;
      if (sp.parent && sp.parent !== era) {
        findings.push({ rel: f.rel, msg: `era “${era}” 与 dynasty “${dynasty}” 的 parent “${sp.parent}” 不一致` });
      }
      // 日期落在朝代跨度内（event/topic；person/world 不强制）
      if (type !== 'person' && type !== 'world' && !between(s, sp.start - 1, sp.end + 1) && !between(e, sp.start - 1, sp.end + 1)) {
        findings.push({ rel: f.rel, msg: `日期 ${s}–${e}${e === s ? '' : ''} 落在朝代 “${dynasty}”（${sp.start}–${sp.end}）之外` });
      }
    } else if (!dynasty && spans.has(era)) {
      const sp = spans.get(era)!;
      if (type !== 'person' && !between(s, sp.start - 1, sp.end + 1) && !between(e, sp.start - 1, sp.end + 1)) {
        findings.push({ rel: f.rel, msg: `日期 ${s}–${e} 落在分期 “${era}”（${sp.start}–${sp.end}）之外` });
      }
    }

    // related 检查
    const rels: string[] = n.related ?? [];
    const seen = new Set<string>();
    for (const r of rels) {
      if (seen.has(r)) {
        findings.push({ rel: f.rel, msg: `related 重复条目 “${r}”` });
        continue;
      }
      seen.add(r);
      const g = generated.get(r);
      if (!g && !queueIds.has(r)) {
        findings.push({ rel: f.rel, msg: `related “${r}” 既无节点也不在生成队列（悬空指针）` });
      }
    }
  }

  const sorted = findings.sort((a, b) => a.rel.localeCompare(b.rel));
  if (json) {
    console.log(JSON.stringify({ count: sorted.length, findings: sorted }, null, 2));
  } else {
    console.log(`交叉核对：${sorted.length} 处可疑`);
    for (const x of sorted) console.log(`  ${x.rel} — ${x.msg}`);
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(String(e));
    process.exit(1);
  });