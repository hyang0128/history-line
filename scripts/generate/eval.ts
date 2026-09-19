#!/usr/bin/env tsx
/**
 * eval.ts —— 多模型评测（A1，PLAN §6.7）。
 *
 * 用 M0 的 10 个唐朝样例事件的元数据驱动候选模型再生成草稿，结构自动打分：
 *   - frontmatter schema、正文四块是否合规
 *   - 必备要素：AI 综述、credibility、license 是否齐全
 *   - token 用量与费用（按 models.yaml 单价估算）
 * 出处是否属实无法自动判断——报告会附每节点“出处清单”，供人工比对后写入 docs/model-eval.md。
 *
 * 用法：
 *   npm run gen:eval           # 只打印计划与预估费用（不调用模型）
 *   npm run gen:eval -- --run  # 实际评测（会花 token，先看 --dry-run 的估算）
 *   --models a,b               # 覆盖 models.yaml eval.models
 *   --determinism              # 每个节点同模型跑两次，比较稳定性（温度 0）
 */
import 'dotenv/config';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadModels, resolveModelDef, modelCost, type ModelsConfig, type ModelDef } from '../lib/models';
import { createProvider, isRetryable, type Provider } from './providers/index';
import { parseFrontmatter } from '../lib/frontmatter';
import { checkDraft } from '../lib/validate-core';
import { unwrapCodeFence } from '../lib/markdown';
import { parseBlocks } from '../../src/lib/parse-blocks';
import { buildPrompt } from '../lib/prompt';
import { ROOT, CACHE_DIR } from '../lib/content';

interface Sample {
  id: string;
  type: string;
  title: string;
  era?: string;
  dynasty?: string;
  year?: number;
  importance: number;
}

interface NodeScore {
  sample: Sample;
  model: string;
  ok: boolean;
  issues: string[];
  warnings: string[];
  inputTokens: number;
  outputTokens: number;
  costCny: number;
  sources: string[];
  deterministic: boolean | null;
  text: string; // 保存的原始草稿
}

async function loadSamples(): Promise<Sample[]> {
  const dir = path.join(ROOT, 'content', 'events', 'tang');
  const out: Sample[] = [];
  for (const name of (await readdir(dir)).filter((n) => n.endsWith('.md'))) {
    const text = await readFile(path.join(dir, name), 'utf8');
    const p = parseFrontmatter(text);
    if (p.data == null) continue;
    const d = p.data as Record<string, unknown>;
    const date = d.date as { start?: number } | undefined;
    out.push({
      id: d.id as string,
      type: d.type as string,
      title: d.title as string,
      era: d.era as string | undefined,
      dynasty: d.dynasty as string | undefined,
      year: date?.start,
      importance: (d.importance as number) ?? 3,
    });
  }
  return out.sort((a, b) => a.year! - b.year!);
}

async function runOne(provider: Provider, def: ModelDef, sample: Sample, temperature: number): Promise<{ text: string; in: number; out: number } | { error: string }> {
  const { system, user } = await buildPrompt({ ...sample, model: def.model, year: sample.year });
  let last: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await provider({ system, user, temperature, maxTokens: 4000, meta: { ...sample } });
      return { text: r.text, in: r.usage.inputTokens, out: r.usage.outputTokens };
    } catch (e) {
      last = e;
      if (!isRetryable(e)) break;
    }
  }
  return { error: last instanceof Error ? last.message : String(last) };
}

function scoreText(text: string): Pick<NodeScore, 'ok' | 'issues' | 'warnings' | 'sources'> {
  const issues: string[] = [];
  const warnings: string[] = [];
  const sources: string[] = [];
  let parsed;
  try {
    parsed = parseFrontmatter(unwrapCodeFence(text));
  } catch (e) {
    issues.push(`frontmatter 解析失败：${(e as Error).message}`);
    return { ok: false, issues, warnings, sources };
  }
  if (parsed.data == null) {
    issues.push('缺少 frontmatter');
    return { ok: false, issues, warnings, sources };
  }
  const type = ((parsed.data as Record<string, unknown>).type as string) ?? 'event';
  const chk = checkDraft(text, type);
  issues.push(...chk.errors);
  warnings.push(...chk.warnings);
  // 从正文提取出处清单供人工核对
  try {
    const blocks = parseBlocks(parsed.body, 'eval');
    if (blocks.overview.trim()) {
      const ol = blocks.overview.replace(/[\s　]/g, '').length;
      if (ol < 200 || ol > 400) warnings.push(`概述 ${ol} 字`);
    }
    for (const s of [...blocks.official, ...blocks.unofficial]) sources.push(s.source);
    for (const c of blocks.commentary) sources.push(c.license === 'ai-synthesis' ? `AI 综述（${c.source}）` : c.source);
  } catch (e) {
    issues.push(`正文解析失败：${(e as Error).message}`);
  }
  return { ok: issues.length === 0, issues, warnings, sources };
}

