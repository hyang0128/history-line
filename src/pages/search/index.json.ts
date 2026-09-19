/**
 * /search/index.json —— 全站搜索索引（构建时静态生成）。
 * A3：客户端在 /search 页面 fetch 本文件做中文全文检索 + 筛选。
 */
import { buildSearchIndex } from '@/lib/search-index';

export async function GET() {
  const index = await buildSearchIndex();
  // 开启增量压缩；SearchEntry 无第三方类型问题，直接序列化。
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}