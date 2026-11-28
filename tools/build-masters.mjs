// マスタの CSV（data/masters/。メンテ用）から、処理用の JS とテスト用の JSON を作る
//   node tools/build-masters.mjs           CSV → site/js/data/masters.js・tests/fixtures/masters.json
//   node tools/build-masters.mjs --check   作り直さずに、JS・JSON が CSV と同じかだけを確かめる（違えば終了コード 1）
//   node tools/build-masters.mjs --from-js JS → CSV（JS を直接直してしまったときの書き戻し用。ふだんは使わない）
import fs from 'node:fs';
import path from 'node:path';
import { readCsvMasters, writeCsvMasters, jsText, readJsMasters, JS_PATH, FIXTURE_PATH, DIR, ROOT } from './masters-csv.mjs';

const rel = (p) => path.relative(ROOT, p);
const mode = process.argv[2] || '';
try {
  if (mode === '--from-js') {
    const m = readJsMasters();
    writeCsvMasters(m);
    console.log(rel(DIR) + '/ に書き出しました（単価 ' + m.rates.length + ' 行・簡裁 ' + m.courts.length + ' 庁・版 ' + m.version + '）');
  } else {
    const m = readCsvMasters();
    const js = jsText(m), json = JSON.stringify(m, null, 2) + '\n';
    if (mode === '--check') {
      const bad = [];
      if (fs.readFileSync(JS_PATH, 'utf8') !== js) bad.push(rel(JS_PATH));
      if (JSON.stringify(JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8').replace(/^\uFEFF/, ''))) !== JSON.stringify(m)) bad.push(rel(FIXTURE_PATH));
      if (bad.length) { console.error('CSV と同期していません: ' + bad.join('、') + '\n→ node tools/build-masters.mjs で作り直してください'); process.exit(1); }
      console.log('マスタは CSV と同期しています（単価 ' + m.rates.length + ' 行・簡裁 ' + m.courts.length + ' 庁・版 ' + m.version + '）');
    } else {
      fs.writeFileSync(JS_PATH, js);
      fs.writeFileSync(FIXTURE_PATH, json);
      console.log(rel(JS_PATH) + '・' + rel(FIXTURE_PATH) + ' を作りました（単価 ' + m.rates.length + ' 行・簡裁 ' + m.courts.length + ' 庁・版 ' + m.version + '）');
    }
  }
} catch (e) {
  console.error('エラー: ' + e.message);
  process.exit(1);
}
