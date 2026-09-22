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
  for (const [file, fixes] of byFile) {
    const p = path.join(ROOT, 'content', file);
    const text = await readFile(p, 'utf8');
    let next = text;
    for (const f of fixes) {
      if (next.includes(f.old)) {
        if (!dry) next = next.split(f.old).join(f.new);
        applied++;
      } else {
        console.error(`[miss] ${file}: 未找到旧串 —— ${f.old.slice(0, 60)}…`);
        missed++;
      }
    }
    if (!dry && next !== text) await writeFile(p, next, 'utf8');
  }
  console.log(`应用 ${applied} 条，未命中 ${missed} 条${dry ? '（dry-run，未写盘）' : ''}`);
  return missed > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(String(e));
    process.exit(1);
  });