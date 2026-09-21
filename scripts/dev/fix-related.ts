#!/usr/bin/env tsx
/**
 * fix-related.ts —— related 引用批量订正（一次性工具）。
 *
 * 背景：validate 报 ~400 条 unknown-related 警告。分三类处理：
 *   future  —— rid 已在 queue.yaml 中（未来节点），保留不动；
 *   rename  —— 引用写法与实际 id 系统性错位（如 li-shi-min → li-shimin、
 *              sui-dynasty → sui），按映射表行级改写 frontmatter 中的 related 条目；
 *   drop    —— 永远不会存在的引用，从 related 中删除该行。
 *
 * 编辑方式：只对 frontmatter 内 related 块做行级替换/删除，正文与 YAML 序列化零改动。
 * 用法：
 *   npx tsx scripts/dev/fix-related.ts analyze            # 输出分类报告
 *   npx tsx scripts/dev/fix-related.ts apply <map.json>   # 按 {renames, drops} 执行
 */
import { readFile, writeFile } from 'node:fs/promises';
import YAML from 'yaml';
import { scanContent, CONTENT_DIR, GENERATE_DIR } from '../lib/content';
import { splitFrontmatter } from '../lib/frontmatter';
import { loadQueue } from '../lib/queue';
import path from 'node:path';

interface NodeInfo {
  id: string;
  type: string;
  title: string;
  rel: string;
}

const norm = (s: string): string => s.replace(/-/g, '');

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

