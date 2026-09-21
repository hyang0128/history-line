#!/usr/bin/env tsx
/**
 * run.ts —— 批量内容生成（A1，PLAN §6.3）。
 *
 * 流程：queue.yaml → 组装提示词 → provider（models.yaml 档位）→ 结构化输出 →
 *       写盘 content/ → 结构自检 → 本地缓存（断点续跑，防重复付费）→ 成本账本。
 *
 * 用法 npm run generate -- [选项]
 *   --queue <path>     队列文件（默认 scripts/generate/queue.yaml）
 *   --limit <n>        本次最多处理前 n 条（跳过缓存与已存在的）
 *   --only <id>,<id>   只处理指定节点
 *   --model <name>     全局覆盖模型（models.yaml）
 *   --tier <name>      全局默认档位（cheap/medium/high）
 *   --force            忽略缓存、覆盖已存在文件（慎用，会覆盖已审核内容）
 *   --yes              跳过费用确认
 *   --dry-run          只做估算与计划，不调用模型、不写文件
 *   --concurrency <n>  并发数（默认 3）
 *   --retries <n>      重试次数（默认 3）
 *   --out <dir>        输出到指定目录（默认 content/，测试用）
 *   --max-tokens <n>   单次输出 token 上限（默认 4000）
 */
import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { loadModels, resolveModelDef, modelCost, pricesKnown, type ModelsConfig, type ModelDef } from '../lib/models';
import { loadQueue, type QueueEntry } from '../lib/queue';
import { loadCache, saveCache, appendRun, loadRuns, sha256, type CacheEntry, type RunRecord } from '../lib/cache';
import { createProvider, isRetryable, type Provider, type ProviderResult } from './providers/index';
import { parseFrontmatter } from '../lib/frontmatter';
import { composeMarkdown, unwrapCodeFence } from '../lib/markdown';
import { splitSections, splitPreamble } from '../../src/lib/parse-blocks';
import YAML from 'yaml';
import { buildPrompt } from '../lib/prompt';
import { nodeSchemaFor } from '../lib/frontmatter-schema';
import { CACHE_DIR, relForNode } from '../lib/content';
import { checkDraft } from '../lib/validate-core';
import { info, warn, error, section } from '../lib/logger';

interface Options {
  queue: string;
  outDir: string;
  limit: number | null;
  only: string[] | null;
  model: string | null;
  tier: string | null;
  force: boolean;
  yes: boolean;
  dryRun: boolean;
  concurrency: number;
  retries: number;
  temperature: number | null;
  maxTokens: number;
}

interface Plan {
  entry: QueueEntry;
  def: ModelDef;
  targetRel: string;
  targetFile: string;
  system: string;
  user: string;
  hash: string;
  cached: CacheEntry | undefined;
  skip: string; // '' | 'cached' | 'existing'
  est: { input: number; output: number };
}

