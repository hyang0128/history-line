/**
 * 时间轴岛组件核心逻辑（A2，PLAN.md §5.3）。
 * Canvas + d3-zoom：无级缩放、四轨道开关、语义缩放（按 importance）、
 * URL hash 深链（#t=start..end&n=id）、键盘导航、点击打开详情面板。
 * 浏览器端运行，只加载 timeline/index.json，详情按需取。
 */
import { pointer, select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import 'd3-transition'; // 为 selection 挂 .transition()，供 era 跳转动画
import type { TimelineIndex, TimelineIndexEra, TimelineIndexNode, TimelineNodeType } from '@/lib/timeline-types';
import { renderDetailPanel } from './timeline-panel';
import { readTheme, THEME_EVENT } from '../../lib/theme';

export interface TimelineConfig {
  /** BASE_URL 前缀，如 /history-line */
  base: string;
  /** 索引 JSON 地址 */
  indexUrl: string;
  /** 初始视口（局部时间轴用） */
  range?: { start: number; end: number };
  /** 只显示某分期（局部时间轴用） */
  filterEra?: string;
  /** 只显示某朝代（局部时间轴用） */
  filterDynasty?: string;
  /** 隐藏顶部控件（局部时间轴用） */
  minimal?: boolean;
}

const TYPE_LABEL: Record<TimelineNodeType, string> = {
  event: '事件',
  person: '人物',
  topic: '专题',
  world: '世界史',
};
const TRACKS: TimelineNodeType[] = ['event', 'person', 'topic', 'world'];
const TYPE_COLOR: Record<TimelineNodeType, string> = {
  event: '#4a7fb5',
  person: '#b0774a',
  topic: '#7a6db0',
  world: '#4f9a7e',
};
const DOT_COLOR = {
  o: ['#3f6f8f', '#7fb0d0'],
  u: ['#b07a2a', '#d9a854'],
  c: ['#6b5a8a', '#a894c8'],
} as const;
/** 语义缩放分档（PLAN.md §5.3）：k 在 [1,2) 只显示 importance 5，每翻倍多放一档 */
const MIN_SPAN_YEARS = 30;

interface Hit {
  kind: 'node' | 'era' | 'dyn';
  id: string;
  type?: TimelineNodeType;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface State {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cfg: TimelineConfig;
  nodes: TimelineIndexNode[];
  eras: TimelineIndexEra[];
  t0: number;
  t1: number;
  len: number;
  W: number;
  H: number;
  dpr: number;
  k: number;
  tx: number;
  maxK: number;
  isDark: boolean;
  rowY: { bandEra: number; bandDyn: number } & Partial<Record<TimelineNodeType, number>>;
  active: Set<TimelineNodeType>;
  hit: Hit[];
  selectedId: string | null;
  zoomBhv: ReturnType<typeof zoom<HTMLCanvasElement, unknown>>;
  statusEl: HTMLElement | null;
  tooltipEl: HTMLElement | null;
  panelRoot: HTMLElement | null;
  /** 标签碰撞检测：每行上一个标签的右端 */
  lastEnd: Map<number, number>;
  /** ?hud=1 时启用帧耗时统计 */
  frameTimes?: number[];
  hudEl?: HTMLElement | null;
}

export async function initTimeline(root: HTMLElement, cfg: TimelineConfig): Promise<void> {
  const canvas = root.querySelector<HTMLCanvasElement>('.timeline-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const statusEl = root.querySelector('.timeline-status');
  const tooltipEl = root.querySelector('.timeline-tooltip');
  const panelRoot = root.querySelector('.timeline-panel');
  const indexUrl = cfg.indexUrl;

  try {
    const res = await fetch(indexUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const index = (await res.json()) as TimelineIndex;

    const st: State = prepare(root, cfg, canvas, ctx!, index);
    st.statusEl = statusEl as HTMLElement | null;
    st.tooltipEl = tooltipEl as HTMLElement | null;
    st.panelRoot = panelRoot as HTMLElement | null;

    layout(st);          // 先算尺寸与 maxK，wireGestures 依赖 maxK
    buildSpeedbar(st);
    wireControls(st);
    wireGestures(st);
    wireResize(st);
    setupHud(st);

    // 深链恢复
    const h = readHash();
    if (cfg.range) {
      setViewport(st, cfg.range.start, cfg.range.end, false);
    } else if (h.t) {
      setViewport(st, h.t[0], h.t[1], false);
    } else {
      setViewport(st, st.t0, st.t1, false);
    }

    if (h.n) {
      const node = st.nodes.find((n) => n.id === h.n);
      if (node) {
        st.selectedId = node.id;
        redraw(st);
        void openPanel(st, node.id);
      }
    } else {
      redraw(st);
    }
    root.classList.add('tl-ready');
  } catch (err) {
    console.error('时间轴初始化失败', err);
    if (statusEl) statusEl.textContent = '时间轴数据加载失败，请刷新重试。';
    root.classList.add('tl-error');
  }
}

function prepare(
  root: HTMLElement,
  cfg: TimelineConfig,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  index: TimelineIndex,
): State {
  // 局部时间轴过滤 + 排序
  let nodes = index.nodes;
  if (cfg.filterEra) nodes = nodes.filter((n) => n.e === cfg.filterEra);
  if (cfg.filterDynasty) nodes = nodes.filter((n) => n.d === cfg.filterDynasty);
  nodes = nodes.slice().sort((a, b) => a.a - b.a);

  const eras = index.eras.filter((e) => (cfg.filterEra ? e.id === cfg.filterEra : true));

  let t0 = Infinity;
  let t1 = -Infinity;
  for (const n of nodes) {
    t0 = Math.min(t0, n.a);
    t1 = Math.max(t1, n.b ?? n.a);
  }
  for (const e of eras) {
    t0 = Math.min(t0, e.a);
    t1 = Math.max(t1, e.b);
  }
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) {
    t0 = -2100;
    t1 = 2000;
  }
  const pad = Math.max(1, Math.round((t1 - t0) * 0.01));
  t0 -= pad;
  t1 += pad;

  const st: State = {
    root,
    canvas,
    ctx,
    cfg,
    nodes,
    eras,
    t0,
    t1,
    len: t1 - t0,
    W: 0,
    H: 0,
    dpr: 1,
    k: 1,
    tx: 0,
    maxK: 1,
    isDark: readTheme() === 'dark',
    rowY: { bandEra: 0, bandDyn: 0 },
    active: new Set(TRACKS),
    hit: [],
    selectedId: null,
    zoomBhv: null as unknown as State['zoomBhv'],
    statusEl: null,
    tooltipEl: null,
    panelRoot: null,
    lastEnd: new Map(),
  };
  computeRows(st);
  return st;
}

/** 行布局：分期带、朝代带、四轨道 */
function computeRows(st: State): void {
  const top = 14;
  st.rowY.bandEra = top;
  st.rowY.bandDyn = top + 22;
  const base = top + 58;
  for (const t of TRACKS) {
    st.rowY[t] = base + TRACKS.indexOf(t) * 30;
  }
  st.H = (st.rowY.world ?? base + 90) + 40;
}

function layout(st: State): void {
  const wrap = st.canvas.parentElement;
  const w = wrap ? wrap.clientWidth : st.root.clientWidth;
  if (w <= 0) return;
  st.W = Math.max(320, w);
  st.dpr = Math.min(2, window.devicePixelRatio || 1);
  st.canvas.style.width = `${st.W}px`;
  st.canvas.style.height = `${st.H}px`;
  st.canvas.width = Math.round(st.W * st.dpr);
  st.canvas.height = Math.round(st.H * st.dpr);
  st.ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
  st.maxK = Math.max(1, st.len / MIN_SPAN_YEARS);
  st.zoomBhv?.scaleExtent([1, st.maxK]).extent([[0, 0], [st.W, st.H]]).translateExtent([[0, 0], [st.W, st.H]]);
}

/** 年 → 基础像素（未乘缩放），0..W */
function baseX(st: State, year: number): number {
  return ((year - st.t0) / st.len) * st.W;
}
/** 年 → 屏幕坐标 */
function screenX(st: State, year: number): number {
  return baseX(st, year) * st.k + st.tx;
}
/** 屏幕横坐标 → 年 */
function yearAt(st: State, x: number): number {
  return st.t0 + ((x - st.tx) / st.k) * (st.len / st.W);
}

function clampPan(st: State): void {
  const lo = st.W - st.W * st.k;
  if (st.tx < lo) st.tx = lo;
  if (st.tx > 0) st.tx = 0;
}

/** 把我们自己维护的 k/tx 同步回 d3-zoom 的 __zoom，避免下一次手势跳变 */
function syncZoomState(st: State): void {
  select(st.canvas).property('__zoom', zoomIdentity.translate(st.tx, 0).scale(st.k));
}

function setViewport(st: State, a: number, b: number, animate: boolean): void {
  let ax = Math.min(a, b);
  let bx = Math.max(a, b);
  if (bx - ax < MIN_SPAN_YEARS) bx = ax + MIN_SPAN_YEARS;
  let k = st.len / (bx - ax);
  if (k < 1) {
    k = 1; // 请求跨度比全轴还宽：退回全幅。k 必须一并复位，否则低于 scaleExtent 下限、整轴被压扁
    ax = st.t0;
    bx = st.t1;
  } else if (k > st.maxK) {
    k = st.maxK;
  }
  const span = st.len / k;
  const center = (ax + bx) / 2;
  const na = center - span / 2;
  st.k = k;
  st.tx = -baseX(st, na) * k;
  clampPan(st);
  if (animate) {
    select(st.canvas).transition().duration(260).call(st.zoomBhv.transform, zoomIdentity.translate(st.tx, 0).scale(st.k));
  } else {
    syncZoomState(st);
    redraw(st);
  }
}

/* ------------------------------- 绘制 ------------------------------- */

function redraw(st: State): void {
  const t0 = performance.now();
  const { ctx } = st;
  ctx.clearRect(0, 0, st.W, st.H);
  const theme = st.isDark ? 1 : 0;
  const fg = theme ? '#e8e3d9' : '#2a2722';
  const line = theme ? '#3a3630' : '#e2ddd3';
  const muted = theme ? '#a39d92' : '#6f6a60';

  st.hit = [];
  drawGrid(st, line, muted);
  drawBands(st, theme, muted);
  drawTrackLabels(st, muted);
  drawNodes(st, fg, muted, theme);
  drawSelection(st, line);

  if (st.frameTimes) {
    const dt = performance.now() - t0;
    st.frameTimes.push(dt);
    if (st.frameTimes.length > 60) st.frameTimes.shift();
    if (st.hudEl) {
      const avg = st.frameTimes.reduce((a, b) => a + b, 0) / st.frameTimes.length;
      st.hudEl.textContent = `render avg ${avg.toFixed(2)}ms (${(1000 / Math.max(avg, 0.1)).toFixed(0)}fps) · nodes ${st.nodes.length}`;
    }
  }
}

/** ?hud=1：右上角显示帧耗时统计，供 3000 节点密度自检 */
function setupHud(st: State): void {
  if (!new URLSearchParams(location.search).has('hud')) return;
  const hud = document.createElement('div');
  hud.className = 'tl-hud';
  hud.textContent = '…';
  st.root.appendChild(hud);
  st.hudEl = hud;
  st.frameTimes = [];
}

function drawGrid(st: State, line: string, muted: string): void {
  const pxPerYear = (st.W / st.len) * st.k;
  const approx = 110 / pxPerYear;
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
  let step = 10000;
  for (const s of steps) {
    if (s >= approx) {
      step = s;
      break;
    }
  }
  if (approx > 10000) step = Math.ceil(approx / 10000) * 10000;

  const yearLo = Math.floor(yearAt(st, 0) / step) * step;
  const yearHi = Math.ceil(yearAt(st, st.W) / step) * step;
  const ctx = st.ctx;
  ctx.font = '10px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  for (let y = yearLo; y <= yearHi; y += step) {
    const x = Math.round(screenX(st, y));
    if (x < 0 || x > st.W) continue;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, st.H);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = muted;
    const label = y < 0 ? `前 ${-y}` : `${y}`;
    ctx.fillText(label, x + 3, st.H - 6);
  }
}

function drawTrackLabels(st: State, muted: string): void {
  const ctx = st.ctx;
  ctx.font = '11px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  ctx.fillStyle = muted;
  ctx.textBaseline = 'middle';
  for (const t of TRACKS) {
    if (!st.active.has(t)) continue;
    const y = st.rowY[t];
    if (y == null) continue;
    ctx.fillText(TYPE_LABEL[t], 6, y);
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = muted;
    ctx.beginPath();
    ctx.moveTo(44.5, y - 12);
    ctx.lineTo(44.5, y + 12);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** 分期/朝代色带，并登记点击命中 */
function drawBands(st: State, theme: number, muted: string): void {
  const ctx = st.ctx;
  const eraY = st.rowY.bandEra;
  const dynY = st.rowY.bandDyn;
  if (st.tx !== 0 || st.k !== 1) {
    // 全高淡色带（分期背景），仅在非全览时叠加
    for (const e of st.eras) {
      const x0 = screenX(st, e.a);
      const x1 = screenX(st, e.b);
      if (x1 < 0 || x0 > st.W) continue;
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = bandColor(e.c, theme, e.id);
      ctx.fillRect(x0, 0, x1 - x0, st.H);
      ctx.globalAlpha = 1;
    }
  }

  // 分期带 + 朝代带，两条轨道
  for (const e of st.eras) {
    const ex0 = screenX(st, e.a);
    const ex1 = screenX(st, e.b);
    const color = bandColor(e.c, theme, e.id);
    if (ex1 >= 0 && ex0 <= st.W) {
      const x0 = Math.max(0, ex0);
      const x1 = Math.min(st.W, ex1);
      if (x1 > x0) {
        drawBandRect(ctx, x0, eraY, x1 - x0, 16, color, muted, e.title);
        st.hit.push({ kind: 'era', id: e.id, x: x0, y: eraY, w: x1 - x0, h: 16 });
      }
    }
    for (const dd of e.d) {
      const dx0 = screenX(st, dd.a);
      const dx1 = screenX(st, dd.b);
      if (dx1 < 0 || dx0 > st.W) continue;
      const x0 = Math.max(0, dx0);
      const x1 = Math.min(st.W, dx1);
      if (x1 <= x0) continue;
      drawBandRect(ctx, x0, dynY, x1 - x0, 16, bandColor(dd.c, theme, dd.id), muted, dd.title);
      st.hit.push({ kind: 'dyn', id: dd.id, x: x0, y: dynY, w: x1 - x0, h: 16 });
    }
  }
}

function drawBandRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  muted: string,
  label: string,
): void {
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y, Math.max(2, w - 1), h, 4);
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (w > 34) {
    ctx.font = '11px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    ctx.fillStyle = muted;
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y + 1, w - 2, h - 2);
    ctx.clip();
    ctx.fillText(label, x + 7, y + h / 2 + 1);
    ctx.restore();
  }
}

