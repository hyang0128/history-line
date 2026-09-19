/**
 * Anthropic Messages API（Claude）。
 */
import type { ModelDef } from '../../lib/models';
import { ApiKeyMissing, RetryableError, type Provider } from './index';
import { fetchWithTimeout, readErrorText } from './http';

export function anthropic(def: ModelDef): Provider {
  return async (req) => {
    const key = process.env[def.apiKeyEnv ?? ''];
    if (!key) throw new ApiKeyMissing(def.apiKeyEnv ?? '');

    const base = (def.baseURL ?? 'https://api.anthropic.com').replace(/\/+$/, '');
    const url = `${base}/v1/messages`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    };
    if (def.auth === 'bearer') {
      // Ark / 网关等 Anthropic 兼容通道用 Bearer 鉴权（与 harness 的 ANTHROPIC_AUTH_TOKEN 一致）
      headers['Authorization'] = `Bearer ${key}`;
    } else {
      headers['x-api-key'] = key;
    }
    const body: Record<string, unknown> = {
      model: def.model,
      max_tokens: req.maxTokens ?? 4096,
      messages: [{ role: 'user', content: req.user }],
      temperature: req.temperature ?? 0.7,
    };
    if (req.system) body.system = req.system;

    let res: Response;
    try {
      res = await fetchWithTimeout(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new RetryableError(`请求失败（${def.model}）：${(e as Error).message}`);
    }

    if (!res.ok) {
      throw new RetryableError(`[${def.model}] HTTP ${res.status}：${await readErrorText(res)}`, res.status);
    }

    const j = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (j?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n');
    const u = j?.usage ?? {};
    return {
      text,
      usage: { inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0 },
    };
  };
}