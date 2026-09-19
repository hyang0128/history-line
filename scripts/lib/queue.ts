/**
 * queue.yaml 的加载与校验。
 * 队列是 YAML 列表；每行代表一个待生成节点，字段定义见 scripts/generate/queue.yaml 顶部注释。
 */
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';

export type QueueType = 'event' | 'person' | 'topic' | 'world';

export interface QueueEntry {
  id: string;
  type: QueueType;
  title: string;
  era?: string;
  dynasty?: string;
  /** 起始大致年份（公元，公元前为负） */
  year?: number;
  yearEnd?: number;
  importance: number;
  hint?: string;
  /** world 类型的地区/文明，如 阿拉伯、波斯、日本 */
  region?: string;
  /** 覆盖默认档位（cheap/medium/high） */
  tier?: string;
  /** 覆盖模型名 */
  model?: string;
}

const TYPES = new Set(['event', 'person', 'topic', 'world']);

export async function loadQueue(file: string): Promise<QueueEntry[]> {
  const text = await readFile(file, 'utf8');
  const raw = YAML.parse(text) as unknown;
  if (!Array.isArray(raw)) throw new Error(`queue.yaml 必须是 YAML 列表（每行一个节点）：${file}`);
  return raw.map((item, i) => {
    const r = (item ?? {}) as Record<string, unknown>;
    const row = i + 1;
    if (!r.id || typeof r.id !== 'string') throw new Error(`queue.yaml 第 ${row} 行缺 id`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id)) {
      throw new Error(`queue.yaml 第 ${row} 行 id “${r.id}” 非法：只能用小写字母、数字和连字符（不能含 ü 等变音字母）`);
    }
    if (typeof r.type !== 'string' || !TYPES.has(r.type)) {
      throw new Error(`queue.yaml 第 ${row} 行 type 必须是 event / person / topic / world 之一`);
    }
    if (!r.title || typeof r.title !== 'string') throw new Error(`queue.yaml 第 ${row} 行缺 title`);
    return {
      id: r.id as string,
      type: r.type as QueueType,
      title: r.title as string,
      era: typeof r.era === 'string' ? r.era : undefined,
      dynasty: typeof r.dynasty === 'string' ? r.dynasty : undefined,
      year: typeof r.year === 'number' ? r.year : undefined,
      yearEnd: typeof r.yearEnd === 'number' ? r.yearEnd : undefined,
      importance: typeof r.importance === 'number' ? r.importance : 3,
      hint: typeof r.hint === 'string' ? r.hint : undefined,
      region: typeof r.region === 'string' ? r.region : undefined,
      tier: typeof r.tier === 'string' ? r.tier : undefined,
      model: typeof r.model === 'string' ? r.model : undefined,
    };
  });
}