function estCost(def: ModelDef, cfg: ModelsConfig, inTok: number, outTok: number): number {
  return modelCost(def, inTok, outTok, cfg.usdCnyRate);
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const runFlag = argv.includes('--run');
  const deter = argv.includes('--determinism');
  const modelsArg = argv.find((a) => a !== '--run' && a !== '--determinism' && a.startsWith('--models'))
    ?.split('=')[1];
  if (argv.includes('--help')) {
    console.log('用法：npm run gen:eval -- [--run] [--models a,b] [--determinism]');
    return 0;
  }

  const cfg = await loadModels();
  const samples = await loadSamples();
  const modelNames = modelsArg ? modelsArg.split(',').map((s) => s.trim()).filter(Boolean) : cfg.eval?.models ?? [];
  if (!modelNames.length) {
    console.error('models.yaml 未配置 eval.models，也没有 --models。');
    return 1;
  }
  const defs = modelNames.map((n) => resolveModelDef(cfg, { model: n }));

  const tt = cfg.estimateTokens;
  console.log(`评测计划：${samples.length} 个样例 × ${defs.length} 个模型`);
  for (const d of defs) {
    const perNode = estCost(d, cfg, tt.input, tt.output);
    console.log(`  ${d.model}  ${d.provider}  每节点,~¥${perNode.toFixed(4)}；合计(不确定)~¥${(perNode * samples.length * (deter ? 2 : 1)).toFixed(3)}`);
  }
  if (!runFlag) {
    console.log('\n以上为估算，未调用任何模型。加 --run 实际执行（会花费 token，先确认以上数字）。');
    return 0;
  }

  const outDir = path.join(CACHE_DIR, 'eval');
  const results: NodeScore[] = [];
  console.log('\n开始评测…');
  for (const def of defs) {
    const provider = createProvider(def);
    await mkdir(path.join(outDir, def.model), { recursive: true });
    for (const sample of samples) {
      const r1 = await runOne(provider, def, sample, 0);
      if ('error' in r1) {
        results.push({ sample, model: def.model, ok: false, issues: [r1.error], warnings: [], inputTokens: 0, outputTokens: 0, costCny: 0, sources: [], deterministic: null, text: '' });
        console.log(`  ✘ ${def.model} ${sample.id}：${r1.error}`);
        continue;
      }
      const cost = estCost(def, cfg, r1.in, r1.out);
      const scored = scoreText(r1.text);
      let deterministic: boolean | null = null;
      if (deter) {
        const r2 = await runOne(provider, def, sample, 0);
        deterministic = !('error' in r2) && r2.text === r1.text;
      }
      await writeFile(path.join(outDir, def.model, `${sample.id}.md`), r1.text, 'utf8');
      results.push({ sample, model: def.model, ...scored, inputTokens: r1.in, outputTokens: r1.out, costCny: cost, deterministic, text: r1.text });
      console.log(`  ${scored.ok ? '✔' : '✘'} ${def.model} ${sample.id}（in=${r1.in} out=${r1.out}，¥${cost.toFixed(4)}）${scored.issues.length ? `：${scored.issues[0]}` : ''}`);
    }
  }

  // —— 报告 ——
  const perModel = new Map<string, NodeScore[]>();
  for (const r of results) {
    if (!perModel.has(r.model)) perModel.set(r.model, []);
    perModel.get(r.model)!.push(r);
  }
  const lines: string[] = [
    `# 多模型评测报告`,
    ``,
    `生成时间：${new Date().toISOString()}`,
    `样例：${samples.length} 个唐朝事件；模型：${defs.map((d) => d.model).join(', ')}`,
    ``,
    `| 模型 | 合格/节点数 | 结构错误数(平均) | 平均 in/out token | 平均费用¥ | 确定性 |`,
    `|---|---|---|---|---|---|`,
  ];
  for (const [model, rs] of perModel) {
    const ok = rs.filter((r) => r.ok).length;
    const errs = rs.reduce((a, r) => a + r.issues.length, 0);
    const avgIn = Math.round(rs.reduce((a, r) => a + r.inputTokens, 0) / rs.length);
    const avgOut = Math.round(rs.reduce((a, r) => a + r.outputTokens, 0) / rs.length);
    const avgCost = rs.reduce((a, r) => a + r.costCny, 0) / rs.length;
    const det = rs.every((r) => r.deterministic !== false) ? (rs.some((r) => r.deterministic === true) ? '✔' : '—') : '✘';
    lines.push(`| ${model} | ${ok}/${rs.length} | ${errs} | ${avgIn}/${avgOut} | ¥${avgCost.toFixed(4)} | ${det} |`);
  }
  lines.push('', `## 逐模型出处清单（供人工核对）`, '');
  for (const [model, rs] of perModel) {
    lines.push(`### ${model}`, '');
    lines.push('<details><summary>展开</summary>', '');
    for (const r of rs) {
      lines.push(`**${r.sample.id}（${r.sample.title}）** ${r.ok ? '✔' : '✘'}`, '');
      for (const i of r.issues) lines.push(`- 错: ${i}`);
      for (const w of r.warnings.slice(0, 5)) lines.push(`- 警: ${w}`);
      for (const s of r.sources.slice(0, 12)) lines.push(`  - ${s}`);
      lines.push('');
    }
    lines.push('</details>', '');
  }
  const reportFile = path.join(outDir, 'report.md');
  await writeFile(reportFile, lines.join('\n'), 'utf8');
  await writeFile(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n报告已写入 ${reportFile} 与 results.json。`);
  console.log('把逐模型出处清单与人工抽查结论整理进 docs/model-eval.md（结构分数已可参考，出处还需人核）。');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(String(e));
    process.exit(1);
  });