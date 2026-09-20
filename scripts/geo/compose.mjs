// compose.mjs —— 用真实地理数据烘焙 6 朝疆域与亚洲底图（B2）。
// 输入：raw/（由 fetch-raw.mjs 下载；asia-50m.json 若缺失则从 node_modules/world-atlas 生成）
// 输出：../../public/geo/{dynasties.json, base.json}
//
// 数据来源与许可：
//   西汉 / 大明 / 大清：OpenHistoricalMap 关系 2692874 / 2936889 / 2889977（CC0）
//   秦 / 唐 / 元：DataV 省级边界并集 + Natural Earth 国家多边形按史载界线裁切合成（示意，
//     但海岸线与省界均为真实测绘数据，非手绘）
//   底图：Natural Earth 50m（public domain）
//
// 用法：node scripts/geo/compose.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'polygon-clipping';

const here = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(here, 'raw');
const OUT = path.join(here, '..', '..', 'public', 'geo');
fs.mkdirSync(OUT, { recursive: true });

// ---------- 简化与几何工具 ----------
function segDist2(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1]; return x * x + y * y;
}
function rdp(pts, eps2) {
  const n = pts.length; if (n < 3) return pts;
  const keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
  const st = [[0, n - 1]];
  while (st.length) {
    const [s, e] = st.pop(); if (e - s < 2) continue;
    let md = 0, mi = -1;
    for (let i = s + 1; i < e; i++) { const d = segDist2(pts[i], pts[s], pts[e]); if (d > md) { md = d; mi = i; } }
    if (md > eps2) { keep[mi] = 1; st.push([s, mi], [mi, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function simpRing(r, eps) {
  if (r.length < 4) return null;
  const closed = r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
  const pts = closed ? r.slice(0, -1) : r.slice();
  if (pts.length < 3) return null;
  let far = 1, fd = 0;
  for (let i = 1; i < pts.length; i++) { const dx = pts[i][0] - pts[0][0], dy = pts[i][1] - pts[0][1]; const d = dx * dx + dy * dy; if (d > fd) { fd = d; far = i; } }
  const a = rdp(pts.slice(0, far + 1), eps * eps), b = rdp(pts.slice(far).concat([pts[0]]), eps * eps);
  const out = a.concat(b.slice(1, -1)); out.push(out[0]);
  return out.length >= 4 ? out : null;
}
function simpMP(mp, eps) {
  return mp.map((poly) => poly.map((r) => simpRing(r, eps)).filter(Boolean)).filter((p) => p.length);
}
function ringArea(r) { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; }
function mpArea(mp) { return mp.reduce((s, poly) => s + Math.abs(ringArea(poly[0])), 0); }
function mpPts(mp) { return mp.reduce((s, poly) => s + poly.reduce((t, r) => t + r.length, 0), 0); }
/** d3-geo 球面渲染要求外环顺时针（负面积）内环逆时针——统一按此输出（实测验证） */
function orientForD3(mp) {
  return mp.map((poly) => poly.map((r, i) => {
    const a = ringArea(r);
    const wantNeg = i === 0;
    const isNeg = a < 0;
    return wantNeg === isNeg ? r : [...r].reverse();
  }));
}
function geomOf(f) { return f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates; }
/** 用折线裁切：保留折线指定一侧。side: 'south'|'north' */
function cutByLine(mp, line, side) {
  const s = line[0], e = line[line.length - 1];
  const y = side === 'south' ? -90 : 90;
  const cut = [[...line, [180, e[1]], [180, y], [-180, y], [-180, s[1]], line[0]]];
  try { return pc.intersection(mp, [cut]); } catch (err) { console.log('cut 失败', err.message); return mp; }
}

// ---------- 输入 ----------
// asia-50m.json：Natural Earth 50m 亚洲国家。缺失时从 node_modules/world-atlas 生成。
const asiaPath = path.join(RAW, 'asia-50m.json');
if (!fs.existsSync(asiaPath)) {
  const topo = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'node_modules', 'world-atlas', 'countries-50m.json'), 'utf8'));
  // world-atlas 是 TopoJSON；Asia 部分按 bbox 粗筛（60–160E, 0–60N 覆盖相关国家）
  const { feature } = await import('topojson-client');
  const all = feature(topo, topo.objects.countries);
  const asia = {
    type: 'FeatureCollection',
    features: all.features.filter((f) => {
      let ok = false;
      const walk = (g) => (Array.isArray(g[0]) ? g.forEach(walk) : (ok ||= g[0] > 55 && g[0] < 165 && g[1] > -12 && g[1] < 62));
      walk(f.geometry.coordinates);
      return ok;
    }),
  };
  fs.writeFileSync(asiaPath, JSON.stringify(asia));
  console.log('已从 world-atlas 生成 asia-50m.json');
}
const asia = JSON.parse(fs.readFileSync(asiaPath, 'utf8'));
const provs = JSON.parse(fs.readFileSync(path.join(RAW, 'china-provinces.json'), 'utf8'));
const country = {};
for (const f of asia.features) country[f.properties.name] = geomOf(f);
const prov = {};
for (const f of provs.features) prov[f.properties.name] = geomOf(f);

const PRE = 0.006; // 预简化（度），保细节提速度
function u(names) {
  const parts = names.map((n) => {
    const g = prov[n]; if (!g) throw new Error('缺省: ' + n);
    return simpMP(g, PRE);
  });
  return pc.union(...parts);
}

// ---------- OHM 三朝 ----------
function ohmDyn(file, id, title, when, range, note, source) {
  const gj = JSON.parse(fs.readFileSync(path.join(RAW, file), 'utf8'));
  let mp = [];
  for (const f of gj.features) mp = mp.concat(geomOf(f));
  mp = simpMP(orientForD3(mp), 0.06);
  return { type: 'Feature', properties: { id, title, when, range, note, source }, geometry: { type: 'MultiPolygon', coordinates: mp } };
}

// ---------- 合成三朝 ----------
// 秦：现代省并集（秦郡县范围）+ 越北（象郡示意，裁 19.5°N 以北）
function makeQin() {
  const names = ['北京市','天津市','河北省','山西省','内蒙古自治区','辽宁省','上海市','江苏省','浙江省','安徽省','福建省','江西省','山东省','河南省','湖北省','湖南省','广东省','广西壮族自治区','香港特别行政区','澳门特别行政区','重庆市','四川省','贵州省','陕西省','甘肃省','宁夏回族自治区'];
  let mp = u(names);
  const vn = cutByLine(simpMP(country['Vietnam'], PRE), [[102, 19.5], [108.5, 19.5]], 'north');
  mp = pc.union(mp, vn);
  return mp;
}
// 唐（750）：本土（除吐蕃/南诏/渤海/台湾）+ 新疆 + 蒙古 + 吉/塔 + 哈南（碎叶）+ 越北（安南，裁 18°N 以北）
function makeTang() {
  const names = ['北京市','天津市','河北省','山西省','内蒙古自治区','辽宁省','上海市','江苏省','浙江省','安徽省','福建省','江西省','山东省','河南省','湖北省','湖南省','广东省','广西壮族自治区','海南省','香港特别行政区','澳门特别行政区','重庆市','四川省','贵州省','陕西省','甘肃省','宁夏回族自治区','新疆维吾尔自治区'];
  let mp = u(names);
  const parts = [simpMP(country['Mongolia'], PRE), simpMP(country['Kyrgyzstan'], PRE), simpMP(country['Tajikistan'], PRE)];
  const kz = cutByLine(simpMP(country['Kazakhstan'], PRE), [[72, 42.5], [75, 44], [78, 44.5], [81, 44.3], [84, 43], [87, 42]], 'south');
  const vn = cutByLine(simpMP(country['Vietnam'], PRE), [[102, 18], [108.5, 18]], 'north');
  for (const p of [kz, vn, ...parts]) mp = pc.union(mp, p);
  return mp;
}
// 元（1290）：本土（除台湾）+ 蒙古 + 俄南（萨彦岭—外兴安岭以南）+ 缅北（裁 23.5°N 以北）
function makeYuan() {
  const names = ['北京市','天津市','河北省','山西省','内蒙古自治区','辽宁省','吉林省','黑龙江省','上海市','江苏省','浙江省','安徽省','福建省','江西省','山东省','河南省','湖北省','湖南省','广东省','广西壮族自治区','海南省','香港特别行政区','澳门特别行政区','重庆市','四川省','贵州省','云南省','西藏自治区','陕西省','甘肃省','青海省','宁夏回族自治区','新疆维吾尔自治区'];
  let mp = u(names);
  const ru = cutByLine(simpMP(country['Russia'], PRE), [[70, 50], [76, 52], [83, 53.5], [90, 54.5], [97, 52.8], [104, 55], [111, 56], [118, 56.5], [125, 56], [132, 55.5], [138, 55.5], [142, 52.5], [144, 49.5], [147, 45]], 'south');
  const mm = cutByLine(simpMP(country['Myanmar'], PRE), [[93.5, 23.5], [98.5, 23.5]], 'north');
  mp = pc.union(mp, simpMP(country['Mongolia'], PRE), ru, mm);
  return mp;
}

const META = {
  qin: { id: 'qin', title: '秦', when: '秦始皇二十六年统一后（约前 210）', range: [-221, -207], source: '合成：DataV 省级边界并集 + Natural Earth（越北裁切），示意' },
  'western-han': { id: 'western-han', title: '汉（西汉）', when: '汉武帝元封年间（约前 100）', range: [-202, 8], source: 'OpenHistoricalMap 关系 2692874（CC0）' },
  tang: { id: 'tang', title: '唐', when: '开元年间极盛（约 750）', range: [618, 907], source: '合成：DataV 省级边界并集 + Natural Earth（蒙古/中亚/越北裁切），示意' },
  yuan: { id: 'yuan', title: '元', when: '至元后期（约 1290）', range: [1271, 1368], source: '合成：DataV 省级边界并集 + Natural Earth（俄南/缅北裁切），示意' },
  ming: { id: 'ming', title: '明', when: '明中后期（约 1500）', range: [1368, 1644], source: 'OpenHistoricalMap 关系 2936889（CC0）' },
  qing: { id: 'qing', title: '清', when: '乾隆朝（约 1760，平准噶尔后）', range: [1636, 1912], source: 'OpenHistoricalMap 关系 2889977（CC0）' },
};

const EPS_OUT = 0.055;
const out = { type: 'FeatureCollection', features: [] };

console.log('拼装秦…'); let m = makeQin();
out.features.push({ type: 'Feature', properties: { ...META.qin, note: '郡县制极盛：含闽中、黔中、岭南；西南不含滇，北界示意于阴山—长城一线；象郡裁于越北（示意）。' }, geometry: { type: 'MultiPolygon', coordinates: simpMP(orientForD3(m), EPS_OUT) } });
console.log('  pts', mpPts(out.features.at(-1).geometry.coordinates));

console.log('拼装汉…');
out.features.push(ohmDyn('ohm-xihan-107bc-75bc.geojson', 'western-han', '汉（西汉）', '汉武帝元封年间（约前 100）', [-202, 8], 'OHM 西汉边界（-107~-75）：不含西域都护（前 60 始置）；东至乐浪，南至日南。', META['western-han'].source));
console.log('  pts', mpPts(out.features.at(-1).geometry.coordinates));

console.log('拼装唐…'); m = makeTang();
out.features.push({ type: 'Feature', properties: { ...META.tang, note: '安西、北庭都护至碎叶—葱岭（含七河示意）；安北都护辖漠北；不含吐蕃、南诏、渤海国。' }, geometry: { type: 'MultiPolygon', coordinates: simpMP(orientForD3(m), EPS_OUT) } });
console.log('  pts', mpPts(out.features.at(-1).geometry.coordinates));

console.log('拼装元…'); m = makeYuan();
out.features.push({ type: 'Feature', properties: { ...META.yuan, note: '大汗直辖：岭北行省示意至萨彦岭—外兴安岭，含西藏、云南、缅北；高丽为安属不画入，察合台等汗国不画入。' }, geometry: { type: 'MultiPolygon', coordinates: simpMP(orientForD3(m), EPS_OUT) } });
console.log('  pts', mpPts(out.features.at(-1).geometry.coordinates));

console.log('拼装明…');
out.features.push(ohmDyn('ohm-daming-1430-1617.geojson', 'ming', '明', '明中后期（约 1500）', [1368, 1644], 'OHM 大明边界（1430–1617）：含乌斯藏、三宣六慰等羁縻；交趾已弃（1427）、奴儿干已罢，故不画入。', META.ming.source));
console.log('  pts', mpPts(out.features.at(-1).geometry.coordinates));

console.log('拼装清…');
out.features.push(ohmDyn('ohm-daqing.geojson', 'qing', '清', '乾隆朝（约 1760，平准噶尔后）', [1636, 1912], 'OHM 大清边界（1755–1842）：含新疆、蒙古、外兴安岭、西藏、台湾。', META.qing.source));
console.log('  pts', mpPts(out.features.at(-1).geometry.coordinates));

// 底图：亚洲国家轮廓（低细节）
const base = { type: 'FeatureCollection', features: asia.features.map((f) => ({ type: 'Feature', properties: { name: f.properties.name }, geometry: { type: 'MultiPolygon', coordinates: simpMP(geomOf(f), 0.09) } })).filter((f) => f.geometry.coordinates.length > 0) };

out.features = out.features.filter((f) => f.geometry.coordinates.length > 0);
fs.writeFileSync(path.join(OUT, 'dynasties.json'), JSON.stringify(out));
fs.writeFileSync(path.join(OUT, 'base.json'), JSON.stringify(base));
console.log('\ndynasties.json', (fs.statSync(path.join(OUT, 'dynasties.json')).size / 1024).toFixed(0) + 'KB',
  'base.json', (fs.statSync(path.join(OUT, 'base.json')).size / 1024).toFixed(0) + 'KB');
for (const f of out.features) {
  const mp = f.geometry.coordinates;
  console.log(' ', f.properties.id, '面积', mpArea(mp).toFixed(0), '顶点', mpPts(mp));
}
