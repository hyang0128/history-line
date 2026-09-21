/**
 * 筛选状态：首页目录筛选与搜索页筛选共用（A3）。
 * 纯浏览器端模块；类型判断放在这里避免在各岛屿组件里重复。
 */

export const TYPE_LABELS: Record<string, { label: string; key: string }> = {
  event: { key: 'event', label: '事件' },
  person: { key: 'person', label: '人物' },
  topic: { key: 'topic', label: '专题' },
  world: { key: 'world', label: '世界史' },
};
export const CRED_LABELS = ['A', 'B', 'C', 'D'] as const;

export interface FilterState {
  /** 空数组 = 全部类型 */
  types: string[];
  /** 空数组 = 全部可信度 */
  creds: string[];
  /** 空格/顿号分词，全部命中才通过；空 = 不过滤 */
  tag: string;
  /** true = 包含 status=draft */
  drafts: boolean;
}

export const TYPE_KEYS = Object.keys(TYPE_LABELS);

export function defaultFilter(): FilterState {
  return { types: [], creds: [], tag: '', drafts: true };
}

export function filterFromParams(p: URLSearchParams): FilterState {
  const types = (p.get('type') ?? '')
    .split(',')
    .filter((t): t is 'event' | 'person' | 'topic' | 'world' => t in TYPE_LABELS);
  const creds = (p.get('cred') ?? '')
    .toUpperCase()
    .split(',')
    .filter((c): c is 'A' | 'B' | 'C' | 'D' => (CRED_LABELS as readonly string[]).includes(c));
  return {
    types: [...new Set(types)],
    creds: [...new Set(creds)],
    tag: (p.get('tag') ?? '').trim(),
    drafts: p.get('drafts') !== '0',
  };
}

/** 把筛选写回 URL；保留已有参数（如搜索页的 q），只覆盖筛选相关键。 */
export function filterToQuery(st: FilterState, q: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const out = new URLSearchParams(q);
  const set = (k: string, v: string) => {
    if (v) out.set(k, v);
    else out.delete(k);
  };
  set('type', st.types.join(','));
  set('cred', st.creds.join(','));
  set('tag', st.tag || '');
  // drafts 的真值（含未审核）是默认，不写进 URL，减少噪音；仅当显式关闭时写 drafts=0
  if (!st.drafts) out.set('drafts', '0');
  else out.delete('drafts');
  return out;
}

export interface Filterable {
  type: string;
  /** 节点含有的可信度集合字符串，如 'ABC' */
  creds: string;
  status: string;
  tags: string;
  title: string;
  text?: string;
}

/** 节点是否通过筛选。creds 按"包含任一选中等级"判定。 */
export function matches(st: FilterState, n: Filterable): boolean {
  if (!st.drafts && n.status === 'draft') return false;
  if (st.types.length && !st.types.includes(n.type)) return false;
  if (st.creds.length && !st.creds.some((c) => n.creds.includes(c))) return false;
  if (st.tag) {
    // 空格/顿号/逗号分词（占位符即写着「如 战争、科举」），全部命中才通过
    const terms = st.tag.toLowerCase().split(/[\s，、,；;]+/).filter(Boolean);
    const hay = `${n.title} ${n.tags} ${n.text ?? ''}`.toLowerCase();
    if (terms.some((t) => !hay.includes(t))) return false;
  }
  return true;
}