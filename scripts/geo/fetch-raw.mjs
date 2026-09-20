// fetch-raw.mjs —— 下载疆域地图的原始地理数据到 raw/（评估与重建用）。
// raw/ 已 gitignore：原始数据可随时由此脚本重新下载，不进版本库。
//
// 数据来源与许可：
//   - 中国省级边界（DataV）：公开接口，仅作合成底料
//   - OpenHistoricalMap（西汉 2692874 / 大明 2936889 / 大清 2889977）：CC0
//   - Natural Earth 50m（world-atlas 包内 asia 提取）：public domain
//
// 用法：node scripts/geo/fetch-raw.mjs   （幂等，已存在则跳过；--force 强制重下）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import osmtogeojson from 'osmtogeojson';

const here = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(here, 'raw');
fs.mkdirSync(RAW, { recursive: true });

// 注意：必须用 OHM 自己的 Overpass 实例；overpass-api.de 是 OpenStreetMap 的，
// 关系 ID 在两个数据库里完全不同，拿回来的是错误数据。
const OVERPASS_MIRRORS = [
  'https://ohm.kumi.systems/api/interpreter',
  'https://overpass.ohm.link/api/interpreter',
  'https://overpass.openhistoricalmap.uk/api/interpreter',
];

const FILES = [
  {
    name: 'asia-50m.json',
    desc: 'Natural Earth 50m 亚洲国家（world-atlas countries-50m 提取）',
    // 从 world-atlas 包提取，无需网络——由 prepare 提示
    fromWorldAtlas: true,
  },
  {
    name: 'china-provinces.json',
    desc: 'DataV 中国省级边界',
    url: 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json',
  },
  {
    name: 'ohm-xihan-107bc-75bc.geojson',
    desc: 'OHM 西汉（-107~-75）',
    ohm: 2692874,
  },
  {
    name: 'ohm-daming-1430-1617.geojson',
    desc: 'OHM 大明（1430–1617）',
    ohm: 2936889,
  },
  {
    name: 'ohm-daqing.geojson',
    desc: 'OHM 大清（1755–1842）',
    ohm: 2889977,
  },
];

const force = process.argv.includes('--force');

async function download(url, timeoutMs = 300000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'history-line-geo-build' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

async function fetchOhm(relId, name) {
  const q = `[out:json];relation(${relId});(._;>;);out geom;`;
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const mirror = OVERPASS_MIRRORS[attempt % OVERPASS_MIRRORS.length];
    try {
      const body = await download(`${mirror}?data=${encodeURIComponent(q)}`);
      const json = JSON.parse(body); // 非 JSON（HTML 错误页）会抛出并重试
      if (!json.elements?.length) throw new Error('响应无 elements');
      return json;
    } catch (e) {
      lastErr = e;
      console.log(`  第 ${attempt} 次失败（${mirror}）：${e.message}，换镜像重试…`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw new Error(`${name} 下载失败：${lastErr.message}`);
}

for (const f of FILES) {
  const dest = path.join(RAW, f.name);
  if (!force && fs.existsSync(dest)) {
    console.log(`已有 ${f.name} 跳过`);
    continue;
  }
  console.log(`获取 ${f.name} …（${f.desc}）`);
  let body;
  if (f.fromWorldAtlas) {
    // world-atlas 是 TopoJSON，需要转 GeoJSON；直接给出转换说明，转换单独处理
    console.log('  该文件来自 node_modules/world-atlas（countries-50m.json），由 build.mjs 内嵌转换，无需下载。');
    continue;
  }
  if (f.ohm) {
    const json = await fetchOhm(f.ohm, f.name);
    body = JSON.stringify(json);
  } else {
    body = await download(f.url);
    JSON.parse(body); // 校验是合法 JSON
  }
  fs.writeFileSync(dest, body);
  console.log(`  已保存 ${(fs.statSync(dest).size / 1024).toFixed(0)}KB`);
}

console.log('\n原始数据就绪：', RAW);