function parseArgs(argv: string[]): Options {
  const value = (f: string) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (f: string) => argv.includes(f);
  const num = (f: string, def: number) => {
    const v = value(f);
    return v == null || Number.isNaN(Number(v)) ? def : Number(v);
  };
  return {
    queue: value('--queue') ?? path.resolve('scripts', 'generate', 'queue.yaml'),
    outDir: value('--out') ? path.resolve(value('--out')!) : path.resolve('content'),
    limit: value('--limit') ? Number(value('--limit')) : null,
    only: value('--only') ? value('--only')!.split(',').map((s) => s.trim()).filter(Boolean) : null,
    model: value('--model') ?? null,
    tier: value('--tier') ?? null,
    force: has('--force'),
    yes: has('--yes'),
    dryRun: has('--dry-run'),
    concurrency: Math.max(1, num('--concurrency', 3)),
    retries: Math.max(0, num('--retries', 3)),
    temperature: value('--temperature') != null ? Number(value('--temperature')) : null,
    maxTokens: num('--max-tokens', 4000),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 顺序化 cache / runs 的写盘（并发 worker 会同时写同一文件） */
let cacheWriteTail: Promise<void> = Promise.resolve();
function queueCacheSave(entries: Map<string, CacheEntry>): void {
  cacheWriteTail = cacheWriteTail.then(() => saveCache(entries)).catch((e) => warn(`缓存写入失败：${e}`));
}
function queueRunAppend(run: RunRecord): void {
  cacheWriteTail = cacheWriteTail.then(() => appendRun(run)).catch((e) => warn(`账本写入失败：${e}`));
}

async function existsFile(p: string): Promise<boolean> {
  try {
    await readFile(p, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/** 按历史平均估算该模型单节点 token，无历史则用 models.yaml 的 estimateTokens */
function estimateTokens(cfg: ModelsConfig, runs: Array<{ model: string; ok: boolean; inputTokens: number; outputTokens: number }>, model: string) {
  const rs = runs.filter((r) => r.model === model && r.ok);
  if (!rs.length) return { ...cfg.estimateTokens };
  const avg = (k: 'inputTokens' | 'outputTokens') =>
    Math.round(rs.reduce((a, r) => a + r[k], 0) / rs.length);
  return { input: avg('inputTokens'), output: avg('outputTokens') };
}

/** 模型偶尔漏写 frontmatter 的闭合 ---；在第一个 ## 标题前补上（内容正确，仅缺分隔线） */
function ensureFrontmatterClosed(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const open = lines.findIndex((l) => l.trim() === '---');
  if (open < 0) return text;
  for (let i = open + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      for (let j = open + 1; j < i; j++) {
        if (lines[j].trim() === '---') return text; // 已有闭合
      }
      lines.splice(i, 0, '---');
      return lines.join('\n');
    }
  }
  return text;
}

const PRECISIONS = ['year', 'month', 'day', 'circa', 'century'];

/** 用队列元数据兜底 frontmatter 结构字段，其余保留模型输出，再跑 zod 校验 */
function finalizeFrontmatter(text: string, entry: QueueEntry, modelName: string): { data: unknown; body: string } {
  const parsed = parseFrontmatter(ensureFrontmatterClosed(unwrapCodeFence(text)));
  if (!parsed.hadFrontmatter || parsed.data == null) {
    throw new Error('模型未按模板输出 frontmatter（内容不以 --- 开头）');
  }
  /** 模型常输出 "location:" 这类空值 → YAML 解析为 null；把 null 视为未填写 */
  const stripNulls = (o: Record<string, unknown>) => {
    for (const k of Object.keys(o)) {
      if (o[k] === null) delete o[k];
    }
    return o;
  };
  const candidate = stripNulls({ ...(parsed.data as Record<string, unknown>) });
  candidate.id = entry.id;
  candidate.type = entry.type;
  candidate.status = 'draft';
  candidate.generated_by = modelName;
  candidate.importance = entry.importance;
  if (entry.era) candidate.era = entry.era;
  if (entry.dynasty) candidate.dynasty = entry.dynasty;
  else delete candidate.dynasty; // 队列未指定时不接受模型自造（跨朝代专题/世界史）
  if (entry.region && entry.type === 'world') candidate.region = entry.region;
  delete candidate.reviewed_at;

  const date = (candidate.date ?? {}) as Record<string, unknown>;
  if (entry.year != null && (typeof date.start !== 'number' || date.start === 0)) date.start = entry.year;
  if (typeof date.start !== 'number') date.start = entry.year ?? 0;
  if (entry.yearEnd != null) date.end = entry.yearEnd;
  if (typeof date.end !== 'number') delete date.end;
  // precision 只接受枚举值，模型偶发写 "approx" 等 → 回退 year
  if (date.precision !== undefined && !PRECISIONS.includes(date.precision as string)) date.precision = 'year';
  candidate.date = date;

  // 过滤非法 related id（模型偶发写入中文/空格）
  if (Array.isArray(candidate.related)) {
    candidate.related = candidate.related.filter(
      (x) => typeof x === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(x),
    );
  }
  // location 偶发被模型写成数组 → 合并为字符串
  if (Array.isArray(candidate.location)) {
    candidate.location = candidate.location.filter((x) => typeof x === 'string').join('、');
  }
  // tags/aliases 只保留字符串元素
  for (const k of ['tags', 'aliases', 'titles'] as const) {
    if (Array.isArray(candidate[k])) {
      candidate[k] = candidate[k].filter((x) => typeof x === 'string');
    }
  }

  const schema = nodeSchemaFor(entry.type);
  const r = schema.safeParse(candidate);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；');
    throw new Error(`frontmatter 不合规：${issues}`);
  }
  return { data: r.data, body: parsed.body };
}

/** 单节点生成：调用（含重试）→ 结构化 → 自检 → 写盘 → 返回账本 */
async function generateOne(
  opts: Pick<Options, 'retries' | 'temperature' | 'maxTokens' | 'force'>,
  cfg: ModelsConfig,
  provider: Provider,
  p: Plan,
): Promise<{ run: Parameters<typeof appendRun>[0]; entry: CacheEntry }> {
  const { entry, def } = p;
  const modelName = def.model;

  let result: ProviderResult | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      result = await provider({
        system: p.system,
        user: p.user,
        temperature: opts.temperature ?? 0.7,
        maxTokens: opts.maxTokens,
        meta: entry as unknown as Record<string, unknown>,
      });
      break;
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e)) break;
      if (attempt < opts.retries) await sleep(400 * 2 ** attempt);
    }
  }
  if (!result) {
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    return {
      run: { at: new Date().toISOString(), id: entry.id, file: null, model: modelName, inputTokens: 0, outputTokens: 0, costCny: 0, ok: false, error: msg },
      entry: { at: new Date().toISOString(), id: entry.id, file: null, model: modelName, inputTokens: 0, outputTokens: 0, costCny: 0, ok: false, promptHash: p.hash, error: msg },
    };
  }

  const costCny = modelCost(def, result.usage.inputTokens, result.usage.outputTokens, cfg.usdCnyRate);
  let draftText: string;
  try {
    const { data, body } = finalizeFrontmatter(result.text, entry, modelName);
    draftText = composeMarkdown(data, normalizeBodyBlocks(body));
  } catch (e) {
    await saveFailed(entry.id, result.text, String((e as Error).message));
    const msg = (e as Error).message;
    return {
      run: { at: new Date().toISOString(), id: entry.id, file: null, model: modelName, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costCny, ok: false, error: msg },
      entry: { at: new Date().toISOString(), id: entry.id, file: null, model: modelName, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costCny, ok: false, promptHash: p.hash, error: msg },
    };
  }

  const chk = checkDraft(draftText, entry.type);
  if (!chk.ok) {
    await saveFailed(entry.id, draftText, chk.errors.join('；'));
    const msg = chk.errors.join('；');
    return {
      run: { at: new Date().toISOString(), id: entry.id, file: null, model: modelName, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costCny, ok: false, error: msg },
      entry: { at: new Date().toISOString(), id: entry.id, file: null, model: modelName, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costCny, ok: false, promptHash: p.hash, error: msg },
    };
  }

  await mkdir(path.dirname(p.targetFile), { recursive: true });
  await writeFile(p.targetFile, draftText, 'utf8');
  return {
    run: { at: new Date().toISOString(), id: entry.id, file: p.targetRel, model: modelName, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costCny, ok: true },
    entry: { at: new Date().toISOString(), id: entry.id, file: p.targetRel, model: modelName, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, costCny, ok: true, promptHash: p.hash },
  };
}

