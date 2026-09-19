/**
 * 构建时输出搜索索引（A3）。
 *
 * 为什么不直接用 Pagefind：节点详情页的三块内容（正史/野史/批注）放在
 * 纯 CSS 标签页里，非激活 tab 是 `display:none`，而 Pagefind 的爬虫会按
 * 计算样式跳过隐藏内容，导致它索引不到出处与批注原文——恰好是 A3 验收
 * 要求的"中文搜索可命中正文与出处"。因此这里在构建期从 getAllNodes() +
 * parseBlocks() 直接产出全量文本索引，客户端做检索与高亮。
 *
 * 说明已记入 docs/worklog.md；若规划会话仍希望换回 Pagefind，可据此核对。
 */
import { getAllNodes, getEras, formatRange, type NodeView } from './nodes';

export interface SearchBlock {
  /** o=正史 u=野史 c=批注 v=概述 */
  k: 'o' | 'u' | 'c' | 'v';
  /** 正文，已折叠空白与压缩长度 */
  text: string;
  /** 仅来源条目：出处名（书名+卷次），供"出处"检索与展示 */
  src?: string;
  /** 仅来源条目：可信度等级 */
  cred?: string;
}

/** 搜索索引文档：节点列表 + 分期/朝代 id→名称表（结果展示用）。 */
export interface SearchIndexDoc {
  nodes: SearchEntry[];
  names: Record<string, string>;
}

export interface SearchEntry {
  id: string;
  type: 'event' | 'person' | 'topic' | 'world';
  title: string;
  aliases: string[];
  summary?: string;
  /** 显示用年份区间 */
  date: string;
  start: number;
  era: string;
  dyn: string;
  imp: number;
  tags: string[];
  status: string;
  /** 节点全部来源条目含有的可信度等级集合，如 "ABCD" */
  creds: string;
  blocks: SearchBlock[];
}

const BLOCK_CAP = { v: 320, o: 170, u: 170, c: 190 } as const;

function cap(text: string, n: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, n);
}

/** 由已解析节点（NodeView）构建搜索索引条目。 */
export function buildFromNodes(nodes: NodeView[]): SearchEntry[] {
  return nodes.map((n) => {
    const d = n.entry.data;
    const b = n.blocks;
    const credSet = new Set<string>();
    for (const e of [...b.official, ...b.unofficial]) credSet.add(e.credibility);

    const blocks: SearchBlock[] = [];
    if (b.overview.trim()) blocks.push({ k: 'v', text: cap(b.overview, BLOCK_CAP.v) });
    for (const e of b.official) {
      blocks.push({
        k: 'o',
        text: cap([e.text, e.quote, e.note].filter(Boolean).join(' '), BLOCK_CAP.o),
        src: e.source,
        cred: e.credibility,
      });
    }
    for (const e of b.unofficial) {
      blocks.push({
        k: 'u',
        text: cap([e.text, e.quote, e.note].filter(Boolean).join(' '), BLOCK_CAP.u),
        src: e.source,
        cred: e.credibility,
      });
    }
    for (const e of b.commentary) {
      blocks.push({
        k: 'c',
        text: cap([e.text, e.quote].filter(Boolean).join(' '), BLOCK_CAP.c),
        src: e.source,
      });
    }

    const aliases = [...d.aliases, ...((d as { titles?: string[] }).titles ?? [])];

    return {
      id: d.id,
      type: n.route as SearchEntry['type'],
      title: d.title,
      aliases,
      summary: d.summary ? cap(d.summary, 120) : undefined,
      date: formatRange(d.date),
      start: d.date.start,
      era: d.era,
      dyn: d.dynasty ?? '',
      imp: d.importance,
      tags: d.tags,
      status: d.status,
      creds: Array.from(credSet).sort().join('') || 'none',
      blocks,
    };
  });
}

/**
 * 供 /search/index.json 端点使用：全量索引 + 分期/朝代名表（329 节点约
 * 0.6MB，静态站点接受，GitHub Pages 走 gzip 后体积可再降一大截）。
 */
export async function buildSearchIndex(): Promise<SearchIndexDoc> {
  const nodes = await getAllNodes();
  const { eras, dynasties } = await getEras();
  const names: Record<string, string> = {};
  for (const e of [...eras, ...dynasties]) names[e.id] = e.data.title;
  return { nodes: buildFromNodes(nodes), names };
}