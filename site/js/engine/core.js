// 訴訟費用額計算機（Web 版）― 計算エンジンの共通部品
// 参照実装 engine/CostEngine.ps1（PowerShell）の丸め・補助関数を移したもの。
// ファイルを開くだけで動くように（file://）、モジュールにせず名前空間 SH に載せる。
(function (g) {
  'use strict';
  const SH = (g.SH = g.SH || {});

  // .NET の Math.Round(x, 6)（既定は偶数丸め）と同じ
  function round6(x) {
    const s = x * 1e6;
    const f = Math.floor(s);
    const d = s - f;
    let r;
    if (d > 0.5) r = f + 1;
    else if (d < 0.5) r = f;
    else r = (f % 2 === 0) ? f : f + 1;
    return r / 1e6;
  }
  // 1円未満を四捨五入。先に小数6桁にそろえる（浮動小数点の誤差で x.5 が x.4999… になるのを防ぐ。参照実装のテスト TC-23）
  function roundYen(x) {
    const v = round6(x);
    return v < 0 ? -Math.floor(-v + 0.5) : Math.floor(v + 0.5);
  }
  // 国等の端数（国等の債権債務等の金額の端数計算に関する法律2条）
  function roundYenGov(x, credGov, debtGov) {
    if (!(credGov || debtGov)) return roundYen(x);
    const r = round6(x);
    if (debtGov && !credGov && r > 0 && r < 1) return 1;
    return Math.floor(r);
  }

  // 任意の項目を読む（無い・null なら既定値）
  function prop(o, name, def) {
    if (o != null && Object.prototype.hasOwnProperty.call(o, name) && o[name] != null) return o[name];
    return def;
  }
  const toInt = (v) => {
    const n = Number(v);
    if (!isFinite(n)) return 0;
    // PowerShell の [int] は偶数丸め
    const f = Math.floor(n), d = n - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return (f % 2 === 0) ? f : f + 1;
  };
  const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const numSort = (a, b) => a - b;
  const uniq = (xs) => { const out = []; for (const x of xs) if (!out.includes(x)) out.push(x); return out; };
  const sortedUniqNums = (xs) => uniq(xs).sort(numSort);

  // 3 桁区切り（'{0:N0}'）
  function yen(n) {
    const s = String(Math.abs(Math.trunc(n)));
    const t = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-' : '') + t;
  }

  // PowerShell の Sort-Object が文字列に使う比較（ICU。記号は数字より前で、- : + > | の順）。
  // エンジンの中の鍵（「当事者|区分|号|関係」「1+2->3:金額」）を並べるのに使う。
  function psStringCompare(a, b) {
    const key = (s) => s.replace(/-/g, '\u0001').replace(/:/g, '\u0002').replace(/\+/g, '\u0003').replace(/>/g, '\u0004').replace(/\|/g, '\u0005');
    const x = key(a), y = key(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }

  // 日付は「日の番号」（1970-01-01 からの日数）で持つ
  function dayOf(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const m = String(v).match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (!m) return null;
    return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5);
  }
  function dayStr(n, sep) {
    const d = new Date(n * 864e5);
    const p = (x) => String(x).padStart(2, '0');
    sep = sep || '-';
    return d.getUTCFullYear() + sep + p(d.getUTCMonth() + 1) + sep + p(d.getUTCDate());
  }
  const OPEN_END = dayOf('9999-12-31');

  Object.assign(SH, { round6, roundYen, roundYenGov, prop, toInt, asArray, numSort, uniq, sortedUniqNums, yen,
                      psStringCompare, dayOf, dayStr, OPEN_END });
})(typeof globalThis !== 'undefined' ? globalThis : this);
