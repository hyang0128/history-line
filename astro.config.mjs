// @ts-check
import { defineConfig } from 'astro/config';

// site / base 在 A4 部署任务包中按 GitHub Pages 仓库名调整。
export default defineConfig({
  site: 'https://example.github.io',
  base: '/',
  output: 'static',
  trailingSlash: 'ignore',
  markdown: {
    shikiConfig: { theme: 'github-light' },
  },
});
