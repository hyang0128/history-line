/**
 * 提示词组装：系统提示 + 参考样例（few-shot）+ 用户消息（节点元数据填入模板）。
 * run.ts 与 eval.ts 共用，保证同一节点在两种路径下提问一致（利于前缀缓存与评测）。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { GENERATE_DIR, ROOT } from './content';

export interface PromptInput {
  id: string;
  type: string;
  title: string;
  era?: string;
  dynasty?: string;
  year?: number;
  yearEnd?: number;
  importance: number;
  hint?: string;
  model: string;
}

const FEW_SHOT_SAMPLE = path.join(ROOT, 'content', 'events', 'tang', 'an-lushan-rebellion.md');

export async function buildPrompt(input: PromptInput): Promise<{ system: string; user: string }> {
  const systemRaw = await readFile(path.join(GENERATE_DIR, 'prompts', 'system.md'), 'utf8');
  const fewShot = await readFile(FEW_SHOT_SAMPLE, 'utf8');
  const system =
    systemRaw.trim() +
    '\n\n## 参考样例\n只模仿其格式与内容结构，不得复制其中的史实内容。\n\n```markdown\n' +
    fewShot.trim() +
    '\n```\n';

  const tpl = await readFile(path.join(GENERATE_DIR, 'prompts', 'node-template.md'), 'utf8');
  const yearHint =
    input.year != null ? `${input.year}${input.yearEnd != null ? `–${input.yearEnd}` : ''}` : '请按史实推断大致年份';
  const user = tpl
    .replaceAll('{{id}}', input.id)
    .replaceAll('{{type}}', input.type)
    .replaceAll('{{title}}', input.title)
    .replaceAll('{{era}}', input.era ?? '')
    .replaceAll('{{dynasty}}', input.dynasty ?? '')
    .replaceAll('{{year_hint}}', yearHint)
    .replaceAll('{{importance}}', String(input.importance))
    .replaceAll('{{hint}}', input.hint ?? '')
    .replaceAll('{{model}}', input.model);
  return { system, user };
}