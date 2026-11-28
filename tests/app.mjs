// 画面の状態（site/js/app/state.js）を通した計算: 退避 JSON を読み込み → 4号・5号を期日と出欠から起こし直し → 計算 → 主文・計算書が参照実装と一致
//   （画面で入れた事件と同じ道筋。事件G.json は古い形式の JSON なので 4号・5号の摘要が変わり、計算書は比べない）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSH } from './load.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const SH = loadSH([path.join(here, '../site/js/data/masters.js'), path.join(here, '../site/js/app/util.js'), path.join(here, '../site/js/app/state.js')]);
const A = SH.App;
const exp = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/expected/scenario.json'), 'utf8'));
let pass = 0, fail = 0;
// 4号・5号の摘要の「区間N：日付〜」は、画面の道筋では今の単価マスタの区間から付け直す（参照実装の期待値は退避 JSON に残った摘要のまま）。
//   マスタの改定で審級の期間が新たに区間に分かれた事件は、摘要の末尾だけが期待値と違ってくる。そのような行に限り、
//   期待値の摘要に区間を足したものと比べる（額・行の並び・ほかの文言は参照実装の期待値そのもの）。
//   例: { '事件X.json': { '<期待値の摘要>': ' 区間1：yyyy/mm/dd〜' } }。今は該当する事件が無い。
const SPLIT_LABELS = {};
const sheet2Expected = (x) => (x.Sheet2 || []).map((row) => {
  const add = (SPLIT_LABELS[x.file] || {})[row.Text];
  return add ? Object.assign({}, row, { Text: row.Text + add }) : row;
});
const j = (x) => JSON.stringify(x);
const eq = (n, k, a, b) => { if (j(a) === j(b)) pass++; else { fail++; console.log(n, k, '\n got', j(a), '\n exp', j(b)); } };
for (const x of exp) {
  const json = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/app', x.file), 'utf8'));
  const s = A.fromJSON(json);
  // 書き出して読み直しても同じ（往復できる）
  eq(x.file, 'roundtrip', A.toJSON(A.fromJSON(A.toJSON(s))), A.toJSON(s));
  A.syncHearingCosts(s);
  const c = A.engineCase(s);
  const r = SH.calculate(c);
  eq(x.file, 'Decree', SH.getDecree(c, r), x.Decree);
  if (x.file !== '事件G.json') eq(x.file, 'Sheet2', SH.getSheet2(c, r), sheet2Expected(x));
}
console.log(`app: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
