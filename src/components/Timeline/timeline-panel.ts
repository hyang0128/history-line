/**
 * 时间轴详情面板渲染（A2，PLAN.md §5.3 / §4 方案 A）。
 * 结构与 NodePanel.astro + SourceCite/CommentaryCite 对齐，复用 base.css 的样式类。
 * 纯 DOM 构建，内容一律用 textContent，避免注入。
 */
import type { TimelineCommentaryEntry, TimelineDetail, TimelineNodeType } from '@/lib/timeline-types';

const TYPE_LABEL: Record<TimelineNodeType, string> = {
  event: '事件',
  person: '人物',
  topic: '专题',
  world: '世界史',
};

const LIC_LABEL: Record<string, string> = {
  'public-domain': '公版',
  paraphrase: '转述',
  'ai-synthesis': 'AI 综述',
};

const CAT_GROUPS: { key: TimelineCommentaryEntry['category']; label: string }[] = [
  { key: 'classical', label: '古代史论' },
  { key: 'modern', label: '近现代学者' },
  { key: 'contemporary', label: '当代与政治人物（观点鲜明，请自行判断）' },
  { key: 'ai', label: 'AI 综述' },
];

const CRED_LABEL: Record<string, string> = {
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fmtRange(a: number, b: number | undefined, p?: string): string {
  const circa = p === 'circa' || p === 'century' ? '约 ' : '';
  const fy = (y: number) => (y < 0 ? `前 ${-y}` : `${y}`);
  if (typeof b === 'number' && b !== a) return `${circa}${fy(a)} – ${fy(b)}`;
  return `${circa}${fy(a)}`;
}

export function renderDetailPanel(root: HTMLElement, detail: TimelineDetail, base: string): void {
  root.hidden = false;
  root.textContent = '';

  // 头部：标题 + 元信息 + 关闭按钮
  const head = el('div', 'tl-panel-head');
  const titleWrap = el('div');
  const titleLine = el('p', 'tl-panel-title');
  const titleLink = el('a', undefined, detail.title) as HTMLAnchorElement;
  titleLink.href = `${base}/${detail.t}/${encodeURIComponent(detail.id)}`;
  titleLine.appendChild(titleLink);
  if (detail.status === 'draft') titleLine.appendChild(el('span', 'badge-draft', 'draft'));
  titleWrap.appendChild(titleLine);

  const meta = el('p', 'meta');
  meta.textContent = `${fmtRange(detail.a, detail.b, detail.p)} · ${TYPE_LABEL[detail.t]} · 重要度 ${detail.i}`;
  titleWrap.appendChild(meta);

  if (detail.location || detail.aliases.length) {
    const extra = el('p', 'meta');
    extra.textContent = [
      detail.location,
      detail.aliases.length ? `又称 ${detail.aliases.join('、')}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    titleWrap.appendChild(extra);
  }
  if (detail.tags.length) {
    const tags = el('p', 'tags');
    for (const t of detail.tags) tags.appendChild(el('span', 'tag', t));
    titleWrap.appendChild(tags);
  }
  head.appendChild(titleWrap);

  const closeBtn = el('button', 'tl-panel-close', '×') as HTMLButtonElement;
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', '关闭面板');
  head.appendChild(closeBtn);
  root.appendChild(head);

  // 概述
  const overview = el('section', 'overview');
  const paras = detail.overview.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paras.length === 0) {
    overview.appendChild(el('p', 'empty', '暂无概述。'));
  } else {
    for (const p of paras) overview.appendChild(el('p', undefined, p));
  }
  root.appendChild(overview);

  // 三 tab 面板
  const panel = el('div', 'panel');
  const name = `tl-tab-${detail.id.replace(/[^a-z0-9]/gi, '')}`;
  const oi = el('input') as HTMLInputElement;
  oi.type = 'radio';
  oi.name = name;
  oi.id = 't-o';
  oi.checked = true;
  const ui = el('input') as HTMLInputElement;
  ui.type = 'radio';
  ui.name = name;
  ui.id = 't-u';
  const ci = el('input') as HTMLInputElement;
  ci.type = 'radio';
  ci.name = name;
  ci.id = 't-c';
  panel.appendChild(oi);
  panel.appendChild(ui);
  panel.appendChild(ci);

  const tabs = el('div', 'tabs');
  appendTab(tabs, 't-o', '正史', detail.official.length);
  appendTab(tabs, 't-u', '野史', detail.unofficial.length);
  appendTab(tabs, 't-c', '批注', detail.commentary.length);
  panel.appendChild(tabs);

  const paneO = el('div', 'tabpane pane-o');
  if (detail.official.length === 0) paneO.appendChild(el('p', 'empty', '暂无正史条目。'));
  else for (const e of detail.official) paneO.appendChild(sourceEntry(e));
  panel.appendChild(paneO);

  const paneU = el('div', 'tabpane pane-u');
  if (detail.unofficial.length === 0) paneU.appendChild(el('p', 'empty', '暂无野史条目。'));
  else for (const e of detail.unofficial) paneU.appendChild(sourceEntry(e));
  panel.appendChild(paneU);

  const paneC = el('div', 'tabpane pane-c');
  for (const g of CAT_GROUPS) {
    const items = detail.commentary.filter((c) => c.category === g.key);
    if (!items.length) continue;
    const group = el('div', 'cat-group');
    group.appendChild(el('h3', undefined, g.label));
    for (const c of items) group.appendChild(commentaryEntry(c));
    paneC.appendChild(group);
  }
  if (detail.commentary.length === 0) paneC.appendChild(el('p', 'empty', '暂无批注条目。'));
  panel.appendChild(paneC);

  root.appendChild(panel);

  // 相关
  if (detail.related.length > 0) {
    const rel = el('p', 'related');
    rel.appendChild(el('span', undefined, '相关：'));
    for (const rid of detail.related) rel.appendChild(el('span', undefined, rid));
    root.appendChild(rel);
  }

  const full = el('p', 'meta');
  const link = el('a', undefined, '打开完整页面 →') as HTMLAnchorElement;
  link.href = `${base}/${detail.t}/${encodeURIComponent(detail.id)}`;
  full.appendChild(link);
  root.appendChild(full);
}

function appendTab(tabs: HTMLElement, id: string, label: string, count: number): void {
  const l = el('label') as HTMLLabelElement;
  l.setAttribute('for', id);
  l.textContent = label;
  const n = el('span', 'n', String(count));
  l.appendChild(n);
  tabs.appendChild(l);
}

function sourceEntry(e: TimelineDetail['official'][number]): HTMLElement {
  const wrap = el('div', 'entry');
  const src = el('div', 'src');
  if (e.ref) {
    const a = el('a', undefined, e.source) as HTMLAnchorElement;
    a.href = e.ref;
    a.target = '_blank';
    a.rel = 'noopener';
    src.appendChild(a);
  } else {
    src.appendChild(el('span', undefined, e.source));
  }
  src.appendChild(el('span', 'cred cred-' + credKey(e), CRED_LABEL[e.credibility] ?? e.credibility));
  wrap.appendChild(src);
  wrap.appendChild(el('p', 'text', e.text));
  if (e.quote) {
    const d = el('details');
    d.appendChild(el('summary', undefined, '原文'));
    d.appendChild(el('blockquote', undefined, e.quote));
    wrap.appendChild(d);
  }
  if (e.note) wrap.appendChild(el('div', 'note', `按：${e.note}`));
  return wrap;
}

function credKey(e: { credibility: string }): string {
  const c = e.credibility.toUpperCase();
  return ['A', 'B', 'C', 'D'].includes(c) ? c : 'D';
}

function commentaryEntry(e: TimelineCommentaryEntry): HTMLElement {
  const wrap = el('div', 'entry');
  const src = el('div', 'src');
  src.appendChild(el('span', undefined, e.author));
  const srcSpan = el('span', 'meta');
  srcSpan.textContent = ` · ${e.source ?? ''}`;
  src.appendChild(srcSpan);
  src.appendChild(el('span', 'lic', `[${LIC_LABEL[e.license] ?? e.license}]`));
  wrap.appendChild(src);
  wrap.appendChild(el('p', 'text', e.text));
  if (e.quote) {
    const d = el('details');
    d.appendChild(el('summary', undefined, '原文'));
    d.appendChild(el('blockquote', undefined, e.quote));
    wrap.appendChild(d);
  }
  if (e.note) wrap.appendChild(el('div', 'note', `按：${e.note}`));
  return wrap;
}