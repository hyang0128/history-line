/**
 * mock provider —— 仅用于离线自检管线（生成 → 缓存 → 校验 → 统计），
 * 不产生真实模型调用、费用为 0。生产批量请使用真实模型。
 */
import type { ModelDef } from '../../lib/models';
import type { Provider } from './index';

export function mock(_def: ModelDef): Provider {
  return async (req) => {
    const m = (req.meta ?? {}) as Record<string, unknown>;
    const id = String(m.id ?? 'mock-node');
    const type = String(m.type ?? 'event');
    const title = String(m.title ?? '测试节点');
    const year = typeof m.year === 'number' ? m.year : 500;
    const era = String(m.era ?? 'sui-tang-wudai');
    const dynasty = typeof m.dynasty === 'string' ? m.dynasty : '';
    const importance = typeof m.importance === 'number' ? m.importance : 3;

    const summary = `mock 生成的管线自检草稿：${title}。本条目仅用于验证生成、缓存、校验与统计流程，不构成实际历史内容。`;
    const overview =
      `这是《${title}》的单条 mock 概述，为管线自检而生成。第一段介绍起因、经过与结果：` +
      `该节点进入待生成队列，由 mock provider 返回固定模板，用于验证提示词组装、生成、写入与缓存全流程是否完整（本段为说明文字）。` +
      `第二段说明影响与史料问题：正式使用时这条内容会被真实模型的草稿替换，并在人工审核后发布；` +
      `mock 内容不含任何史实表述，也不可被引用。此处为达到概述字数下限补充的填充文字，请勿保留。`;

    const lines = [
      '---',
      `id: ${id}`,
      `type: ${type}`,
      `title: ${title}`,
      'aliases: []',
      `summary: ${summary}`,
      `date: { start: ${year}, end: ${typeof m.yearEnd === 'number' ? m.yearEnd : 'null'}, precision: year }`,
      `era: ${era}`,
      ...(dynasty ? [`dynasty: ${dynasty}`] : []),
      `importance: ${importance}`,
      'tags: [测试]',
      'location:',
      'related: []',
      'status: draft',
      'generated_by: mock',
      '---',
    ].join('\n');

    const body = [
      '',
      '## 概述',
      '',
      overview,
      '',
      '## 正史',
      '',
      '- source: 《示例史书》卷第一',
      '  credibility: A',
      '  text: 这段文字用于证明正史条目能被校验器接受。本条全部内容均为 mock 占位，不构成历史叙述。',
      '- source: 《示例史料汇编》某篇',
      '  credibility: B',
      '  text: 第二条正史占位，验证多条目与列表结构。',
      '',
      '## 野史',
      '',
      '- source: 《示例笔记》',
      '  credibility: C',
      '  text: 野史占位条目，验证野史块结构与可信度字段。',
      '',
      '## 批注',
      '',
      '- author: AI 综述',
      '  source: 综合示例来源',
      '  category: ai',
      '  license: ai-synthesis',
      '  text: 学界共识：这是 mock 生成的占位内容。主要分歧：它只用于测试管线，不应出现在正式内容中。',
    ].join('\n');

    return { text: `${lines}\n${body}\n`, usage: { inputTokens: 1200, outputTokens: 900 } };
  };
}