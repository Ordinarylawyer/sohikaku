// STEP 2 当事者 ― 当事者（立場・名称・国等・住所・基準の簡裁・申立書記載の総額）と代理人等
(function (g) {
  'use strict';
  const SH = g.SH, A = SH.App;
  const { h, textInput, numInput, select, checkbox, button, iconDel, multi } = SH.UI;

  function courtBtn(label, onPick, fid) {
    return button(label || '（簡易裁判所を選ぶ）', () => A.pickCourt('基準の簡易裁判所の選択', label, onPick), { class: 'court' + (label ? '' : ' empty'), fid });
  }
  const setCourt = (o) => (c) => {
    if (c) Object.assign(o, { courtKind: c.kind, courtLabel: c.label, courtKey: c.key, lat: c.lat, lon: c.lon });
    else Object.assign(o, { courtKind: '', courtLabel: '', courtKey: '', lat: 0, lon: 0 });
    A.changed();
  };

  function removeParty(s, p) {
    s.opponentScopes = s.opponentScopes.filter((q) => q.partyId !== p.id && q.opponentId !== p.id);
    s.partyPools = s.partyPools.filter((q) => q.partyId !== p.id);
    for (const a of s.attendees) a.parties = a.parties.filter((x) => x !== p.id);
    s.attendance = s.attendance.filter((x) => !(x.subjectKind === 'party' && x.subjectId === p.id));
    s.options.opponentIds = s.options.opponentIds.filter((x) => x !== p.id);
    s.parties = s.parties.filter((x) => x !== p);
    A.changed();
  }

  A.STEPS[2] = {
    render(root) {
      const s = A.state;
      root.append(
        h('section', { class: 'card' },
          h('div', { class: 'row between' }, h('h2', null, '当事者'),
            button('＋ 当事者を追加', () => { s.parties.push({ id: A.nextId(s.parties), kind: '相手方', name: '', address: '', claimedTotal: null,
              courtKind: '', courtLabel: '', courtKey: '', lat: 0, lon: 0, isGov: false }); A.changed(); }, { class: 'primary', fid: 'add-party' })),
          h('p', { class: 'hint' }, '本案の当事者（補助参加人を含む）を全員登録します。立場は、確定処分の申立てでの立場です（申立人・相手方のどちらでもない者は「その他」。その費用は計上しません）。名称には氏名（名称）だけを入れます。'),
          s.parties.length === 0 ? h('p', { class: 'empty' }, '当事者がいません。［＋ 当事者を追加］を押してください。') :
          h('table', { class: 'grid' },
            h('thead', null, h('tr', null, ['#', '確定処分での立場', '名称', '国等', '住所', '基準の簡易裁判所', '申立書記載の総額（任意）', ''].map((t) => h('th', null, t)))),
            h('tbody', null, s.parties.map((p) => h('tr', null,
              h('td', { class: 'id' }, p.id),
              h('td', null, select('p' + p.id + '-kind', ['申立人', '相手方', 'その他'], p.kind, (v) => { p.kind = v; A.changed(); }, { label: '立場' })),
              h('td', null, textInput('p' + p.id + '-name', p.name, (v) => { p.name = v.trim(); A.changed(); }, { placeholder: '氏名（名称）', label: '名称' })),
              h('td', null, checkbox('p' + p.id + '-gov', p.isGov, '', (v) => { p.isGov = v; A.changed(); },
                { title: '国・地方公共団体等（国等の債権債務等の金額の端数計算に関する法律）。この当事者が債権者・債務者となる案分額の1円未満を切り捨てます' })),
              h('td', null, textInput('p' + p.id + '-addr', p.address, (v) => { p.address = v; A.changed(); }, { placeholder: '住所', label: '住所', class: 'wide' })),
              h('td', null, courtBtn(p.courtLabel, setCourt(p), 'p' + p.id + '-court')),
              h('td', null, numInput('p' + p.id + '-claimed', p.claimedTotal, (v) => { p.claimedTotal = v == null ? null : Math.trunc(v); A.changed(); }, { label: '申立書記載の総額', placeholder: '円' })),
              h('td', null, iconDel(() => removeParty(s, p), '当事者を消す'))))))),
        h('section', { class: 'card' },
          h('div', { class: 'row between' }, h('h2', null, '代理人等'),
            button('＋ 代理人等を追加', () => { s.attendees.push({ id: A.nextId(s.attendees), kind: '訴訟代理人', name: '', courtKind: '', courtLabel: '', courtKey: '', lat: 0, lon: 0, parties: [], title: '' }); A.changed(); }, { fid: 'add-att' })),
          h('p', { class: 'hint' }, '代理人等は、処分書・申立書の当事者欄にも載ります。法定代理人・代表者は当事者ごとに「同代表者　○○」、代理人は 1 名だけを代理するなら「同代理人弁護士　○○」、2 名以上に共通なら「上記２名代理人弁護士　○○」です（確定処分は本案の手続ではないので「訴訟代理人」でなく「代理人」）。「書面での肩書き」は、空欄なら区分から決まります（親権者→法定代理人親権者、その他の法定代理人等→法定代理人、訴訟代理人→代理人弁護士）。法人の代表者は「代表者代表取締役」のように入れます。'),
          h('p', { class: 'hint' }, '基準の簡易裁判所は、出頭のための旅行の出発地を管轄する簡易裁判所です（通常は、訴訟代理人は事務所、法定代理人は住所、法人の代表者は法人の主たる事務所）。自宅から来た期日などは STEP 7 の出欠の行で直せます。当事者本人はここに入れません。法人の代表者は「その他の法定代理人等」にします。'),
          s.attendees.length === 0 ? h('p', { class: 'empty' }, '代理人等はいません（いなければ空のままでかまいません）。') :
          h('table', { class: 'grid' },
            h('thead', null, h('tr', null, ['区分', '氏名', '書面での肩書き', '基準の簡易裁判所', '代理する当事者', ''].map((t) => h('th', null, t)))),
            h('tbody', null, s.attendees.map((a) => h('tr', null,
              h('td', null, select('a' + a.id + '-kind', ['親権者', 'その他の法定代理人等', '訴訟代理人'], a.kind, (v) => { a.kind = v; A.changed(); }, { label: '区分' })),
              h('td', null, textInput('a' + a.id + '-name', a.name, (v) => { a.name = v.trim(); A.changed(); }, { placeholder: '氏名', label: '氏名' })),
              h('td', null, textInput('a' + a.id + '-title', a.title, (v) => { a.title = v.trim(); A.changed(); },
                { placeholder: A.attendeeTitle({ kind: a.kind }), label: '処分書・申立書の当事者欄での肩書き（空欄なら区分から）' })),
              h('td', null, courtBtn(a.courtLabel, setCourt(a), 'a' + a.id + '-court')),
              h('td', null, multi('a' + a.id + '-pt', s.parties.map((p) => ({ value: p.id, text: p.name || '当事者' + p.id })), a.parties,
                (v) => { a.parties = v.map(Number).sort(SH.numSort); A.changed(); })),
              h('td', null, iconDel(() => { s.attendance = s.attendance.filter((x) => !(x.subjectKind === 'attendee' && x.subjectId === a.id)); s.attendees = s.attendees.filter((x) => x !== a); A.changed(); }, '代理人等を消す'))))))),
        h('p', { class: 'hint' }, '民訴規則24条2項・25条1項、費用法2条4号・5号／書実研15号 28〜32頁、81〜84頁、92頁'));
    },
    validate() {
      const s = A.state;
      if (s.parties.length < 2) return '当事者を2名以上登録してください';
      if (s.parties.some((p) => !p.name)) return '名称が未入力の当事者があります';
      if (s.parties.some((p) => !p.courtKey)) return '基準の簡易裁判所が未選択の当事者があります';
      if (s.attendees.some((a) => !a.name)) return '氏名が未入力の代理人等があります';
      if (s.attendees.some((a) => !a.courtKey)) return '基準の簡易裁判所が未選択の代理人等があります';
      if (s.attendees.some((a) => a.parties.length === 0)) return '代理する当事者が未選択の代理人等があります';
      return '';
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
