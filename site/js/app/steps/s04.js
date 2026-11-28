// STEP 4 負担の裁判 ― 審級 × 費用区分ごとの条項。対象費用区分・対象当事者・割合（列＝その当事者に生じた費用、行＝負担者と割合）
(function (g) {
  'use strict';
  const SH = g.SH, A = SH.App;
  const { h, numInput, select, button, iconDel, toast, radios, multi, checkbox } = SH.UI;
  const TYPES = ['全部負担', '一律按分', '個別指定', '連帯あり（詳細）'];
  const TYPE_NOTE = {
    '全部負担': '「訴訟費用は被告（ら）の負担とする。」のように、全部を一人（又は数人）が負担する主文です。負担者を選んで［この内容で生成］を押します。',
    '一律按分': '「訴訟費用は、これを5分し、その2を原告の、その余を被告の負担とする。」のように、どの当事者に生じた費用も同じ割合で分ける主文です。',
    '個別指定': '当事者（列）ごとに割合が違う主文や、上の型に当てはまらない主文です。列のタブごとに、負担者と割合の行を入れます。',
    '連帯あり（詳細）': '「その余を被告らの連帯負担とする。」のように、連帯の定めがある主文です。入れ方は個別指定と同じで、負担者 2 人以上の行で「連帯」を選びます。'
  };

  // 消えた費用区分の条項を片づけ、条項の無い費用区分に条項を 1 つ用意する
  A.cleanRulings = function (s) {
    const poolIds = new Set(s.pools.map((p) => p.id));
    const gone = new Set(s.rulings.filter((r) => r.poolId !== 0 && !poolIds.has(r.poolId)).map((r) => r.id));
    s.obligations = s.obligations.filter((o) => !gone.has(o.rulingId));
    s.rulings = s.rulings.filter((r) => !gone.has(r.id));
    for (const r of s.rulings) r.scopePools = r.scopePools.filter((id) => poolIds.has(id));
    let base = s.rulings.reduce((m, r) => Math.max(m, r.id), 0);
    for (const p of s.pools.slice().sort((a, b) => a.id - b.id)) {
      if (s.rulings.some((r) => r.poolId === p.id)) continue;
      base++;
      s.rulings.push({ id: base, rulingInstanceId: p.instanceId, poolId: p.id, scopePools: [p.id], scopeParties: [] });
    }
  };
  const rulingsOf = (s, instId) => s.rulings.filter((r) => r.rulingInstanceId === instId).sort((a, b) => (a.poolId - b.poolId) || (a.id - b.id));
  const obsOf = (s, rid) => s.obligations.filter((o) => o.rulingId === rid);
  const isBase = (s, r) => r.id === Math.min(...s.rulings.filter((x) => x.poolId === r.poolId).map((x) => x.id));

  // 保存した割合から型を決め、パネルに入れる
  function loadPanel(s, r) {
    const obs = obsOf(s, r.id).map((o) => ({ col: o.column, num: o.num, den: o.den, mode: o.mode || '', cnt: o.obligors.length,
                                            sig: o.obligors.slice().sort(SH.numSort).join(',') }));
    const n = obs.length, cols = [...new Set(obs.map((o) => o.col))], c1 = n ? obs[0].col : null;
    const isAll = n > 0 && n === cols.length && obs.every((o) => o.num === o.den && o.cnt > 0) &&
                  new Set(obs.map((o) => o.sig)).size === 1 && new Set(obs.map((o) => o.mode)).size === 1;
    const first = obs.filter((o) => o.col === c1);
    const colSig = (c) => obs.filter((o) => o.col === c).sort((a, b) => (a.sig < b.sig ? -1 : a.sig > b.sig ? 1 : 0)).map((y) => y.sig + ':' + y.num + '/' + y.den).join(';');
    const isPro = n > 0 && obs.every((o) => o.cnt === 1 && (o.den || 0) !== 0) && new Set(first.map((o) => o.sig)).size === first.length &&
                  new Set(cols.map(colSig)).size === 1;
    const type = n === 0 || isAll ? '全部負担' : isPro ? '一律按分' : obs.some((o) => o.cnt >= 2 && o.mode === 'joint') ? '連帯あり（詳細）' : '個別指定';
    const pro = {};
    if (isPro && !isAll) for (const y of first) pro[Number(y.sig)] = { num: y.num, den: y.den };
    A.view.r4 = { rid: r.id, type, bearers: isAll ? obs[0].sig.split(',').map(Number) : [], joint: isAll && obs[0].mode === 'joint', pro,
                  col: A.view.r4 && A.view.r4.col };
  }
  function selectRuling(s, r) { A.view.ruling = r ? r.id : null; if (r) loadPanel(s, r); }

  function addOb(s, o) { o.id = A.nextId(s.obligations); s.obligations.push(o); }

  A.STEPS[4] = {
    render(root) {
      const s = A.state;
      A.cleanRulings(s);
      if (s.instances.length === 0) { root.append(h('p', { class: 'empty' }, 'STEP 3 で審級を登録してください')); return; }
      let inst = A.instOf(s, A.view.inst) || A.instSorted(s)[0];
      A.view.inst = inst.id;
      const rs = rulingsOf(s, inst.id);
      let r = s.rulings.find((x) => x.id === A.view.ruling && x.rulingInstanceId === inst.id);
      if (!r) { r = rs[0]; selectRuling(s, r); }
      if (!A.view.r4 || A.view.r4.rid !== (r && r.id)) loadPanel(s, r);
      const P = A.view.r4;
      const poolName = (id) => { const p = A.poolOf(s, id); return p ? p.name : '区分' + id; };
      const scopeParties = s.parties.filter((p) => r.scopeParties.includes(p.id));

      const head = h('section', { class: 'card' },
        h('div', { class: 'row' },
          A.field('審級', select('r-inst', A.instSorted(s).map((i) => ({ value: i.id, text: i.name || '審級' + i.rank })), inst.id,
            (v) => { A.view.inst = Number(v); A.view.ruling = null; A.view.r4 = null; A.changed(); })),
          h('div', { class: 'tabs', role: 'tablist', 'aria-label': '条項' }, rs.map((x) => h('button', {
            type: 'button', role: 'tab', class: 'tab' + (x.id === r.id ? ' cur' : ''), 'aria-selected': x.id === r.id ? 'true' : 'false',
            onclick: () => { if (x.id !== r.id) { selectRuling(s, x); A.changed(); } } },
            '条項' + x.id + '　' + (x.poolId ? (A.poolOf(s, x.poolId) || {}).kind || '' : '') + (obsOf(s, x.id).length ? '' : '・未入力'))))),
        h('div', { class: 'row' },
          button('この費用区分に当事者の組を分けた条項を足す', () => {
            const nid = s.rulings.reduce((m, x) => Math.max(m, x.id), 0) + 1;
            s.rulings.push({ id: nid, rulingInstanceId: r.rulingInstanceId, poolId: r.poolId, scopePools: [r.poolId], scopeParties: [] });
            selectRuling(s, s.rulings[s.rulings.length - 1]); A.changed();
          }, { disabled: !r.poolId }),
          button(isBase(s, r) ? '条項を空にする' : '条項を削除', () => {
            s.obligations = s.obligations.filter((o) => o.rulingId !== r.id);
            if (isBase(s, r)) { r.scopeParties = []; r.scopePools = [r.poolId]; selectRuling(s, r); }
            else { s.rulings = s.rulings.filter((x) => x !== r); selectRuling(s, rulingsOf(s, inst.id)[0]); }
            A.changed();
          }, { class: 'danger-outline' })),
        h('p', { class: 'hint' }, '負担の裁判をしていない審級（原判決を取り消して差し戻した控訴審など）の条項は、未入力のまま残します。同じ費用区分で当事者の組ごとに割合が分かれる主文のときだけ、条項を足します。'));

      const lowerPools = s.pools.filter((p) => { const i = A.instOf(s, p.instanceId); return i && i.rank <= inst.rank; });
      const scope = h('section', { class: 'card' },
        h('h2', null, '条項' + r.id + '（' + poolName(r.poolId) + '）'),
        h('div', { class: 'row' }, h('span', { class: 'label' }, '対象費用区分'),
          button('当審のみ', () => { r.scopePools = r.poolId ? [r.poolId] : A.poolsOfInst(s, inst.id).map((p) => p.id); A.changed(); }),
          button('訴訟の総費用', () => { r.scopePools = lowerPools.map((p) => p.id); A.changed(); })),
        multi('r' + r.id + '-pools', lowerPools.map((p) => ({ value: p.id, text: p.name })), r.scopePools, (v) => { r.scopePools = v.map(Number); A.changed(); }),
        h('p', { class: 'hint' }, '棄却なら「当審のみ」、原判決変更なら「訴訟の総費用」'),
        h('div', { class: 'row' }, h('span', { class: 'label' }, '対象当事者'),
          button('全当事者', () => { r.scopeParties = s.parties.map((p) => p.id); A.changed(); })),
        multi('r' + r.id + '-parties', s.parties.map((p) => ({ value: p.id, text: p.name || '当事者' + p.id })), r.scopeParties, (v) => { r.scopeParties = v.map(Number); A.changed(); }),
        h('p', { class: 'hint' }, '上訴していない当事者を外すと、その関係は原審の条項が適用されます。負担者の一覧には対象当事者だけが出るので、対象当事者を先に選びます。'));

      const ratio = h('section', { class: 'card' },
        h('h2', null, '割合の指定'),
        radios('r-type', TYPES, P.type, (v) => { P.type = v; A.changed(); }),
        h('p', { class: 'hint' }, TYPE_NOTE[P.type]),
        scopeParties.length === 0 ? h('p', { class: 'empty' }, '先に対象当事者を選んでください。') : panel(s, r, P, scopeParties));

      root.append(head, h('div', { class: 'cols' }, scope, ratio),
        h('p', { class: 'hint' }, '民訴法61条〜67条・73条1項／書実研15号 58〜61頁、112〜113頁、136〜139頁'));
    },
    validate() { return A.state.rulings.length === 0 ? 'STEP 3 で審級を登録してください' : ''; }
  };

  function panel(s, r, P, scopeParties) {
    const opts = scopeParties.map((p) => ({ value: p.id, text: p.name || '当事者' + p.id }));
    if (P.type === '全部負担') {
      return h('div', null,
        h('p', { class: 'label' }, '負担者'),
        multi('all-bearer', opts, P.bearers.filter((id) => r.scopeParties.includes(id)), (v) => { P.bearers = v.map(Number); A.changed(); }),
        P.bearers.length >= 2 ? radios('all-joint', [{ value: 'split', text: '等分（民訴法65条1項本文）' }, { value: 'joint', text: '連帯（同項ただし書）' }],
          P.joint ? 'joint' : 'split', (v) => { P.joint = v === 'joint'; A.changed(); }) : null,
        button('この内容で生成', () => {
          const bearers = P.bearers.filter((id) => r.scopeParties.includes(id));
          s.obligations = s.obligations.filter((o) => o.rulingId !== r.id);
          const md = P.joint && bearers.length >= 2 ? 'joint' : 'split';
          for (const col of scopeParties) addOb(s, { rulingId: r.id, column: col.id, num: 1, den: 1, mode: md, obligors: bearers.slice() });
          toast('負担割合を生成しました。「個別指定」に切り替えると内容を確認・修正できます。');
          A.changed();
        }, { class: 'primary', disabled: P.bearers.length === 0 }),
        h('p', { class: 'hint' }, '「被告らの負担とする。」は、「連帯」と書いてなければ等分（分割）です。'));
    }
    if (P.type === '一律按分') {
      let sum = 0;
      for (const p of scopeParties) { const x = P.pro[p.id]; if (x && x.den) sum += x.num / x.den; }
      const ok = Math.abs(sum - 1) < 1e-9;
      return h('div', null,
        h('p', { class: 'hint' }, '各当事者の負担割合を分数で入力してください。合計が 1 になる必要があります。'),
        h('table', { class: 'grid' }, h('tbody', null, scopeParties.map((p) => {
          const x = P.pro[p.id] || { num: 0, den: 1 };
          return h('tr', null, h('td', null, p.name || '当事者' + p.id),
            h('td', null, numInput('pro-n-' + p.id, x.num, (v) => { P.pro[p.id] = { num: v || 0, den: x.den || 1 }; A.changed(); }, { label: '分子', class: 'num short' })),
            h('td', null, '／'),
            h('td', null, numInput('pro-d-' + p.id, x.den, (v) => { P.pro[p.id] = { num: x.num || 0, den: v || 1 }; A.changed(); }, { label: '分母', class: 'num short' })),
            h('td', { class: 'sub' }, x.den ? (Math.round(x.num / x.den * 1000) / 10).toFixed(1) + '%' : ''));
        }))),
        h('p', { class: ok ? 'ok' : 'err' }, '合計: ' + SH.UI.frac(sum)),
        button('この内容で生成', () => {
          s.obligations = s.obligations.filter((o) => o.rulingId !== r.id);
          for (const col of scopeParties) for (const p of scopeParties) {
            const x = P.pro[p.id];
            if (x && x.num > 0 && x.den > 0) addOb(s, { rulingId: r.id, column: col.id, num: x.num, den: x.den, mode: '', obligors: [p.id] });
          }
          toast('負担割合を生成しました。'); A.changed();
        }, { class: 'primary', disabled: !ok }));
    }
    // 個別指定・連帯あり（詳細）
    let col = scopeParties.find((p) => p.id === P.col) || scopeParties[0];
    P.col = col.id;
    const colSum = (cid) => obsOf(s, r.id).filter((o) => o.column === cid).reduce((t, o) => t + (o.den ? o.num / o.den : 0), 0);
    const rows = obsOf(s, r.id).filter((o) => o.column === col.id);
    const cs = colSum(col.id);
    return h('div', null,
      h('p', { class: 'hint' }, '列＝その当事者に生じた費用、行＝その費用の負担者と割合です。どの列も割合の合計（列和）を 1 にします。負担者を2名以上選ぶと、連帯／分割を選べます。'),
      h('div', { class: 'tabs', role: 'tablist', 'aria-label': '列（費用を支出した当事者）' }, scopeParties.map((p) => h('button', {
        type: 'button', role: 'tab', class: 'tab' + (p.id === col.id ? ' cur' : ''), onclick: () => { P.col = p.id; A.changed(); } },
        (p.name || '当事者' + p.id) + '　列和 ' + SH.UI.frac(colSum(p.id))))),
      h('table', { class: 'grid' },
        h('thead', null, h('tr', null, ['割合', '', '', '負担者', '連帯／分割', '', ''].map((t) => h('th', null, t)))),
        h('tbody', null, rows.map((o) => {
          const n = o.obligors.length;
          const note = n >= 2 ? (o.mode === 'split' ? '分割負担（65条1項本文）' : '連帯負担') : n === 1 && o.obligors[0] === o.column ? '自己負担（精算対象外）' : n === 1 ? '単独負担' : '負担者を選んでください';
          return h('tr', null,
            h('td', null, numInput('ob' + o.id + '-n', o.num, (v) => { o.num = v || 0; A.changed(); }, { label: '分子', class: 'num short' })),
            h('td', null, '／'),
            h('td', null, numInput('ob' + o.id + '-d', o.den, (v) => { o.den = v || 1; A.changed(); }, { label: '分母', class: 'num short' })),
            h('td', null, multi('ob' + o.id + '-who', scopeParties.map((p) => ({ value: p.id, text: p.name || '当事者' + p.id })), o.obligors, (v) => {
              o.obligors = v.map(Number); if (o.obligors.length >= 2 && !o.mode) o.mode = 'split'; A.changed(); })),
            h('td', null, n >= 2 ? select('ob' + o.id + '-mode', [{ value: 'joint', text: '連帯' }, { value: 'split', text: '分割' }], o.mode === 'split' ? 'split' : 'joint',
              (v) => { o.mode = v; A.changed(); }, { label: '連帯／分割' }) : null),
            h('td', { class: 'sub' }, note),
            h('td', null, iconDel(() => { s.obligations = s.obligations.filter((x) => x !== o); A.changed(); }, '行を消す')));
        }))),
      button('＋ 行を追加', () => { addOb(s, { rulingId: r.id, column: col.id, num: 1, den: 1, mode: 'split', obligors: [] }); A.changed(); }),
      h('p', { class: Math.abs(cs - 1) < 1e-9 ? 'ok' : 'err' }, '列和: ' + SH.UI.frac(cs) + (Math.abs(cs - 1) < 1e-9 ? '　✓' : '　← 1 にしてください')));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
