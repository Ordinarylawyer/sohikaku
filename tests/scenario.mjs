// アプリの退避 JSON（考案事例 事件A〜G と engine/samples）を Web 版で読み込み・計算し、参照実装の結果と突き合わせる
//   期待値: tests/fixtures/expected/scenario.json（参照実装で作ったもの。作り方は tests/README.md）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSH } from './load.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SH = loadSH([path.join(here, '../site/js/data/masters.js')]);
const master = SH.normalizeMaster(SH.MASTERS.rates);
const expected = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/expected/scenario.json'), 'utf8'));
let pass = 0, fail = 0;
const j = (x) => JSON.stringify(x);
function eq(n, name, got, exp) {
  if (j(got) === j(exp)) { pass++; return; }
  fail++; console.log(`${n} ${name}\n   got: ${j(got)}\n   exp: ${j(exp)}`);
}
for (const x of expected) {
  const json = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/app', x.file), 'utf8').replace(/^\uFEFF/, ''));
  const c = SH.toCase(json);
  const r = SH.calculate(c);
  const n = x.file;
  eq(n, 'Normalized', r.Normalized, x.Normalized);
  eq(n, 'NotOrdered', r.NotOrderedNormalized, x.NotOrdered);
  for (const k of ['Errors', 'Warnings', 'Diffs', 'Notes', 'OffsetLog']) eq(n, k, r[k], x[k]);
  eq(n, 'Decree', SH.getDecree(c, r), x.Decree);
  eq(n, 'Sheet2', SH.getSheet2(c, r), x.Sheet2);
  eq(n, 'CostSubtotals', SH.getCostSubtotals(c, r), x.CostSubtotals);
  if (x.Hearing) {
    const hc = SH.toHearingCase(json);
    const segs = SH.buildRateSegments(hc.Instances, hc.Pools, master, [4, 5]);
    const hr = SH.getHearingCosts(hc, { Segments: segs });
    eq(n, 'HRows', hr.Rows.map((q) => ({ RKey: q.RKey, PoolId: q.PoolId, SegNo: q.SegNo, Item: q.Item, Km: q.Km, Fare: q.Fare, Daily: q.Daily,
                                         Lodge: q.Lodge, Amount: q.Amount, Cap: q.Cap, Dropped: q.Dropped })), x.Hearing.Rows);
    eq(n, 'HWarnings', hr.Warnings, x.Hearing.Warnings);
    eq(n, 'HCosts', hr.CostRows.map((q) => ({ PoolId: q.PoolId, Item: q.Item, SegNo: q.SegNo, Amount: q.Amount, Label: q.Label, Payers: q.Payers })), x.Hearing.CostRows);
  }
}
console.log(`scenario: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
