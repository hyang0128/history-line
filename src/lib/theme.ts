/**
 * 深浅色主题客户端工具（A3）：显式三态 亮/暗/跟随系统。
 *
 * 约定：
 *  - <html data-theme="light|dark"> 为显式指定；无该属性时由 `prefers-color-scheme` 决定。
 *  - 显式选择存 localStorage（key `hl-theme`），跟随系统时删除。
 *  - 任何主题变化都派发 `hl-themechange` 事件，供时间轴等其他岛组件重绘。
 * 这是浏览器端模块，勿在服务端（islands 之外的构建阶段）导入。
 */

export type ThemeChoice = 'light' | 'dark' | 'auto';
export const THEME_EVENT = 'hl-themechange';
const KEY = 'hl-theme';

/** 当前生效的主题（考虑显式选择与系统偏好）。 */
export function readTheme(): 'light' | 'dark' {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 读取用户显式选择；没有显式选择时返回 'auto'。 */
export function readChoice(): ThemeChoice {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* localStorage 不可用时忽略 */
  }
  return 'auto';
}

/** 应用选择并通知监听者。 */
export function applyTheme(choice: ThemeChoice): void {
  const el = document.documentElement;
  if (choice === 'auto') {
    delete el.dataset.theme;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* 忽略 */
    }
  } else {
    el.dataset.theme = choice;
    try {
      localStorage.setItem(KEY, choice);
    } catch {
      /* 忽略 */
    }
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** 循环下一个档位：跟随系统 → 亮 → 暗 → 跟随系统。 */
export function cycleTheme(current: ThemeChoice): ThemeChoice {
  if (current === 'auto') return 'light';
  if (current === 'light') return 'dark';
  return 'auto';
}