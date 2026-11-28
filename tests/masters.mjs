// マスタの同期: data/masters/ の CSV（メンテ用）と、site/js/data/masters.js（処理用）・tests/fixtures/masters.json が同じ中身か
//   あわせて CSV の読み書きの往復（引用符・カンマ・改行を含む値）を確かめる
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCsvMasters, writeCsvMasters, readJsMasters, jsText, parseCsv, toCsv, JS_PATH, FIXTURE_PATH, DIR } from '../tools/masters-csv.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

let csv;
try { csv = readCsvMasters(); ok(true, ''); } catch (e) { ok(false, 'CSV を読めない: ' + e.message); }
if (csv) {
  ok(JSON.stringify(readJsMasters()) === JSON.stringify(csv), 'site/js/data/masters.js が CSV と違う（node tools/build-masters.mjs で作り直す）');
  ok(fs.readFileSync(JS_PATH, 'utf8') === jsText(csv), 'site/js/data/masters.js の書式が生成物と違う（手で直していないか）');
  ok(JSON.stringify(JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8').replace(/^\uFEFF/, ''))) === JSON.stringify(csv), 'tests/fixtures/masters.json が CSV と違う');
  // CSV → JS → CSV の往復で CSV が変わらない（数の表記・空欄・「はい」）
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'masters-'));
  writeCsvMasters(csv, tmp);
  for (const f of ['version.txt', '単価マスタ.csv', '簡易裁判所マスタ.csv'])
    ok(fs.readFileSync(path.join(tmp, f), 'utf8').replace(/\r\n/g, '\n') === fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\r\n/g, '\n'), '往復で変わる: ' + f);
  fs.rmSync(tmp, { recursive: true, force: true });
}
// 宿泊料の区切り（Issue #2）: 2025-04-01〜 は令和6年財務省令第70号の額、2026-04-01〜 は令和8年財務省令第3号の額
if (csv) {
  const at = (code, d) => { const rs = csv.rates.filter((r) => r.ItemCode === code && r.EffectiveDate <= d && !(r.AbolishedDate && r.AbolishedDate <= d)).sort((a, b) => (a.EffectiveDate < b.EffectiveDate ? 1 : -1)); return rs.length ? rs[0].Amount : null; };
  ok(at('SHUKUHAKU_13', '2025-04-01') === 19000 && at('SHUKUHAKU_13', '2026-03-31') === 19000 && at('SHUKUHAKU_13', '2026-04-01') === 21000, '東京都の宿泊料（19,000 → 21,000）');
  ok(at('SHUKUHAKU_11', '2025-10-01') === 19000 && at('SHUKUHAKU_11', '2026-04-01') === 16000, '埼玉県の宿泊料（19,000 → 16,000）');
  ok(at('SHUKUHAKU_KO', '2025-03-31') === 8500 && at('SHUKUHAKU_KO', '2025-04-01') === null, '甲地方は 2025-04-01 に廃止');
  ok(csv.rates.filter((r) => /^SHUKUHAKU_\d\d$/.test(r.ItemCode)).length === 94 && csv.rates.filter((r) => /^SHUKUHAKU_\d\d$/.test(r.ItemCode) && r.FilingBasis).length === 0, '都道府県別の宿泊料は 47 × 2 行・申立日基準なし');
}
// CSV の読み書きそのもの
const rows = [['a', 'b,c', 'say "hi"'], ['改行\nあり', '', 'x']];
ok(JSON.stringify(parseCsv(toCsv(rows))) === JSON.stringify(rows), 'CSV の往復（引用符・カンマ・改行）');
ok(JSON.stringify(parseCsv('\uFEFFa,b\r\n1,2\r\n\r\n')) === JSON.stringify([['a', 'b'], ['1', '2']]), 'BOM・CRLF・空行');
console.log(`masters: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
