// STEP 6 費目の選択 ― 費用区分ごとに計上する号（費用法2条各号）
(function (g) {
  'use strict';
  const SH = g.SH, A = SH.App;
  const { h, select, button, checkbox, modal } = SH.UI;
  const ITEMS = Array.from({ length: 18 }, (_, i) => i + 1);

  A.STEPS[6] = {
    render(root) {
      const s = A.state;
      const pools = A.poolsSorted(s);
      if (pools.length === 0) { root.append(h('p', { class: 'empty' }, 'STEP 3 で審級を登録してください')); return; }
      const pl = A.poolOf(s, A.view.pool6) || pools[0];
      A.view.pool6 = pl.id;
      const has = (it) => s.selectedItems.some((x) => x.poolId === pl.id && x.item === it);
      const setSel = (it, on) => {
        s.selectedItems = s.selectedItems.filter((x) => !(x.poolId === pl.id && x.item === it));
        if (on) s.selectedItems.push({ poolId: pl.id, item: it });
      };
      root.append(h('section', { class: 'card' },
        h('div', { class: 'row' },
          A.field('費用区分', select('pool6', pools.map((p) => ({ value: p.id, text: p.name })), pl.id, (v) => { A.view.pool6 = Number(v); A.changed(); })),
          button('よく使う号をまとめて選択（1・2・4・5・6・7）', () => { for (const it of [1, 2, 4, 5, 6, 7]) setSel(it, true); A.changed(); }),
          h('span', { class: 'sub' }, '選択中: ' + s.selectedItems.filter((x) => x.poolId === pl.id).length + ' 件')),
        h('p', { class: 'hint' }, '選んだ号だけが STEP 8 の一覧に出ます。選択は費用区分ごとで、当事者ごとではありません。★自動は額を計算する号（4・5号は STEP 7 の期日と出欠から、6・7・8号は STEP 8 の入力欄から）です。4・5号は STEP 7 の出欠だけで計上されます。'),
        h('div', { class: 'items' }, ITEMS.map((it) => h('div', { class: 'itemrow' },
          checkbox('it-' + pl.id + '-' + it, has(it), SH.ITEM_NAMES[it], (on) => {
            const counted = s.costs.some((c) => c.poolId === pl.id && c.item === it);
            if (!on && counted && it !== 4 && it !== 5) {
              modal('計上した明細があります', h('p', null, SH.ITEM_NAMES[it] + ' には、STEP 8 で計上した明細があります。'), [
                { text: '明細も消してチェックを外す', class: 'danger', onclick: () => {
                  s.costs = s.costs.filter((c) => !(c.poolId === pl.id && c.item === it));
                  s.freeRows = s.freeRows.filter((f) => !(f.poolId === pl.id && f.item === it));
                  setSel(it, false); A.changed(); } },
                { text: 'やめる（チェックを残す）', onclick: () => A.changed() }]);
              return;
            }
            setSel(it, on); A.changed();
          }),
          h('span', { class: A.AUTO_ITEMS.includes(it) ? 'tag auto' : 'tag' }, A.AUTO_ITEMS.includes(it) ? '★自動' : '自由入力')))),
        h('p', { class: 'hint' }, '計上できるのは費用法2条各号に掲げた費用だけです。証人の旅費・日当・宿泊料は4号ではなく2号です。費用法2条／書実研15号 18〜27頁、93頁')));
    },
    validate() { return A.state.selectedItems.length === 0 ? '計上する号を1つ以上選んでください' : ''; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
