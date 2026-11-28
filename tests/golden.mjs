// 参照実装（engine/*.ps1）が書き出した事件と期待値（Export-Golden.ps1）を、Web 版のエンジンで計算して突き合わせる
//   node tests/golden.mjs <golden.json> [...]
import fs from 'node:fs';
import zlib from 'node:zlib';
import { loadSH } from './load.mjs';

const SH = loadSH();
let pass = 0, fail = 0;
const fails = [];

// PowerShell の ConvertTo-Json は要素 1 つの配列をそのまま配列で書く（@() で包んである）。null は null
const j = (x) => JSON.stringify(x);
function eq(caseNo, name, got, exp) {
  if (j(got) === j(exp)) { pass++; return; }
  fail++;
  if (fails.length < 40) fails.push(`#${caseNo} ${name}\n   got: ${j(got)}\n   exp: ${j(exp)}`);
}
const mapToObj = (m) => Object.fromEntries([...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
const sortObj = (o) => Object.fromEntries(Object.entries(o || {}).sort((a, b) => (a[0] < b[0] ? -1 : 1)));

function engineCase(c) {
  return SH.newCase({
    Parties: c.Parties, Instances: c.Instances, Pools: c.Pools, OpponentScopes: c.OpponentScopes || [],
    Claims: c.Claims, Rulings: c.Rulings,
    Costs: c.Costs.map((x) => Object.assign({}, x, { Payers: x.Payers || [] })),
    Options: { OpponentMode: c.Options.OpponentMode || 'none', OpponentIds: c.Options.OpponentIds || [],
               ClaimedTotals: c.Options.ClaimedTotals || {} }
  });
}
function hearingCase(h) {
  const a = (x) => x || [];
  return { Parties: a(h.Parties), Attendees: a(h.Attendees), AttendeeParties: a(h.AttendeeParties), Instances: a(h.Instances),
           Pools: a(h.Pools), PartyPools: a(h.PartyPools), Hearings: a(h.Hearings), Attendance: a(h.Attendance) };
}

const here = new URL('.', import.meta.url).pathname;
const files = process.argv.length > 2 ? process.argv.slice(2)
  : fs.readdirSync(here + 'fixtures/expected').filter((f) => f.startsWith('golden')).map((f) => here + 'fixtures/expected/' + f);
for (const file of files) {
  const buf = fs.readFileSync(file);
  const all = JSON.parse((file.endsWith('.gz') ? zlib.gunzipSync(buf) : buf).toString('utf8').replace(/^\uFEFF/, ''));
  for (const e of all) {
    const n = file.replace(/.*\//, '') + ':' + e.caseNo;
    const x = e.expect;
    // 期日・出欠（4号・5号）
    const hr = SH.getHearingCosts(hearingCase(e.hearingCase), { LodgingRates: e.lodging });
    eq(n, 'HRows', hr.Rows.map((r) => ({ RKey: r.RKey, PoolId: r.PoolId, Item: r.Item, Km: r.Km, Fare: r.Fare, Daily: r.Daily,
                                         Lodge: r.Lodge, Amount: r.Amount, Cap: r.Cap, Dropped: r.Dropped })), x.HRows);
    eq(n, 'HWarnings', hr.Warnings, x.HWarnings);
    eq(n, 'HCosts', hr.CostRows.map((r) => ({ PoolId: r.PoolId, Item: r.Item, SegNo: r.SegNo, Amount: r.Amount, Label: r.Label, Payers: r.Payers })), x.HCosts);
    // 計算
    const c = engineCase(e.case);
    const r = SH.calculate(c);
    eq(n, 'Normalized', r.Normalized, x.Normalized);
    eq(n, 'NotOrdered', r.NotOrderedNormalized, x.NotOrdered);
    eq(n, 'Errors', r.Errors, x.Errors);
    eq(n, 'Warnings', r.Warnings, x.Warnings);
    eq(n, 'Diffs', r.Diffs, x.Diffs);
    eq(n, 'Notes', r.Notes, x.Notes);
    eq(n, 'OffsetLog', r.OffsetLog, x.OffsetLog);
    eq(n, 'Questions', r.ScopeQuestions.map((q) => ({ PoolId: q.PoolId, PartyId: q.PartyId, OpponentId: q.OpponentId, RulingId: q.RulingId, Suggested: q.Suggested })), x.Questions);
    eq(n, 'BaseAmounts', mapToObj(r.BaseAmounts), sortObj(x.BaseAmounts));
    eq(n, 'Debts', r.Debts.map((d) => ({ Creditor: d.Creditor, Obligors: d.Obligors, Amount: d.Amount })), x.Debts);
    eq(n, 'Decree', SH.getDecree(c, r), x.Decree);
    eq(n, 'Sheet2', SH.getSheet2(c, r), x.Sheet2);
    eq(n, 'CostSubtotals', SH.getCostSubtotals(c, r), x.CostSubtotals);
  }
}
for (const f of fails) console.log(f);
console.log(`golden: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