function bandColor(c: string | undefined, theme: number, id: string): string {
  if (c) {
    // 深色主题下把色带再加深一档，避免发灰
    return theme ? c : c;
  }
  const fallback = ['#b8862b', '#3f6f8f', '#6b5a8a', '#b0774a', '#4f9a7e', '#a34d55'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return fallback[h % fallback.length];
}

function drawNodes(st: State, fg: string, muted: string, theme: number): void {
  const level = levelForK(st.k);
  const minImp = 6 - level;
  const ctx = st.ctx;
  const pxPerYear = (st.W / st.len) * st.k;
  const showLabel = pxPerYear >= 0.6;

  const shown: TimelineIndexNode[] = [];
  for (const n of st.nodes) {
    if (!st.active.has(n.t)) continue;
    // 事件按 importance 语义分层；人物/专题/世界史一般数量可控，全部显示
    if (n.t === 'event' && n.i < minImp) continue;
    shown.push(n);
  }
  shown.sort((a, b) => a.a - b.a || b.i - a.i);

  st.lastEnd.clear();
  for (const n of shown) {
    const x0 = screenX(st, n.a);
    const x1 = n.b != null && n.b !== n.a ? screenX(st, n.b) : x0;
    if (x1 < 0 || x0 > st.W) continue;
    const cy = st.rowY[n.t] ?? 0;
    const color = TYPE_COLOR[n.t];

    if (n.t === 'event' || n.t === 'world') {
      const r = 2.5 + n.i * 0.55;
      ctx.beginPath();
      ctx.arc(x0, cy, r, 0, Math.PI * 2);
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      ctx.strokeStyle = theme ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)';
      ctx.stroke();
      drawDots(st, n, x0, cy + 8);
      if (n.st === 1) {
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(x0 + r + 1, cy - r - 1, 3, 3);
      }
      st.hit.push({ kind: 'node', id: n.id, type: n.t, x: x0 - 6, y: cy - 6, w: 12, h: 12 });
      if (showLabel) drawNodeLabel(st, n, x0 + r + 4, cy, muted);
    } else {
      if (x1 - x0 < 1) continue;
      const barH = 12;
      const barW = Math.max(2, x1 - x0 - 1);
      ctx.beginPath();
      ctx.roundRect(x0 + 0.5, cy - barH / 2, barW, barH, 6);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (n.st === 1) {
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(x0 + 2, cy - barH / 2 - 2, 3, 3);
      }
      st.hit.push({ kind: 'node', id: n.id, type: n.t, x: Math.min(x0, x1) - 3, y: cy - barH / 2 - 3, w: Math.abs(x1 - x0) + 6, h: barH + 6 });
      drawBarLabel(st, n, x0, cy, fg, x1);
    }
  }
}

