/**
 * B2 历史疆域地图（岛屿客户端逻辑）。
 * 渲染烘焙好的真实地理数据（public/geo/，构建管线见 scripts/geo/）：
 *   - base.json：亚洲国家底图（Natural Earth 50m，public domain）
 *   - dynasties.json：6 朝疆域（西汉/明/清取 OpenHistoricalMap CC0 实测边界；
 *     秦/唐/元由 DataV 省级边界并集 + Natural Earth 按史载界线裁切合成，示意）
 * 主题随 hl-themechange 重绘；URL ?dyn=<id> 深链可直选朝代。
 */
import { geoConicEqualArea, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import { readTheme, THEME_EVENT } from '../lib/theme';
import { MAP_DYNASTIES, resolveLocations } from '../lib/map-data';

export interface MapNode {
  id: string;
  t: 'event' | 'person' | 'topic' | 'world';
  title: string;
  date: string;
  start: number;
  dyn?: string;
  loc?: string;
}

interface Pal {
  land: string;
  landStroke: string;
  faintStroke: string;
  accent: string;
  city: string;
  grid: string;
}

const LIGHT: Pal = {
  land: '#efe9dc',
  landStroke: '#cfc6b4',
  faintStroke: '#c4b9a4',
  accent: '#9c4f3a',
  city: '#3f6f8f',
  grid: '#e7e0d2',
};
const DARK: Pal = {
  land: '#2b2822',
  landStroke: '#4a453c',
  faintStroke: '#565045',
  accent: '#d08a6f',
  city: '#7fb0d0',
  grid: '#33302a',
};

const W = 960;
const H = 600;

interface DynProps {
  id: string;
  title: string;
  when: string;
  note?: string;
  source?: string;
}
interface GeoBundle {
  base: GeoJSON.FeatureCollection;
  dyn: GeoJSON.FeatureCollection<GeoJSON.MultiPolygon, DynProps>;
}

export function initHistoryMap(root: HTMLElement, cfg: { base: string; nodes: MapNode[]; initial?: string }) {
  const nodes = cfg.nodes;
  const base = (cfg.base ?? '').replace(/\/$/, '');
  let bundle: GeoBundle | null = null;
  // initial（dev 期经 map.astro 来自 URL ?dyn=）可能是任意值：不校验会让 render() 找不到要素、地图空白
  const initial = MAP_DYNASTIES.some((d) => d.id === cfg.initial) ? cfg.initial : undefined;
  let selected = initial ?? MAP_DYNASTIES[0]?.id ?? 'qin';

  const statusEl = root.querySelector<HTMLElement>('.map-status');
  const whenEl = root.querySelector<HTMLElement>('.map-when');
  const listEl = root.querySelector<HTMLElement>('.map-nodes');
  const tooltip = root.querySelector<HTMLElement>('.map-tooltip');
  const svg = select(root).select<SVGSVGElement>('svg.map-svg');
  const chips = Array.from(root.querySelectorAll<HTMLButtonElement>('.map-chip'));

  function pal(): Pal {
    return readTheme() === 'dark' ? DARK : LIGHT;
  }

  /** 底图 + 对照 + 选中层 + 城市点；数据加载完成后每次交互/换主题整体重画（元素量小，无需 diff） */
  function render() {
    if (!bundle) return;
    const p = pal();
    svg.selectAll('*').remove();
    const g = svg.append('g');

    // 投影：等积圆锥（中国地图标准画法），以 6 朝整体范围取景
    const projection = geoConicEqualArea()
      .parallels([25, 47])
      .rotate([-105, 0])
      .fitExtent(
        [
          [14, 10],
          [W - 14, H - 10],
        ],
        bundle.dyn as unknown as GeoJSON.GeoJSON,
      );
    const pathGen = geoPath(projection);

    // 经纬参考线
    const grid = g.append('g').attr('stroke', p.grid).attr('stroke-width', 0.4).attr('fill', 'none');
    for (let lng = 60; lng <= 160; lng += 20) {
      grid.append('path').attr('d', pathGen({ type: 'LineString', coordinates: Array.from({ length: 11 }, (_, i) => [lng, 10 + i * 5]) } as never));
    }
    for (let lat = 0; lat <= 60; lat += 10) {
      grid.append('path').attr('d', pathGen({ type: 'LineString', coordinates: Array.from({ length: 11 }, (_, i) => [60 + i * 10, lat]) } as never));
    }

    // 底图：现代亚洲国家（真实海岸线），弱化填色
    for (const f of bundle.base.features) {
      g.append('path')
        .attr('d', pathGen(f as never) ?? '')
        .attr('fill', p.land)
        .attr('stroke', p.landStroke)
        .attr('stroke-width', 0.5);
    }

    // 其余朝代：只描边作范围对照
    for (const f of bundle.dyn.features) {
      if (f.properties.id === selected) continue;
      g.append('path')
        .attr('d', pathGen(f as never) ?? '')
        .attr('fill', 'none')
        .attr('stroke', p.faintStroke)
        .attr('stroke-width', 0.9)
        .attr('stroke-dasharray', '3 2');
    }

    const sel = bundle.dyn.features.find((f) => f.properties.id === selected);
    if (!sel) {
      if (whenEl) whenEl.textContent = '';
      if (listEl) listEl.replaceChildren();
      return;
    }

    // 选中朝代疆域
    const selPath = g
      .append('path')
      .attr('d', pathGen(sel as never) ?? '')
      .attr('fill', p.accent)
      .attr('fill-opacity', 0.3)
      .attr('stroke', p.accent)
      .attr('stroke-width', 1.6);

    // 朝代名标在最大多边形重心
    const largest = sel.geometry.coordinates.reduce((best, poly) =>
      poly[0].length > best[0].length ? poly : best,
    );
    const centroid = pathGen.centroid({ type: 'Polygon', coordinates: [largest] } as never);
    if (Number.isFinite(centroid[0]) && Number.isFinite(centroid[1])) {
      g.append('text')
        .attr('x', centroid[0])
        .attr('y', centroid[1])
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 30)
        .attr('font-weight', 700)
        .attr('fill', p.accent)
        .attr('fill-opacity', 0.8)
        .attr('pointer-events', 'none')
        .text(sel.properties.title);
    }
    void selPath;

    // 该朝代节点 → 城市落点（location 解析到地名词典者）
    const mine = nodes.filter((n) => n.dyn === sel.properties.id);
    const points = new Map<string, { geo: [number, number]; count: number; names: string[] }>();
    for (const n of mine) {
      for (const c of resolveLocations(n.loc)) {
        const key = `${c.geo[0]},${c.geo[1]}`;
        const prev = points.get(key);
        if (prev) {
          prev.count += 1;
          if (!prev.names.includes(c.place)) prev.names.push(c.place);
        } else {
          points.set(key, { geo: c.geo, count: 1, names: [c.place] });
        }
      }
    }

    const cityG = g.append('g');
    for (const { geo, count, names } of points.values()) {
      const xy = projection(geo);
      if (!xy) continue;
      const label = names.join('、');
      cityG
        .append('circle')
        .attr('cx', xy[0])
        .attr('cy', xy[1])
        .attr('r', 3.4)
        .attr('fill', p.city)
        .attr('stroke', 'rgba(255,255,255,0.72)')
        .attr('stroke-width', 0.7)
        .on('mousemove', (ev: MouseEvent) => {
          if (!tooltip) return;
          tooltip.textContent = `${label}（${count} 条节点提及）`;
          showTip(tooltip, ev);
        })
        .on('mouseleave', () => tooltip?.setAttribute('hidden', ''));
    }

    if (whenEl) {
      whenEl.textContent = `${sel.properties.title}：${sel.properties.when}`;
      whenEl.title = sel.properties.note ?? '';
    }
    if (statusEl) statusEl.textContent = `${points.size} 个可显示地点 · 其余节点见下方列表`;
    renderList(sel.properties.id);
  }

  function renderList(dynId: string) {
    if (!listEl) return;
    const mine = nodes
      .filter((n) => n.dyn === dynId)
      .sort((a, b) => a.start - b.start);
    const frag = document.createDocumentFragment();
    if (!mine.length) {
      const li = document.createElement('li');
      li.className = 'meta empty';
      li.textContent = '该朝代暂无可列节点。';
      frag.appendChild(li);
    }
    for (const n of mine) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `${base}/${n.t}/${n.id}`;
      a.textContent = n.title;
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = ` ${n.date} · ${TYPE_LABEL[n.t]}`;
      li.appendChild(a);
      li.appendChild(meta);
      frag.appendChild(li);
    }
    listEl.replaceChildren(frag);
  }

  function showTip(tooltipEl: HTMLElement, ev: MouseEvent) {
    tooltipEl.hidden = false;
    const tw = tooltipEl.offsetWidth;
    const x = Math.min(ev.clientX + 12, window.innerWidth - tw - 8);
    const y = Math.max(8, ev.clientY - 30);
    tooltipEl.style.left = `${x}px`;
    tooltipEl.style.top = `${y}px`;
  }

  function syncChips() {
    chips.forEach((b) => {
      const on = b.dataset.dyn === selected;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function selectDyn(id: string) {
    selected = id;
    const q = new URLSearchParams(location.search);
    q.set('dyn', id);
    history.replaceState(null, '', location.pathname + `?${q}`);
    syncChips();
    render();
  }

  chips.forEach((b) => b.addEventListener('click', () => selectDyn(b.dataset.dyn ?? selected)));

  const urlDyn = new URLSearchParams(location.search).get('dyn');
  if (urlDyn && MAP_DYNASTIES.some((d) => d.id === urlDyn)) selected = urlDyn;
  syncChips();
  window.addEventListener(THEME_EVENT, render);

  // 加载真实几何数据后首渲染
  Promise.all([
    fetch(`${base}/geo/dynasties.json`).then((r) => r.json()),
    fetch(`${base}/geo/base.json`).then((r) => r.json()),
  ])
    .then(([dyn, baseGj]) => {
      bundle = { dyn, base: baseGj };
      render();
    })
    .catch((e) => {
      console.error('疆域数据加载失败', e);
      if (statusEl) statusEl.textContent = '疆域数据加载失败，请刷新重试。';
    });
}

const TYPE_LABEL: Record<string, string> = { event: '事件', person: '人物', topic: '专题', world: '世界史' };
