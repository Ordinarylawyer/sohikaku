// マスタの CSV（メンテ用）と、JS に埋め込むデータ（処理用）の相互変換。tools/build-masters.mjs と tests/masters.mjs が使う
//   CSV は UTF-8（BOM 付き。Excel でそのまま開ける）。1 行目は日本語の列名。空欄＝値なし（null）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIR = path.join(ROOT, 'data', 'masters');
export const FILES = { version: 'version.txt', rates: '単価マスタ.csv', courts: '簡易裁判所マスタ.csv' };
export const JS_PATH = path.join(ROOT, 'site', 'js', 'data', 'masters.js');
export const FIXTURE_PATH = path.join(ROOT, 'tests', 'fixtures', 'masters.json');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// 列の定義: [CSV の列名, JS のキー, 型]
//   text＝文字（必須）／text?＝文字（空欄可）／date・date?＝yyyy-mm-dd／int＝整数／num＝数／bool＝「はい」か空欄
export const COLUMNS = {
  rates: [
    ['項目コード', 'ItemCode', 'text'], ['項目名', 'ItemName', 'text'], ['施行日', 'EffectiveDate', 'date'],
    ['金額', 'Amount', 'int'], ['廃止日', 'AbolishedDate', 'date?'], ['申立日基準', 'FilingBasis', 'bool']
  ],
  courts: [
    ['簡易裁判所', 'Court', 'text'], ['地方裁判所・家庭裁判所', 'DistFam', 'text?'], ['高等裁判所', 'High', 'text?'],
    ['所在地', 'Addr', 'text'], ['緯度', 'Lat', 'num'], ['経度', 'Lon', 'num']
  ]
};

// ---- CSV の読み書き（RFC 4180。引用符・カンマ・改行を含む値に対応） ----
export function parseCsv(text) {
  const s = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\r') { /* CRLF の CR は捨てる */ }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (q) throw new Error('引用符（"）が閉じていません');
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));   // 空行は無視
}
const cell = (v) => /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
export const toCsv = (rows) => '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

// ---- 値の変換 ----
function fromCell(v, type, where) {
  const t = v.trim();
  const opt = type.endsWith('?'); const base = type.replace('?', '');
  if (t === '') {
    if (base === 'bool') return false;
    if (opt) return null;
    throw new Error(where + ': 空欄にできません');
  }
  switch (base) {
    case 'text': return t;
    case 'date': if (!DATE.test(t) || isNaN(Date.parse(t + 'T00:00:00Z'))) throw new Error(where + ': 日付は yyyy-mm-dd で書いてください（' + t + '）'); return t;
    case 'int': if (!/^-?\d+$/.test(t)) throw new Error(where + ': 整数で書いてください（' + t + '）'); return Number(t);
    case 'num': if (!/^-?\d+(\.\d+)?$/.test(t)) throw new Error(where + ': 数で書いてください（' + t + '）'); return Number(t);
    case 'bool': if (t === 'はい') return true; if (t === 'いいえ') return false; throw new Error(where + ': 「はい」か空欄にしてください（' + t + '）');
  }
  throw new Error('不明な型 ' + type);
}
function toCell(v, type) {
  if (type.startsWith('bool')) return v ? 'はい' : '';
  if (v === null || v === undefined) return '';
  return String(v);   // 数は JS の既定の表記（往復しても同じ値になる）
}

// ---- CSV → マスタ ----
export function readCsvMasters(dir = DIR) {
  const version = fs.readFileSync(path.join(dir, FILES.version), 'utf8').replace(/^\uFEFF/, '').trim();
  if (!DATE.test(version)) throw new Error(FILES.version + ': 版は yyyy-mm-dd で書いてください（' + version + '）');
  const out = { version };
  for (const key of ['rates', 'courts']) {
    const file = FILES[key], cols = COLUMNS[key];
    const rows = parseCsv(fs.readFileSync(path.join(dir, file), 'utf8'));
    const head = rows.shift() || [];
    const want = cols.map((c) => c[0]);
    if (head.join(',') !== want.join(',')) throw new Error(file + ': 1 行目の列名が違います。正しくは ' + want.join(','));
    out[key] = rows.map((r, i) => {
      const where = file + ' ' + (i + 2) + ' 行目';
      if (r.length !== cols.length) throw new Error(where + ': 列の数が ' + r.length + '（正しくは ' + cols.length + '）');
      return Object.fromEntries(cols.map(([name, k, type], j) => [k, fromCell(r[j], type, where + '「' + name + '」')]));
    });
  }
  check(out);
  return out;
}
// 中身の確かめ（重複・前後関係）
function check(m) {
  const seen = new Set();
  for (const r of m.rates) {
    const k = r.ItemCode + '|' + r.EffectiveDate;
    if (seen.has(k)) throw new Error('単価マスタ: 「項目コード＋施行日」が重複しています（' + k.replace('|', '・') + '）');
    seen.add(k);
    if (r.AbolishedDate && r.AbolishedDate <= r.EffectiveDate) throw new Error('単価マスタ: 廃止日が施行日より前です（' + r.ItemCode + '・' + r.EffectiveDate + '）');
  }
  const names = new Set();
  for (const c of m.courts) {
    if (names.has(c.Court)) throw new Error('簡易裁判所マスタ: 庁名が重複しています（' + c.Court + '）');
    names.add(c.Court);
    if (c.Lat < 20 || c.Lat > 46 || c.Lon < 122 || c.Lon > 154) throw new Error('簡易裁判所マスタ: 緯度・経度が日本の範囲外です（' + c.Court + '）');
  }
}

// ---- マスタ → CSV ----
export function writeCsvMasters(m, dir = DIR) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, FILES.version), m.version + '\n');
  for (const key of ['rates', 'courts']) {
    const cols = COLUMNS[key];
    fs.writeFileSync(path.join(dir, FILES[key]),
      toCsv([cols.map((c) => c[0]), ...m[key].map((o) => cols.map(([, k, type]) => toCell(o[k], type)))]));
  }
}

// ---- JS（処理用） ----
export function jsText(m) {
  return '// 単価マスタ（' + m.rates.length + ' 行）と簡易裁判所マスタ（' + m.courts.length + ' 庁）\n' +
    '// 生成元: data/masters/ の CSV。手で直さないこと（CSV を直して node tools/build-masters.mjs で作り直す）\n' +
    "(function (g) { 'use strict'; (g.SH = g.SH || {}).MASTERS = " + JSON.stringify(m) + ";\n})(typeof globalThis !== 'undefined' ? globalThis : this);\n";
}
export function readJsMasters(p = JS_PATH) {
  const t = fs.readFileSync(p, 'utf8');
  const mm = t.match(/MASTERS = (\{.*\});\n/s);
  if (!mm) throw new Error(path.relative(ROOT, p) + ' の形が想定と違います');
  return JSON.parse(mm[1]);
}
