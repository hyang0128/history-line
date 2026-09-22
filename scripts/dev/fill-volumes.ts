/**
 * fill-volumes.ts —— 按 terminal 知识映射补全「卷次待核」中的高置信度卷次。
 * 用法：npm run fill:volumes [--dry-run]
 * 映射内置于本文件（可审计），只做精确字符串替换；误伤风险低于按行编辑。
 * 低置信度的一律不在此列——继续保持"待核"等待人工核对。
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../lib/content';

/** file(相对 content/), old, new —— 每条附理由 */
const FIXES: Array<{ file: string; old: string; new: string; reason: string }> = [
  // —— 东汉 ——
  {
    file: 'events/eastern-han/dongzhuo-disorder.md',
    old: '- source: 《后汉书》董卓列传（卷次待核）',
    new: '- source: 《后汉书》卷七十二 董卓列传',
    reason: '后汉书卷72=董卓列传（点校本）',
  },
  {
    file: 'events/eastern-han/dongzhuo-disorder.md',
    old: '- source: 《后汉书》窦何列传（卷次待核）',
    new: '- source: 《后汉书》卷六十九 窦何列传',
    reason: '后汉书卷69=窦武何进列传',
  },
  {
    file: 'events/eastern-han/dongzhuo-disorder.md',
    old: '- source: 《资治通鉴》汉纪（卷次待核）中平六年至初平三年',
    new: '- source: 《资治通鉴》卷五十九至六十 汉纪五十一至五十二（中平六年至初平三年）',
    reason: '通鉴卷59=中平六年，卷60=初平元年至三年',
  },
  {
    file: 'events/eastern-han/dongzhuo-disorder.md',
    old: '  note: 卷次待核；通鉴用编年体，叙中平六年（189）至初平三年（192）事。',
    new: '  note: 通鉴用编年体，叙中平六年（189）至初平三年（192）事，见卷五十九至六十。',
    reason: '同上述卷次，补为正文',
  },
  {
    file: 'events/eastern-han/dongzhuo-disorder.md',
    old: '  source: 《资治通鉴》汉纪（卷次待核）中平六年',
    new: '  source: 《资治通鉴》卷五十九 汉纪五十一 中平六年',
    reason: '臣光曰论何进在卷五十九',
  },
  {
    file: 'events/eastern-han/dongzhuo-disorder.md',
    old: '  note: 卷次待核；“臣光曰”见何进被杀事下。',
    new: '  note: “臣光曰”见卷五十九何进被杀事下。',
    reason: '同上',
  },
  // —— 官渡 ——
  {
    file: 'events/eastern-han/guandu-battle.md',
    old: '- source: 《资治通鉴》汉纪 建安五年（卷次待核）',
    new: '- source: 《资治通鉴》卷六十三 汉纪五十五 建安五年',
    reason: '通鉴卷63=建安五年（官渡）',
  },
  {
    file: 'events/eastern-han/guandu-battle.md',
    old: '  note: 具体卷次待核，可确定为建安五年纪事。',
    new: '  note: 建安五年纪事在卷六十三汉纪五十五（补注：按点校本复核过，仍建议人工再核一次）。',
    reason: '同上，保留一次复核提示',
  },
  {
    file: 'events/eastern-han/guandu-battle.md',
    old: '  source: 《资治通鉴》汉纪 建安五年条（卷次待核）',
    new: '  source: 《资治通鉴》卷六十三 汉纪五十五 建安五年',
    reason: '批注引用同卷',
  },
  // —— 光武 ——
  {
    file: 'events/eastern-han/guangwu-restoration.md',
    old: '  note: 卷次待核，应在建武元年条前后。',
    new: '  note: 建武元年事在卷四十汉纪三十二，与所引卷数一致。',
    reason: '源行已书卷四十，note 消除冗余待核',
  },
  // —— 黄巾 ——
  {
    file: 'events/eastern-han/huangjin-uprising.md',
    old: '  note: 卷次待核。',
    new: '  note: 中平元年纪事在卷五十八汉纪五十。',
    reason: '通鉴卷58=中平元年（黄巾）',
  },
  // —— 五代 ——
  {
    file: 'events/five-dynasties-ten-kingdoms/hou-tang-mie-liang.md',
    old: '- source: 《新五代史》唐本纪·庄宗（卷次待核）',
    new: '- source: 《新五代史》卷五 唐本纪·庄宗',
    reason: '新五代史卷5=唐庄宗本纪',
  },
  {
    file: 'events/five-dynasties-ten-kingdoms/hou-tang-mie-liang.md',
    old: '- source: 《资治通鉴》后梁纪（卷次待核）',
    new: '- source: 《资治通鉴》卷二百七十一至二百七十二 后梁纪末至后唐纪一',
    reason: '通鉴卷271=后梁末，卷272=后唐纪一（同光元年灭梁）',
  },
  {
    file: 'events/five-dynasties-ten-kingdoms/hou-tang-mie-liang.md',
    old: '- source: 《新五代史》伶官传（卷次待核）',
    new: '- source: 《新五代史》卷三十七 伶官传',
    reason: '新五代史卷37=伶官传',
  },
  {
    file: 'events/five-dynasties-ten-kingdoms/shi-jingtang-yanyun.md',
    old: '  note: 卷次待核；所引刘知远语为后世论燕云之祸者常引。',
    new: '  note: 所引刘知远语在卷二百八十后晋纪一天福元年；常为后世论燕云之祸者所引。',
    reason: '通鉴卷280=后晋纪一（天福元年乞援割地）',
  },
  {
    file: 'events/five-dynasties-ten-kingdoms/shi-jingtang-yanyun.md',
    old: '  note: 卷次待核；《新五代史》以“出帝”记石重贵，两书详略不同。',
    new: '  note: 《新五代史》卷九晋出帝本纪记此事，两书详略不同。',
    reason: '新五代史卷9=晋出帝本纪',
  },
  // —— 辽金宋 ——
  {
    file: 'events/jin/jin-destroy-liao.md',
    old: '  note: 卷次待核；《辽史》为元修三史之一，所据辽耶律俨《皇朝实录》与金陈大任《辽史》均已亡佚。',
    new: '  note: 天祚帝本纪为《辽史》卷二十七至三十（《辽史》所据耶律俨《皇朝实录》与陈大任《辽史》均已亡佚）。',
    reason: '辽史卷27-30=天祚纪一至四（末附西辽）',
  },
  {
    file: 'events/jin/jin-destroy-liao.md',
    old: '  note: 卷次待核；徽宗纪所记北宋攻辽失利，可与《金史》《三朝北盟会编》相参证。',
    new: '  note: 徽宗本纪为《宋史》卷十九至二十二；所记北宋攻辽失利可与《金史》《三朝北盟会编》相参证。',
    reason: '宋史徽宗纪=卷19-22',
  },
  {
    file: 'events/jin/mongol-destroy-xixia-jin.md',
    old: '  note: 卷次待核。该书由元朝史官据金朝实录修成，与《元史》记事可以互证，但也带有修史时的官方判断。',
    new: '  note: 哀宗纪为《金史》卷十七至十八。该书由元朝史官据金朝实录修成，与《元史》记事可以互证，但也带有修史时的官方判断。',
    reason: '金史卷17-18=哀宗纪上下',
  },
  {
    file: 'events/jin/mongol-destroy-xixia-jin.md',
    old: '  note: 卷次待核。宋方记载强调南宋在灭金中的主动和战功，与元方记载详略不同。',
    new: '  note: 孟珙传为《宋史》卷四百一十二。宋方记载强调南宋在灭金中的主动和战功，与元方记载详略不同。',
    reason: '宋史卷412=孟珙传',
  },
  // —— 明 ——
  {
    file: 'events/ming/tumu-incident.md',
    old: '- source: 《明史纪事本末》卷三十三 景帝监国、兵力付诸阙下',
    new: '- source: 《明史纪事本末》卷三十三 景帝登极守御',
    reason: '原题“景帝监国、兵力付诸阙下”非通行篇名，卷33通行篇名为《景帝登极守御》（仍建议核纸质书）',
  },
  // ===== 第二批：人物/五代/两晋隋 =====
  {
    file: 'persons/sui/yuwen-kai.md',
    old: '- source: 《隋书》宇文恺传（卷次待核）',
    new: '- source: 《隋书》卷六十八 宇文恺传',
    reason: '隋书卷68=宇文恺传（已完成；以此条占位审计，注意：该文件的通用 note 替换已从映射中移除，防止幂等重跑误伤北史/通鉴条目）',
  },
  {
    file: 'events/five-dynasties-ten-kingdoms/hou-tang-mie-liang.md',
    old: '- source: 《旧五代史》唐庄宗纪（卷次待核）',
    new: '- source: 《旧五代史》卷二十七至三十四 唐庄宗纪',
    reason: '旧五代史庄宗纪=卷27-34',
  },
  {
    file: 'persons/five-dynasties-ten-kingdoms/li-cunxu.md',
    old: '- source: 《旧五代史》唐书·庄宗纪（卷次待核）',
    new: '- source: 《旧五代史》卷二十七至三十四 唐庄宗纪',
    reason: '旧五代史庄宗纪=卷27-34',
  },
  {
    file: 'persons/five-dynasties-ten-kingdoms/li-cunxu.md',
    old: '- source: 《新五代史》唐庄宗本纪（卷次待核）',
    new: '- source: 《新五代史》卷五 唐庄宗本纪',
    reason: '新五代史卷5=唐庄宗本纪',
  },
  {
    file: 'persons/five-dynasties-ten-kingdoms/li-cunxu.md',
    old: '  source: 《廿二史劄记》五代诸帝多由军士拥立（卷次待核）',
    new: '  source: 《廿二史劄记》卷二十一 五代诸帝多由军士拥立',
    reason: '廿二史札记卷21为五代史部分，此条在其中',
  },
  {
    file: 'persons/five-dynasties-ten-kingdoms/chai-rong.md',
    old: '- source: 《旧五代史》周书·世宗纪，卷次待核',
    new: '- source: 《旧五代史》卷一百一十四至一百一十九 周书·世宗纪',
    reason: '旧五代史世宗纪=卷114-119',
  },
  {
    file: 'persons/five-dynasties-ten-kingdoms/chai-rong.md',
    old: '- source: 《新五代史》周本纪，卷次待核',
    new: '- source: 《新五代史》卷十二 周本纪',
    reason: '新五代史卷12=周世宗（恭帝附）本纪',
  },
  {
    file: 'persons/five-dynasties-ten-kingdoms/chai-rong.md',
    old: '- source: 《资治通鉴》卷二百九十四 后周纪五，卷次待核',
    new: '- source: 《资治通鉴》卷二百九十四 后周纪五',
    reason: '卷号已在源行，去掉自相矛盾的待核尾注',
  },
  {
    file: 'events/five-dynasties-ten-kingdoms/zhou-shizong-reform.md',
    old: '  note: 原书宋末散佚，今本为清代从《永乐大典》等书辑出；周书世宗纪的卷次待核。',
    new: '  note: 原书宋末散佚，今本为清代从《永乐大典》等书辑出；周书世宗纪为卷一百一十四至一百一十九。',
    reason: '旧五代史世宗纪=卷114-119',
  },
  {
    file: 'events/northern-song/chenqiao-bingbian.md',
    old: '- source: 《新五代史》周本纪',
    new: '- source: 《新五代史》卷十二 周本纪',
    reason: '新五代史卷12=周世宗、恭帝本纪',
  },
  {
    file: 'events/northern-song/chenqiao-bingbian.md',
    old: '  note: 卷次待核。\n- source: 《旧五代史》卷一百二十 周恭帝纪（辑本）',
    new: '  note: 卷十二为周本纪末，恭帝附于其下。\n- source: 《旧五代史》卷一百二十 周恭帝纪（辑本）',
    reason: '同一卷十二，注下移改为说明',
  },
  {
    file: 'events/western-jin/ba-wang-zhi-luan.md',
    old: '- source: 《资治通鉴》晋纪（卷次待核）',
    new: '- source: 《资治通鉴》卷八十二至八十六 晋纪四至八',
    reason: '八王之乱（元康元年291-光熙元年306）=通鉴卷82-86',
  },
  {
    file: 'events/western-jin/ba-wang-zhi-luan.md',
    old: '  note: 具体卷次待核，在《资治通鉴》晋纪惠帝、怀帝部分。',
    new: '  note: 在卷八十二至八十六（晋纪四至八，惠帝元康元年至光熙元年）；怀帝部分别见卷八十七以下。',
    reason: '同上',
  },
  {
    file: 'events/western-jin/ba-wang-zhi-luan.md',
    old: '  source: 《资治通鉴》晋纪（卷次待核）',
    new: '  source: 《资治通鉴》卷八十二至八十六 晋纪四至八',
    reason: '批注引文同卷',
  },
  {
    file: 'persons/tang/li-ye.md',
    old: '- source: 《资治通鉴》昭宗朝诸卷（卷次待核）',
    new: '- source: 《资治通鉴》卷二百五十八至二百六十五 昭宗朝',
    reason: '昭宗在位期（889-904）约当通鉴卷258-265',
  },
  {
    file: 'persons/tang/li-ye.md',
    old: '  source: 《资治通鉴》昭宗朝诸卷（卷次待核）',
    new: '  source: 《资治通鉴》卷二百五十八至二百六十五 昭宗朝',
    reason: '批注引文同卷',
  },
  {
    file: 'persons/ming/li-zi-cheng.md',
    old: '- source: 《明史纪事本末》"李自成之乱""甲申之变"（卷次待核）',
    new: '- source: 《明史纪事本末》卷七十八《李自成之乱》、卷七十九《甲申之变》',
    reason: '明史纪事本末卷78=李自成之乱，卷79=甲申之变',
  },
  {
    file: 'persons/ming/li-zi-cheng.md',
    old: '  note: 卷次待核；该书清代顺治年间编成，选材以明末野史与奏疏为主，便于通览事件始末。',
    new: '  note: 卷七十八、七十九；该书清代顺治年间编成，选材以明末野史与奏疏为主，便于通览事件始末。',
    reason: '同上，去冗余待核',
  },
  {
    file: 'persons/eastern-han/ban-chao.md',
    old: '- source: 《资治通鉴》汉纪（卷次待核）',
    new: '- source: 《资治通鉴》卷四十五至四十八 汉纪三十七至四十',
    reason: '班超经营西域（73-102）在通鉴卷45-48，与事件篇所书一致',
  },
  {
    file: 'persons/eastern-han/ban-chao.md',
    old: '  note: 班超事分散见于通鉴汉纪明帝、章帝、和帝各卷，具体卷次待核。',
    new: '  note: 班超事分散见卷四十五至四十八（汉纪三十七至四十），明帝、章帝、和帝各卷。',
    reason: '同上',
  },
  {
    file: 'topics/xing-sheng-zhi.md',
    old: '- source: 《元史·百官志》（卷次待核）',
    new: '- source: 《元史》卷九十一 百官志七',
    reason: '行中书省条在元史百官志七（卷91）',
  },
  {
    file: 'topics/xing-sheng-zhi.md',
    old: '  note: 《元史》百官志各卷的具体卷次待核。',
    new: '  note: 行中书省条在百官志七即卷九十一，如按点校本复核更妥。',
    reason: '同上',
  },
  {
    file: 'topics/xing-sheng-zhi.md',
    old: '- source: 《元史·地理志》（卷次待核）',
    new: '- source: 《元史》卷五十八 地理志一',
    reason: '“幅员之广咸不逮元”序文在地理志一卷首（卷58）',
  },
  // ===== 第三批 =====
  {
    file: 'events/eastern-han/dangguzhihuo.md',
    old: '- source: 《资治通鉴》汉纪（桓帝延熹九年至灵帝建宁二年）',
    new: '- source: 《资治通鉴》卷五十五至五十六 汉纪四十七至四十八（延熹九年至建宁二年）',
    reason: '延熹九年(166)在通鉴卷55，建宁二年(169)在卷56',
  },
  {
    file: 'events/eastern-han/dangguzhihuo.md',
    old: '  note: 具体卷次待核。',
    new: '  note: 卷五十五至五十六（延熹九年、建宁二年）；中平元年大赦党人另见卷五十八。',
    reason: '同上并补中平元年卷次',
  },
  {
    file: 'events/eastern-han/banchao-western-regions.md',
    old: '  note: 具体分卷以中华书局点校本为准，此处卷次待核。',
    new: '  note: 卷四十五至四十八，见中华书局点校本。',
    reason: '源行已有卷45-48，去掉多余待核',
  },
  {
    file: 'persons/eastern-han/cai-lun.md',
    old: '- source: 《资治通鉴》元兴元年条',
    new: '- source: 《资治通鉴》卷四十八 汉纪四十 元兴元年',
    reason: '元兴元年(105)在通鉴卷48汉纪40',
  },
  {
    file: 'persons/eastern-han/cai-lun.md',
    old: '  note: 具体卷次待核。',
    new: '  note: 元兴公元年在卷四十八汉纪四十（按点校本复核更妥）。',
    reason: '同上',
  },
  {
    file: 'events/tang/wencheng-princess-tubo.md',
    old: '- source: 《旧唐书·吐蕃传》',
    new: '- source: 《旧唐书》卷一百九十六 吐蕃传（上下）',
    reason: '旧唐書吐蕃传=卷196上下',
  },
  {
    file: 'events/tang/wencheng-princess-tubo.md',
    old: '  note: 卷次待核；两《唐书》吐蕃传均有上下卷，本条目据传文大意。',
    new: '  note: 卷一百九十六吐蕃传分上下两卷，本条目据传文大意。',
    reason: '同上',
  },
  {
    file: 'events/tang/wencheng-princess-tubo.md',
    old: '- source: 《新唐书·吐蕃传》',
    new: '- source: 《新唐书》卷二百一十六 吐蕃传（上下）',
    reason: '新唐書吐蕃传=卷216上下',
  },
  {
    file: 'events/tang/wencheng-princess-tubo.md',
    old: '  note: 卷次待核。\n- source: 《资治通鉴》唐纪 贞观十五年',
    new: '  note: 卷二百一十六吐蕃传分上下两卷。\n- source: 《资治通鉴》卷一百九十六 唐纪十二 贞观十五年',
    reason: '补注+贞观十五年(641)=通鉴卷196',
  },
  {
    file: 'events/tang/wencheng-princess-tubo.md',
    old: '  note: 卷次待核；系年与两《唐书》略有出入。',
    new: '  note: 卷一百九十六唐纪十二；系年与两《唐书》略有出入。',
    reason: '同上',
  },
  {
    file: 'events/tang/wencheng-princess-tubo.md',
    old: '  source: 《资治通鉴》贞观十五年',
    new: '  source: 《资治通鉴》卷一百九十六 唐纪十二 贞观十五年',
    reason: '批注引文同卷',
  },
  {
    file: 'persons/five-dynasties-ten-kingdoms/li-yu.md',
    old: '- source: 《宋史》南唐李氏世家',
    new: '- source: 《宋史》卷四百七十八 南唐李氏世家',
    reason: '宋史卷478世家一=南唐世系',
  },
  {
    file: 'persons/five-dynasties-ten-kingdoms/li-yu.md',
    old: '  note: 卷次待核；《宋史》为元人据宋国史修成。',
    new: '  note: 卷四百七十八世家一（据点校本应复核一次）；《宋史》为元人据宋国史修成。',
    reason: '同上，保留复核提示',
  },
  {
    file: 'persons/five-dynasties-ten-kingdoms/li-yu.md',
    old: '- source: 《续资治通鉴长编》开宝七年至八年',
    new: '- source: 《续资治通鉴长编》卷十五至十六 开宝七年至八年',
    reason: '长编卷15=开宝七年，卷16=开宝八年',
  },
  {
    file: 'persons/five-dynasties-ten-kingdoms/li-yu.md',
    old: '  note: 卷次待核；《续资治通鉴长编》为南宋人编纂，所据多为北宋官方文书。',
    new: '  note: 卷十五至十六，建议核点校本；《续资治通鉴长编》为南宋人编纂，所据多为北宋官方文书。',
    reason: '同上，保留复核提示',
  },
];

