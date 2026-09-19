/**
 * A4：以「包含 draft」模式运行 astro（dev / build:local）。
 *
 * 生产构建 `npm run build` 不设置任何环境变量 → src/lib/publish.ts
 * INCLUDE_DRAFTS=false，只发布 reviewed / published。本脚本把
 * PUBLISH_ONLY 置为 'false' 后转发给 astro，让本地开发与本地完整构建
 * 能看到 draft 内容（Base 布局会显示预览横幅）。
 *
 * 用法：node scripts/local-astro.mjs <astro args…>（如 dev / build / check）
 */
import { spawn } from 'node:child_process';

process.env.PUBLISH_ONLY = 'false';

const args = process.argv.slice(2);
// Windows 上 .cmd shim 需要 shell；POSIX 直接执行 npx。
const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(cmd, ['astro', ...args], {
  shell: process.platform === 'win32',
  stdio: 'inherit',
});
child.on('error', (e) => {
  console.error('无法启动 astro（先执行 npm install？）', e);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 1));