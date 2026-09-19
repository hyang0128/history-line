/** 极简分级日志（无依赖） */
let quiet = false;

export function setQuiet(v: boolean) { quiet = v; }

export function info(msg: string) { if (!quiet) console.log(msg); }

export function warn(msg: string) { console.warn(`[warn] ${msg}`); }

export function error(msg: string) { console.error(`[error] ${msg}`); }

export function section(title: string) { info(`\n== ${title} ==`); }