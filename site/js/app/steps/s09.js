// STEP 9 計算結果 ― ［計算する］で計算し、主文（ドラフト）・回収上限額・費用計算書・計算過程・検算と警告を出す
(function (g) {
  'use strict';
  const SH = g.SH, A = SH.App;
  const { h, button, radios } = SH.UI;

  // 計算。結果は A.out に置く（入力が変わったかは sig で見る）
  A.calculate = function () {
    const s = A.state;
    A.syncHearings();
    const c = A.engineCase(s);
    const r = SH.calculate(c);
    const out = { sig: A.calcSig(s), case: c, result: r, decree: SH.getDecree(c, r), sheet2: SH.getSheet2(c, r), subtotals: SH.getCostSubtotals(c, r) };
    out.breakdown = A.buildBreakdown ? A.buildBreakdown(s, out) : [];
    A.out = out;
    return out;
  };
  A.outFresh = () => !!A.out && A.out.sig === A.calcSig(A.state);
  // 退避 JSON に添える形（decree・sheet2・breakdown）
  A.outForJSON = function () {
    if (!A.outFresh()) return {};
    const o = A.out;
    const nd = o.decree.length >= 2;
    return {
      // 「支払うべき訴訟費用額はない」は No 0（処分書では番号を付けない）
      decree: o.decree.map((t, i) => ({ no: o.result.Debts.length === 0 ? 0 : i + 1, text: nd ? t.replace(/^\d+　/, '') : t })),
      sheet2: o.sheet2.map((x) => ({ seq: x.Seq, kind: x.Kind, no: x.No, text: x.Text, amount: x.Amount, paren: x.Paren, partyId: x.PartyId, note: x.Note })),
      breakdown: o.breakdown || []
    };
  };

  const nameRe = /当事者(\d+)/g;
  A.STEPS[9] = {
    render(root) {
      const s = A.state;
      const o = A.out;
      const fresh = A.outFresh();
      const r = o ? o.result : null;
      const nm = (id) => A.partyName(s, id);
      const head = h('section', { class: 'card' },
        h('div', { class: 'row' },
          button('計算する', () => { A.calculate(); A.changed(); }, { class: 'primary big', fid: 'calc' }),
          r ? h('span', { class: r.Errors.length ? 'status err' : r.Diffs.length ? 'status warn' : 'status ok' },
            '主文に掲げる債務 ' + r.Debts.length + ' 件／主文に掲げない債務 ' + r.NotOrdered.length + ' 件／検算差額 ' + r.Diffs.length + ' 件／警告 ' + r.Warnings.length + ' 件／エラー ' + r.Errors.length + ' 件') : null),
        o && !fresh ? h('p', { class: 'err' }, '計算した後に入力が変わっています。［計算する］を押し直してください。') : null,
        !o ? h('p', { class: 'hint' }, '入力から償還すべき額を計算します。STEP 1〜8 のどこかを直したら、必ず［計算する］を押し直してください。') : null);
      root.append(head);
      if (!o) return;

      const tab = A.view.tab9 || '費用計算書';
      const decree = h('section', { class: 'card' },
        h('h2', null, A.isApplicant() ? '処分の見込み（主文案）' : '主文（ドラフト）'),
        h('ol', { class: 'decree' + (o.decree.length < 2 ? ' single' : '') }, o.decree.map((t) => h('li', null, t.replace(/^\d+　/, '')))),
        h('h3', null, '回収上限額（連帯部分を重複して数えない実際の上限）'),
        r.Cap.size === 0 ? h('p', { class: 'sub' }, 'なし') :
        h('table', { class: 'grid' }, h('tbody', null, [...r.Cap.keys()].sort(SH.numSort).map((k) => h('tr', null, h('td', null, nm(k)), h('td', { class: 'num' }, SH.UI.yen(r.Cap.get(k)) + '円'))))),
        h('p', { class: 'hint' }, '当事者は立場（申立人・相手方）で書きます。同じ立場の者が 2 人以上いるときだけ名称を続けます。主文に掲げるのは、相手方が申立人に支払う債務だけです。民訴法71条1項・3項／書実研15号 92頁、108頁、110〜111頁'));

      let pane;
      if (tab === '費用計算書') pane = costSheet(s, o);
      else if (tab === '計算過程') {
        const lines = [];
        for (const a of r.Attribution) for (const m of [...a.Alloc.keys()].sort(SH.numSort)) lines.push('分属: ' + nm(a.Party) + ' → ' + nm(m) + ' ' + SH.UI.yen(a.Alloc.get(m)) + '円（' + SH.ITEM_NAMES[a.Item] + '）');
        for (const k of [...r.BaseAmounts.keys()].sort(SH.psStringCompare)) { const [rid, pid] = k.split('|').map(Number); lines.push('基礎額: 条項' + rid + ' × ' + nm(pid) + ' = ' + SH.UI.yen(r.BaseAmounts.get(k)) + '円'); }
        for (const t of r.OffsetLog) lines.push(t.replace(/相殺 \((\d+),(\d+)\)/, (m, a, b) => '相殺（' + nm(+a) + '・' + nm(+b) + '）').replace(/債権者(\d+) 債務者(\d+)/, (m, a, b) => '債権者 ' + nm(+a) + ' / 債務者 ' + nm(+b)));
        for (const d of r.NotOrdered) lines.push('主文に掲げない額（相殺の限度で考慮済み。残額はその者の申立てによる）: ' + d.Obligors.map(nm).join('・') + ' → ' + nm(d.Creditor) + ' ' + SH.UI.yen(d.Amount) + '円');
        for (const t of r.Notes) lines.push('注記: ' + t);
        pane = h('div', null, lines.length ? h('ul', { class: 'process' }, lines.map((t) => h('li', null, t))) : h('p', { class: 'sub' }, '表示するものはありません。'),
          h('p', { class: 'hint' }, '相殺は債務者ごとに行い、同じ 2 人の間に単独債務と連帯債務の持ち分があるときは、単独債務から先に引きます。案分額そのものは計算書の「案分計算」の行で確かめます。'));
      } else {
        const items = r.Errors.map((t) => ({ t: '【エラー】' + t, c: 'err' })).concat(r.Diffs.map((t) => ({ t: '【検算差額】' + t, c: 'warn' })), r.Warnings.map((t) => ({ t: '【警告】' + t, c: '' })));
        pane = h('div', null, items.length ? h('ul', { class: 'issues' }, items.map((x) => h('li', { class: x.c }, x.t.replace(nameRe, (m, id) => (A.partyOf(s, +id) ? nm(+id) : m))))) : h('p', { class: 'ok' }, 'エラー・検算差額・警告はありません。'),
          h('p', { class: 'hint' }, 'アプリは端数を寄せ直しません。検算差額があるときは、どの額で定めるかを判断してください（書実研15号 88頁）。'));
      }
      const right = h('section', { class: 'card' },
        radios('tab9', ['費用計算書', '計算過程', '検算・警告'], tab, (v) => { A.view.tab9 = v; A.changed(); }), pane);
      root.append(h('div', { class: 'cols' }, decree, right));
    },
    validate() {
      if (!A.out) return '［計算する］を押してください';
      if (!A.outFresh()) return '入力が変わっています。［計算する］を押し直してください';
      if (A.out.result.Errors.length) return 'エラーがあります（「検算・警告」を確認してください）';
      return '';
    }
  };

  function costSheet(s, o) {
    const rows = [];
    const ex = o.result.ExpandedCosts;
    for (const pl of o.case.Pools) {
      for (const pt of o.case.Parties) {
        const pr = ex.filter((x) => x.PoolId === pl.Id && x.PartyId === pt.Id);
        if (!pr.length) continue;
        const outsider = pt.Kind === 'その他';
        const excluded = o.case.Options.OpponentMode !== 'none' && o.case.Options.OpponentIds.includes(pt.Id);
        const note = outsider ? '　← 申立人・相手方でないため計上せず' : excluded ? '　← 不計上モードにより計上せず' : '';
        const sub = o.subtotals.filter((x) => x.PoolId === pl.Id && x.PartyId === pt.Id);
        const who = pl.Name + ' / ' + pt.Name;
        const line = (x) => rows.push(h('tr', null, h('td', null, who), h('td', null, (x.Label || SH.ITEM_NAMES[x.Item]) + (x.Shared ? '（共同支出の振り分け）' : '')), h('td', { class: 'num' }, SH.UI.yen(x.Amount))));
        const subl = (x, n) => rows.push(h('tr', { class: 'subtotal' }, h('td', null, who), h('td', null, x.Name + (n || '')), h('td', { class: 'num' }, SH.UI.yen(x.Amount))));
        const main = pr.filter((x) => !x.AppCost).sort((a, b) => a.Item - b.Item), app = pr.filter((x) => x.AppCost).sort((a, b) => a.Item - b.Item);
        main.forEach(line);
        if (!app.length) subl(sub[0], note);
        else { subl(sub[0]); app.forEach(line); subl(sub[1]); subl(sub[2], note); }
      }
    }
    return h('div', null, h('table', { class: 'grid sheet' }, h('thead', null, h('tr', null, ['費用区分 / 当事者', '摘要', '金額'].map((t) => h('th', null, t)))), h('tbody', null, rows)),
      h('p', { class: 'hint' }, '画面では当事者を名称で、1号の摘要を「手数料」で出します。Excel の計算書では立場で書き、1号は「訴え提起手数料」などになります。'));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
