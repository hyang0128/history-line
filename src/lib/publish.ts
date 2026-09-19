/**
 * 发布模式开关（A4，PLAN.md §6.1 / §10.3 A4）：
 * 线上构建只发布 reviewed / published；本地 dev / build:local 包含 draft 并带水印。
 *
 * 约定：
 *  - `npm run build`（生产，GitHub Actions 用）：不设置 PUBLISH_ONLY → 排除 draft。
 *  - `npm run dev` / `npm run build:local`：经 scripts/local-astro.mjs 设置
 *    PUBLISH_ONLY=false 启动 astro → 包含 draft，Base 布局显示预览横幅。
 *
 * 注意：此标记只在构建期（Node）读取；构建产物是静态页，不含运行时判断。
 */
export const INCLUDE_DRAFTS =
  process.env.PUBLISH_ONLY === 'false' || process.env.PUBLISH_ONLY === '0';

/** draft 是否被当前构建排除 */
export const EXCLUDE_DRAFTS = !INCLUDE_DRAFTS;