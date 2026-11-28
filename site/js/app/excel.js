// 訴訟費用額計算機（Web 版）― Excel の作成（ブラウザの中で作ってダウンロードする。どこにも送らない）
//   ひな形（4 シート）を JSZip（MIT。site/vendor/）で開き、
//   表（tblHeader・tblDecree・tblSheet2・tblBreak）に行を書き込む。
//   書き込む値は退避 JSON の decree・sheet2・breakdown と同じもの。
//   2026-11-24 ユーザー: 1 枚目の処分書（申立書）は Word で作る（site/js/app/word.js）。Excel からは処分書シートを外し、
//   計算書・内訳・データの 3 シートにする。
(function (g) {
  'use strict';
  const SH = g.SH, A = SH.App;

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colName = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  // セル（文字は inlineStr、数は数値。空は書式だけのセル）
  function cell(ref, v, style) {
    const s = style != null ? ' s="' + style + '"' : '';
    if (v == null || v === '') return '<c r="' + ref + '"' + s + '/>';
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + s + '><v>' + v + '</v></c>';
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  }
  function rowXml(r, values, styles, attrs) {
    return '<row r="' + r + '"' + (attrs || '') + '>' + values.map((v, i) => cell(colName(i + 1) + r, v, styles ? styles[i] : null)).join('') + '</row>';
  }
  // 行を足す（足す行はどれも既存の行より下にある）
  function appendRows(xml, rowsXml, lastRow, lastCol) {
    xml = xml.replace('</sheetData>', rowsXml.join('') + '</sheetData>');
    return xml.replace(/<dimension ref="[^"]*"\s*\/>/, '<dimension ref="A1:' + lastCol + lastRow + '"/>');
  }
  const setTableRef = (xml, ref) => xml.replace(/(<table [^>]*ref=")[^"]*"/, '$1' + ref + '"').replace(/(<autoFilter ref=")[^"]*"/, '$1' + ref + '"');

  // 処分日・申立日（和暦・全角。元号は「令和」）
  function wareki(dateStr) {
    const n = SH.dayOf(dateStr) != null ? SH.dayOf(dateStr) : SH.dayOf(SH.UI.todayStr());
    const d = new Date(n * 864e5);
    const s = '令和' + (d.getUTCFullYear() - 2018) + '年' + (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日';
    return s.replace(/[0-9]/g, (c) => '０１２３４５６７８９'[+c]);
  }
  // 処分書の当事者欄（申立人 → 相手方。住所の次の行に「申立人　氏名」。その他は出さない）
  //   2026-11-24 ユーザー: STEP 2 で入れた限度で、代表者・法定代理人・代理人も載せる。書き方は
  //     法定代理人（法人の代表者を含む）… 当事者ごとに、その当事者の次に「同代表者　●●」（共通でも当事者ごとに繰り返す）
  //     代理人（訴訟代理人）……………… 1 名だけを代理するならその当事者の次に「同代理人弁護士　●●」、
  //                                      2 名以上に共通なら、そのうち最後の当事者の次に 1 回「上記２名代理人弁護士　●●」
  //   確定処分は本案の手続ではないので、目録では「訴訟代理人」でなく「代理人」と書く。
  //   肩書きは STEP 2 の「書面での肩書き」（空欄なら区分から決める）
  const DEFAULT_TITLE = { '親権者': '法定代理人親権者', 'その他の法定代理人等': '法定代理人', '訴訟代理人': '代理人弁護士' };
  A.attendeeTitle = (a) => (a.title && a.title.trim()) || DEFAULT_TITLE[a.kind] || a.kind;
  const zen = (n) => String(n).replace(/[0-9]/g, (c) => '０１２３４５６７８９'[+c]);
  A.partyLines = function (s) {
    const out = [];
    for (const kind of ['申立人', '相手方']) {
      const pts = s.parties.filter((p) => p.kind === kind);
      const reps = s.attendees.filter((a) => a.name && a.parties.some((id) => pts.some((p) => p.id === id)))
        .sort((x, y) => (x.kind === '訴訟代理人') - (y.kind === '訴訟代理人') || x.id - y.id);
      for (const pt of pts) {
        if (pt.address) out.push({ type: 'addr', text: pt.address });
        out.push({ type: 'party', text: kind + '　' + (pt.name || '') });
        for (const a of reps) {
          const mine = pts.filter((p) => a.parties.includes(p.id));
          if (!mine.includes(pt)) continue;
          const legal = a.kind !== '訴訟代理人';
          if (legal || mine.length === 1) out.push({ type: 'rep', text: '同' + A.attendeeTitle(a) + '　' + a.name });
          else if (mine[mine.length - 1] === pt) out.push({ type: 'rep', text: '上記' + zen(mine.length) + '名' + A.attendeeTitle(a) + '　' + a.name });
        }
      }
    }
    return out;
  };
  function ptyBlock(s) { return A.partyLines(s).map((l) => l.text).join('\n'); }
  const caseNoBase = (s) => s.instances.map((i) => i.caseNo).join('、');

  // ---- 内訳 ----------------------------------------------
  A.buildBreakdown = function (s, out) {
    const c = out.case, r = out.result;
    const label = (id) => SH.partyLabel(c, id);
    const poolName = (id) => { const p = c.Pools.find((x) => x.Id === id); return p ? p.Name : ''; };
    const rows = [];
    // 1. 費用の明細・小計・合計（画面の費用計算書と同じもの）
    const cs = [];
    for (const pl of c.Pools) for (const pt of c.Parties) {
      for (const rw of r.ExpandedCosts.filter((x) => x.PoolId === pl.Id && x.PartyId === pt.Id)) {
        cs.push({ PoolId: pl.Id, PartyId: pt.Id, PoolName: pl.Name, ItemNo: rw.AppCost ? 50 + rw.Item : rw.Item, SegNo: rw.SegNo || 1,
                  ItemName: SH.ITEM_NAMES[rw.Item], Label: (rw.Label || '') + (rw.Shared ? (rw.Label ? '・共同支出の振り分け' : '共同支出の振り分け') : ''),
                  Amount: rw.Amount, AppCost: !!rw.AppCost, IsSubtotal: false });
      }
    }
    const keys = [];
    for (const x of cs) if (!keys.some((k) => k.PoolId === x.PoolId && k.PartyId === x.PartyId)) keys.push({ PoolId: x.PoolId, PartyId: x.PartyId, PoolName: x.PoolName });
    const subs = [];
    for (const k of keys) {
      const grp = cs.filter((x) => x.PoolId === k.PoolId && x.PartyId === k.PartyId);
      const pt = c.Parties.find((p) => p.Id === k.PartyId);
      const note = pt && pt.Kind === 'その他' ? '申立人・相手方でないため計上せず'
        : c.Options.OpponentMode !== 'none' && c.Options.OpponentIds.includes(k.PartyId) ? '不計上モードにより計上せず' : '';
      const main = grp.filter((x) => !x.AppCost).reduce((t, x) => t + x.Amount, 0), app = grp.filter((x) => x.AppCost).reduce((t, x) => t + x.Amount, 0);
      const base = { PoolId: k.PoolId, PartyId: k.PartyId, PoolName: k.PoolName, SegNo: 0, IsSubtotal: true };
      if (!grp.some((x) => x.AppCost)) subs.push(Object.assign({ ItemNo: 99, ItemName: '小計', Label: note, Amount: main, AppCost: false }, base));
      else subs.push(Object.assign({ ItemNo: 49, ItemName: '小計（本案の費用）', Label: '', Amount: main, AppCost: false }, base),
                     Object.assign({ ItemNo: 98, ItemName: '小計（申立ての費用）', Label: '', Amount: app, AppCost: true }, base),
                     Object.assign({ ItemNo: 99, ItemName: '合計', Label: note, Amount: main + app, AppCost: false }, base));
    }
    for (const x of cs.concat(subs)) {
      rows.push({ seq: 1000000000 + ((x.PoolId * 100 + x.PartyId) * 100 + x.ItemNo) * 100 + x.SegNo, kind: 'cost', pool: x.PoolName, party: label(x.PartyId),
                  no: x.IsSubtotal ? '' : String(x.ItemNo > 50 ? x.ItemNo - 50 : x.ItemNo), itemName: x.ItemName, text: x.Label, amount: x.Amount,
                  hdate: '', who: '', status: '', km: null, days: null, nights: null, note: !x.IsSubtotal && x.AppCost ? '申立ての費用' : '' });
    }
    // 2. 4号・5号の期日ごとの明細
    const hr = A.hearingRun(s).result;
    for (const h of hr.Rows) {
      const payers = h.Payers.map(label).join('・');
      rows.push({ seq: 2000000000 + h.HearingId * 100000 + h.Item * 1000 + (h.SubjectKind === 'party' ? 0 : 500) + h.SubjectId, kind: 'hearing',
                  pool: poolName(h.PoolId), party: payers, no: String(h.Item), itemName: SH.ITEM_NAMES[h.Item],
                  text: h.HKind + ' 第' + h.HNo + '回　日当' + SH.yen(h.Daily) + '円／旅費' + SH.yen(h.Fare) + '円／宿泊料' + SH.yen(h.Lodge) + '円',
                  amount: h.Gross, hdate: SH.dayStr(h.HDate, '/'), who: payers + h.Role, status: h.Status, km: h.Km, days: h.Days, nights: h.Nights, note: h.Dropped || '' });
    }
    // 3. 欠席
    for (const ab of s.attendance.filter((a) => a.status === '欠席')) {
      const hh = s.hearings.find((x) => x.id === ab.hearingId);
      if (!hh) continue;
      let nm, rl;
      if (ab.subjectKind === 'party') { nm = label(ab.subjectId); rl = '本人'; }
      else { const at = s.attendees.find((x) => x.id === ab.subjectId); nm = at ? at.parties.map(label).join('・') : ''; rl = at ? at.kind : ''; }
      rows.push({ seq: 3000000000 + ab.hearingId * 100000 + (ab.subjectKind === 'party' ? 0 : 500) + ab.subjectId, kind: 'absent', pool: '', party: '', no: '',
                  itemName: '', text: hh.kind, amount: null, hdate: hh.date.replace(/-/g, '/'), who: nm + rl, status: '欠席', km: null, days: null, nights: null,
                  note: '欠席のため計上せず' });
    }
    return rows.map((x, i) => [x, i]).sort((a, b) => (a[0].seq - b[0].seq) || (a[1] - b[1])).map((x) => x[0]);
  };

  // ---- 書面の頭書きの値（tblHeader） ---------------------------------------
  A.docHead = function (kind) {
    const s = A.state, hd = s.header, applicant = kind === 'applicant';
    return { CaseNoMo: applicant ? '' : hd.caseNoMo, CaseNoBase: caseNoBase(s), CourtName: hd.courtName, Division: hd.division,
             Clerk: applicant ? '' : hd.clerk, IssueDay: wareki(hd.issueDay), PtyBlock: ptyBlock(s) };
  };
  // 申立書に付ける費用計算書は、申立人の費用の明細だけ
  A.applicantSheet2 = function (sheet2) {
    const app = new Set(A.state.parties.filter((p) => p.kind === '申立人').map((p) => p.id));
    return sheet2.filter((x) => app.has(x.partyId) && ['head', 'item', 'sub', 'total'].includes(x.kind));
  };

  // ---- ブックを作る --------------------------------------------------------------------
  //   kind: 'clerk'（計算書・内訳・データ）／'applicant'（費用計算書・内訳・データ）
  A.makeExcel = async function (kind) {
    if (typeof g.JSZip !== 'function') throw new Error('Excel を作る部品（JSZip）が読み込めていません');
    if (!A.outFresh()) throw new Error('STEP 9 で計算し直してください');
    const J = A.outForJSON();
    const bin = Uint8Array.from(atob(SH.TEMPLATE_XLSX), (c) => c.charCodeAt(0));
    const zip = await g.JSZip.loadAsync(bin);
    const P = { sheet2: 'xl/worksheets/sheet2.xml', sheet3: 'xl/worksheets/sheet3.xml', sheet4: 'xl/worksheets/sheet4.xml',
                t1: 'xl/tables/table1.xml', t2: 'xl/tables/table2.xml', t4: 'xl/tables/table4.xml', wb: 'xl/workbook.xml',
                rels: 'xl/_rels/workbook.xml.rels', ct: '[Content_Types].xml' };
    const X = {};
    for (const [k, p] of Object.entries(P)) X[k] = await zip.file(p).async('string');

    const applicant = kind === 'applicant';
    const head = A.docHead(kind);
    const decree = J.decree;   // [{no, text}]（「ない」の文は no 0）
    const sheet2 = applicant ? A.applicantSheet2(J.sheet2) : J.sheet2;

    // データ（tblHeader の 1 行・tblDecree）。処分書は Word にしたが、値の控えとして残す
    const hv = ['1', head.CaseNoMo, head.CaseNoBase, head.CourtName, head.Division, head.Clerk, head.IssueDay, head.PtyBlock];
    X.sheet4 = X.sheet4.replace(/<row r="2"[^>]*>[\s\S]*?<\/row>/, '<row r="2">' + hv.map((v, i) => cell(colName(i + 1) + '2', i === 0 ? 1 : v)).join('') + '</row>');
    const drows = decree.map((d, i) => '<row r="' + (3 + i) + '">' + cell('N' + (3 + i), d.no) + cell('O' + (3 + i), d.text) + '</row>');
    X.sheet4 = appendRows(X.sheet4, drows, Math.max(2, 2 + decree.length), 'O');
    X.t4 = setTableRef(X.t4, 'N1:O' + (2 + decree.length));

    // 計算書（tblSheet2。番号・摘要・金額・根拠条文・括弧）
    const srows = sheet2.map((x, i) => rowXml(6 + i, [x.no ? x.no : '', x.text, x.amount == null ? '' : x.amount, x.note || '', x.paren ? 1 : 0], [6, 6, 7, 6, 6]));
    X.sheet2 = appendRows(X.sheet2, srows, 5 + sheet2.length, 'E');
    X.t1 = setTableRef(X.t1, 'A4:E' + (5 + sheet2.length));
    if (applicant) X.sheet2 = X.sheet2.replace('<t>計　算　書</t>', '<t>費　用　計　算　書</t>');

    // 内訳（tblBreak）
    const bk = J.breakdown;
    const brows = bk.map((x, i) => rowXml(3 + i, [x.pool, x.party, x.no, x.itemName, x.text, x.amount == null ? '' : x.amount, x.hdate, x.who, x.status,
      x.km == null ? '' : x.km, x.days == null ? '' : x.days, x.nights == null ? '' : x.nights, x.note], [6, 6, 6, 6, 6, 7, 6, 6, 6, 6, 6, 6, 6]));
    X.sheet3 = appendRows(X.sheet3, brows, 2 + bk.length, 'M');
    X.t2 = setTableRef(X.t2, 'A1:M' + (2 + bk.length));

    // 処分書シートを外す（シート・関係・種類・印刷範囲。印刷範囲の localSheetId は 1 つずつ前へ）
    X.wb = X.wb.replace(/<sheet name="処分書"[^>]*\/>/, '')
      .replace(/<definedName name="_xlnm\.Print_Area" localSheetId="0">[^<]*<\/definedName>/, '')
      .replace(/localSheetId="(\d+)"/g, (m, n) => 'localSheetId="' + (Number(n) - 1) + '"');
    if (applicant) X.wb = X.wb.replace('name="計算書"', 'name="費用計算書"').replace("'計算書'!$A$1:$C$500", "'費用計算書'!$A$1:$C$500");
    X.rels = X.rels.replace(/<Relationship [^>]*Target="\/xl\/worksheets\/sheet1\.xml"[^>]*\/>/, '');
    X.ct = X.ct.replace(/<Override PartName="\/xl\/worksheets\/sheet1\.xml"[^>]*\/>/, '');
    zip.remove('xl/worksheets/sheet1.xml');
    for (const [k, p] of Object.entries(P)) zip.file(p, X[k]);
    // 文書のプロパティ（作成者などは空にする）
    const core = await zip.file('docProps/core.xml').async('string');
    zip.file('docProps/core.xml', core.replace(/<dc:creator>[^<]*<\/dc:creator>/, '<dc:creator></dc:creator>').replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, ''));
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
    const name = A.baseName() + (applicant ? '_費用計算書.xlsx' : '_計算書.xlsx');
    return { name, blob };
  };

  A._excelTest = { wareki, ptyBlock };
})(typeof globalThis !== 'undefined' ? globalThis : this);
