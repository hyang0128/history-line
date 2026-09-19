// @ts-check
import { defineConfig } from 'astro/config';

// site / base 在 A4 部署任务包中按 GitHub Pages 仓库名调整。
export default defineConfig({
  site: 'https://example.github.io',
  base: '/',
  output: 'static',
  trailingSlash: 'ignore',
  // 本机 localhost 常解析为 ::1，导致 dev 只绑 IPv6 回环、IPv4 访问被拒。
  // 显式绑 127.0.0.1，保证 http://localhost:4321 与 http://127.0.0.1:4321 都能打开。
  server: { host: '127.0.0.1' },
  markdown: {
    shikiConfig: { theme: 'github-light' },
  },
});
