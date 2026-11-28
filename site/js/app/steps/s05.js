// STEP 5 支配関係の確認 ― 費用区分 × 当事者の組ごとに効く条項の表と、相手方の範囲（相手ごとに条項が分かれる費用だけ）
(function (g) {
  'use strict';
  const SH = g.SH, A = SH.App;
  const { h, button, checkbox } = SH.UI;

  function run(s) {
    A.syncHearings();
    const c = A.engineCase(s);
    return { c, r: SH.calcPhase12(c) };
  }

  A.STEPS[5] = {
    render(root) {
      const s = A.state;
      const { r } = run(s);
      A.view.p12 = r;
      const pools = A.poolsSorted(s);
      const pairs = [];
      const ids = s.parties.map((p) => p.id).sort(SH.numSort);
      for (const a of ids) for (const b of ids) if (a < b) pairs.push([a, b]);
      const cell = (poolId, a, b) => {
        const ru = r.Dominant.get(SH.pairKey(poolId, a, b));
        if (!ru) return h('td', { class: 'na' }, '（対象外）');
        const inst = A.instOf(s, ru.RulingInstanceId);
        return h('td', null, '条項' + ru.Id, h('br'), h('span', { class: 'sub' }, inst ? inst.name : ''));
      };
      const table = h('section', { class: 'card' },
        h('h2', null, '支配する条項'),
        h('p', { class: 'hint' }, 'どの費用区分の、どの当事者の間に、どの条項が適用されるかの一覧です。使われるのは、その区分とその2人をどちらも対象に含む条項のうち、最も上級の審級の条項です。'),
        h('div', { class: 'scroll' }, h('table', { class: 'grid map' },
          h('thead', null, h('tr', null, h('th', null, '当事者の組'), pools.map((p) => h('th', null, p.name)))),
          h('tbody', null, pairs.map(([a, b]) => h('tr', null, h('th', null, A.partyName(s, a) + ' ― ' + A.partyName(s, b)), pools.map((p) => cell(p.id, a, b))))))),
        h('p', { class: 'hint' }, '「（対象外）」は、その当事者の間でこの費用区分についての費用負担の裁判がないことを示します。費用がある場合は STEP 9 でエラーになります。'));

      // 相手方の範囲
      const groups = [];
      for (const q of r.ScopeQuestions) {
        let gq = groups.find((x) => x.pool === q.PoolId && x.party === q.PartyId);
        if (!gq) groups.push(gq = { pool: q.PoolId, party: q.PartyId, qs: [] });
        gq.qs.push(q);
      }
      A.view.sq = A.view.sq || {};
      const scope = h('section', { class: 'card' },
        h('h2', null, '相手方の範囲（相手ごとに条項が分かれる費用だけ）'),
        groups.length === 0 ? h('p', { class: 'ok' }, '条項が分かれる費用はないので、相手方の範囲の入力は不要です。') :
        groups.map((gq) => {
          const key = gq.pool + '|' + gq.party;
          const done = gq.qs.every((q) => q.Answered);
          const cur = A.view.sq[key] || (A.view.sq[key] = Object.fromEntries(gq.qs.map((q) => [q.OpponentId, q.Answered ? q.Included : q.Suggested])));
          for (const q of gq.qs) if (!(q.OpponentId in cur)) cur[q.OpponentId] = q.Answered ? q.Included : q.Suggested;
          const any = gq.qs.some((q) => cur[q.OpponentId]);
          return h('div', { class: 'sq' },
            h('p', null, A.partyName(s, gq.party) + ' の「' + ((A.poolOf(s, gq.pool) || {}).name || '') + '」の費用は、誰を相手に支出したものですか',
              h('span', { class: done ? 'badge ok' : 'badge err' }, done ? '確定済み' : '未確定')),
            h('div', { class: 'row' }, gq.qs.map((q) => {
              const ru = s.rulings.find((x) => x.id === q.RulingId);
              const inst = ru ? A.instOf(s, ru.rulingInstanceId) : null;
              return checkbox('sq-' + key + '-' + q.OpponentId, cur[q.OpponentId], A.partyName(s, q.OpponentId) + '（条項' + q.RulingId + '・' + (inst ? inst.name : '') + '）',
                (v) => { cur[q.OpponentId] = v; A.changed(); });
            }),
            button('確定', () => {
              s.opponentScopes = s.opponentScopes.filter((x) => !(x.poolId === gq.pool && x.partyId === gq.party));
              for (const q of gq.qs) s.opponentScopes.push({ poolId: gq.pool, partyId: gq.party, opponentId: q.OpponentId, included: !!cur[q.OpponentId] });
              delete A.view.sq[key];
              A.changed();
            }, { class: 'primary', disabled: !any })));
        }),
        h('p', { class: 'hint' }, '共同原告・共同被告は相手方ではありません。最初の印はアプリの推定です。記録で確かめてから［確定］を押してください。回答で結果が大きく変わります。民訴法65条、67条／書実研15号 114頁、138頁'));
      root.append(table, scope);
    },
    validate() {
      const r = A.view.p12;
      if (!r) return '';
      if (r.Errors.length) return r.Errors[0];
      if (r.ScopeQuestions.some((q) => !q.Answered)) return '相手方の範囲が未確定の費用があります（下の一覧で確定してください）';
      return '';
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
