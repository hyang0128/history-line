/**
 * Markdown 组装与文本度量工具。
 */
import YAML from 'yaml';

/** 序列化 frontmatter 对象为 YAML 文本（不换行、保留字段顺序） */
export function serializeFrontmatter(data: unknown): string {
  return YAML.stringify(data, { lineWidth: 0, sortMapEntries: false });
}

/** 组装完整 Markdown 文件（frontmatter + 正文） */
export function composeMarkdown(frontmatter: unknown, body: string): string {
  const fm = serializeFrontmatter(frontmatter)
    .replace(/\s+$/, '\n')
    .replace(/\n{2,}/g, '\n');
  const b = body.replace(/^\s+/, '').trimEnd();
  return `---\n${fm}---\n\n${b}\n`;
}

/** 字符数（去掉空白），用于概述、quote 的字数检查 */
export function charLen(s: string): number {
  return s.replace(/[\s　]/g, '').length;
}

/**
 * 把模型响应规整回"从 --- 开始的 Markdown"：
 *   - 剥掉 ``` 围栏（含 ` ```--- ` 粘合行）
 *   - 丢掉文件前的解说句/空行（从第一个独立 --- 行起）
 *   - 去掉末尾的纯围栏行
 * 规整后仍不以 --- 开头则原样返回（留给解析器报错）。
 */
export function unwrapCodeFence(raw: string): string {
  const lines = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  let body = lines;
  const open = lines.findIndex((l) => /^\s*```/.test(l));
  if (open >= 0) {
    if (/^\s*```\w*\s*$/.test(lines[open])) {
      body = lines.slice(open + 1);
    } else {
      body = lines.slice(open);
      body[0] = lines[open].replace(/^\s*```\w*/, '');
    }
  }
  const dash = body.findIndex((l) => l.trim() === '---');
  if (dash > 0) body = body.slice(dash);
  while (body.length && /^\s*```\s*$/.test(body[body.length - 1])) body.pop();
  const out = body.join('\n').replace(/^\s*/, '');
  return out.trim() === '' ? lines.join('\n') : out;
}