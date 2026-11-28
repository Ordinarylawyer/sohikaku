// 訴訟費用額計算機（Web 版）― 処分書・申立書の Word（.docx）を作る（ブラウザの中で作ってダウンロードする。どこにも送らない）
//   2026-11-24 ユーザー: Excel の 1 枚目（処分書・申立書）は Word のほうがよい（Web 版だけの対応）。
//   計算書・内訳は Excel（site/js/app/excel.js）。docx は JSZip（MIT。site/vendor/）で最小限の部品から組み立てる。
//   書式: A4 縦・ＭＳ 明朝 12pt・余白 上35mm 下27mm 左30mm 右20mm・1 頁 26 行（裁判文書の標準的な体裁にならう）
(function (g) {
  'use strict';
  const SH = g.SH, A = SH.App;

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const CH = 240;   // 1 字（12pt）の幅（twip）

  // 段落。o: { align: 'center'|'right', bold, size(pt), left(字), firstLine(字), hanging(字), right(字), keepNext }
  function p(text, o) {
    o = o || {};
    const ppr = [];
    if (o.keepNext) ppr.push('<w:keepNext/>');
    if (o.align) ppr.push('<w:jc w:val="' + (o.align === 'center' ? 'center' : 'right') + '"/>');
    const ind = [];
    if (o.left) ind.push('w:left="' + Math.round(o.left * CH) + '"');
    if (o.right) ind.push('w:right="' + Math.round(o.right * CH) + '"');
    if (o.firstLine) ind.push('w:firstLine="' + Math.round(o.firstLine * CH) + '"');
    if (o.hanging) ind.push('w:hanging="' + Math.round(o.hanging * CH) + '"');
    if (ind.length) ppr.push('<w:ind ' + ind.join(' ') + '/>');
    const rpr = (o.bold ? '<w:b/>' : '') + (o.size ? '<w:sz w:val="' + o.size * 2 + '"/><w:szCs w:val="' + o.size * 2 + '"/>' : '');
    const run = text ? '<w:r>' + (rpr ? '<w:rPr>' + rpr + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + esc(text) + '</w:t></w:r>' : '';
    return '<w:p>' + (ppr.length ? '<w:pPr>' + ppr.join('') + '</w:pPr>' : '') + run + '</w:p>';
  }
  const blank = () => p('');

  function documentXml(body) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<w:body>' + body.join('') +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1985" w:right="1134" w:bottom="1531" w:left="1701" w:header="851" w:footer="992" w:gutter="0"/>' +
      '<w:docGrid w:type="lines" w:linePitch="512"/></w:sectPr></w:body></w:document>';
  }
  const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults>' +
    '<w:rPrDefault><w:rPr><w:rFonts w:ascii="ＭＳ 明朝" w:eastAsia="ＭＳ 明朝" w:hAnsi="ＭＳ 明朝" w:cs="ＭＳ 明朝"/><w:kern w:val="2"/>' +
    '<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US" w:eastAsia="ja-JP" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:widowControl w:val="0"/><w:jc w:val="both"/><w:snapToGrid w:val="1"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="a"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>';
  const SETTINGS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="840"/>' +
    '<w:characterSpacingControl w:val="compressPunctuation"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';

  async function pack(body) {
    const zip = new g.JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>');
    zip.file('word/document.xml', documentXml(body));
    zip.file('word/styles.xml', STYLES);
    zip.file('word/settings.xml', SETTINGS);
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
  }

  // 当事者欄（住所の行・「申立人　氏名」の行・代表者・代理人の行。申立人 → 相手方。その他は出さない）
  function partyParas(s) {
    // 住所 → 「申立人　氏名」→ 代表者・代理人（excel.js の A.partyLines）
    return A.partyLines(s).map((l) => p(l.text, { left: l.type === 'addr' ? 2 : 4 }));
  }

  // 処分書（書実研15号 92頁の様式にならう）
  function dispositionBody(s, head, decree) {
    const b = [];
    if (head.CaseNoMo) b.push(p(head.CaseNoMo + '訴訟費用額確定処分申立事件'));
    if (head.CaseNoBase) b.push(p('（基本事件・' + head.CaseNoBase + '）'));
    b.push(blank(), p('訴 訟 費 用 額 確 定 処 分', { align: 'center', bold: true, size: 14 }), blank());
    b.push(...partyParas(s), blank());
    b.push(p('申立人から、標記の基本事件についての訴訟費用額確定処分の申立てがあったので、別紙計算書に基づき、次のとおり定める。', { firstLine: 1 }));
    b.push(blank(), p('主　　文', { align: 'center', bold: true, keepNext: true }), blank());
    const numbered = decree.length >= 2 && decree[0].no !== 0;
    for (const d of decree) {
      if (numbered) b.push(p(d.no + '　' + d.text, { left: 2, hanging: 2 }));
      else b.push(p(d.text, { firstLine: 1 }));
    }
    b.push(blank(), blank(), p(head.IssueDay, { left: 2 }));
    b.push(p(head.CourtName + head.Division, { left: 6 }));
    if (head.Clerk) b.push(p('裁判所書記官　' + head.Clerk, { left: 10 }));
    return b;
  }

  // 申立書（申立人・代理人が使うとき。一般的な申立書の形の下書き）
  function applicationBody(s, head, total) {
    const b = [];
    b.push(p('訴訟費用額確定処分申立書', { align: 'center', bold: true, size: 14 }), blank());
    b.push(p(head.IssueDay, { align: 'right' }));
    if (head.CourtName + head.Division) b.push(p(head.CourtName + head.Division + '　御中'));
    b.push(blank());
    if (s.header.signer) b.push(p(s.header.signer, { align: 'right' }));
    b.push(blank(), ...partyParas(s), blank());
    if (head.CaseNoBase) b.push(p('基本事件の表示　' + head.CaseNoBase), blank());
    b.push(p('申立ての趣旨', { align: 'center', bold: true, keepNext: true }));
    b.push(p('上記基本事件について、相手方が申立人に償還すべき訴訟費用額を定める処分を求める。', { firstLine: 1 }), blank());
    b.push(p('申立ての理由', { align: 'center', bold: true, keepNext: true }));
    b.push(p('１　上記基本事件について、訴訟費用の負担の裁判がされ、確定した。', { left: 1, hanging: 1 }));
    b.push(p('２　申立人が支出した訴訟費用の額は、別紙費用計算書のとおり、合計' + SH.yen(total) + '円である。', { left: 1, hanging: 1 }));
    b.push(p('３　よって、申立ての趣旨のとおりの処分を求める。', { left: 1, hanging: 1 }), blank());
    b.push(p('附　属　書　類', { align: 'center', bold: true, keepNext: true }));
    b.push(p('１　費用計算書　　１通', { left: 1 }));
    return b;
  }

  // kind: 'clerk'（処分書）／'applicant'（申立書）
  A.makeWord = async function (kind) {
    if (typeof g.JSZip !== 'function') throw new Error('Word を作る部品（JSZip）が読み込めていません');
    if (!A.outFresh()) throw new Error('STEP 9 で計算し直してください');
    const s = A.state, J = A.outForJSON();
    const head = A.docHead(kind);
    let body, name;
    if (kind === 'applicant') {
      const total = A.applicantSheet2(J.sheet2).filter((x) => x.kind === 'total').reduce((t, x) => t + (x.amount || 0), 0);
      body = applicationBody(s, head, total);
      name = A.baseName() + '_訴訟費用額確定処分申立書.docx';
    } else {
      body = dispositionBody(s, head, J.decree);
      name = A.baseName() + '_訴訟費用額確定処分.docx';
    }
    return { name, blob: await pack(body) };
  };
  A._wordTest = { p, dispositionBody, applicationBody };
})(typeof globalThis !== 'undefined' ? globalThis : this);