/** 修复"值内半角冒号未引号"导致的 YAML 解析失败（如 书名 "The Enlightenment: An Interpretation"）。
 * 本 schema 的整史/野史/批注块都是扁平条目，不存在嵌套映射，因此可安全地把含 `: ` 的标量加双引号。 */
function repairYamlColons(raw: string): string {
  return raw
    .split('\n')
    .map((line) => {
      const m = /^(\s*)(- )?([a-zA-Z_]+):(\s*)(.*)$/.exec(line);
      if (!m) return line;
      const value = m[5];
      if (!value) return line;
      // 映射/列表容器开头不动；其余只要"含 : 或以半角引号开头"就整体引号化
      // （模型常用成对 ASCII 引号包裹中文引文，形成未闭合 YAML 字符串）
      if (/^[\s]*[{\[]/.test(value)) return line;
      if (value.startsWith('"') || value.startsWith("'") || /: /.test(value)) {
        return `${m[1]}${m[2]}${m[3]}: ${JSON.stringify(value)}`;
      }
      return line;
    })
    .join('\n');
}

/** 模型常在块 YAML 里写空值（如 `quote:` 空行 → null），parse-blocks 的 strict 校验不接受 null。
 * 写盘前对正史/野史/批注三个块做"null 清理 + 重序列化"，其余不变。
 * 重复二级标题会让 splitSections 的 Map 去重而丢块，导语不属四块规范——前者直接报错，后者丢弃并警告。 */
function normalizeBodyBlocks(body: string): string {
  const heads = [...body.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)].map((m) => m[1]);
  const dupes = [...new Set(heads.filter((h, i) => heads.indexOf(h) !== i))];
  if (dupes.length) {
    throw new Error(`正文出现重复二级标题：${dupes.join('、')}（按标题去重会丢前块，须重新生成或手工修复）`);
  }
  const { preamble, rest } = splitPreamble(body);
  if (preamble.trim()) warn(`正文在首个 ## 前有 ${preamble.trim().length} 字导语，不属四块规范，已丢弃`);
  const sections = splitSections(rest);
  for (const h of ['正史', '野史', '批注'] as const) {
    const raw = sections.get(h) ?? '';
    if (!raw.trim()) continue;
    let data: unknown;
    try {
      data = YAML.parse(raw);
    } catch {
      try {
        data = YAML.parse(repairYamlColons(raw)); // 冒号未引号导致失败时先修复再试
      } catch {
        continue; // 仍失败则保留原样，让 parse-blocks 报具体错误
      }
    }
    if (Array.isArray(data)) {
      const clean = data.map((e) => stripNulls(e));
      sections.set(h, YAML.stringify(clean, { lineWidth: 0, sortMapEntries: false }).trimEnd());
    }
  }
  const kept: string[] = [];
  for (const [h, c] of sections) kept.push(`## ${h}\n\n${c}`);
  return kept.join('\n\n');
}

/** 递归删除对象/数组中的 null（视为"未填写"） */
function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val !== null) o[k] = stripNulls(val);
    }
    return o;
  }
  return v;
}

