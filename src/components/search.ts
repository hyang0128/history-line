/**
 * 客户端全文检索（A3）。输入已构建好的 SearchEntry[]，返回排序结果。
 * 命中范围：标题、别名、摘要、标签、概述、正史/野史/批注内容与出处名。
 * CJK 按子串匹配（无切词依赖），拉丁按小写不敏感匹配。
 */
import { TYPE_LABELS } from '../lib/search-filter';
import type { SearchBlock, SearchEntry } from '../lib/search-index';

export type { SearchEntry } from '../lib/search-index';

export interface Hit {
  entry: SearchEntry;
  score: number;
  /** 命中片段，已含 <mark> 关键词 */
  snippet: string;
  /** 命中位置描述：概述 / 正史 / 野史 / 批注 / 出处 */
  where: string;
  /** 命中来源条目的可信度（如有） */
  cred?: string;
}

const BLOCK_LABEL: Record<SearchBlock['k'], string> = { v: '概述', o: '正史', u: '野史', c: '批注' };

/** 命中权重（数字越大越靠前） */
const W: Record<string, number> = {
  title: 120,
  titleExact: 60,
  alias: 60,
  summary: 30,
  tag: 25,
  src: 30,
  v: 18,
  o: 15,
  u: 14,
  c: 13,
};

function tokens(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 把文本里的关键词包成 <mark>。返回 HTML。 */
export function highlight(text: string, terms: string[]): string {
  if (!terms.length) return escapeHtml(text);
  const re = new RegExp(
    terms
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .sort((a, b) => b.length - a.length)
      .join('|'),
    'gi',
  );
  return escapeHtml(text).replace(re, (m) => `<mark>${escapeHtml(m)}</mark>`);
}

/** 在文本中取某个关键词所在的片段（上下文各 26 字），作为结果摘要。 */
function sliceAround(text: string, termLower: string): string {
  const idx = text.toLowerCase().indexOf(termLower);
  if (idx < 0) return text.slice(0, 60);
  const from = Math.max(0, idx - 26);
  const to = Math.min(text.length, idx + termLower.length + 26);
  return `${from > 0 ? '…' : ''}${text.slice(from, to)}${to < text.length ? '…' : ''}`;
}

interface Score {
  score: number;
  snippet: string;
  where: string;
  cred?: string;
}

/** 单节点打分；任一关键词在标题/别名/摘要/标签/正文/出处处全无命中则返回 null。 */
function scoreEntry(entry: SearchEntry, terms: string[]): Score | null {
  let score = 0;
  let best: { w: number; text: string; where: string; cred?: string } | null = null;
  const singleTerm = terms.length === 1;

  for (const t of terms) {
    const canHit = (s: string) => s.toLowerCase().includes(t);
    let tokScore = 0;

    if (canHit(entry.title)) {
      tokScore += W.title;
      if (singleTerm && entry.title === t) tokScore += W.titleExact;
    }
    if (entry.aliases.some((a) => canHit(a))) tokScore += W.alias;
    if (entry.summary && canHit(entry.summary)) tokScore += W.summary;
    if (entry.tags.some((tg) => canHit(tg))) tokScore += W.tag;

    for (const blk of entry.blocks) {
      const hay = `${blk.text} ${blk.src ?? ''}`;
      if (!canHit(hay)) continue;
      let w = W[blk.k] ?? 10;
      if (blk.src && canHit(blk.src)) w += 4;
      tokScore += w;
      if (!best || w > best.w) {
        best = {
          w,
          text: sliceAround(blk.text, t),
          where: blk.src ? `出处 · ${blk.src}` : BLOCK_LABEL[blk.k],
          cred: blk.cred,
        };
      }
    }

    if (tokScore === 0) return null; // 该关键词哪都不中，排除
    score += tokScore;
  }

  return {
    score: score + entry.imp * 3,
    snippet: best?.text ?? entry.summary ?? entry.title,
    where: best?.where ?? '',
    cred: best?.cred,
  };
}

export function search(q: string, index: SearchEntry[]): Hit[] {
  const terms = tokens(q);
  if (!terms.length) {
    return [...index]
      .sort((a, b) => b.imp - a.imp || a.start - b.start)
      .map((entry) => ({ entry, score: 0, snippet: entry.summary ?? '', where: '', cred: '' }));
  }
  const out: Hit[] = [];
  for (const entry of index) {
    const r = scoreEntry(entry, terms);
    if (r) out.push({ entry, score: r.score, snippet: r.snippet, where: r.where, cred: r.cred });
    if (out.length >= 600) break;
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

export { TYPE_LABELS };