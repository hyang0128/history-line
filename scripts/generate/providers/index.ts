/**
 * 统一的模型调用接口（PLAN §6.7）。
 * 签名：createProvider(ModelDef) → (ProviderRequest) → ProviderResult
 * 换模型只改 models.yaml，代码不改。
 */
import type { ModelDef } from '../../lib/models';
import { openaiCompatible } from './openai-compatible';
import { anthropic } from './anthropic';
import { mock } from './mock';

export interface ProviderRequest {
  system?: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  /** 仅 mock provider 使用：结构化节点元数据 */
  meta?: Record<string, unknown>;
}

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderResult {
  text: string;
  usage: ProviderUsage;
}

export type Provider = (req: ProviderRequest) => Promise<ProviderResult>;

export class ApiKeyMissing extends Error {
  constructor(envName: string) {
    super(
      `缺少 API key：环境变量 ${envName} 未设置。` +
        `请复制 .env.example 为 .env 并填入对应 key（见 README「费用与密钥」）。`,
    );
    this.name = 'ApiKeyMissing';
  }
}

/** 网络抖动、限流（429）、5xx —— 可重试 */
export class RetryableError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'RetryableError';
    this.status = status;
  }
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof RetryableError) {
    const s = err.status;
    // 429 / 5xx / 无状态（网络层）可重试；4xx 一律不重试
    return s === 429 || s === undefined || s >= 500;
  }
  // fetch 抛出的 TypeError（网络错误、超时）可重试
  return err instanceof TypeError;
}

export function createProvider(def: ModelDef): Provider {
  switch (def.provider) {
    case 'openai-compatible':
      return openaiCompatible(def);
    case 'anthropic':
      return anthropic(def);
    case 'mock':
      return mock(def);
    default:
      throw new Error(`未知 provider：${String(def.provider)}`);
  }
}