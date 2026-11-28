// Excel のひな形（tools/template/ の xlsx）を site/js/data/template.js に埋め込む
//   node tools/build-template.mjs [ひな形.xlsx]   既定は tools/template/訴訟費用額確定処分_テンプレート.xlsx
//   ファイルを開くだけで動くように（file://）、fetch で読まずに JS の文字列（base64）にする
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const src = process.argv[2] || fileURLToPath(new URL('./template/訴訟費用額確定処分_テンプレート.xlsx', import.meta.url));
const b64 = fs.readFileSync(src).toString('base64');
const out = '// Excel のひな形（処分書・計算書・内訳・データの 4 シート）。tools/template/ の xlsx を base64 にしたもの\n' +
  '// 手で直さないこと（tools/build-template.mjs で作り直す）\n' +
  "(function (g) { 'use strict'; (g.SH = g.SH || {}).TEMPLATE_XLSX = '" + b64 + "';\n})(typeof globalThis !== 'undefined' ? globalThis : this);\n";
fs.writeFileSync(new URL('../site/js/data/template.js', import.meta.url), out);
console.log('site/js/data/template.js: ' + b64.length + ' 文字');
