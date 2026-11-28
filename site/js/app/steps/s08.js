// STEP 8 費用入力 ― 費用区分 × 支出者 × 号（× 単価の区間）ごとに額を入れ、［この費目を確定］で計上する
(function (g) {
  'use strict';
  const SH = g.SH, A = SH.App;
  const { h, textInput, numInput, select, checkbox, button, iconDel, toast, multi } = SH.UI;
  const ROW6 = ['一の項（訴え提起・控訴提起・上告提起・再審・保全命令等）', '二の項（和解・支払督促の申立て）', '二の二の項', '三の項',
                '四の項（手形小切手・少額訴訟の異議、保全異議等）', '五の項', '六の項', '職権により開始された基本手続'];
  const DED6 = [{ value: 'none', text: 'なし' }, { value: 'settlement', text: '和解・支払督促から移行（規則2条の2第2項1号）' }, { value: 'labor', text: '労働審判から移行／四の項イ（同項2号）' }];
  const row6Key = (v) => ({ '一の項': '1', '二の項': '2', '二の二': '2-2', '三の項': '3', '四の項': '4', '五の項': '5', '六の項': '6' })[v.slice(0, 3)] || 'exofficio';

  function defaultParty(s, pl) {
    const pools = A.poolsOfInst(s, pl.instanceId);
    let cand;
    if (pools.length < 2) cand = s.parties;
    else if (pl.kind === '本体') cand = s.parties.filter((p) => !s.partyPools.some((q) => q.instanceId === pl.instanceId && q.partyId === p.id));
    else cand = s.parties.filter((p) => s.partyPools.some((q) => q.poolId === pl.id && q.partyId === p.id));
    return (cand[0] || s.parties.slice().sort((a, b) => a.id - b.id)[0] || {}).id;
  }

  A.STEPS[8] = {
    render(root) {
      const s = A.state;
      const pools = A.poolsSorted(s);
      if (!pools.length || !s.parties.length) { root.append(h('p', { class: 'empty' }, 'STEP 2・3 で当事者と審級を登録してください')); return; }
      const V = A.view.c8 || (A.view.c8 = {});
      const pl = A.poolOf(s, V.pool) || pools[0];
      if (V.pool !== pl.id) { V.pool = pl.id; V.party = defaultParty(s, pl); V.inputs = {}; }
      const pt = A.partyOf(s, V.party) || A.partyOf(s, defaultParty(s, pl));
      V.party = pt.id;
      const items = s.selectedItems.filter((x) => x.poolId === pl.id).map((x) => x.item).sort((a, b) => a - b);
      const item = items.includes(V.item) ? V.item : items[0];
      V.item = item;
      const segsAll = A.rateSegments(s);
      const segs = item ? A.segsOf(segsAll, pl.id, item) : [];
      const seg = segs.find((x) => x.SegNo === V.seg) || segs[0] || null;
      V.seg = seg ? seg.SegNo : 1;
      const segNo = V.seg;
      A.syncHearingCosts(s, segsAll);

      // 支出者の区分の注意
      const own = A.poolsOfInst(s, pl.instanceId).length < 2 ? pl.id : A.ownPool(s, pt.id, pl.instanceId);
      const hint = own && own !== pl.id
        ? h('p', { class: 'hint warn' }, 'この当事者の費用区分は「' + ((A.poolOf(s, own) || {}).name || '') + '」です。この区分に入れてよい費用か確かめてください（補助参加人が被参加人のためにした行為の費用など）。')
        : h('p', { class: 'hint' }, '「誰が支出した費用か」を必ず選んでください。');
      const saved = s.costs.find((c) => c.poolId === pl.id && c.partyId === pt.id && c.item === item && c.segNo === segNo);
      // 共同で支出した者（PayerKey。代表の支出者を含めて ID 昇順に + でつなぐ）
      if (!V.payersFor || V.payersFor !== [pl.id, pt.id, item, segNo].join('|')) {
        V.payersFor = [pl.id, pt.id, item, segNo].join('|');
        V.payers = saved && saved.payerKey ? saved.payerKey.split('+').map(Number).filter((x) => x !== pt.id) : [];
      }
      const payerKey = () => (V.payers.length === 0 ? '' : [pt.id].concat(V.payers).sort(SH.numSort).join('+'));
      const sumFor = (it) => s.costs.filter((c) => c.poolId === pl.id && c.item === it && (c.partyId === pt.id || ('+' + c.payerKey + '+').includes('+' + pt.id + '+'))).reduce((t, c) => t + c.amount, 0);
      const segLabel = () => (seg && seg.IsSplit ? ' ' + seg.Label : '');
      const replace = (rows) => {
        s.costs = s.costs.filter((c) => !(c.poolId === pl.id && c.partyId === pt.id && c.item === item && c.segNo === segNo));
        s.costs.push(...rows);
        toast('計上しました'); A.changed();
      };
      const base = (amount, label, extra) => Object.assign({ poolId: pl.id, partyId: pt.id, item, segNo, amount, label, relatedPartyId: 0, payerKey: payerKey(), appCost: false, sortKey: null }, extra || {});

      const head = h('section', { class: 'card' },
        h('div', { class: 'row' },
          A.field('費用区分', select('c-pool', pools.map((p) => ({ value: p.id, text: p.name })), pl.id, (v) => { V.pool = Number(v); A.changed(); })),
          A.field('支出者', select('c-party', s.parties.slice().sort((a, b) => a.id - b.id).map((p) => ({ value: p.id, text: p.name || '当事者' + p.id })), pt.id, (v) => { V.party = Number(v); A.changed(); })),
          item && item !== 4 && item !== 5 ? A.field('共同で支出した者（任意）', multi('c-payers', s.parties.filter((p) => p.id !== pt.id).map((p) => ({ value: p.id, text: p.name || '当事者' + p.id })), V.payers, (v) => { V.payers = v.map(Number); A.changed(); })) : null,
          segs.length > 1 && item !== 4 && item !== 5 ? A.field('単価の区間', select('c-seg', segs.map((x) => ({ value: x.SegNo, text: x.Label })), segNo, (v) => { V.seg = Number(v); A.changed(); })) : null),
        hint);

      const list = h('section', { class: 'card itemlist' },
        h('h2', null, '号'),
        items.length === 0 ? h('p', { class: 'empty' }, 'STEP 6 でこの区分の号を選んでください。') :
        items.map((it) => h('button', { type: 'button', class: 'itembtn' + (it === item ? ' cur' : ''), onclick: () => { V.item = it; V.seg = 1; A.changed(); } },
          h('span', null, SH.ITEM_NAMES[it]), h('span', { class: 'amt' }, SH.UI.yen(sumFor(it))))));

      let detail = h('section', { class: 'card' });
      if (item) {
        const missing = segs.filter((x) => x.Missing);
        const notice = missing.length ? h('p', { class: 'err' }, '単価マスタに、この期間に適用される行がありません: ' + missing.map((x) => x.Label + ' ' + x.Missing).join(' ／ '))
          : segs.length && segs[0].IsSplit ? h('p', { class: 'hint warn' }, 'この審級の期間中に単価が改定されています。' + (item === 4 || item === 5 ? '4号・5号は期日の日付で区間が自動で決まります（STEP 7）。' : '右上で区間を切り替え、区間ごとに入力して確定してください。')) : null;
        const savedLine = saved && [1, 6, 7, 8].includes(item) ? h('span', { class: 'sub' }, '確定済み: ' + SH.UI.yen(saved.amount) + ' 円（［この費目を確定］を押すと、上の入力の額で置き換わります）') : null;
        const I = V.inputs || (V.inputs = {});
        // 1号の欄は、支出者・号・区間を替えたら確定済みの額から出し直す
        const k1 = [pl.id, pt.id, item, segNo].join('|');
        if (V.k1 !== k1) { V.k1 = k1; I.paid = null; I.refund = null; }
        const R = seg ? seg.Rates : null;
        detail = h('section', { class: 'card' }, h('h2', null, SH.ITEM_NAMES[item]), notice, (() => {
          if (item === 1) {
            const paid = I.paid != null ? I.paid : (saved ? saved.amount : null);
            const amt = (paid || 0) - (I.refund || 0);
            return h('div', null,
              h('p', { class: 'hint' }, '納付した手数料（収入印紙の額）を入れてください。控訴・上告の手数料は、その審級の費用区分を選んで納付した額を入れます。還付を受けた額（費用法9条）があれば還付額に入れます。'),
              A.field('納付済額', numInput('c1-paid', paid, (v) => { I.paid = v; A.changed(); })),
              A.field('還付額（9条2項）', numInput('c1-ref', I.refund, (v) => { I.refund = v; A.changed(); })),
              h('p', null, '計上額: ' + SH.UI.yen(amt) + ' 円'),
              h('div', { class: 'row' }, button('この費目を確定', () => { replace([base(amt, '手数料' + segLabel())]); V.inputs = {}; }, { class: 'primary' }), savedLine));
          }
          if (item === 4 || item === 5) {
            const hr = A.hearing || { Warnings: [] };
            const rows = s.costs.filter((c) => c.item === item && c.poolId === pl.id && ('+' + c.payerKey + '+').includes('+' + pt.id + '+'));
            return h('div', null,
              h('p', { class: 'hint' }, 'STEP 7 の期日と出欠から計算した額です（ここでは確かめるだけです）。'),
              rows.length === 0 ? h('p', { class: 'empty' }, 'この支出者のこの号の額はありません。') :
              h('table', { class: 'grid' }, h('thead', null, h('tr', null, ['号', '支出者', '摘要', '額'].map((t) => h('th', null, t)))),
                h('tbody', null, rows.map((c) => h('tr', null, h('td', null, c.item + '号'), h('td', null, c.payerKey.split('+').map((x) => A.partyName(s, Number(x))).join('・')),
                  h('td', null, c.label), h('td', { class: 'num' }, SH.UI.yen(c.amount)))))),
              hr.Warnings.length ? h('ul', { class: 'warnlist' }, hr.Warnings.map((w) => h('li', null, '【確認】' + w))) : null,
              button('期日と出欠の画面へ', () => A.go(7)));
          }
          if (item === 6) {
            const row = I.row6 || ROW6[0];
            const key = row6Key(row);
            const one = key === '1' || key === '4';
            let amt = null, breakdown = '';
            if (R && seg && !seg.Missing) {
              try {
                if (one) {
                  amt = SH.getDocFee1(I.plead || 0, I.exh || 0, I.opp || 0, I.ded || 'none', R);
                  breakdown = '内訳: 基本' + SH.yen(R.SHORUI_1_KIHON) + '円' +
                    ((I.plead || 0) > 5 ? ' ＋ 主張書面超過 ' + Math.ceil(((I.plead || 0) - 5) / 15) + '×' + SH.yen(R.SHORUI_1_SHUCHO) + '円' : '') +
                    ((I.exh || 0) > 15 ? ' ＋ 書証超過 ' + Math.ceil(((I.exh || 0) - 15) / 50) + '×' + SH.yen(R.SHORUI_1_SHOSHO) + '円' : '') +
                    '　×　相手方 ' + Math.ceil((I.opp || 0) / 5) + ' 倍';
                } else amt = SH.getDocFeeOther(key, { Claims: I.claims || 0, OtherCreditor: !!I.other }, R);
              } catch (e) { amt = null; }
            }
            return h('div', null,
              A.field('別表第二の項', select('c6-row', ROW6, row, (v) => { I.row6 = v; A.changed(); })),
              one ? [
                A.field('主張書面の通数', numInput('c6-pl', I.plead, (v) => { I.plead = v; A.changed(); })),
                A.field('書証の写しの通数', numInput('c6-ex', I.exh, (v) => { I.exh = v; A.changed(); })),
                A.field('送付すべき相手方の数', numInput('c6-op', I.opp, (v) => { I.opp = v; A.changed(); })),
                A.field('移行事件', select('c6-ded', DED6, I.ded || 'none', (v) => { I.ded = v; A.changed(); })),
                h('p', { class: 'sub' }, breakdown)] : null,
              key === '2-2' ? A.field('請求の数（二の二の項）', numInput('c6-cl', I.claims, (v) => { I.claims = v; A.changed(); })) : null,
              key === '3' ? checkbox('c6-other', I.other, '申立人以外の債権者（三の項ただし書）', (v) => { I.other = v; A.changed(); }) : null,
              h('p', null, '計上額: ' + (amt == null ? '—' : SH.UI.yen(amt) + ' 円')),
              h('p', { class: 'hint' }, '通数は、当該手続の資料とされたものです。費用法2条6号、費用規則2条の2・別表第二'),
              h('div', { class: 'row' }, button('この費目を確定', () => replace([base(amt, '書類の作成及び提出の費用' + segLabel())]), { class: 'primary', disabled: amt == null }), savedLine));
          }
          if (item === 7) {
            const rate = R ? R.YUBIN_1SHU : null;
            const amt = rate == null ? null : SH.getCertFee(I.fee7 || 0, I.times7 || 0, rate);
            return h('div', null,
              A.field('手数料の実額合計', numInput('c7-fee', I.fee7, (v) => { I.fee7 = v; A.changed(); })),
              A.field('交付回数', numInput('c7-t', I.times7, (v) => { I.times7 = v; A.changed(); })),
              h('p', { class: 'sub' }, rate == null ? '適用単価: 未登録' : '適用単価: 第一種郵便物の最低料金 ' + rate + '円 × 2 ＝ ' + rate * 2 + '円／回'),
              h('p', null, '計上額: ' + (amt == null ? '—' : SH.UI.yen(amt) + ' 円')),
              h('p', { class: 'hint' }, '6号の書類の交付を官庁等・公証人から受ける費用です。郵便の単価の新旧は、STEP 3 の「申立ての日」で決まります。費用規則2条の3'),
              h('div', { class: 'row' }, button('この費目を確定', () => replace([base(amt, '官庁等からの書類交付費用' + segLabel())]), { class: 'primary', disabled: amt == null }), savedLine));
          }
          if (item === 8) {
            const dir = I.dir8 || 'F2J';
            let amt = null;
            if (dir === 'other') amt = I.direct8 == null ? null : Math.trunc(I.direct8);
            else if (R) { try { amt = SH.getTranslationFee(dir, I.sheets8 || 0, R); } catch (e) { amt = null; } }
            return h('div', null,
              A.field('翻訳の方向', select('c8-dir', [{ value: 'F2J', text: '外国語→日本語' }, { value: 'J2F', text: '日本語→外国語' }, { value: 'other', text: 'その他（裁判所が相当と認める額）' }], dir, (v) => { I.dir8 = v; A.changed(); })),
              dir === 'other' ? A.field('額', numInput('c8-dx', I.direct8, (v) => { I.direct8 = v; A.changed(); }))
                : A.field('枚数（400字詰用紙）', numInput('c8-sh', I.sheets8, (v) => { I.sheets8 = v; A.changed(); })),
              h('p', null, '計上額: ' + (amt == null ? '—' : SH.UI.yen(amt) + ' 円')),
              h('p', { class: 'hint' }, '外国語→日本語は訳文の枚数、日本語→外国語は原文の枚数で数えます。費用規則3条'),
              h('div', { class: 'row' }, button('この費目を確定', () => replace([base(amt, '翻訳料' + segLabel())]), { class: 'primary', disabled: amt == null }), savedLine));
          }
          // 明細の号（2・3・9〜18号）
          const frs = s.freeRows.filter((f) => f.poolId === pl.id && f.partyId === pt.id && f.item === item);
          const total = frs.reduce((t, f) => t + (f.amount || 0), 0);
          const relOpts = [{ value: 0, text: '（共通）' }].concat(s.parties.slice().sort((a, b) => a.id - b.id).map((p) => ({ value: p.id, text: p.name || '当事者' + p.id })));
          return h('div', null,
            h('p', { class: 'hint' }, '明細ごとに費目名と金額を入れます。費目名は計算書の摘要になります（空欄なら号の名称）。右の選択は「特定の相手方にだけ係る費用」です（その被告への送達費用など）。'),
            frs.length === 0 ? h('p', { class: 'empty' }, '明細がありません。') :
            h('table', { class: 'grid' }, h('tbody', null, frs.map((f) => h('tr', null,
              h('td', null, textInput('fr' + f.id + '-l', f.label, (v) => { f.label = v; A.changed(); }, { placeholder: '費目名', class: 'wide', label: '費目名' })),
              h('td', null, select('fr' + f.id + '-r', relOpts, f.relatedId || 0, (v) => { f.relatedId = Number(v); A.changed(); }, { label: '特定の相手方' })),
              h('td', null, numInput('fr' + f.id + '-a', f.amount, (v) => { f.amount = v == null ? null : Math.trunc(v); A.changed(); }, { label: '金額', class: 'num short' })),
              h('td', null, item === 2 ? checkbox('fr' + f.id + '-app', f.appCost, '申立て', (v) => { f.appCost = v; A.changed(); }, { title: '催告書送付費用・確定処分正本送達費用など、確定処分の申立てに関する費用（11条1項）' }) : null),
              h('td', null, iconDel(() => { s.freeRows = s.freeRows.filter((x) => x !== f); A.changed(); }, '明細を消す')))))),
            h('div', { class: 'row' },
              button('＋ 明細を追加', () => { s.freeRows.push({ id: A.nextId(s.freeRows), poolId: pl.id, partyId: pt.id, item, label: '', amount: null, appCost: false, relatedId: 0 }); A.changed(); }),
              h('span', null, '合計: ' + SH.UI.yen(total) + ' 円')),
            item === 12 || item === 18 ? h('p', { class: 'hint' }, item === 12 ? '12号は、手数料 ＋ 1 回につき（第一種郵便物の最低料金 × 2 ＋ 書留料）で額を出して入れます。' : '18号は、1 回につき（最低料金 ＋ 書留料）で額を出して入れます。') : null,
            item === 2 ? h('p', { class: 'hint' }, '2号の額は、当事者が予納した額のうち裁判所が現実に支出した額です。「申立て」の印を付けた明細は、計算書で本案の費用と分けて小計します（合計・案分・相殺の額は変わりません）。') : null,
            h('div', { class: 'row' }, button('この費目を確定', () => {
              replace(frs.map((f) => base(f.amount || 0, (f.label || SH.ITEM_NAMES[item]) + segLabel(), { appCost: !!f.appCost, relatedPartyId: f.relatedId || 0 })));
            }, { class: 'primary' }), h('span', { class: 'sub' }, '明細を消したときも、もう一度確定します（確定するまで前の額が残ります）。')));
        })());
      }
      root.append(head, h('div', { class: 'cols c8' }, list, detail));
    },
    validate() { return A.state.costs.length === 0 ? '費用を1件以上「この費目を確定」で計上してください' : ''; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
