// @ts-check
import { defineConfig } from 'astro/config';

// site / base 默认按 GitHub Pages 项目站点（hyang0128/history-line）配置。
// 可通过环境变量覆盖（GitHub Actions 按仓库名计算，见 .github/workflows/deploy.yml）：
//   SITE_URL  如 https://hyang0128.github.io
//   BASE_PATH 如 /history-line/（必须首尾带斜杠；用户页站点传 '/'）
const site = process.env.SITE_URL || 'https://hyang0128.github.io';
const base = process.env.BASE_PATH || '/history-line/';

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'ignore',
  // 本机 localhost 常解析为 ::1，导致 dev 只绑 IPv6 回环、IPv4 访问被拒。
  // 显式绑 127.0.0.1，保证 http://localhost:4321 与 http://127.0.0.1:4321 都能打开。
  server: { host: '127.0.0.1' },
  markdown: {
    shikiConfig: { theme: 'github-light' },
  },
});