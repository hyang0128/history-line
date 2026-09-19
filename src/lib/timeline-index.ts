/**
 * 构建时输出时间轴用的精简 JSON（A2，PLAN.md §5.3 / §10.3 A2）。
 * 只在构建期（页面/静态端点）运行，浏览器端不加载本文件。
 */
import { getAllNodes, getEras } from './nodes';
import type {
  TimelineDetail,
  TimelineIndex,
  TimelineIndexEra,
  TimelineIndexNode,
  TimelineNodeType,
} from './timeline-types';

const TYPE: Record<string, TimelineNodeType> = {
  events: 'event',
  persons: 'person',
  topics: 'topic',
  world: 'world',
};

/**
 * 生成时间轴索引：每节点精简记录 + 分期/朝代色带。
 * 被 /timeline/index.json.ts 调用，构建时静态输出。
 */
export async function buildTimelineIndex(): Promise<TimelineIndex> {
  const nodes = await getAllNodes();
  const { eras, dynasties } = await getEras();

  const nodeRecs: TimelineIndexNode[] = nodes.map((n) => {
    const d = n.entry.data;
    const blocks = n.blocks;
    return {
      id: d.id,
      t: TYPE[n.collection],
      title: d.title,
      s: d.summary,
      a: d.date.start,
      b: d.date.end,
      p: d.date.precision,
      e: d.era,
      d: d.dynasty,
      i: d.importance,
      o: blocks.official.length,
      u: blocks.unofficial.length,
      c: blocks.commentary.length,
      g: d.tags,
      st: d.status === 'draft' ? 1 : 0,
    };
  });

  const eraRecs: TimelineIndexEra[] = eras.map((era) => ({
    id: era.id,
    title: era.data.title,
    a: era.data.date.start,
    b: era.data.date.end ?? era.data.date.start,
    c: era.data.color,
    d: dynasties
      .filter((dd) => dd.data.parent === era.id)
      .map((dd) => ({
        id: dd.id,
        title: dd.data.title,
        a: dd.data.date.start,
        b: dd.data.date.end ?? dd.data.date.start,
        c: dd.data.color,
      })),
  }));

  return { nodes: nodeRecs, eras: eraRecs };
}

/** 单个节点的完整详情，点击面板用。 */
export function buildTimelineDetail(n: {
  collection: 'events' | 'persons' | 'topics' | 'world';
  entry: {
    data: {
      id: string;
      title: string;
      summary?: string;
      aliases: string[];
      date: { start: number; end?: number; precision?: string };
      era: string;
      dynasty?: string;
      importance: number;
      tags: string[];
      location?: string;
      related: string[];
      status: string;
    };
  };
  blocks: {
    overview: string;
    official: TimelineDetail['official'];
    unofficial: TimelineDetail['unofficial'];
    commentary: TimelineDetail['commentary'];
  };
}): TimelineDetail {
  const d = n.entry.data;
  return {
    id: d.id,
    t: TYPE[n.collection],
    title: d.title,
    s: d.summary,
    a: d.date.start,
    b: d.date.end,
    p: d.date.precision,
    e: d.era,
    d: d.dynasty,
    i: d.importance,
    tags: d.tags,
    location: d.location,
    aliases: d.aliases,
    related: d.related,
    status: d.status,
    overview: n.blocks.overview,
    official: n.blocks.official,
    unofficial: n.blocks.unofficial,
    commentary: n.blocks.commentary,
  };
}

/** 给 endpoint 用：确保 eras 数据排序稳定 */
export async function getSortedEras(): Promise<{ eras: TimelineIndexEra[] }> {
  const idx = await buildTimelineIndex();
  return { eras: idx.eras };
}