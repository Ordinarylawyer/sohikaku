// Excel の作成（site/js/app/excel.js）: 見本の事件で作り、表の範囲・行の中身が計算結果と合うこと、外部 URL を含まないこと
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadSH } from './load.mjs';
const JSZip = createRequire(import.meta.url)('../site/vendor/jszip.min.js');
const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.join(here, '../site');
const SH = loadSH(['js/data/masters.js', 'js/data/template.js', 'vendor/jszip.min.js', 'js/app/util.js', 'js/app/state.js', 'js/app/excel.js', 'js/app/word.js', 'js/app/steps/s09.js', 'js/app/steps/s10.js']
  .map((f) => path.join(site, f)), { atob, Blob, Uint8Array, setTimeout, setImmediate, Promise });
const A = SH.App;
A.STEPS = A.STEPS || {};
A.syncHearings = () => { A.hearing = A.syncHearingCosts(A.state); };
A.isApplicant = () => A.state.header.role === 'applicant';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
for (const file of ['事件A.json', '事件C.json', '事件D.json', 'tc06.json']) {
  A.state = A.fromJSON(JSON.parse(fs.readFileSync(path.join(here, 'fixtures/app', file), 'utf8')));
  A.calculate();
  for (const kind of ['clerk', 'applicant']) {
    if (kind === 'applicant') { A.state.header.role = 'applicant'; A.calculate(); }
    const { name, blob } = await A.makeExcel(kind);
    const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
    const t1 = await zip.file('xl/tables/table1.xml').async('string');
    const s2 = await zip.file('xl/worksheets/sheet2.xml').async('string');
    const t4 = await zip.file('xl/tables/table4.xml').async('string');
    const sheet2 = kind === 'clerk' ? A.out.sheet2 : A.out.sheet2.filter((x) => A.state.parties.find((p) => p.id === x.PartyId && p.kind === '申立人') && ['head', 'item', 'sub', 'total'].includes(x.Kind));
    ok(t1.includes('ref="A4:E' + (5 + sheet2.length) + '"'), file + ' ' + kind + ' tblSheet2 の範囲');
    ok(t4.includes('ref="N1:O' + (2 + A.out.decree.length) + '"'), file + ' ' + kind + ' tblDecree の範囲');
    ok(sheet2.every((x) => s2.includes('>' + x.Text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '<')), file + ' ' + kind + ' 計算書の摘要');
    let all = '';
    for (const f of Object.keys(zip.files)) if (!zip.files[f].dir) all += await zip.file(f).async('string');
    ok(!/https?:\/\/(?!schemas\.openxmlformats\.org|schemas\.microsoft\.com|purl\.org|www\.w3\.org)/.test(all), file + ' ' + kind + ' 外部 URL を含まない');
    ok(name.endsWith('.xlsx'), 'ファイル名 ' + name);
    const wb = await zip.file('xl/workbook.xml').async('string');
    ok(!zip.file('xl/worksheets/sheet1.xml') && (wb.match(/<sheet /g) || []).length === 3 && !wb.includes('処分書'), file + ' ' + kind + ' 処分書シートを外した');
    ok(!/localSheetId="-/.test(wb) && wb.includes('localSheetId="0"'), file + ' ' + kind + ' 印刷範囲');
    // Word
    const w = await A.makeWord(kind);
    const wz = await JSZip.loadAsync(Buffer.from(await w.blob.arrayBuffer()));
    const doc = await wz.file('word/document.xml').async('string');
    ok(w.name.endsWith('.docx'), 'Word のファイル名 ' + w.name);
    if (kind === 'clerk') ok(A.out.decree.every((t) => doc.includes(t.replace(/^\d+　/, ''))) && doc.includes('訴 訟 費 用 額 確 定 処 分'), file + ' 処分書（Word）に主文');
    else ok(doc.includes('訴訟費用額確定処分申立書') && doc.includes('申立ての趣旨'), file + ' 申立書（Word）');
    ok(A.state.parties.filter((p) => p.kind !== 'その他').every((p) => doc.includes(p.name)), file + ' ' + kind + ' Word に当事者');
    // 代理人等（STEP 2 で入れたもの）も当事者欄に載る
    const sides = new Set(A.state.parties.filter((p) => p.kind === '申立人' || p.kind === '相手方').map((p) => p.id));
    ok(A.state.attendees.filter((a) => a.name && a.parties.some((id) => sides.has(id))).every((a) => doc.includes(a.name)), file + ' ' + kind + ' Word に代理人等');
  }
}
console.log(`excel: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
