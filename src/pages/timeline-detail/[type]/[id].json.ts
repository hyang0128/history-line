/**
 * /timeline-detail/<type>/<id>.json —— 单节点详情，点击面板按需取（PLAN.md §5.3）。
 * type 为 event / person / topic / world。
 */
import { getAllNodes } from '@/lib/nodes';
import { buildTimelineDetail } from '@/lib/timeline-index';

export async function getStaticPaths() {
  const nodes = await getAllNodes();
  return nodes.map((n) => ({
    params: { type: n.route, id: n.entry.data.id },
    props: { node: n },
  }));
}

export async function GET({ props }: { props: { node: Parameters<typeof buildTimelineDetail>[0] } }) {
  return new Response(JSON.stringify(buildTimelineDetail(props.node)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}