async function saveFailed(id: string, content: string, diagnostic: string) {
  const dir = path.join(CACHE_DIR, 'failed');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${id}.md`), `<!-- 生成失败：${diagnostic} -->\n\n${content}\n`, 'utf8').catch(() => {});
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function askConfirm(totalEst: number): Promise<boolean> {
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ans = await rl.question(`本次预估费用约 ¥${totalEst.toFixed(2)}，超过阈值。继续？(y/N) `);
    rl.close();
    return /^y/i.test(ans);
  }
  error(`预估费用 ¥${totalEst.toFixed(2)} 超过阈值，且当前不是交互终端。`);
  error(`确认继续请加 --yes，或缩小范围（--limit / --only），或用 --dry-run 查看计划。`);
  return false;
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  if (process.argv.includes('--help')) {
    console.log('见文件头部注释的用法说明；或  npm run generate -- --help');
    return 0;
  }

  const cfg = await loadModels();
  const entries = await loadQueue(opts.queue);
  const selected = entries.filter((e) => !opts.only || opts.only.includes(e.id));
  if (opts.limit != null) selected.splice(opts.limit);

  const cache = await loadCache();
  const runs = await loadRuns();

  // —— 制定计划 ——
  const plans: Plan[] = [];
  for (const entry of selected) {
    const def = resolveModelDef(cfg, {
      model: opts.model ?? entry.model,
      tier: opts.tier ?? entry.tier,
      importance: entry.importance,
    });
    const targetRel = relForNode(entry);
    const targetFile = path.join(opts.outDir, targetRel);
    const { system, user } = await buildPrompt({ ...entry, model: def.model });
    const hash = sha256(system, user, def.model);
    const cached = cache.get(entry.id);
    let skip = '';
    // 缓存命中 = 该输入已在本输出目录生成且文件在（不满足时退回“文件已存在”判断）
    if (!opts.force && cached?.ok && cached.model === def.model && cached.promptHash === hash && (await existsFile(targetFile))) {
      skip = 'cached';
    } else if (!opts.force && (await existsFile(targetFile))) {
      skip = 'existing';
    }
    plans.push({ entry, def, targetRel, targetFile, system, user, hash, cached, skip, est: estimateTokens(cfg, runs, def.model) });
  }

  const toDo = plans.filter((p) => !p.skip);
  const totalEst = toDo.reduce((a, p) => a + modelCost(p.def, p.est.input, p.est.output, cfg.usdCnyRate), 0);

  section(`队列 ${selected.length} 条 → 待生成 ${toDo.length} 条（缓存 ${plans.length - toDo.length} 条）`);
  for (const p of plans) {
    const tag = p.skip
      ? `[${p.skip}]`
      : `¥${modelCost(p.def, p.est.input, p.est.output, cfg.usdCnyRate).toFixed(3)}`;
    info(`  ${p.entry.id}  →  ${p.targetRel}   ${p.def.model}  ${tag}`);
  }
  const estPart = toDo.length && !pricesKnown(toDo[0].def) ? '（该模型价格未填写，费用按 0 估算）' : '';
  info(`预估费用合计：¥${totalEst.toFixed(2)} ${estPart}`);

  if (opts.dryRun) {
    info(`\n--dry-run：以上为计划，未调用任何模型。`);
    return 0;
  }

  if (totalEst > cfg.costThresholdYuan && !opts.yes) {
    const ok = await askConfirm(totalEst);
    if (!ok) return 1;
  }

  const byDef = new Map<string, Provider>();
  const getProvider = (def: ModelDef) => {
    if (!byDef.has(def.provider + def.model)) byDef.set(def.provider + def.model, createProvider(def));
    return byDef.get(def.provider + def.model)!;
  };

  const done: Array<{ ok: boolean; entry: QueueEntry; model: string; cost: number; error?: string; file?: string }> = [];
  let generated = 0;

  section('正在生成');
  await mapPool(toDo, opts.concurrency, async (p) => {
    const result = await generateOne(opts, cfg, getProvider(p.def), p);
    cache.set(p.entry.id, result.entry);
    queueCacheSave(cache);
    queueRunAppend(result.run);
    done.push({
      ok: result.run.ok,
      entry: p.entry,
      model: p.def.model,
      cost: result.run.costCny,
      error: result.run.error,
      file: result.run.file ?? undefined,
    });
    if (result.run.ok) {
      generated++;
      info(`  ✔ ${p.entry.id} → ${p.entry.title}`);
    } else {
      warn(`  ✘ ${p.entry.id}：${result.run.error}（原始输出存于 .cache/failed/）`);
    }
  });

  const costReal = done.reduce((a, d) => a + d.cost, 0);
  await cacheWriteTail;
  section('完成');
  info(`生成成功：${generated}；失败：${done.length - generated}`);
  info(`本次实际费用（估算）：¥${costReal.toFixed(4)}`);
  if (toDo.length === 0) {
    info(`没有待生成节点（全部命中缓存或已存在）。这就是“重复运行同一队列不产生新费用”的效果。`);
  }
  if (generated > 0) {
    info(`下一步：npm run validate 检查通过后，按 docs/style-guide.md §7 逐条人工审核。`);
  }
  return done.some((d) => !d.ok) ? 2 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    error(String(e));
    process.exit(1);
  });