function drawDots(st: State, n: TimelineIndexNode, x: number, y: number): void {
  const theme = st.isDark ? 1 : 0;
  const dots: [keyof typeof DOT_COLOR, number][] = [
    ['o', n.o],
    ['u', n.u],
    ['c', n.c],
  ];
  let offset = -6;
  for (const [key, count] of dots) {
    if (count > 0) {
      st.ctx.beginPath();
      st.ctx.arc(x + offset, y, 2, 0, Math.PI * 2);
      st.ctx.fillStyle = DOT_COLOR[key][theme];
      st.ctx.fill();
      offset += 6;
    }
  }
}

/** 点状节点标签：同轨道内避免文字重叠 */
function drawNodeLabel(st: State, n: TimelineIndexNode, x: number, cy: number, muted: string): void {
  const ctx = st.ctx;
  ctx.font = '11px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  const w = ctx.measureText(n.title).width;
  const last = st.lastEnd.get(cy) ?? -Infinity;
  if (x < last) return;
  ctx.fillStyle = muted;
  ctx.textBaseline = 'middle';
  ctx.fillText(n.title, x, cy);
  st.lastEnd.set(cy, x + w + 8);
}

/** 横条节点标签：条够宽时写在条内，右侧补块色标 */
function drawBarLabel(st: State, n: TimelineIndexNode, x0: number, cy: number, fg: string, x1: number): void {
  const ctx = st.ctx;
  ctx.font = '11px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  const w = ctx.measureText(n.title).width;
  if (x1 - x0 < w + 18) return;
  const last = st.lastEnd.get(cy) ?? -Infinity;
  if (x0 < last) return;
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(n.title, x0 + 9, cy);
  st.lastEnd.set(cy, x0 + w + 18);
  const theme = st.isDark ? 1 : 0;
  let dotX = x0 + w + 24;
  const dots: [keyof typeof DOT_COLOR, number][] = [
    ['o', n.o],
    ['u', n.u],
    ['c', n.c],
  ];
  for (const [key, count] of dots) {
    if (count > 0) {
      ctx.beginPath();
      ctx.arc(dotX, cy, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = DOT_COLOR[key][theme];
      ctx.fill();
      dotX += 5;
    }
  }
}

function drawSelection(st: State, line: string): void {
  if (!st.selectedId) return;
  const n = st.nodes.find((nn) => nn.id === st.selectedId);
  if (!n || !st.active.has(n.t)) return;
  const x0 = screenX(st, n.a);
  const x1 = n.b != null && n.b !== n.a ? screenX(st, n.b) : x0;
  const cy = st.rowY[n.t] ?? 0;
  if (x1 < 0 || x0 > st.W) return;
  const ctx = st.ctx;
  ctx.beginPath();
  if (n.t === 'event' || n.t === 'world') {
    ctx.arc(x0, cy, 8, 0, Math.PI * 2);
  } else {
    const w = Math.max(14, x1 - x0);
    ctx.roundRect(x0 - 4, cy - 11, w + 8, 22, 8);
  }
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function levelForK(k: number): number {
  // [1,2) → 1（仅 importance 5）；[2,4)→2；[4,8)→3；[8,16)→4；≥16 → 5（全部）
  if (k < 2) return 1;
  if (k < 4) return 2;
  if (k < 8) return 3;
  if (k < 16) return 4;
  return 5;
}

/* ------------------------------- 交互 ------------------------------- */

function wireGestures(st: State): void {
  const bhv = zoom<HTMLCanvasElement, unknown>()
    .scaleExtent([1, st.maxK])
    .translateExtent([[0, 0], [st.W, st.H]])
    .extent([[0, 0], [st.W, st.H]])
    .on('start', () => st.root.classList.add('tl-interacting'))
    .on('zoom', (ev) => {
      st.k = ev.transform.k;
      st.tx = ev.transform.x;
      clampPan(st);
      redraw(st);
    })
    .on('end', () => {
      st.root.classList.remove('tl-interacting');
      updateHash(st);
      markActiveEra(st);
    });
  st.zoomBhv = bhv;
  select(st.canvas).call(bhv);

  st.canvas.addEventListener('mousemove', (e) => {
    const [cx, cy] = pointer(e, st.canvas);
    const hit = pick(st, cx, cy);
    if (hit) {
      st.canvas.style.cursor = hit.kind === 'node' ? 'pointer' : 'default';
      showTooltip(st, hit, e.clientX, e.clientY);
    } else {
      st.canvas.style.cursor = 'default';
      if (st.tooltipEl) st.tooltipEl.hidden = true;
    }
  });
  st.canvas.addEventListener('mouseleave', () => {
    if (st.tooltipEl) st.tooltipEl.hidden = true;
  });
  // 拖拽平移后 d3 不清除随后的 click，记录按下位置做过距离过滤
  let downX = 0;
  let downY = 0;
  st.canvas.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
  });
  st.canvas.addEventListener('click', (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // 是拖拽而非点选
    const [cx, cy] = pointer(e, st.canvas);
    const hit = pick(st, cx, cy);
    if (!hit) return;
    if (hit.kind === 'node' && hit.id) {
      st.selectedId = hit.id;
      redraw(st);
      updateHash(st);
      void openPanel(st, hit.id).catch((err) => {
        console.error(err);
        if (st.statusEl) st.statusEl.textContent = '详情加载失败。';
      });
    } else if (hit.kind === 'era' || hit.kind === 'dyn') {
      location.href = `${st.cfg.base}/era/${hit.id}`;
    }
  });

  window.addEventListener('keydown', (e) => {
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const visW = st.W / st.k;
    if (e.key === 'ArrowLeft') {
      slide(st, -visW * 0.25);
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      slide(st, visW * 0.25);
      e.preventDefault();
    } else if (e.key === '+' || e.key === '=') {
      zoomCentered(st, 1.5);
      e.preventDefault();
    } else if (e.key === '-') {
      zoomCentered(st, 1 / 1.5);
      e.preventDefault();
    } else if (e.key === 'Home') {
      setViewport(st, st.t0, st.t1, true);
      e.preventDefault();
    }
  });
}

