// STEP 3 審級と費用区分 ― 審級（序列は追加した順）、費用区分、当事者ごとの費用区分、請求額（分属用）、半径500mの扱い
(function (g) {
  'use strict';
  const SH = g.SH, A = SH.App;
  const { h, textInput, numInput, select, checkbox, button, iconDel, toast, modal } = SH.UI;
  const INST_NAMES = ['第一審', '控訴審', '上告審', '原決定審', '異議審', '抗告審', '第一審（差戻後）', '差戻後控訴審'];
  const POOL_KINDS = ['附帯控訴', '附帯上告', '補助参加', '補助参加異議', 'その他'];
  const POOL_NAME = { '附帯控訴': '附帯控訴費用', '附帯上告': '附帯上告費用', '補助参加': '補助参加によって生じた費用', '補助参加異議': '補助参加についての異議によって生じた費用' };

  function curInst(s) {
    let i = A.instOf(s, A.view.inst);
    if (!i) { i = A.instSorted(s)[0]; A.view.inst = i ? i.id : null; }
    return i;
  }
  function setName(s, inst, name) {
    inst.name = name;
    const b = s.pools.find((p) => p.instanceId === inst.id && p.kind === '本体');
    if (b) b.name = name + 'の訴訟費用';
  }
  function removeInst(s, inst) {
    const poolIds = new Set(s.pools.filter((p) => p.instanceId === inst.id).map((p) => p.id));
    s.opponentScopes = s.opponentScopes.filter((q) => !poolIds.has(q.poolId));
    s.partyPools = s.partyPools.filter((q) => q.instanceId !== inst.id);
    s.pools = s.pools.filter((p) => p.instanceId !== inst.id);
    s.instances = s.instances.filter((x) => x !== inst);
    if (A.view.inst === inst.id) A.view.inst = null;
    A.cleanRulings(s);
    A.changed();
  }

  function instCard(s, inst, sel) {
    const fid = 'i' + inst.id;
    const preset = INST_NAMES.includes(inst.name) ? inst.name : '';
    return h('div', { class: 'instcard' + (sel ? ' sel' : ''), onclick: (e) => { if (e.target === e.currentTarget || e.target.classList.contains('instno')) { A.view.inst = inst.id; A.changed(); } } },
      h('div', { class: 'row between' },
        h('button', { type: 'button', class: 'instno', onclick: () => { A.view.inst = inst.id; A.changed(); }, 'aria-pressed': sel ? 'true' : 'false' }, '審級 ' + inst.rank + (sel ? '（選択中）' : '')),
        iconDel(() => modal('審級を消す', h('p', null, '「' + (inst.name || '審級' + inst.rank) + '」とその費用区分を消します。STEP 7 の期日と STEP 8 の費用は消えないので、先にそれぞれの画面で消してください。'),
          [{ text: '消す', class: 'danger', onclick: () => removeInst(s, inst) }, { text: 'やめる' }]), '審級を消す')),
      h('div', { class: 'row' },
        select(fid + '-preset', [{ value: '', text: '（定型から選ぶ）' }].concat(INST_NAMES), preset, (v) => { if (v) { setName(s, inst, v); A.changed(); } }, { label: '定型の審級名' }),
        textInput(fid + '-name', inst.name, (v) => { setName(s, inst, v.trim()); A.changed(); }, { placeholder: '審級名', label: '審級名' })),
      A.field('事件番号', textInput(fid + '-caseno', inst.caseNo, (v) => { inst.caseNo = v; A.changed(); }, { placeholder: '例: 令和７年（ワ）第４５６号', class: 'wide' })),
      h('div', { class: 'row' },
        A.field('開始日', textInput(fid + '-start', inst.start, (v) => { inst.start = v; A.changed(); }, { type: 'date' })),
        A.field('申立ての日', h('span', { class: 'row tight' },
          textInput(fid + '-filing', inst.filingDate, (v) => { inst.filingDate = v; A.changed(); }, { type: 'date', label: '申立ての日（空欄なら開始日と同じ）' }),
          inst.filingDate ? button('×', () => { inst.filingDate = ''; A.changed(); }, { class: 'icon', label: '申立ての日を空欄に戻す' }) : null,
          button('？', () => toast('申立ての日は、訴え・上訴の提起の日です（7号・12号・18号の郵便の単価の新旧に使います）。空欄なら開始日と同じ扱いです。差戻後の審級は、差戻しの裁判の日を入れてください。', 'info'), { class: 'icon', label: '申立ての日の説明' })))),
      A.field('出頭場所', button(inst.venueLabel || '（裁判所を選ぶ）', () => A.pickCourt('出頭場所の選択', inst.venueLabel, (c) => {
        if (c) Object.assign(inst, { venueKind: c.kind, venueLabel: c.label, venueKey: c.key, venueLat: c.lat, venueLon: c.lon });
        else Object.assign(inst, { venueKind: '', venueLabel: '', venueKey: '', venueLat: 0, venueLon: 0 });
        A.changed();
      }), { class: 'court' + (inst.venueLabel ? '' : ' empty'), fid: fid + '-venue' })));
  }

  // 請求額（1号の分属・分割・共同支出の振り分けに使う）
  function claimsDialog(s, inst) {
    let from = A.view.claimFrom && A.partyOf(s, A.view.claimFrom) ? A.view.claimFrom : (s.parties[0] && s.parties[0].id);
    const body = h('div');
    function fill() {
      body.replaceChildren(
        h('p', { class: 'hint' }, '1号（手数料）を相手ごとに振り分けるときの割合です。請求をした当事者を選び、相手ごとに請求額を入れます。請求の相手でない者は空欄にします（' + (inst.name || '審級') + '）。'),
        A.field('請求をした当事者', select('cl-from', s.parties.map((p) => ({ value: p.id, text: p.name || '当事者' + p.id })), from, (v) => { from = Number(v); A.view.claimFrom = from; fill(); })),
        h('table', { class: 'grid' }, h('tbody', null, s.parties.filter((p) => p.id !== from).map((p) => {
          const c = s.claims.find((x) => x.instanceId === inst.id && x.from === from && x.to === p.id);
          return h('tr', null, h('td', null, p.name || '当事者' + p.id),
            h('td', null, numInput('cl-' + from + '-' + p.id, c ? c.amount : null, (v) => {
              s.claims = s.claims.filter((x) => !(x.instanceId === inst.id && x.from === from && x.to === p.id));
              if (v != null) s.claims.push({ instanceId: inst.id, from, to: p.id, amount: v });
            }, { label: '請求額', placeholder: '円' })), h('td', null, '円'));
        }))));
    }
    fill();
    modal('請求額を入力（分属用）', body, [{ text: '閉じる', onclick: () => A.changed() }]);
  }

  // 半径500mの扱い（出頭場所と基準の簡裁が同じ人）
  function dlg500(s, inst) {
    const subj = [];
    for (const p of s.parties) if (p.courtKey && p.courtKey === inst.venueKey) subj.push({ kind: 'party', id: p.id, name: p.name, role: '本人' });
    for (const a of s.attendees) if (a.courtKey && a.courtKey === inst.venueKey) subj.push({ kind: 'attendee', id: a.id, name: a.name, role: a.kind });
    const get = (x) => { const f = s.inst500.find((q) => q.instanceId === inst.id && q.subjectKind === x.kind && q.subjectId === x.id); return f ? f.within500m : false; };
    const body = h('div', null,
      h('p', { class: 'hint' }, '基準の簡易裁判所が出頭場所（' + inst.venueLabel + '）と同じ人です。出発地が、実際に出頭した場所から半径 500 m 以内の人に印を付けます（旅費 0 円。費用規則2条1項2号）。同じ簡易裁判所でも、500 m を超えれば旅費は 300 円です。'),
      subj.length === 0 ? h('p', { class: 'empty' }, '該当する人はいません。') :
      h('div', null, subj.map((x) => checkbox('f500-' + x.kind + x.id, get(x), x.role + '　' + x.name + '　500m以内', (v) => {
        s.inst500 = s.inst500.filter((q) => !(q.instanceId === inst.id && q.subjectKind === x.kind && q.subjectId === x.id));
        s.inst500.push({ instanceId: inst.id, subjectKind: x.kind, subjectId: x.id, within500m: v });
      }))));
    modal('半径500mの扱い', body, [
      { text: 'この審級の出欠の行にも反映する', onclick: () => {
        const hIds = new Set(s.hearings.filter((x) => x.instanceId === inst.id).map((x) => x.id));
        let n = 0;
        for (const a of s.attendance) {
          if (!hIds.has(a.hearingId) || a.srcKey) continue;   // 出発地を期日ごとに直した行には反映しない
          const f = s.inst500.find((q) => q.instanceId === inst.id && q.subjectKind === a.subjectKind && q.subjectId === a.subjectId);
          if (f) { a.within500m = f.within500m; n++; }
        }
        toast('出欠の行 ' + n + ' 件に反映しました');
        A.changed();
      } },
      { text: '閉じる', onclick: () => A.changed() }]);
  }

  A.STEPS[3] = {
    render(root) {
      const s = A.state;
      const inst = curInst(s);
      const left = h('section', { class: 'card' },
        h('div', { class: 'row between' }, h('h2', null, '審級'),
          button('＋ 審級を追加', () => {
            const id = A.nextId(s.instances);
            s.instances.push({ id, rank: s.instances.reduce((m, x) => Math.max(m, x.rank), 0) + 1, name: '', caseNo: '', start: '',
                               venueKind: '', venueLabel: '', venueKey: '', venueLat: 0, venueLon: 0, filingDate: '' });
            s.pools.push({ id: A.nextId(s.pools), instanceId: id, kind: '本体', name: '' });
            A.view.inst = id; A.changed();
          }, { class: 'primary', fid: 'add-inst' })),
        h('p', { class: 'hint' }, '審級は古い順に追加します（追加した順が序列になり、後から並べ替えられません）。差戻しがあった事件は、差戻前と差戻後を別の審級にします。カードの空いた所を押すと、その審級を選びます。'),
        A.instSorted(s).length === 0 ? h('p', { class: 'empty' }, '審級がありません。［＋ 審級を追加］を押してください。') :
        A.instSorted(s).map((i) => instCard(s, i, inst && i.id === inst.id)));

      let right = null;
      if (inst) {
        const pools = A.poolsOfInst(s, inst.id);
        let kind = A.view.poolKind || '附帯控訴';
        right = h('div', null,
          h('section', { class: 'card' },
            h('h2', null, '費用区分（' + (inst.name || '審級' + inst.rank) + '）'),
            h('p', { class: 'hint' }, '通常は「本体」1件です。附帯控訴・補助参加があるとき、または特定の費目だけ負担の定めが違うとき（「その他」を選び、名称を入れる。例: 鑑定費用）に追加してください。'),
            h('div', { class: 'row' },
              select('pool-kind', POOL_KINDS, kind, (v) => { A.view.poolKind = v; }, { label: '追加する区分の種別' }),
              button('区分を追加', () => {
                const k = A.view.poolKind || '附帯控訴';
                s.pools.push({ id: A.nextId(s.pools), instanceId: inst.id, kind: k, name: POOL_NAME[k] || '' });
                A.changed();
              })),
            h('table', { class: 'grid' }, h('tbody', null, pools.map((p) => h('tr', null,
              h('td', { class: 'tag' }, p.kind),
              h('td', null, textInput('pool' + p.id + '-name', p.name, (v) => { p.name = v.trim(); A.changed(); }, { placeholder: '費用区分の名称（例: 鑑定費用）', class: 'wide', label: '費用区分の名称' })),
              h('td', null, p.kind === '本体' ? null : iconDel(() => {
                s.opponentScopes = s.opponentScopes.filter((q) => q.poolId !== p.id);
                s.partyPools = s.partyPools.filter((q) => q.poolId !== p.id);
                s.pools = s.pools.filter((x) => x !== p);
                A.cleanRulings(s); A.changed();
              }, '区分を消す'))))))),
          pools.length >= 2 ? h('section', { class: 'card' },
            h('h2', null, '当事者ごとの費用区分（' + (inst.name || '') + '）'),
            h('p', { class: 'hint' }, '附帯控訴人・補助参加人など、本体以外の区分に費用がある当事者だけ区分を選びます。補助参加人が被参加人のためにした行為の費用は、STEP 8 で明細ごとに区分を選んで入れます。'),
            h('table', { class: 'grid' }, h('tbody', null, s.parties.map((pt) => h('tr', null,
              h('td', null, pt.id + '. ' + (pt.name || '')),
              h('td', null, select('pp' + inst.id + '-' + pt.id, pools.map((p) => ({ value: p.id, text: p.name || p.kind })), A.ownPool(s, pt.id, inst.id), (v) => {
                const pl = A.poolOf(s, Number(v));
                s.partyPools = s.partyPools.filter((q) => !(q.instanceId === inst.id && q.partyId === pt.id));
                if (pl && pl.kind !== '本体') s.partyPools.push({ instanceId: inst.id, partyId: pt.id, poolId: pl.id });
                A.changed();
              }, { label: '費用区分' }))))))) : null,
          h('section', { class: 'card' },
            h('div', { class: 'row' },
              s.parties.length >= 3 ? button('請求額を入力（分属用）', () => claimsDialog(s, inst)) : null,
              inst.venueKey ? button('半径500mの扱い', () => dlg500(s, inst)) : null),
            h('p', { class: 'hint' }, '民訴法66条・67条、費用規則2条1項1号・2号／書実研15号 31〜32頁、58〜63頁、88頁')));
      }
      root.append(h('div', { class: 'cols' }, left, right));
    },
    validate() {
      const s = A.state;
      if (s.instances.length === 0) return '審級を1件以上登録してください';
      if (s.instances.some((i) => !i.start)) return '開始日が未入力の審級があります';
      if (s.instances.some((i) => !i.name.trim())) return '審級名が未入力の審級があります';
      if (s.pools.some((p) => !p.name.trim())) return '費用区分の名称が未入力の区分があります';
      return '';
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
