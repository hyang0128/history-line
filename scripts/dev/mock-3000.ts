/**
 * A2 密度测试工具：造 3000 个假节点，验证时间轴不掉帧。
 * 输出 public/timeline/mock-3000.json（已 gitignore，不进生产）。
 * 运行：npm run mock  →  npm run dev 然后访问 /?mock=3000&hud=1 看渲染毫秒数。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TimelineIndex, TimelineIndexEra, TimelineIndexNode } from '../../src/lib/timeline-types';

// 确定性 PRNG，方便复现
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260918);

const T = ['event', 'event', 'event', 'event', 'event', 'person', 'person', 'topic', 'world'];

// 与 PLAN §3.1 一致的分期骨架
const ERAS: TimelineIndexEra[] = [
  { id: 'prehistoric', title: '传说与上古', a: -2100, b: -2070, c: '#7a6db0', d: [] },
  { id: 'xia-shang-zhou', title: '夏商周', a: -2070, b: -771, c: '#b8862b', d: [] },
  { id: 'spring-autumn-warring', title: '春秋战国', a: -770, b: -221, c: '#3f6f8f', d: [] },
  { id: 'qin-han', title: '秦汉', a: -221, b: 220, c: '#b0774a', d: [] },
  { id: 'wei-jin-nanbei', title: '三国两晋南北朝', a: 220, b: 589, c: '#4f9a7e', d: [] },
  { id: 'sui-tang-wudai', title: '隋唐五代', a: 581, b: 960, c: '#c9963a', d: [] },
  { id: 'song-liao-jin-yuan', title: '宋辽金元', a: 960, b: 1368, c: '#a34d55', d: [] },
  { id: 'ming', title: '明', a: 1368, b: 1644, c: '#8a5f9f', d: [] },
  { id: 'qing', title: '清', a: 1636, b: 1912, c: '#5a7f7a', d: [] },
  { id: 'republic', title: '民国', a: 1912, b: 1949, c: '#c2563f', d: [] },
  { id: 'prc', title: '新中国', a: 1949, b: 2000, c: '#b89a4a', d: [] },
];

function pickEra(year: number): string {
  for (const e of ERAS) {
    if (year >= e.a && year <= e.b) return e.id;
  }
  return year < -770 ? 'xia-shang-zhou' : 'prc';
}

function randYear(): number {
  // 集中在 -2000..2000
  return Math.round(-2000 + rng() * 4000);
}

function importance(): number {
  const r = rng();
  if (r < 0.08) return 5;
  if (r < 0.22) return 4;
  if (r < 0.5) return 3;
  if (r < 0.8) return 2;
  return 1;
}

const NAMES = ['大举', '叛乱', '改制', '西征', '变法', '会盟', '北伐', '迁都', '兴衰', '鼎革', '落定', '中兴', '败盟', '来朝', '用事'];

const nodes: TimelineIndexNode[] = [];
for (let i = 0; i < 3000; i++) {
  const t = T[Math.floor(rng() * T.length)] as TimelineIndexNode['t'];
  const a = randYear();
  let b: number | undefined;
  if (t === 'person') b = a + Math.round(20 + rng() * 60);
  else if (t === 'topic' || rng() < 0.25) b = a + Math.round(5 + rng() * 120);
  const era = pickEra(a);
  nodes.push({
    id: `mock-n${i}`,
    t,
    title: `${NAMES[Math.floor(rng() * NAMES.length)]}${i % 10 === 0 ? '之役' : ''}`,
    s: undefined,
    a,
    b,
    p: 'year',
    e: era,
    d: undefined,
    i: importance(),
    o: Math.floor(rng() * 3),
    u: Math.floor(rng() * 2),
    c: Math.floor(rng() * 3),
    g: [],
    st: 0,
  });
}

const index: TimelineIndex = { nodes, eras: ERAS };

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/timeline/mock-3000.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(index), 'utf8');
console.log(`mock-3000.json 已生成：${out}（${nodes.length} 节点）`);