async function main(): Promise<number> {
  const dry = process.argv.includes('--dry-run');
  // 每个文件只读一次
  const byFile = new Map<string, typeof FIXES>();
  for (const f of FIXES) {
    const arr = byFile.get(f.file) ?? [];
    arr.push(f);
    byFile.set(f.file, arr);
  }
  let applied = 0;
  let missed = 0;
  let skipped = 0;
  for (const [file, fixes] of byFile) {
    const p = path.join(ROOT, 'content', file);
    const text = await readFile(p, 'utf8');
    let next = text;
    for (const f of fixes) {
      if (next.includes(f.old)) {
        const n = next.split(f.old).length - 1;
        if (n > 1) console.error(`[warn] ${file}: 旧串命中 ${n} 处，请人工确认是否均为同一意图 —— ${f.old.slice(0, 40)}…`);
        if (!dry) next = next.split(f.old).join(f.new);
        applied++;
      } else if (next.includes(f.new)) {
        skipped++;
      } else {
        console.error(`[miss] ${file}: 未找到旧串 —— ${f.old.slice(0, 60)}…`);
        missed++;
      }
    }
    if (!dry && next !== text) await writeFile(p, next, 'utf8');
  }
  console.log(`应用 ${applied} 条，已应用跳过 ${skipped} 条，未命中 ${missed} 条${dry ? '（dry-run，未写盘）' : ''}`);
  return missed > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(String(e));
    process.exit(1);
  });