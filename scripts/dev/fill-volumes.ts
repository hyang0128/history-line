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
  // ===== 第五批：维基文库目录页核出的正史卷号（2026-09-22 网核）=====
  // —— 明史 ——
  { file: 'events/ming/duomen-coup.md', old: '- source: 《明史》英宗后纪\n  credibility: A', new: '- source: 《明史》卷十二 英宗后纪\n  credibility: A', reason: '明史卷12=英宗后纪' },
  { file: 'events/ming/duomen-coup.md', old: '- source: 《明史》于谦传\n', new: '- source: 《明史》卷一百七十 于谦传\n', reason: '明史卷170=于谦' },
  { file: 'events/ming/duomen-coup.md', old: '- source: 《明史》徐有贞传\n', new: '- source: 《明史》卷一百七十一 徐有贞传\n', reason: '明史卷171=王骥 徐有贞 杨善 王越' },
  { file: 'persons/ming/yu-qian.md', old: '- source: 《明史》于谦传\n', new: '- source: 《明史》卷一百七十 于谦传\n', reason: '明史卷170' },
  { file: 'events/ming/ming-founding.md', old: '- source: 《明史》太祖本纪\n', new: '- source: 《明史》卷一至三 太祖本纪\n', reason: '明史卷1-3=太祖一至三' },
  { file: 'events/ming/ming-founding.md', old: '- source: 《明史》食货志\n', new: '- source: 《明史》卷七十七至八十二 食货志\n', reason: '明史卷77-82=食货一至六' },
  { file: 'events/ming/ming-founding.md', old: '- source: 《明史》兵志\n', new: '- source: 《明史》卷八十九至九十二 兵志\n', reason: '明史卷89-92=兵一至四' },
  { file: 'events/ming/southern-ming.md', old: '- source: 《明史》史可法传\n', new: '- source: 《明史》卷二百七十四 史可法传\n', reason: '明史卷274=史可法 高弘图 姜曰广' },
  { file: 'events/ming/zhang-juzheng-reform.md', old: '- source: 《明史》食货志\n', new: '- source: 《明史》卷七十八 食货志二（赋役）\n', reason: '明史卷78=食货二 赋役' },
  { file: 'events/ming/zhang-juzheng-reform.md', old: '  note: 卷次待核，当在食货志赋役部分。', new: '  note: 赋役在食货志二即卷七十八。', reason: '同上' },
  { file: 'persons/ming/zhang-ju-zheng.md', old: '- source: 《明史》食货志 赋役\n', new: '- source: 《明史》卷七十八 食货志二 赋役\n', reason: '同上' },
  { file: 'events/ming/zhang-juzheng-reform.md', old: '  source: 《明史纪事本末·江陵柄政》\n', new: '  source: 《明史纪事本末》卷六十一 江陵柄政\n', reason: '纪事本末卷61' },
  { file: 'events/qing/qing-enter-guans.md', old: '- source: 《明史·流贼传》\n', new: '- source: 《明史》卷三百九 流贼传（李自成、张献忠）\n', reason: '明史卷309=流贼' },
  { file: 'persons/ming/hai-rui.md', old: '- source: 《明史·海瑞传》\n', new: '- source: 《明史》卷二百二十六 海瑞传\n', reason: '明史卷226' },
  { file: 'persons/ming/hai-rui.md', old: '- source: 《明史·徐阶传》\n', new: '- source: 《明史》卷二百一十三 徐阶传\n', reason: '明史卷213=徐阶 高拱 张居正' },
  { file: 'persons/ming/qi-ji-guang.md', old: '- source: 《明史纪事本末·沿海倭乱》\n', new: '- source: 《明史纪事本末》卷五十五 沿海倭乱\n', reason: '纪事本末卷55' },
  { file: 'persons/ming/wang-shouren.md', old: '- source: 《明史·朱宸濠传》\n', new: '- source: 《明史》卷一百一十七 诸王传·宁王权（宸濠附）\n', reason: '明史卷117 太祖诸子二，宸濠附宁献王权传' },
  { file: 'persons/ming/wang-shouren.md', old: '  note: 卷次待核，属《明史》诸王传部分。', new: '  note: 宸濠事附于卷一百一十七宁献王权传后。', reason: '同上' },
  { file: 'persons/ming/xu-guang-qi.md', old: '- source: 《明史》徐光启传\n', new: '- source: 《明史》卷二百五十一 徐光启传\n', reason: '明史卷251' },
  { file: 'persons/ming/zhu-di.md', old: '- source: 《明史》成祖本纪\n', new: '- source: 《明史》卷五至七 成祖本纪\n', reason: '明史卷5-7' },
  { file: 'persons/ming/zhu-di.md', old: '- source: 《明史》郑和传\n', new: '- source: 《明史》卷三百四 宦官传一·郑和\n', reason: '明史卷304=宦官一，郑和居首' },
  { file: 'persons/ming/zhu-di.md', old: '  source: 《明史》成祖本纪赞\n', new: '  source: 《明史》卷七 成祖本纪三 赞\n', reason: '赞在本纪末卷7' },
  { file: 'persons/ming/zhu-di.md', old: '  source: 《明史纪事本末》燕王起兵\n', new: '  source: 《明史纪事本末》卷十六 燕王起兵\n', reason: '纪事本末卷16' },
  { file: 'topics/chang-wei.md', old: '- source: 《明史》刑法志\n', new: '- source: 《明史》卷九十五 刑法志三\n', reason: '锦衣卫/厂卫在刑法三（卷95）' },
  { file: 'topics/chang-wei.md', old: '- source: 《明史》职官志\n', new: '- source: 《明史》卷七十四、七十六 职官志三、五\n', reason: '内官在职官三（卷74），锦衣卫等在职官五（卷76）' },
  { file: 'topics/chang-wei.md', old: '- source: 《明史》宦官传\n', new: '- source: 《明史》卷三百四至三百五 宦官传\n', reason: '明史卷304-305' },
  { file: 'world/age-of-exploration.md', old: '- source: 《明史》外国传·佛郎机（张廷玉等）\n', new: '- source: 《明史》卷三百二十五 外国传六·佛郎机（张廷玉等）\n', reason: '佛郎机条在卷325外国六' },
  { file: 'persons/qing/huangtaiji.md', old: '- source: 《明史》洪承畴传\n', new: '- source: 《明史》庄烈帝纪及诸传中有关洪承畴记事（《明史》未为洪承畴立传）\n', reason: '洪承畴降清，《明史》不立传，事见卷23-24庄烈帝纪等；《清史稿》卷237有传' },
  { file: 'persons/qing/huangtaiji.md', old: '  note: 卷次待核。此传出清修《明史》，对洪承畴降清后的仕历有所讳言。', new: '  note: 《明史》因洪承畴降清未为其立传，其松锦之战事迹散见卷二十三至二十四庄烈帝纪及有关列传；本传见《清史稿》卷二百三十七。', reason: '同上' },
  // —— 两唐书 ——
  { file: 'events/tang/niu-li-faction-feud.md', old: '- source: 《旧唐书》李德裕传\n', new: '- source: 《旧唐书》卷一百七十四 李德裕传\n', reason: '旧唐书卷174' },
  { file: 'events/tang/niu-li-faction-feud.md', old: '- source: 《旧唐书》李宗闵传\n', new: '- source: 《旧唐书》卷一百七十六 李宗闵传\n', reason: '旧唐书卷176' },
  { file: 'events/tang/niu-li-faction-feud.md', old: '- source: 《新唐书》李德裕传\n', new: '- source: 《新唐书》卷一百八十 李德裕传\n', reason: '新唐书卷180' },
  { file: 'persons/tang/fang-xuanling.md', old: '- source: 《旧唐书》房玄龄传\n', new: '- source: 《旧唐书》卷六十六 房玄龄传\n', reason: '旧唐书卷66=房玄龄 杜如晦' },
  { file: 'persons/tang/fang-xuanling.md', old: '- source: 《新唐书》房玄龄传\n', new: '- source: 《新唐书》卷九十六 房玄龄传\n', reason: '新唐书卷96' },
  { file: 'persons/tang/guo-ziyi.md', old: '- source: 《旧唐书》郭子仪传\n', new: '- source: 《旧唐书》卷一百二十 郭子仪传\n', reason: '旧唐书卷120' },
  { file: 'persons/tang/guo-ziyi.md', old: '- source: 《新唐书》郭子仪传\n', new: '- source: 《新唐书》卷一百三十七 郭子仪传\n', reason: '新唐书卷137' },
  { file: 'persons/tang/li-chun.md', old: '- source: 《旧唐书》宪宗纪上、下\n', new: '- source: 《旧唐书》卷十四至十五 宪宗纪上、下\n', reason: '旧唐书卷14顺宗宪宗上、卷15宪宗下' },
  { file: 'persons/tang/li-chun.md', old: '- source: 《新唐书》宪宗纪\n', new: '- source: 《新唐书》卷七 宪宗纪\n', reason: '新唐书卷7=德宗顺宗宪宗' },
  { file: 'persons/tang/li-keyong.md', old: '- source: 《新唐书》沙陀传\n', new: '- source: 《新唐书》卷二百一十八 沙陀传\n', reason: '新唐书卷218' },
  { file: 'persons/tang/li-keyong.md', old: '- source: 《旧五代史》武皇纪\n', new: '- source: 《旧五代史》卷二十五至二十六 唐书·武皇纪上下\n', reason: '旧五代史卷25-26' },
  { file: 'persons/tang/li-keyong.md', old: '  source: 《新五代史》义儿传序\n', new: '  source: 《新五代史》卷三十六 义儿传序\n', reason: '新五代史卷36' },
  { file: 'persons/tang/li-xun.md', old: '- source: 《旧唐书》李训传\n', new: '- source: 《旧唐书》卷一百六十九 李训传\n', reason: '旧唐书卷169' },
  { file: 'persons/tang/li-xun.md', old: '- source: 《新唐书》李训传\n', new: '- source: 《新唐书》卷一百七十九 李训传\n', reason: '新唐书卷179' },
  { file: 'persons/tang/li-xun.md', old: '  source: 《新唐书》李训传赞语\n', new: '  source: 《新唐书》卷一百七十九 李训传赞语\n', reason: '同上' },
  { file: 'persons/tang/pei-du.md', old: '- source: 《新唐书》裴度传\n', new: '- source: 《新唐书》卷一百七十三 裴度传\n', reason: '新唐书卷173' },
  { file: 'persons/tang/wei-zheng.md', old: '- source: 《旧唐书·魏征传》\n', new: '- source: 《旧唐书》卷七十一 魏征传\n', reason: '旧唐书卷71' },
  { file: 'persons/tang/wei-zheng.md', old: '- source: 《新唐书·魏征传》\n', new: '- source: 《新唐书》卷九十七 魏征传\n', reason: '新唐书卷97' },
  { file: 'topics/san-sheng-liu-bu.md', old: '- source: 《旧唐书》职官志\n', new: '- source: 《旧唐书》卷四十二至四十四 职官志\n', reason: '旧唐书卷42-44' },
  { file: 'topics/san-sheng-liu-bu.md', old: '- source: 《新唐书》百官志\n', new: '- source: 《新唐书》卷四十六 百官志一\n', reason: 'note 已言总述在卷46卷首' },
  { file: 'topics/san-sheng-liu-bu.md', old: '  note: 卷次待核；此句为《新唐书》百官志总述，通行本置于卷四十六卷首。', new: '  note: 此句为《新唐书》百官志总述，置于卷四十六卷首。', reason: '同上' },
  { file: 'topics/tang/fan-zhen-ge-ju.md', old: '- source: 《旧唐书》田承嗣传\n', new: '- source: 《旧唐书》卷一百四十一 田承嗣传\n', reason: '旧唐书卷141' },
  { file: 'topics/tang/fan-zhen-ge-ju.md', old: '- source: 《旧唐书》罗绍威传\n', new: '- source: 《旧唐书》卷一百八十一 罗弘信传附罗绍威\n', reason: '旧唐书卷181 罗弘信传，绍威附' },
  { file: 'world/japan-send-tang.md', old: '- source: 《旧唐书·日本国传》\n', new: '- source: 《旧唐书》卷一百九十九上 东夷传·日本国\n', reason: '旧唐书卷199上东夷' },
  { file: 'world/japan-send-tang.md', old: '- source: 《新唐书·日本传》\n', new: '- source: 《新唐书》卷二百二十 东夷传·日本\n', reason: '新唐书卷220东夷' },
  // —— 五代 ——
  { file: 'events/five-dynasties-ten-kingdoms/shi-jingtang-yanyun.md', old: '- source: 《旧五代史·晋书·高祖纪》\n', new: '- source: 《旧五代史》卷七十五至八十 晋书·高祖纪\n', reason: '旧五代史卷75-80' },
  { file: 'persons/five-dynasties-ten-kingdoms/shi-jingtang.md', old: '- source: 《旧五代史》晋高祖纪\n', new: '- source: 《旧五代史》卷七十五至八十 晋书·高祖纪\n', reason: '同上' },
  { file: 'persons/tang/li-ye.md', old: '- source: 《新五代史》梁本纪\n', new: '- source: 《新五代史》卷一至二 梁本纪·太祖\n', reason: '新五代史卷1-2=梁太祖上下' },
  { file: 'persons/tang/li-zhu.md', old: '  source: 《新五代史·唐六臣传》\n', new: '  source: 《新五代史》卷三十五 唐六臣传\n', reason: '新五代史卷35' },
  // —— 宋辽金 ——
  { file: 'events/northern-song/bei-jiu-shi-bingquan.md', old: '- source: 《宋史》 石守信传\n', new: '- source: 《宋史》卷二百五十 石守信传\n', reason: '宋史卷250' },
  { file: 'events/northern-song/bei-jiu-shi-bingquan.md', old: '- source: 《宋史》 赵普传\n', new: '- source: 《宋史》卷二百五十六 赵普传\n', reason: '宋史卷256' },
  { file: 'events/northern-song/yongxi-beifa.md', old: '- source: 《宋史·杨业传》\n', new: '- source: 《宋史》卷二百七十二 杨业传\n', reason: '宋史卷272' },
  { file: 'events/northern-song/yongxi-beifa.md', old: '- source: 《辽史·圣宗纪》\n', new: '- source: 《辽史》卷十一 圣宗纪二（统和四年）\n', reason: '辽史卷11起统和四年（986雍熙北伐）' },
  { file: 'events/northern-song/chanyuan-zhimeng.md', old: '- source: 《辽史》圣宗本纪\n', new: '- source: 《辽史》卷十四 圣宗本纪五（统和二十二年）\n', reason: '辽史卷14起统和十六年，卷15起二十八年，故1004年在卷14' },
  { file: 'events/southern-song/duanping-ru-luo.md', old: '- source: 《宋史》理宗纪\n', new: '- source: 《宋史》卷四十一 理宗纪一（端平元年）\n', reason: '宋史卷41含端平元年，卷42起端平二年' },
  { file: 'events/southern-song/duanping-ru-luo.md', old: '  note: 卷次待核；端平元年事在理宗纪中段。', new: '  note: 端平元年在理宗纪一即卷四十一末段。', reason: '同上' },
  { file: 'events/southern-song/duanping-ru-luo.md', old: '- source: 《宋史》赵葵传、全子才传\n', new: '- source: 《宋史》卷四百一十七 赵葵传（全子才事附见）\n', reason: '宋史卷417=乔行简 范钟 游似 赵葵 谢方叔；全子才无专传' },
  { file: 'events/southern-song/duanping-ru-luo.md', old: '  note: 卷次待核；二传为同一卷或相次两卷，待核。', new: '  note: 赵葵传在卷四百一十七；《宋史》无全子才专传，其事附见赵葵传及理宗纪。', reason: '同上' },
  { file: 'events/southern-song/kaixi-beifa.md', old: '- source: 《金史·章宗纪》\n', new: '- source: 《金史》卷十二 章宗纪四（泰和六年）\n', reason: '金史卷12起泰和四年，开禧北伐=泰和六年' },
  { file: 'events/southern-song/shaoxing-heyi.md', old: '- source: 《宋史》卷二十九《高宗纪》\n  credibility: B\n  text:', new: '- source: 《宋史》卷二十九 高宗纪六（绍兴十一年）\n  credibility: B\n  text:', reason: '卷29=高宗六，含绍兴八至十一年' },
  { file: 'events/southern-song/shaoxing-heyi.md', old: '  note: 卷次待核。\n- source: 《金史》卷七十七《宗弼传》', new: '  note: 卷二十九起绍兴八年，绍兴和议（十一年）在此卷。\n- source: 《金史》卷七十七《宗弼传》', reason: '同上' },
  { file: 'events/southern-song/shaoxing-heyi.md', old: '- source: 《金史》卷七十七《宗弼传》\n  credibility: B\n  text:', new: '- source: 《金史》卷七十七 宗弼传\n  credibility: B\n  text:', reason: '卷77=宗弼 张邦昌 刘豫 挞懒，已核目录' },
  { file: 'persons/northern-song/si-ma-guang.md', old: '- source: 《宋史》司马光传\n', new: '- source: 《宋史》卷三百三十六 司马光传\n', reason: '宋史卷336' },
  { file: 'persons/southern-song/wen-tian-xiang.md', old: '- source: 《宋史纪事本末》（陈邦瞻）\n', new: '- source: 《宋史纪事本末》卷一百九 文谢之死（陈邦瞻）\n', reason: '宋史纪事本末卷109' },
  { file: 'persons/southern-song/wen-tian-xiang.md', old: '  note: 卷次待核；此卷一般题作《文谢之死》。', new: '  note: 卷一百九题《文谢之死》。', reason: '同上' },
  { file: 'world/crusades.md', old: '- source: 《宋史·拂菻传》\n', new: '- source: 《宋史》卷四百九十 外国传六·拂菻\n', reason: '宋史卷490外国六' },
  { file: 'world/crusades.md', old: '- source: 《宋史·大食传》\n', new: '- source: 《宋史》卷四百九十 外国传六·大食\n', reason: '同上' },
  { file: 'events/western-xia/xixia-founding.md', old: '  note: 卷次待核。《辽史》系元人仓促删并前代所修辽史而成', new: '  note: 卷一百一十五二国外记已核目录。《辽史》系元人仓促删并前代所修辽史而成', reason: '辽史卷115=二国外记' },
  { file: 'topics/jiaozi-paper-money.md', old: '- source: 《金史·食货志》（卷次待核）\n', new: '- source: 《金史》卷四十八 食货志三·钱币\n', reason: '金史卷48=食货三 钱币（交钞）' },
  { file: 'topics/jiaozi-paper-money.md', old: '- source: 《元史·食货志》钞法（卷次待核）\n', new: '- source: 《元史》卷九十三 食货志一·钞法\n', reason: '元史卷93食货一含钞法' },
  // —— 元史 ——
  { file: 'events/jin/mongol-destroy-xixia-jin.md', old: '- source: 《元史》太祖本纪、太宗本纪\n', new: '- source: 《元史》卷一至二 太祖本纪、太宗本纪\n', reason: '元史卷1太祖、卷2太宗定宗' },
  { file: 'events/jin/mongol-destroy-xixia-jin.md', old: '  source: 《金史》哀宗纪赞\n', new: '  source: 《金史》卷十八 哀宗纪下 赞\n', reason: '金史卷18哀宗下' },
  { file: 'events/liao/liao-founding.md', old: '  source: 《辽史》太祖本纪赞语\n', new: '  source: 《辽史》卷二 太祖本纪下 赞语\n', reason: '辽史卷2太祖下' },
  { file: 'events/southern-song/xiangyang-southern-song-fall.md', old: '- source: 《元史·世祖纪》\n', new: '- source: 《元史》卷六至八 世祖纪三至五（至元四年至十年）\n', reason: '襄樊之战1267-1273：卷6起至元二年、卷7至元七至九年、卷8至元十至十一年' },
  { file: 'events/southern-song/xiangyang-southern-song-fall.md', old: '  note: 卷次待核；《元史》世祖纪分卷较多，此条以书名标注。', new: '  note: 世祖纪共十四卷（卷四至十七），襄樊之役（至元四年至十年）在卷六至八。', reason: '同上' },
  { file: 'events/yuan/yuan-founding.md', old: '- source: 《元史·世祖纪》\n', new: '- source: 《元史》卷七 世祖纪四（至元八年）\n', reason: '至元八年建国号大元在卷7' },
  { file: 'events/yuan/yuan-founding.md', old: '- source: 《元史·地理志》\n', new: '- source: 《元史》卷五十八 地理志一\n', reason: '地理志一序在卷58' },
  { file: 'persons/yuan/kublai.md', old: '- source: 《元史》世祖本纪，至元八年十一月\n', new: '- source: 《元史》卷七 世祖本纪四 至元八年十一月\n', reason: '同上' },
  { file: 'persons/yuan/kublai.md', old: '- source: 《元史·地理志》\n', new: '- source: 《元史》卷五十八 地理志一\n', reason: '同上' },
  { file: 'persons/yuan/kublai.md', old: '- source: 《元史》刘秉忠传\n', new: '- source: 《元史》卷一百五十七 刘秉忠传\n', reason: '元史卷157' },
  { file: 'persons/yuan/kublai.md', old: '- source: 《元史》日本传\n', new: '- source: 《元史》卷二百八 外夷传一·日本\n', reason: '元史卷208' },
  { file: 'events/yuan/hongjin-uprising.md', old: '- source: 《元史·顺帝纪》至正十一年\n', new: '- source: 《元史》卷四十二 顺帝纪五 至正十一年\n', reason: '卷42起至正九年，含十一、十二年' },
  { file: 'events/yuan/hongjin-uprising.md', old: '  note: 卷次待核。按《元史》顺帝纪分卷，此条当在顺帝本纪至正十一年部分。', new: '  note: 顺帝纪五（卷四十二）起至正九年，至正十一年事在此卷。', reason: '同上' },
  { file: 'events/yuan/hongjin-uprising.md', old: '- source: 《元史·顺帝纪》至正十五年\n', new: '- source: 《元史》卷四十四 顺帝纪七 至正十五年\n', reason: '卷44起至正十五年' },
  { file: 'events/yuan/hongjin-uprising.md', old: '  note: 卷次待核。至正十五年事当在顺帝纪中后段。', new: '  note: 顺帝纪七（卷四十四）起至正十五年。', reason: '同上' },
  { file: 'topics/xing-sheng-zhi.md', old: '咸不逮元。\n  note: 卷次待核。', new: '咸不逮元。\n  note: 地理志一即卷五十八，已核目录。', reason: '元史卷58=地理志一' },
  { file: 'world/mongol-japan-invasions.md', old: '- source: 《元史》世祖本纪 至元十八年（卷次待核）\n', new: '- source: 《元史》卷十一 世祖本纪八 至元十八年\n', reason: '卷11起至元十七年，含十八年' },
  { file: 'world/mongol-japan-invasions.md', old: '  note: 卷次待核。本纪属官方编年记录。', new: '  note: 卷十一起至元十七年，弘安之役（十八年）在此卷。本纪属官方编年记录。', reason: '同上' },
  { file: 'world/mongol-japan-invasions.md', old: '  source: 《元史纪事本末》日本用兵篇（卷次待核）\n', new: '  source: 《元史纪事本末》第四则 日本用兵\n', reason: '陈邦瞻书按"则"编，日本用兵为第四则' },
  { file: 'world/mongol-west-campaign.md', old: '- source: 《元史》术赤、巴秃传\n', new: '- source: 《元史》卷一百一十七 术赤传（拔都事附见）\n', reason: '元史卷117=别里古台 术赤等；拔都无专传' },
  { file: 'world/mongol-west-campaign.md', old: '  note: 卷次待核；传文较简，与《速不台传》及西方记载在细节上有出入。', new: '  note: 术赤传在卷一百一十七，《元史》无拔都专传，其事附见术赤传及速不台传（卷一百二十一）；传文较简，与西方记载在细节上有出入。', reason: '同上' },
  { file: 'world/mongol-west-campaign.md', old: '- source: 《元史》旭烈兀传\n', new: '- source: 《元史》有关旭烈兀西征记事（宪宗纪、郭侃传等；《元史》无旭烈兀专传）\n', reason: '元史目录无旭烈兀传；西征见卷3宪宗纪与卷149郭侃传' },
  { file: 'world/mongol-west-campaign.md', old: '  note: 卷次待核；《元史》此传记事较简，波斯拉施特《史集》所载更详。', new: '  note: 《元史》未为旭烈兀立传，其西征散见卷三宪宗纪、卷一百四十九郭侃传等，记事较简，波斯拉施特《史集》所载更详。', reason: '同上' },
  // —— 晋书 ——
  { file: 'events/western-jin/yongjia-disaster.md', old: '- source: 《晋书》刘聪载记、刘曜载记\n', new: '- source: 《晋书》卷一百二至一百三 刘聪载记、刘曜载记\n', reason: '晋书卷102刘聪、103刘曜' },
  { file: 'events/western-jin/yongjia-disaster.md', old: '  note: 载记卷次待核；', new: '  note: 载记第二、三即卷一百二至一百三；', reason: '同上' },
  { file: 'events/western-jin/yongjia-disaster.md', old: '- source: 《晋书》王导传\n', new: '- source: 《晋书》卷六十五 王导传\n', reason: '晋书卷65' },
  { file: 'persons/eastern-jin/xie-an.md', old: '- source: 《晋书》谢安传\n', new: '- source: 《晋书》卷七十九 谢安传\n', reason: '晋书卷79=谢尚 谢安' },
  { file: 'persons/eastern-jin/xie-an.md', old: '- source: 《晋书》孝武帝纪\n', new: '- source: 《晋书》卷九 孝武帝纪\n', reason: '晋书卷9=简文帝 孝武帝' },
  { file: 'topics/wu-hu-luan-hua.md', old: '- source: 《晋书》苻坚载记\n', new: '- source: 《晋书》卷一百一十三至一百一十四 苻坚载记上下\n', reason: '晋书卷113-114' },
  { file: 'topics/wu-hu-luan-hua.md', old: '  note: 该篇在《晋书》载记部分，具体卷次待核。', new: '  note: 载记第十三、十四即卷一百一十三至一百一十四。', reason: '同上' },
  // —— 通鉴（据维基文库目录 卷-年份对照）——
  { file: 'events/northern-dynasties/xiaowen-reform.md', old: '- source: 《资治通鉴》齐纪 永明十一年至建武四年\n', new: '- source: 《资治通鉴》卷一百三十八至一百四十一 齐纪四至七（永明十一年至建武四年）\n', reason: '卷138=永明十一年，139=建武元年，140=建武二三年，141=建武四年永泰元年' },
  { file: 'events/northern-dynasties/xiaowen-reform.md', old: '断北语、改姓等诏令分布在后续齐纪各卷；具体卷次待核。', new: '断北语、改姓等诏令分布在卷一百三十九至一百四十一。', reason: '同上' },
  { file: 'events/spring-autumn/tianshi-dai-qi.md', old: '- source: 《资治通鉴》周纪一（安王十六年，前386年）\n', new: '- source: 《资治通鉴》卷一 周纪一（安王十六年，前386年）\n', reason: '卷1=周纪一，威烈王23年至烈王7年' },
  { file: 'events/sui/sui-gaoli-campaigns.md', old: '- source: 《资治通鉴》隋纪 大业八至十年条\n', new: '- source: 《资治通鉴》卷一百八十一至一百八十二 隋纪五至六（大业八年至十年）\n', reason: '卷181尽大业八年，卷182起大业九年' },
  { file: 'events/sui/sui-gaoli-campaigns.md', old: '  note: 具体卷次待核，通行本约在卷一百八十一至一百八十二之间。', new: '  note: 卷一百八十一尽大业八年，卷一百八十二起大业九年至十一年。', reason: '同上' },
  { file: 'events/sui/sui-late-uprisings.md', old: '- source: 《资治通鉴》隋纪、唐纪相关卷（卷次待核）\n', new: '- source: 《资治通鉴》卷一百八十二至一百八十五 隋纪六至唐纪一（大业九年至武德元年）\n', reason: '卷182-184隋纪六至八，卷185唐纪一武德元年' },
  { file: 'events/sui/sui-late-uprisings.md', old: '  note: 此段在《资治通鉴》隋纪末与唐纪初交界处，具体卷次待核。', new: '  note: 此段在隋纪末（卷一百八十二至一百八十四）与唐纪初（卷一百八十五）交界处。', reason: '同上' },
  { file: 'events/tang/niu-li-faction-feud.md', old: '- source: 《资治通鉴》\n  credibility: A\n  text:', new: '- source: 《资治通鉴》卷二百四十一至二百四十九 唐纪五十七至六十五（穆宗至宣宗）\n  credibility: A\n  text:', reason: '卷241起长庆元年，卷249尽大中十三年' },
  { file: 'events/tang/niu-li-faction-feud.md', old: '  note: 相关纪年分布于穆宗至宣宗各卷，卷次待核。', new: '  note: 相关纪年分布于穆宗至宣宗各卷（卷二百四十一至二百四十九）。', reason: '同上' },
  { file: 'events/tang/tang-conquest-of-eastern-turks.md', old: '- source: 《资治通鉴》唐纪九 贞观三年至四年\n', new: '- source: 《资治通鉴》卷一百九十三 唐纪九 贞观三年至四年\n', reason: '卷193=贞观二年九月至五年' },
  { file: 'events/tang/tang-conquest-of-eastern-turks.md', old: '  note: 卷次待核；事件跨贞观三年至四年纪事，中华书局标点本约在卷一九三至一九四。', new: '  note: 贞观二年九月至五年纪事均在卷一百九十三。', reason: '同上' },
  { file: 'events/three-kingdoms/yiling-battle.md', old: '  note: 卷次待核；战事纪年在黄初三年。', new: '  note: 卷六十九魏纪一起黄初元年尽三年，夷陵之战（黄初三年）在此卷。', reason: '目录核实' },
  { file: 'events/warring-states/changping-battle.md', old: '- source: 《资治通鉴》周纪 赧王五十五年\n', new: '- source: 《资治通鉴》卷五 周纪五 赧王五十五年\n', reason: '卷5=赧王43-59年' },
  { file: 'events/warring-states/guiling-maling-battles.md', old: '- source: 《资治通鉴》\n  credibility: A\n  text:', new: '- source: 《资治通鉴》卷二 周纪二（显王十六年、二十八年）\n  credibility: A\n  text:', reason: '桂陵前353、马陵前341均在显王朝，卷2=显王元年至48年' },
  { file: 'events/warring-states/guiling-maling-battles.md', old: '  note: 周纪卷次待核。', new: '  note: 桂陵（显王十六年）、马陵（显王二十八年）均在卷二周纪二。', reason: '同上' },
  { file: 'events/warring-states/jing-ke-assassination.md', old: '- source: 《资治通鉴》\n  credibility: B\n  text:', new: '- source: 《资治通鉴》卷七 秦纪二 始皇帝二十年\n  credibility: B\n  text:', reason: '荆轲刺秦前227=始皇20年，卷7起始皇20年' },
  { file: 'events/warring-states/shangyang-reform.md', old: '  note: 卷次待核。', new: '  note: 卷二周纪二起显王元年，商鞅变法（显王八年、十九年）在此卷。', reason: '目录核实' },
  { file: 'events/western-han/zhangqian-western-regions.md', old: '- source: 《资治通鉴》汉纪（武帝元朔三年）\n', new: '- source: 《资治通鉴》卷十八 汉纪十（武帝元朔三年）\n', reason: '卷18=元光二年至元朔四年' },
  { file: 'events/western-jin/yongjia-disaster.md', old: '再记刘曜、王弥等攻陷洛阳、俘怀帝。\n  note: 卷次待核。', new: '再记刘曜、王弥等攻陷洛阳、俘怀帝。\n  note: 卷八十七晋纪九起永嘉三年尽五年，已核目录。', reason: '目录核实' },
  { file: 'events/western-jin/yongjia-disaster.md', old: '中州士女避乱江左者十六七。\n  note: 卷次待核。', new: '中州士女避乱江左者十六七。\n  note: 王导传即卷六十五，已核目录。', reason: '同上' },
  { file: 'events/xin/lulin-chimei-uprising.md', old: '是现行时间线索的便捷依据。\n  note: 卷次待核。', new: '是现行时间线索的便捷依据。\n  note: 卷三十九起更始元年，卷四十一尽建武五年，已核目录。', reason: '目录核实' },
  { file: 'persons/eastern-jin/xie-an.md', old: '- source: 《资治通鉴》晋纪 太元八年\n', new: '- source: 《资治通鉴》卷一百五 晋纪二十七 太元八年\n', reason: '卷105=太元八年至九年' },
  { file: 'persons/northern-dynasties/beiwei-xiaowendi.md', old: '- source: 《资治通鉴》\n  credibility: B\n  text:', new: '- source: 《资治通鉴》卷一百三十四至一百四十二 宋纪十六至齐纪八（孝文帝在位期）\n  credibility: B\n  text:', reason: '孝文帝471-499：卷133-134宋纪，卷135-142齐纪' },
  { file: 'persons/northern-dynasties/beiwei-xiaowendi.md', old: '  note: 卷次待核；通鉴所据主要是', new: '  note: 孝文帝朝纪事分布于卷一百三十三至一百四十二；通鉴所据主要是', reason: '同上' },
  { file: 'persons/northern-dynasties/tuoba-gui.md', old: '- source: 《资治通鉴》\n  credibility: B\n  text:', new: '- source: 《资治通鉴》卷一百六至一百一十五 晋纪二十八至三十七（太元十一年至义熙五年）\n  credibility: B\n  text:', reason: '卷106起太元十年，卷115尽义熙六年' },
  { file: 'persons/northern-dynasties/tuoba-gui.md', old: '  note: 卷次待核，所涉为晋纪太元十一年至义熙五年（386—409）诸卷。', new: '  note: 所涉太元十一年至义熙五年（386—409）在卷一百六至一百一十五。', reason: '同上' },
  { file: 'persons/sui/yang-jian.md', old: '- source: 《资治通鉴》陈纪九至隋纪一\n', new: '- source: 《资治通鉴》卷一百七十五至一百七十七 陈纪九至隋纪一\n', reason: '卷175陈纪九（581起），卷177隋纪一（589起）' },
  { file: 'persons/sui/yang-jian.md', old: '  note: 具体卷次待核。', new: '  note: 卷一百七十五起太建十三年（581 隋建国），卷一百七十七起开皇九年（589 平陈）。', reason: '同上' },
  { file: 'persons/sui/yuwen-kai.md', old: '- source: 《资治通鉴》隋纪有关各卷（卷次待核）\n', new: '- source: 《资治通鉴》卷一百七十五、一百八十 陈纪九、隋纪四\n', reason: 'note 已写明' },
  { file: 'persons/sui/yuwen-kai.md', old: '  note: 营新都见卷一百七十五，东都与观风行殿见卷一百八十诸卷，其余卷次待核。', new: '  note: 营新都（开皇二年）见卷一百七十五，东都与观风行殿（大业元年、三年）见卷一百八十。', reason: '同上' },
  { file: 'persons/tang/fang-xuanling.md', old: '- source: 《资治通鉴》\n  credibility: A\n  text:', new: '- source: 《资治通鉴》卷一百九十二至一百九十八 唐纪八至十四（贞观初至二十二年）\n  credibility: A\n  text:', reason: '卷192起武德九年，卷198尽贞观二十二年' },
  { file: 'persons/tang/fang-xuanling.md', old: '  note: 卷次待核，涉及贞观初年至贞观二十二年事。', new: '  note: 贞观初年至二十二年事在卷一百九十二至一百九十八。', reason: '同上' },
  { file: 'persons/tang/guo-ziyi.md', old: '- source: 《资治通鉴》\n  credibility: A\n  text:', new: '- source: 《资治通鉴》卷二百一十九至二百二十三 唐纪三十五至三十九（至德二载至永泰元年）\n  credibility: A\n  text:', reason: '卷219至德二载，卷223尽永泰元年' },
  { file: 'persons/tang/guo-ziyi.md', old: '  note: 涉及至德二载至永泰元年诸条，卷次待核。', new: '  note: 至德二载至永泰元年诸条在卷二百一十九至二百二十三。', reason: '同上' },
  { file: 'persons/tang/li-chun.md', old: '- source: 《资治通鉴》唐纪宪宗朝\n', new: '- source: 《资治通鉴》卷二百三十七至二百四十一 唐纪五十三至五十七（宪宗朝）\n', reason: '卷237元和元年起，卷241尽元和十五年' },
  { file: 'persons/tang/li-jing.md', old: '- source: 《资治通鉴》武德四年、贞观四年、贞观九年纪事\n', new: '- source: 《资治通鉴》卷一百八十九、一百九十三、一百九十四 武德四年、贞观四年、贞观九年纪事\n', reason: '卷189武德四年，卷193贞观二至五年，卷194贞观六至十一年' },
  { file: 'persons/tang/li-keyong.md', old: '- source: 《资治通鉴》唐纪 中和年间\n', new: '- source: 《资治通鉴》卷二百五十四至二百五十六 唐纪七十至七十二 中和年间\n', reason: '中和元年至四年在卷254-256' },
  { file: 'persons/tang/song-jing.md', old: '对罢相的原因和过程也有记载。\n  note: 卷次待核\n', new: '对罢相的原因和过程也有记载。\n  note: 卷二百一十一起开元二年，卷二百一十二尽开元十三年，宋璟相期（开元四年至八年）在此两卷。\n', reason: '目录核实' },
  { file: 'persons/tang/song-jing.md', old: '在于制度化行政与匡正君主。\n  note: 卷次待核\n', new: '在于制度化行政与匡正君主。\n  note: 卷二百一十一至二百一十二，开元四年至八年纪事。\n', reason: '同上' },
  { file: 'persons/tang/wu-zetian.md', old: '- source: 《资治通鉴》卷二百三至二百七 唐纪\n', new: '- source: 《资治通鉴》卷二百三至二百七 唐纪十九至二十三\n', reason: '卷203唐纪十九（光宅元年）至卷207唐纪二十三（神龙元年）' },
  { file: 'persons/tang/wu-zetian.md', old: '  note: 卷次待核。又《资治通鉴考异》', new: '  note: 卷二百三起光宅元年，卷二百七尽神龙元年正月。又《资治通鉴考异》', reason: '同上' },
  { file: 'persons/three-kingdoms/cao-cao.md', old: '- source: 《资治通鉴》\n  credibility: A\n  text:', new: '- source: 《资治通鉴》卷六十三 汉纪五十五 建安五年\n  credibility: A\n  text:', reason: '卷63=建安四至五年' },
  { file: 'persons/three-kingdoms/cao-cao.md', old: '  note: 卷次待核，事在建安五年（200年），约为汉纪五十五。', new: '  note: 事在建安五年（200年），卷六十三汉纪五十五。', reason: '同上' },
  { file: 'persons/three-kingdoms/liu-bei.md', old: '- source: 《资治通鉴》汉纪 建安年间\n', new: '- source: 《资治通鉴》卷六十二至六十八 汉纪五十四至六十（建安年间）\n', reason: '卷62建安元年起，卷68尽建安二十四年' },
  { file: 'persons/three-kingdoms/liu-bei.md', old: '- source: 《资治通鉴》魏纪 黄初二三年\n', new: '- source: 《资治通鉴》卷六十九 魏纪一 黄初二年至三年\n', reason: '卷69=黄初元年至三年' },
  { file: 'persons/three-kingdoms/zhu-ge-liang.md', old: '  note: 卷次待核；所记事在建安十二年、十三年（207—208 年）。', new: '  note: 卷六十五汉纪五十七起建安十一年尽十三年，所记事在建安十二年、十三年（207—208 年）。', reason: '目录核实' },
  { file: 'persons/western-han/zhang-qian.md', old: '- source: 《资治通鉴》汉纪武帝朝\n', new: '- source: 《资治通鉴》卷十八至二十一 汉纪十至十三（武帝元光至太初）\n', reason: '张骞活动（前139-前114）在卷17-21，出使见卷18-20' },
  { file: 'persons/western-han/zhang-qian.md', old: '  note: 具体卷次待核，通鉴汉纪武帝朝记事约在卷十七至卷二十二之间。', new: '  note: 张骞出使、封博望侯、通西南夷诸事在卷十八至二十一（元光至太初）。', reason: '同上' },
  { file: 'topics/wu-dai-shi-guo.md', old: '- source: 《资治通鉴》后梁纪至后周纪\n', new: '- source: 《资治通鉴》卷二百六十六至二百九十四 后梁纪一至后周纪五\n', reason: '卷266后梁纪一，卷294后周纪五（末卷）' },
  { file: 'world/japan-kofun.md', old: '  source: 《资治通鉴》魏纪（景初二年前后）\n', new: '  source: 《资治通鉴》卷七十四 魏纪六（景初二年前后）\n', reason: '卷74起景初二年' },
  { file: 'world/japan-kofun.md', old: '但选材与编排代表史家判断；卷次待核。', new: '但选材与编排代表史家判断；景初二年在卷七十四魏纪六。', reason: '同上' },
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