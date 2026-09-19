/**
 * 模型登记表（scripts/generate/models.yaml）的加载与解析。
 * 单价是示例值，须在 docs/model-eval.md 的实测后按各家官网当前价核对更新（PLAN §6.7）。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { GENERATE_DIR } from './content';

export type ProviderKind = 'openai-compatible' | 'anthropic' | 'mock';
export type Currency = 'cny' | 'usd';

const PROVIDERS = new Set<ProviderKind>(['openai-compatible', 'anthropic', 'mock']);

export interface ModelDef {
  provider: ProviderKind;
  /** provider 侧的模型 id */
  model: string;
  baseURL?: string;
  /** 读取 API key/token 的环境变量名，key 不入库 */
  apiKeyEnv?: string;
  /** anthropic 鉴权方式：默认 x-api-key，bearer 用于 Ark 等网关（配 ANTHROPIC_AUTH_TOKEN） */
  auth?: 'x-api-key' | 'bearer';
  /** 元 / 百万 token；currency 为 usd 时按 usdCnyRate 换算 */
  inputPerM?: number;
  outputPerM?: number;
  currency: Currency;
  context?: number;
  note?: string;
}

export interface ModelsConfig {
  defaults: { tier: string; model: string };
  /** 档位名 → 模型名（cheap / medium / high …） */
  tiers: Record<string, string>;
  /** importance → 档位；默认空表以免意外升档花钱 */
  tierByImportance: Record<number, string>;
  /** 统一换汇示例值 */
  usdCnyRate: number;
  /** 单次运行预估费用上限（元），超出需 --yes 确认 */
  costThresholdYuan: number;
  /** 无历史记录时每节点预估 token（用于 --dry-run / 费用提示） */
  estimateTokens: { input: number; output: number };
  models: Record<string, ModelDef>;
  eval?: { models: string[] };
}

export async function loadModels(file?: string): Promise<ModelsConfig> {
  const p = file ? path.resolve(file) : path.join(GENERATE_DIR, 'models.yaml');
  const text = await readFile(p, 'utf8');
  const raw = YAML.parse(text) as Record<string, unknown>;
  const models = (raw.models ?? {}) as Record<string, ModelDef>;
  for (const [name, m] of Object.entries(models)) {
    if (!PROVIDERS.has(m.provider)) {
      throw new Error(`models.yaml：模型 ${name} 的 provider “${m.provider}” 不支持`);
    }
    if (!m.model) throw new Error(`models.yaml：模型 ${name} 缺 model 字段`);
    if (!m.currency) m.currency = 'cny';
  }
  const defaults = (raw.defaults ?? {}) as Record<string, string>;
  const tiers = (raw.tiers ?? {}) as Record<string, string>;
  const cfg: ModelsConfig = {
    defaults: { tier: defaults.tier ?? 'cheap', model: defaults.model ?? 'deepseek-chat' },
    tiers,
    tierByImportance: (raw.tierByImportance ?? {}) as Record<number, string>,
    usdCnyRate: (raw.usdCnyRate as number) ?? 7.2,
    costThresholdYuan: (raw.costThresholdYuan as number) ?? 20,
    estimateTokens: {
      input: ((raw.estimateTokens as { input?: number })?.input ?? 2600),
      output: ((raw.estimateTokens as { output?: number })?.output ?? 1500),
    },
    models,
    eval: { models: ((raw.eval as { models?: string[] } | undefined)?.models ?? []) },
  };
  if (!cfg.tiers[cfg.defaults.tier]) cfg.tiers[cfg.defaults.tier] = cfg.defaults.model;
  return cfg;
}

export interface TierChoice {
  /** 显式指定模型名 */
  model?: string | null;
  /** 显式指定任务档位（cheap / medium / high） */
  tier?: string | null;
  importance?: number;
}

/** 按“显式 model > 显式 tier > importance 档位 > 默认档位”解析模型 */
export function resolveModelDef(cfg: ModelsConfig, choice: TierChoice): ModelDef {
  if (choice.model) {
    const m = cfg.models[choice.model];
    if (!m) throw new Error(`未知模型：${choice.model}（models.yaml 中不存在）`);
    return m;
  }
  const byImp = choice.importance !== undefined ? cfg.tierByImportance[choice.importance] : undefined;
  const tier = choice.tier ?? byImp ?? cfg.defaults.tier;
  const name = cfg.tiers[tier] ?? cfg.defaults.model;
  const m = cfg.models[name];
  if (!m) throw new Error(`档位 ${tier} 解析到模型 ${name}，但 models.yaml 中没有定义`);
  return m;
}

/** 单次调用费用（人民币元）。价格缺失按 0 计，费用报告里会提示 pricesKnown。 */
export function modelCost(def: ModelDef, inputTokens: number, outputTokens: number, usdCnyRate: number): number {
  const inPerM = (def.inputPerM ?? 0) * (def.currency === 'usd' ? usdCnyRate : 1);
  const outPerM = (def.outputPerM ?? 0) * (def.currency === 'usd' ? usdCnyRate : 1);
  return (inputTokens / 1e6) * inPerM + (outputTokens / 1e6) * outPerM;
}

/** 单价是否可信；mock 恒真；其余要求 input/output 单价都为正（0 视为待核对） */
export function pricesKnown(def: ModelDef): boolean {
  if (def.provider === 'mock') return true;
  return (def.inputPerM ?? 0) > 0 && (def.outputPerM ?? 0) > 0;
}