async function loadAll() {
  const files = await scanContent(CONTENT_DIR);
  const nodes: NodeInfo[] = [];
  const refs = new Map<string, string[]>(); // rid → 引用它的文件列表（节点集合）
  let flowStyle = 0;

  for (const f of files) {
    const text = await readFile(f.file, 'utf8');
    const { frontmatter } = splitFrontmatter(text);
    if (frontmatter == null) continue;
    const data = YAML.parse(frontmatter) as Record<string, unknown> | null;
    if (data == null || typeof data !== 'object') continue;
    if (typeof data.id === 'string') {
      nodes.push({ id: data.id, type: String(data.type), title: String(data.title), rel: f.rel });
    }
    if (f.collection === 'eras') continue;
    const rel = data.related;
    if (rel == null) continue;
    if (!Array.isArray(rel)) {
      console.error(`[skip] ${f.rel}: related 不是数组`);
      continue;
    }
    for (const rid of rel) {
      if (typeof rid !== 'string') continue;
      const list = refs.get(rid) ?? [];
      list.push(f.rel);
      refs.set(rid, list);
    }
    if (/^related:\s*\[/m.test(frontmatter)) flowStyle++;
  }
  return { nodes, refs, flowStyle };
}

function suggestTarget(rid: string, existing: NodeInfo[]): { target: string; rule: string } | null {
  // R1: <x>-dynasty → <x>
  const m1 = rid.match(/^([a-z0-9-]+)-dynasty$/);
  if (m1 && existing.some((n) => n.id === m1[1])) return { target: m1[1], rule: 'R1 -dynasty 后缀' };
  // R2: 去连字符后完全一致
  const byNorm = new Map<string, string>();
  for (const n of existing) if (!byNorm.has(norm(n.id))) byNorm.set(norm(n.id), n.id);
  const hit2 = byNorm.get(norm(rid));
  if (hit2) return { target: hit2, rule: 'R2 连字符风格' };
  // R3: 归一化编辑距离 ≤2（长度 ≥6 才启用，避免 jin/xia 之类短 id 误配）
  if (norm(rid).length >= 6) {
    let best: { id: string; d: number } | null = null;
    for (const n of existing) {
      const d = levenshtein(norm(rid), norm(n.id));
      if (d <= 2 && (best == null || d < best.d)) best = { id: n.id, d };
    }
    if (best) return { target: best.id, rule: `R3 编辑距离${best.d}` };
    // R4: 互为包含且比例足够
    for (const n of existing) {
      const a = norm(rid);
      const b = norm(n.id);
      if (a.length >= 6 && b.length >= 6 && (a.includes(b) || b.includes(a)) && Math.min(a.length, b.length) / Math.max(a.length, b.length) >= 0.6) {
        return { target: n.id, rule: 'R4 包含' };
      }
    }
  }
  return null;
}

async function analyze(): Promise<void> {
  const { nodes, refs, flowStyle } = await loadAll();
  const existing = nodes.filter((n) => n.type !== 'era' && n.type !== 'dynasty');
  const existingIds = new Set(nodes.map((n) => n.id));
  const queue = await loadQueue(path.join(GENERATE_DIR, 'queue.yaml'));
  const queueById = new Map(queue.map((q) => [q.id, q]));
  const titleOf = (id: string): string => nodes.find((n) => n.id === id)?.title ?? queueById.get(id)?.title ?? '';

  if (flowStyle > 0) console.warn(`注意：${flowStyle} 个文件使用 flow 风格 related，行级编辑不适用`);

  const futures: string[] = [];
  const renames: { rid: string; target: string; rule: string; n: number }[] = [];
  const orphans: { rid: string; n: number; files: string[] }[] = [];

  for (const [rid, files] of [...refs.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (existingIds.has(rid)) continue; // 正常引用
    if (queueById.has(rid)) {
      futures.push(rid);
      continue;
    }
    const sug = suggestTarget(rid, existing);
    if (sug) renames.push({ rid, target: sug.target, rule: sug.rule, n: files.length });
    else orphans.push({ rid, n: files.length, files });
  }

  console.log(`=== 未来节点（queue 中，保留）: ${futures.length} 个 ===`);
  console.log(futures.join('  '));
  console.log(`\n=== 建议改名: ${renames.length} 个 ===`);
  for (const r of renames.sort((a, b) => b.n - a.n))
    console.log(`${r.rid}  →  ${r.target}   [${r.rule}, 引用${r.n}处]「${titleOf(r.target)}」`);
  console.log(`\n=== 孤立引用（无建议）: ${orphans.length} 个 ===`);
  for (const o of orphans) console.log(`${o.rid}  [引用${o.n}处]  ${o.files.slice(0, 4).join(' ')}`);
  console.log(`\n现有节点 ${existingIds.size} 个，queue ${queueById.size} 条，缺引用 ${futures.length + renames.length + orphans.length} 个 distinct id`);
}

async function apply(mapFile: string): Promise<void> {
  const map = JSON.parse(await readFile(mapFile, 'utf8')) as { renames: Record<string, string>; drops: string[] };
  const renames = new Map(Object.entries(map.renames ?? {}));
  const drops = new Set(map.drops ?? []);
  const { nodes, refs } = await loadAll();
  const selfId = new Map<string, string>(); // rel → 自身 id
  for (const n of nodes) selfId.set(n.rel, n.id);

  const touched = new Set<string>();
  for (const rid of [...renames.keys(), ...drops]) for (const f of refs.get(rid) ?? []) touched.add(f);

  let lines = 0;
  for (const rel of [...touched].sort()) {
    const full = path.join(CONTENT_DIR, rel);
    const text = await readFile(full, 'utf8');
    const { frontmatter, body } = splitFrontmatter(text);
    if (frontmatter == null) continue;
    const own = selfId.get(rel) ?? '';
    const fmLines = frontmatter.split('\n');
    let inRelated = false;
    let changed = 0;
    const seen = new Set<string>(); // related 去重
    const out: string[] = [];
    for (const line of fmLines) {
      const key = line.match(/^([A-Za-z-]+):/);
      if (key) {
        inRelated = key[1] === 'related';
        if (inRelated) seen.clear();
      }
      // flow 风格：related: [a, b, c] —— 单行内 token 级替换/删除
      if (inRelated && /^related:\s*\[.*\]\s*$/.test(line)) {
        let flow = line;
        for (const [rid, target] of renames) {
          const re = new RegExp(`(?<![a-z0-9-])${rid}(?![a-z0-9-])`, 'g');
          if (re.test(flow)) {
            const eff = target === own ? null : target; // 目标=自身 → 转删除
            if (eff == null) drops.add(rid);
            flow = flow.replace(re, eff ?? '');
            changed++;
          }
        }
        for (const rid of drops) {
          const re = new RegExp(`,?\\s*"?${rid}"?(?=\\s*[\\],])|\\["?${rid}"?\\s*\\]`, 'g');
          if (re.test(flow)) {
            flow = flow.replace(re, (m) => (m.startsWith('[') ? '[]' : ''));
            changed++;
          }
        }
        if (flow !== line) out.push(flow);
        else out.push(line);
        inRelated = false;
        continue;
      }
      const item = line.match(/^(\s*)-(\s*)(["']?)([a-z0-9-]+)\3\s*$/);
      if (inRelated && item) {
        const rid = item[4];
        if (seen.has(rid)) {
          changed++;
          continue; // 去重：同一 related 内重复条目只保留第一处
        }
        const doDrop = drops.has(rid);
        const doRename = renames.get(rid);
        const target = doRename === own ? undefined : doRename; // 目标=自身 → 转删除
        if (doDrop || (doRename && !target)) {
          seen.add(rid);
          changed++;
          continue;
        }
        if (target) {
          seen.add(target);
          changed++;
          out.push(`${item[1]}-${item[2]}${target}`);
          continue;
        }
        seen.add(rid);
        out.push(line);
        continue;
      }
      out.push(line);
    }
    if (changed === 0) continue;
    lines += changed;
    await writeFile(full, `---\n${out.join('\n')}\n---\n${body}`);
    console.log(`${rel}: ${changed} 处`);
  }
  console.log(`\n共改写/删除 ${lines} 行，涉及 ${touched.size} 个候选文件`);
}

const cmd = process.argv[2];
if (cmd === 'analyze') await analyze();
else if (cmd === 'apply' && process.argv[3]) await apply(process.argv[3]);
else console.error('用法：fix-related.ts analyze | apply <map.json>');