function slide(st: State, dx: number): void {
  st.tx += dx;
  clampPan(st);
  syncZoomState(st);
  redraw(st);
  updateHash(st);
  markActiveEra(st);
}

function zoomCentered(st: State, factor: number): void {
  const centerYear = yearAt(st, st.W / 2);
  let k = st.k * factor;
  k = Math.max(1, Math.min(st.maxK, k));
  const span = st.len / k;
  setViewport(st, centerYear - span / 2, centerYear + span / 2, false);
}

function pick(st: State, x: number, y: number): Hit | null {
  for (let i = st.hit.length - 1; i >= 0; i--) {
    const h = st.hit[i];
    if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
  }
  return null;
}

function showTooltip(st: State, hit: Hit, cx: number, cy: number): void {
  const el = st.tooltipEl;
  if (!el) return;
  el.hidden = false;
  el.innerHTML = '';
  const b = document.createElement('b');
  if (hit.kind === 'node') {
    const n = st.nodes.find((nn) => nn.id === hit.id);
    if (!n) return;
    b.textContent = `${n.title} · ${TYPE_LABEL[n.t]}`;
    el.appendChild(b);
    const rng = document.createElement('div');
    rng.textContent = fmtRange(n.a, n.b, n.p);
    el.appendChild(rng);
    if (n.s) {
      const s = document.createElement('div');
      s.textContent = n.s;
      el.appendChild(s);
    }
    const counts = document.createElement('div');
    counts.textContent = `正史 ${n.o} · 野史 ${n.u} · 批注 ${n.c} · 重要度 ${n.i}`;
    el.appendChild(counts);
    if (n.st === 1) {
      const d = document.createElement('div');
      d.className = 'tl-draft-note';
      d.textContent = 'draft：AI 起草，未审核';
      el.appendChild(d);
    }
  } else if (hit.kind === 'era' || hit.kind === 'dyn') {
    let title: string | undefined;
    let r: [number, number] | undefined;
    if (hit.kind === 'era') {
      const e = st.eras.find((ee) => ee.id === hit.id);
      if (e) {
        title = e.title;
        r = [e.a, e.b];
      }
    } else {
      for (const e of st.eras) {
        const dd = e.d.find((x) => x.id === hit.id);
        if (dd) {
          title = dd.title;
          r = [dd.a, dd.b];
          break;
        }
      }
    }
    if (!title) return;
    b.textContent = `${title} · ${hit.kind === 'era' ? '分期' : '朝代'}`;
    el.appendChild(b);
    const rng = document.createElement('div');
    rng.textContent = fmtRange(r![0], r![1], '');
    el.appendChild(rng);
  }
  const pad = 12;
  const tw = el.offsetWidth;
  const th = el.offsetHeight;
  let x = cx + pad;
  let y = cy + pad;
  if (x + tw > window.innerWidth - 8) x = cx - tw - pad;
  if (y + th > window.innerHeight - 8) y = cy - th - pad;
  el.style.left = `${Math.max(4, x)}px`;
  el.style.top = `${Math.max(4, y)}px`;
}

