/**
 * A2 密度测试（headless）：用 3000 个假节点定量测量每帧 CPU 关键路径耗时。
 * 覆盖 Canvas 渲染之外的 CPU 大头：语义过滤、排序、坐标折算、视口剔除、命中登记、"标签碰撞"。
 * 预期每帧远低于 16ms（60fps）；canvas 绘制只是等量的描边/填充路径，不构成瓶颈。
 * 运行：npm run bench（先生成 mock：npm run mock）
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TimelineIndex, TimelineIndexNode } from '../../src/lib/timeline-types';

const index = JSON.parse(readFileSync(resolve(process.cwd(), 'public/timeline/mock-3000.json'), 'utf8')) as TimelineIndex;
const nodes = index.nodes;
console.log(`载入 ${nodes.length} 个 mock 节点`);

const LEVEL_ZOOMS = [1, 2, 4, 8, 16];
let t0 = Infinity;
let t1 = -Infinity;
for (const n of nodes) {
  t0 = Math.min(t0, n.a);
  t1 = Math.max(t1, n.b ?? n.a);
}
const len = t1 - t0 + 2;
const W = 1100;

function levelForK(k: number): number {
  if (k < 2) return 1;
  if (k < 4) return 2;
  if (k < 8) return 3;
  if (k < 16) return 4;
  return 5;
}

const baseX = (y: number) => ((y - t0) / len) * W;
const screenX = (k: number, tx: number, y: number) => baseX(y) * k + tx;

/** 一帧的 CPU 关键路径（对应 timeline.ts 的 drawNodes + 命中登记） */
function runFrame(k: number, tx: number): void {
  const minImp = 6 - levelForK(k);
  const pxPerYear = (W / len) * k;
  const showLabel = pxPerYear >= 0.6;

  const shown: TimelineIndexNode[] = [];
  for (const n of nodes) {
    if (n.t === 'event' && n.i < minImp) continue;
    shown.push(n);
  }
  shown.sort((a, b) => a.a - b.a || b.i - a.i);

  const lastEnd = new Map<number, number>();
  let hits = 0;
  for (const n of shown) {
    const x0 = screenX(k, tx, n.a);
    const x1 = n.b != null && n.b !== n.a ? screenX(k, tx, n.b) : x0;
    if (x1 < 0 || x0 > W) continue;
    hits++;
    if (showLabel && n.t !== 'person' && n.t !== 'topic') {
      const cy = n.t === 'event' ? 80 : 120;
      const last = lastEnd.get(cy) ?? -Infinity;
      if (x0 >= last) {
        lastEnd.set(cy, x0 + 60);
        void n.i;
      }
    }
  }
  void hits;
}

const LEVELS = [1, 2, 8, 32];
for (const k of LEVELS) {
  // 最坏视口：横跨数据中段（可见节点最多）
  const tx = -W * k * 0.35;
  const runs = 200;
  const start = performance.now();
  for (let i = 0; i < runs; i++) runFrame(k, tx);
  const avg = (performance.now() - start) / runs;
  const flag = avg < 16 ? '✅' : '⚠ 高于 16ms';
  console.log(`zoom k=${String(k).padEnd(3)}（${' '.repeat(0)}放大 ${k}×）: 平均每帧 CPU ${avg.toFixed(3)}ms  ${flag}`);
}

const eventCount = nodes.filter((n) => n.t === 'event').length;
const persons = nodes.filter((n) => n.t === 'person').length;
console.log(`组成：${eventCount} 事件 + ${persons} 人物 + ${nodes.length - eventCount - persons} 专题/世界史`);