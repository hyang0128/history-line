/**
 * /timeline/index.json —— 时间轴精简索引（构建时静态生成）。
 * A2，PLAN.md §5.3：时间轴只加载这一个 JSON。
 */
import { buildTimelineIndex } from '@/lib/timeline-index';

export async function GET() {
  const index = await buildTimelineIndex();
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}