async function openPanel(st: State, id: string): Promise<void> {
  const node = st.nodes.find((n) => n.id === id);
  if (!node || !st.panelRoot) return;
  st.panelRoot.hidden = false;
  // 先清空并提示加载中
  st.panelRoot.textContent = '';
  const note = document.createElement('p');
  note.className = 'empty';
  note.textContent = '正在加载详情…';
  st.panelRoot.appendChild(note);
  const url = `${st.cfg.base}/timeline-detail/${node.t}/${encodeURIComponent(id)}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    renderDetailPanel(
      st.panelRoot,
      {
        id: node.id,
        t: node.t,
        title: node.title,
        s: node.s,
        a: node.a,
        b: node.b,
        p: node.p,
        e: node.e,
        d: node.d,
        i: node.i,
        tags: node.g,
        aliases: [],
        related: [],
        status: 'draft',
        overview: '',
        official: [
          {
            source: '——',
            credibility: 'B',
            text: '详情数据暂不可用（可能为 draft 短条目，尚未生成三块内容）。',
          },
        ],
        unofficial: [],
        commentary: [],
      },
      st.cfg.base,
    );
    return;
  }
  const detail = await res.json();
  renderDetailPanel(st.panelRoot, detail, st.cfg.base);
}

function updateHash(st: State): void {
  const va = yearAt(st, 0);
  const vb = yearAt(st, st.W);
  let h = '#';
  const isFit = st.k <= 1 + 1e-6;
  if (!isFit) {
    h += `t=${Math.round(Math.max(st.t0, va))}..${Math.round(Math.min(st.t1, vb))}`;
  }
  if (st.selectedId) h += (h.length > 1 ? '&' : '') + `n=${st.selectedId}`;
  const newUrl = location.pathname + location.search + h;
  history.replaceState(null, '', newUrl);
}

function readHash(): { t?: [number, number]; n?: string } {
  const h = location.hash.replace(/^#/, '');
  const out: { t?: [number, number]; n?: string } = {};
  for (const part of h.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = eq >= 0 ? part.slice(0, eq) : part;
    const v = eq >= 0 ? part.slice(eq + 1) : '';
    if (k === 't') {
      const [a, b] = v.split('..').map(Number);
      if (Number.isFinite(a) && Number.isFinite(b)) out.t = [a, b];
    } else if (k === 'n') {
      out.n = v;
    }
  }
  return out;
}

/** 全局 `st` 上的通用工具函数需要的格式 */
function fmtRange(a: number, b: number | undefined, p?: string): string {
  const circa = p === 'circa' || p === 'century' ? '约 ' : '';
  const fy = (y: number) => (y < 0 ? `前 ${-y}` : `${y}`);
  if (typeof b === 'number' && b !== a) return `${circa}${fy(a)} – ${fy(b)}`;
  return `${circa}${fy(a)}`;
}

function markActiveEra(st: State): void {
  const center = yearAt(st, st.W / 2);
  let activeEra: string | null = null;
  for (const e of st.eras) {
    if (center >= e.a && center <= (e.b ?? e.a)) activeEra = e.id;
  }
  st.root.querySelectorAll<HTMLButtonElement>('.tl-era-chip').forEach((btn) => {
    btn.classList.toggle('is-active', activeEra === btn.dataset.era);
  });
}

function buildSpeedbar(st: State): void {
  const bar = st.root.querySelector<HTMLElement>('.tl-speedbar');
  if (!bar) return;
  if (st.cfg.minimal) {
    bar.hidden = true;
    return;
  }
  for (const e of st.eras) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tl-era-chip';
    btn.dataset.era = e.id;
    btn.style.setProperty('--era-chip-color', bandColor(e.c, 0, e.id));
    btn.textContent = e.title;
    btn.addEventListener('click', () => {
      const pad = Math.max(20, Math.round((e.b - e.a) * 0.1));
      setViewport(st, e.a - pad, e.b + pad, true);
    });
    bar.appendChild(btn);
  }
}

function wireControls(st: State): void {
  st.root.querySelectorAll<HTMLInputElement>('input[type=checkbox][data-track]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const t = cb.dataset.track as TimelineNodeType;
      if (cb.checked) st.active.add(t);
      else st.active.delete(t);
      redraw(st);
    });
  });
  const closeBtn = st.root.querySelector<HTMLButtonElement>('.tl-panel-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (st.panelRoot) st.panelRoot.hidden = true;
      st.selectedId = null;
      updateHash(st);
      redraw(st);
    });
  }
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const onTheme = () => {
    st.isDark = readTheme() === 'dark';
    redraw(st);
  };
  darkQuery.addEventListener?.('change', onTheme);
  window.addEventListener(THEME_EVENT, onTheme);
}

function wireResize(st: State): void {
  let raf = 0;
  window.addEventListener('resize', () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      layout(st);
      syncZoomState(st);
      redraw(st);
    });
  });
}