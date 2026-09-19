/**
 * 时间轴数据结构的共享类型（A2）。
 * 只放纯类型，不引入任何 server-only 依赖，浏览器端可直接 import type。
 * 字段命名保持紧凑（构建产物每节点约 150–250 字节，PLAN.md §5.3）。
 */

export type TimelineNodeType = 'event' | 'person' | 'topic' | 'world';

/** timeline-index.json 中的节点记录 */
export interface TimelineIndexNode {
  id: string;
  t: TimelineNodeType;
  title: string;
  /** 一句话摘要 */
  s?: string;
  /** 开始年（公元，负数为公元前） */
  a: number;
  /** 结束年 */
  b?: number;
  /** precision：year | month | day | circa | century */
  p?: string;
  /** era id */
  e: string;
  /** dynasty id */
  d?: string;
  /** importance 1–5 */
  i: number;
  /** 正史条数 */
  o: number;
  /** 野史条数 */
  u: number;
  /** 批注条数 */
  c: number;
  /** tags */
  g: string[];
  /** 1 = draft，0 = reviewed/published */
  st: 0 | 1;
}

export interface TimelineDynasty {
  id: string;
  title: string;
  a: number;
  b: number;
  c?: string;
}

/** timeline-index.json 中的分期与朝代 */
export interface TimelineIndexEra {
  id: string;
  title: string;
  a: number;
  b: number;
  c?: string;
  d: TimelineDynasty[];
}

export interface TimelineIndex {
  nodes: TimelineIndexNode[];
  eras: TimelineIndexEra[];
}

/** 正史/野史条目（与 parse-blocks 的 SourceEntry 同构） */
export interface TimelineSourceEntry {
  source: string;
  credibility: 'A' | 'B' | 'C' | 'D';
  text: string;
  quote?: string;
  note?: string;
  ref?: string;
}

/** 批注条目 */
export interface TimelineCommentaryEntry {
  author: string;
  source?: string;
  category: 'classical' | 'modern' | 'contemporary' | 'ai';
  license: 'public-domain' | 'paraphrase' | 'ai-synthesis';
  text: string;
  quote?: string;
  note?: string;
}

/** 点击节点后异步取回的详情（timeline-detail/<type>/<id>.json） */
export interface TimelineDetail {
  id: string;
  t: TimelineNodeType;
  title: string;
  s?: string;
  a: number;
  b?: number;
  p?: string;
  e: string;
  d?: string;
  i: number;
  tags: string[];
  location?: string;
  aliases: string[];
  related: string[];
  status: string;
  overview: string;
  official: TimelineSourceEntry[];
  unofficial: TimelineSourceEntry[];
  commentary: TimelineCommentaryEntry[];
}