/**
 * 统一读取五个集合，供页面与脚本使用。
 * 输出结构中 blocks 为解析后的四块内容。
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { parseBlocks, type NodeBlocks } from './parse-blocks';

export type NodeCollection = 'events' | 'persons' | 'topics' | 'world';
export type NodeEntry = CollectionEntry<NodeCollection>;
export type EraEntry = CollectionEntry<'eras'>;

export interface NodeView {
  collection: NodeCollection;
  /** URL 路径段：event / person / topic / world */
  route: string;
  entry: NodeEntry;
  blocks: NodeBlocks;
}

const ROUTE: Record<NodeCollection, string> = {
  events: 'event',
  persons: 'person',
  topics: 'topic',
  world: 'world',
};

export function routeFor(collection: NodeCollection): string {
  return ROUTE[collection];
}

export async function getAllNodes(): Promise<NodeView[]> {
  const cols: NodeCollection[] = ['events', 'persons', 'topics', 'world'];
  const out: NodeView[] = [];
  for (const c of cols) {
    const entries = await getCollection(c);
    for (const entry of entries) {
      out.push({
        collection: c,
        route: ROUTE[c],
        entry,
        blocks: parseBlocks(entry.body ?? '', `${c}/${entry.id}`),
      });
    }
  }
  return out.sort(byDate);
}

export function byDate(a: NodeView, b: NodeView): number {
  const d = a.entry.data.date.start - b.entry.data.date.start;
  if (d !== 0) return d;
  return b.entry.data.importance - a.entry.data.importance;
}

export async function getEras(): Promise<{ eras: EraEntry[]; dynasties: EraEntry[] }> {
  const all = await getCollection('eras');
  const eras = all.filter((e) => e.data.type === 'era').sort((a, b) => a.data.order - b.data.order);
  const dynasties = all
    .filter((e) => e.data.type === 'dynasty')
    .sort((a, b) => a.data.date.start - b.data.date.start || a.data.order - b.data.order);
  return { eras, dynasties };
}

/** 公元纪年显示：负数为公元前 */
export function formatYear(y: number): string {
  return y < 0 ? `前 ${-y}` : `${y}`;
}

export function formatRange(d: { start: number; end?: number; precision?: string }): string {
  const s = formatYear(d.start);
  const circa = d.precision === 'circa' || d.precision === 'century' ? '约 ' : '';
  if (d.end !== undefined && d.end !== d.start) return `${circa}${s} – ${formatYear(d.end)}`;
  return `${circa}${s}`;
}
