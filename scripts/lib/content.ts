/**
 * 内容目录与路径工具。脚本通过这里读写 content/，不改其结构。
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 项目根目录：scripts/lib 向上两级 */
export const ROOT = path.resolve(__dirname, '..', '..');
export const CONTENT_DIR = path.join(ROOT, 'content');
export const GENERATE_DIR = path.join(ROOT, 'scripts', 'generate');
export const CACHE_DIR = path.join(GENERATE_DIR, '.cache');

export const COLLECTIONS = ['eras', 'events', 'persons', 'topics', 'world'] as const;
export type CollectionName = (typeof COLLECTIONS)[number];
export type NodeCollection = 'events' | 'persons' | 'topics' | 'world';

const TYPE_TO_COLLECTION: Record<string, NodeCollection> = {
  event: 'events',
  person: 'persons',
  topic: 'topics',
  world: 'world',
};

/** 节点 type → 集合目录名 */
export function collectionForType(type: string): NodeCollection | null {
  return TYPE_TO_COLLECTION[type] ?? null;
}

export interface ContentFile {
  collection: CollectionName;
  /** 相对 content/ 的路径，用 / 分隔 */
  rel: string;
  file: string;
}

/** 递归扫描 content/（或 subroot）下的 .md 文件 */
export async function scanContent(dir: string = CONTENT_DIR): Promise<ContentFile[]> {
  const paths: string[] = [];
  const walk = async (d: string) => {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.md')) paths.push(full);
    }
  };
  await walk(dir);
  return paths.map((file) => {
    const rel = path.relative(dir, file).split(path.sep).join('/');
    const collection = rel.split('/')[0] as CollectionName;
    return { collection, rel, file };
  });
}

/**
 * 由队列元数据计算目标相对路径：
 * events/persons 依 dynasty 建子目录；topics/world 缺省放在集合根下（见 style-guide §1）。
 */
export function relForNode(params: { type: string; dynasty?: string; id: string }): string {
  const collection = collectionForType(params.type);
  if (!collection) throw new Error(`未知节点类型：${params.type}`);
  const dir = params.dynasty ? `${collection}/${params.dynasty}` : collection;
  return `${dir}/${params.id}.md`;
}