/**
 * Markdown frontmatter 的拆分与解析。
 * content 文件约定：文件以 `---` 起始，闭合 `---` 之后是正文（见 docs/style-guide.md）。
 */
import YAML from 'yaml';

export interface Split {
  /** 两个 `---` 之间的原始文本；无 frontmatter 时为 null */
  frontmatter: string | null;
  body: string;
}

/** 拆分 frontmatter 与正文，返回 frontmatter 原文（不含定界符）与正文。 */
export function splitFrontmatter(text: string): Split {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/);
  if (lines.length > 0 && lines[0].trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        return { frontmatter: lines.slice(1, i).join('\n'), body: lines.slice(i + 1).join('\n') };
      }
    }
  }
  return { frontmatter: null, body: clean };
}

export interface Parsed {
  raw: string;
  data: unknown;
  body: string;
  hadFrontmatter: boolean;
}

export function parseFrontmatter(text: string): Parsed {
  const { frontmatter, body } = splitFrontmatter(text);
  if (frontmatter == null) return { raw: '', data: null, body, hadFrontmatter: false };
  let data: unknown;
  try {
    data = YAML.parse(frontmatter);
  } catch (e) {
    throw new Error(`frontmatter YAML 解析失败：${(e as Error).message}`);
  }
  return { raw: frontmatter, data, body, hadFrontmatter: true };
}