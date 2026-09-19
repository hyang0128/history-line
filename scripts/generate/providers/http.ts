/** fetch 超时与响应解析的公共工具。方舟等慢通道长文生成可能超过 2 分钟，默认放宽到 300s。 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 300_000,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 读取失败响应正文（防御性） */
export async function readErrorText(res: Response): Promise<string> {
  return res.text().catch(() => '').then((t) => t.slice(0, 300));
}