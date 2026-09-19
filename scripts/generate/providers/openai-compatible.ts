/**
 * OpenAI 兼容端点（DeepSeek / GLM / Kimi(Moonshot) 等），覆盖 /chat/completions。
 */
import type { ModelDef } from '../../lib/models';
import { ApiKeyMissing, RetryableError, type Provider } from './index';
import { fetchWithTimeout, readErrorText } from './http';

export function openaiCompatible(def: ModelDef): Provider {
  return async (req) => {
    const key = process.env[def.apiKeyEnv ?? ''];
    if (!key) throw new ApiKeyMissing(def.apiKeyEnv ?? '');

    const base = (def.baseURL ?? '').replace(/\/+$/, '');
    const url = `${base}/chat/completions`;
    const body: Record<string, unknown> = {
      model: def.model,
      messages: [
        ...(req.system ? [{ role: 'system', content: req.system }] : []),
        { role: 'user', content: req.user },
      ],
      temperature: req.temperature ?? 0.7,
    };
    if (req.maxTokens) body.max_tokens = req.maxTokens;

    let res: Response;
    try {
      res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new RetryableError(`请求失败（${def.model}）：${(e as Error).message}`);
    }

    if (!res.ok) {
      throw new RetryableError(`[${def.model}] HTTP ${res.status}：${await readErrorText(res)}`, res.status);
    }

    const j = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text: string = j?.choices?.[0]?.message?.content ?? '';
    const u = j?.usage ?? {};
    return {
      text,
      usage: { inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0 },
    };
  };
}