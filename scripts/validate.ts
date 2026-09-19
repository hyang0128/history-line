#!/usr/bin/env tsx
/**
 * validate.ts —— 内容校验（A1）。
 * 用法：npm run validate [-- --strict | --json | --dir <路径>]
 *   --strict  把警告一并计为失败（退出码 1）
 *   --json    输出 JSON 报告
 *   --dir     从指定目录扫描（测试独立目录用，此时不校验朝代引用）
 *   --full    列出全部警告（默认最多 20 条）
 */
import path from 'node:path';
import { validateContent, errorCount } from './lib/validate-core';

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const has = (f: string) => argv.includes(f);
  const valueOf = (f: string) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  if (has('--help')) {
    console.log(
      [
        'npm run validate -- [--strict] [--json] [--dir <路径>] [--full]',
        '',
        '校验 content/ 全部内容：frontmatter schema、正文四块、朝代/分期引用、',
        '日期区间、status 规则、字数与条数范围。',
        '缺 source / 缺 credibility / paraphrase 含 quote 等结构错误一律报错（退出码 1）。',
      ].join('\n'),
    );
    return 0;
  }

  const json = has('--json');
  const strict = has('--strict');
  const full = has('--full');
  const dir = valueOf('--dir');

  const result = await validateContent({ baseDir: dir ? path.resolve(dir) : undefined });
  const errors = result.findings.filter((f) => f.level === 'error');
  const warnings = result.findings.filter((f) => f.level === 'warning');

  if (json) {
    console.log(
      JSON.stringify(
        {
          filesChecked: result.filesChecked,
          nodeCount: result.nodeCount,
          eraCount: result.eraCount,
          errors,
          warnings,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`内容校验报告`);
    console.log(`  文件：${result.filesChecked}（节点 ${result.nodeCount}，分期/朝代 ${result.eraCount}）`);
    console.log(`  错误：${errors.length} ${strict ? `· 警告计入失败：${warnings.length}` : ''}`);
    for (const f of errors.slice(0, 50)) {
      console.log(`  [error] ${f.rel} — ${f.code}: ${f.message}`);
    }
    const shown = full ? warnings : warnings.slice(0, 20);
    for (const f of shown) {
      console.log(`  [warn ] ${f.rel} — ${f.code}: ${f.message}`);
    }
    if (!full && warnings.length > shown.length) {
      console.log(`  …其余 ${warnings.length - shown.length} 条警告，用 --full 查看`);
    }
  }
  return errorCount(result, strict) > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(String(e));
    process.exit(1);
  });