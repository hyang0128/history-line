#!/usr/bin/env tsx
/**
 * stats.ts —— 内容与服务统计（A1）。
 * 用法：npm run stats [-- --json]
 * 输出：各集合 / 朝代 / 状态的节点数、draft 积压、累计生成费用（来自 .cache/runs.jsonl）。
 */
import { loadQueue } from './lib/queue';
import { GENERATE_DIR } from './lib/content';
import { scanContent } from './lib/content';
import { parseFrontmatter } from './lib/frontmatter';
import { nodeSchemaFor } from './lib/frontmatter-schema';
import { loadRuns, loadCache } from './lib/cache';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

interface NodeInfo {
  rel: string;
  collection: string;
  id: string;
  title: string;
  dynasty?: string;
  status: string;
  importance: number;
  reviewedAt?: string;
}

async function main(): Promise<number> {
  const json = process.argv.includes('--json');
  const files = await scanContent();

  const nodes: NodeInfo[] = [];
  let eraCount = 0;
  for (const f of files) {
    const text = await readFile(f.file, 'utf8');
    let p;
    try {
      p = parseFrontmatter(text);
    } catch {
      continue;
    }
    if (p.data == null) continue;
    const data = p.data as Record<string, unknown>;
    if (f.collection === 'eras') {
      eraCount++;
      continue;
    }
    let schema;
    try {
      schema = nodeSchemaFor(data.type as string);
    } catch {
      continue; // 未知 type，跳过统计（validate 会报错）
    }
    const r = schema.safeParse(data);
    if (!r.success) continue;
    const n = r.data as { id: string; title: string; dynasty?: string; status: string; importance: number; reviewed_at?: Date };
    nodes.push({
      rel: f.rel,
      collection: f.collection,
      id: n.id,
      title: n.title,
      dynasty: n.dynasty,
      status: n.status,
      importance: n.importance,
      reviewedAt: n.reviewed_at?.toISOString().slice(0, 10),
    });
  }

  const byCollection = new Map<string, number>();
  const byDynasty = new Map<string, number>();
  const byStatus = new Map<string, number>();
  for (const n of nodes) {
    byCollection.set(n.collection, (byCollection.get(n.collection) ?? 0) + 1);
    byStatus.set(n.status, (byStatus.get(n.status) ?? 0) + 1);
    const d = n.dynasty ?? '(无朝代)';
    byDynasty.set(d, (byDynasty.get(d) ?? 0) + 1);
  }

  const drafts = nodes
    .filter((n) => n.status === 'draft')
    .sort((a, b) => a.importance - b.importance);

  // —— 生成账本 ——
  const runs = await loadRuns();
  const cache = await loadCache();
  const spend = new Map<string, { calls: number; in: number; out: number; cost: number }>();
  for (const r of runs) {
    const s = spend.get(r.model) ?? { calls: 0, in: 0, out: 0, cost: 0 };
    s.calls += 1;
    s.in += r.inputTokens;
    s.out += r.outputTokens;
    s.cost += r.costCny; // 失败的调用同样已计费（provider 抛错时 usage 为 0，费用自然为 0）
    spend.set(r.model, s);
  }
  const totalCost = [...spend.values()].reduce((a, b) => a + b.cost, 0);

  // —— 队列进度 ——
  let queueTotal = 0;
  let queueGenerated = 0;
  try {
    const entries = await loadQueue(path.join(GENERATE_DIR, 'queue.yaml'));
    queueTotal = entries.length;
    for (const e of entries) {
      const c = cache.get(e.id);
      if (c?.ok) queueGenerated++;
    }
  } catch {
    /* queue.yaml 不存在或为空时忽略 */
  }

  const report = {
    files: files.length,
    eras: eraCount,
    byCollection: Object.fromEntries(byCollection),
    byDynasty: Object.fromEntries(byDynasty),
    byStatus: Object.fromEntries(byStatus),
    drafts: drafts.map((d) => ({ id: d.id, rel: d.rel, importance: d.importance })),
    queue: { total: queueTotal, generated: queueGenerated },
    spend: Object.fromEntries([...spend.entries()].map(([m, s]) => [m, s])),
    totalCostCny: +totalCost.toFixed(4),
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('统计');
    console.log(`  文件：${report.files}（分期/朝代 ${report.eras}，节点 ${nodes.length}）`);
    console.log(`  节点状态：${Object.entries(report.byStatus).map(([k, v]) => `${k}=${v}`).join('，')}`);
    byDynasty.size > 0 && console.log(`  朝代分布：${[...byDynasty.entries()].map(([k, v]) => `${k}=${v}`).join('，')}`);
    console.log(`  队列：${report.queue.total} 条，其中已生成 ${report.queue.generated} 条`);
    console.log(`  draft 积压：${drafts.length} 条`);
    for (const d of drafts.slice(0, 20)) {
      console.log(`    - ${d.rel}（importance=${d.importance}）`);
    }
    console.log(`  累计生成费用（估算）：¥${report.totalCostCny}`);
    for (const [m, s] of spend.entries()) {
      console.log(`    - ${m}: ${s.calls} 次，in=${s.in} out=${s.out} tokens，¥${s.cost.toFixed(4)}`);
    }
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(String(e));
    process.exit(1);
  });