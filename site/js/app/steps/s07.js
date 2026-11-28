// STEP 7 期日と出欠 ― 期日ごとに誰がどう出たかを入れ、4号・5号の旅費・日当・宿泊料を計算する
(function (g) {
  'use strict';
  const SH = g.SH, A = SH.App;
  const { h, textInput, numInput, select, checkbox, button, iconDel, toast } = SH.UI;
  const KINDS = ['口頭弁論', '弁論準備手続', '書面による準備手続の協議', '和解', '尋問', '進行協議', '審尋', 'その他'];
  const ROLE_ITEM = (role) => (role === '訴訟代理人' ? '5号' : '4号');

  // 同じ日の期日の「順」を 1, 2, … に振り直す
  function normalizeSeq(s) {
    const groups = new Map();
    for (const x of s.hearings) { const k = x.instanceId + '|' + x.date; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
    for (const grp of groups.values()) grp.sort((a, b) => (a.seq - b.seq) || (a.id - b.id)).forEach((x, i) => { x.seq = i + 1; });
  }
  // 出欠の行を作る（当事者全員と、代理する当事者のある代理人等）
  function syncRows(s, hg) {
    const f500 = (kind, id) => { const f = s.inst500.find((q) => q.instanceId === hg.instanceId && q.subjectKind === kind && q.subjectId === id); return f ? f.within500m : false; };
    const blank = (kind, id) => ({ hearingId: hg.id, subjectKind: kind, subjectId: id, status: '欠席', days: 1, nights: 0, lodgingCode: '', kmOverride: 0,
      within500m: f500(kind, id), useActual: false, actualFare: 0, normalRoute: false, receipts: false, capOverride: 0, summoned: false,
      srcKind: '', srcLabel: '', srcKey: '', srcLat: 0, srcLon: 0, poolOverride: 0, noFare: false });
    const has = (kind, id) => s.attendance.some((a) => a.hearingId === hg.id && a.subjectKind === kind && a.subjectId === id);
    for (const p of s.parties) if (!has('party', p.id)) s.attendance.push(blank('party', p.id));
    for (const a of s.attendees) if (a.parties.length > 0 && !has('attendee', a.id)) s.attendance.push(blank('attendee', a.id));
  }
  A.syncAttendanceRows = syncRows;

  A.STEPS[7] = {
    nextAlways: true,
    render(root) {
      const s = A.state;
      if (s.instances.length === 0) { root.append(h('p', { class: 'empty' }, 'STEP 3 で審級を登録してください')); return; }
      const inst = A.instOf(s, A.view.hinst) || A.instSorted(s)[0];
      A.view.hinst = inst.id;
      const hs = s.hearings.filter((x) => x.instanceId === inst.id).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.seq - b.seq) || (a.id - b.id));
      let hg = s.hearings.find((x) => x.id === A.view.hearing && x.instanceId === inst.id) || hs[0] || null;
      A.view.hearing = hg ? hg.id : null;
      if (hg) syncRows(s, hg);
      const segs = A.rateSegments(s);
      const res = A.syncHearingCosts(s, segs);
      A.hearing = res;
      const rowOf = (a) => res.Rows.find((r) => r.RKey === a.hearingId + '|' + a.subjectKind + '|' + a.subjectId);

      const top = h('section', { class: 'card' },
        h('div', { class: 'row' },
          A.field('審級', select('h-inst', A.instSorted(s).map((i) => ({ value: i.id, text: i.name || '審級' + i.rank })), inst.id, (v) => { A.view.hinst = Number(v); A.view.hearing = null; A.changed(); })),
          h('span', null, '出頭場所：', inst.venueLabel ? h('b', null, inst.venueLabel) : h('span', { class: 'err' }, '（未設定。4号・5号は計算できません）')),
          button('出頭場所を選ぶ', () => A.pickCourt('出頭場所の選択', inst.venueLabel, (c) => {
            if (c) Object.assign(inst, { venueKind: c.kind, venueLabel: c.label, venueKey: c.key, venueLat: c.lat, venueLon: c.lon });
            else Object.assign(inst, { venueKind: '', venueLabel: '', venueKey: '', venueLat: 0, venueLon: 0 });
            A.changed(); }))),
        h('p', { class: 'hint' }, '審級ごとに期日を入れ、その期日に誰がどう出たかを選びます。距離・単価の区間・号（4号／5号）は自動で決まります。ウェブ会議等による参加は「Web」（旅費・宿泊料は生じず日当のみ）、出なかった人は「欠席」です。'));

      const left = h('section', { class: 'card hlist' },
        h('div', { class: 'row between' }, h('h2', null, '期日'),
          button('＋ 期日を追加', () => {
            const id = Math.max(100, s.hearings.reduce((m, x) => Math.max(m, x.id), 0)) + 1;
            s.hearings.push({ id, instanceId: inst.id, date: SH.UI.todayStr(), seq: 99, kind: '口頭弁論', venueKind: '', venueLabel: '', venueKey: '', venueLat: 0, venueLon: 0 });
            normalizeSeq(s); A.view.hearing = id; A.changed();
          }, { class: 'primary', fid: 'add-hearing' })),
        hs.length === 0 ? h('p', { class: 'empty' }, '期日がありません。') :
        hs.map((x) => {
          const sameDay = hs.filter((y) => y.date === x.date).length;
          return h('div', { class: 'hrow' + (hg && x.id === hg.id ? ' sel' : '') },
            h('div', { class: 'row tight' },
              button(hg && x.id === hg.id ? '選択中' : '選ぶ', () => { A.view.hearing = x.id; A.changed(); }, { class: 'small' + (hg && x.id === hg.id ? ' primary' : ''), label: '期日を選ぶ' }),
              textInput('hd' + x.id, x.date, (v) => { if (v) { x.date = v; normalizeSeq(s); A.changed(); } }, { type: 'date', label: '期日の日付' }),
              select('hk' + x.id, KINDS.includes(x.kind) || !x.kind ? KINDS.concat(x.kind ? [] : ['']) : KINDS.concat([x.kind]), x.kind, (v) => { x.kind = v; A.changed(); }, { label: '期日の種類' }),
              sameDay > 1 ? h('span', { class: 'sub' }, '順 ' + x.seq) : null,
              sameDay > 1 && x.seq > 1 ? button('▲', () => { const up = hs.find((y) => y.date === x.date && y.seq === x.seq - 1); if (up) { up.seq++; x.seq--; A.changed(); } }, { class: 'icon', label: '先に開かれた期日にする' }) : null,
              sameDay > 1 && x.seq < sameDay ? button('▼', () => { const dn = hs.find((y) => y.date === x.date && y.seq === x.seq + 1); if (dn) { dn.seq--; x.seq++; A.changed(); } }, { class: 'icon', label: '後に開かれた期日にする' }) : null,
              iconDel(() => {
                if (A.view.hdel !== x.id) { A.view.hdel = x.id; toast('もう一度押すと、この期日と出欠の行を削除します', 'warn'); return; }
                s.attendance = s.attendance.filter((a) => a.hearingId !== x.id); s.hearings = s.hearings.filter((y) => y !== x); A.view.hdel = 0; normalizeSeq(s); A.changed();
              }, '期日を消す')),
            x.kind === SH.NOT_HEARING_KIND ? h('p', { class: 'hint warn' }, '書面による準備手続の協議（民訴法176条2項）は、手続法規上の「期日」ではないため、出頭しても 4号・5号（旅費・日当・宿泊料）を計上しません（警告 H10）。') : null,
            h('div', { class: 'row tight sub' }, '出頭場所の上書き：', x.venueLabel || 'なし',
              button('変更', () => A.pickCourt('この期日の出頭場所', x.venueLabel, (c) => {
                if (c) Object.assign(x, { venueKind: c.kind, venueLabel: c.label, venueKey: c.key, venueLat: c.lat, venueLon: c.lon });
                else Object.assign(x, { venueKind: '', venueLabel: '', venueKey: '', venueLat: 0, venueLon: 0 });
                A.changed(); }), { class: 'small' }),
              x.venueLabel ? button('×', () => { Object.assign(x, { venueKind: '', venueLabel: '', venueKey: '', venueLat: 0, venueLon: 0 }); A.changed(); }, { class: 'icon', label: '出頭場所の上書きを消す' }) : null));
        }));

      let right;
      if (!hg) right = h('section', { class: 'card' }, h('p', { class: 'empty' }, '左で期日を追加・選択すると、出欠の行が出ます。'));
      else {
        const sameKind = hs.filter((y) => y.kind === hg.kind).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.seq - b.seq));
        const no = sameKind.indexOf(hg) + 1;
        const poolsHere = A.poolsOfInst(s, inst.id);
        const rows = s.attendance.filter((a) => a.hearingId === hg.id)
          .sort((a, b) => (a.subjectKind === b.subjectKind ? a.subjectId - b.subjectId : a.subjectKind === 'party' ? -1 : 1));
        const day = SH.dayOf(hg.date);
        const lodging = SH.getLodgingCodes(A.master(), day).map((code) => {
          const m = A.master().find((x) => x.ItemCode === code);
          return { value: code, text: (m && m.ItemName ? m.ItemName : code).replace('宿泊料（', '').replace('）', '') };
        });
        right = h('section', { class: 'card' },
          h('div', { class: 'row between' }, h('h2', null, '出欠 ― ' + hg.date.replace(/-/g, '/') + '　第' + no + '回　' + hg.kind),
            button('行を作り直す', () => { syncRows(s, hg); A.changed(); }, { title: 'STEP 2 で後から当事者・代理人等を足したときに押します' })),
          rows.length === 0 ? h('p', { class: 'empty' }, 'STEP 2 で当事者を登録してください。') :
          rows.map((a) => attRow(s, a, rowOf(a), lodging, poolsHere)));
      }

      const warn = h('section', { class: 'card' },
        h('h2', null, '警告'),
        res.Warnings.length === 0 ? h('p', { class: 'ok' }, '警告はありません。') : h('ul', { class: 'warnlist' }, res.Warnings.map((w) => h('li', null, w))),
        h('p', { class: 'hint' }, 'H1・H3・H7＝計上しない行がある／H4＝宿泊料 0／H5＝実費によらず規則の額／H6＝5号ただし書で減額／H8＝区分をまとめた／H9＝外国からの出頭（日当・宿泊料は証人の例による）。費用法2条4号・5号、費用規則2条／書実研15号 22頁、29〜37頁'));

      root.append(top, h('div', { class: 'cols h7' }, left, right), warn);
    },
    validate() {
      const s = A.state;
      if (s.instances.some((i) => !i.venueKey) && s.hearings.length) return '出頭場所が未設定の審級があります（4号・5号は計算できません）';
      const r = A.hearing;
      if (r && r.Warnings.some((w) => /^H[137]:/.test(w))) return '計上できない出欠の行があります（下の警告を確認してください）';
      return '';
    }
  };

  function attRow(s, a, r, lodging, poolsHere) {
    const isParty = a.subjectKind === 'party';
    const subj = isParty ? A.partyOf(s, a.subjectId) : s.attendees.find((x) => x.id === a.subjectId);
    if (!subj) return null;
    const role = isParty ? '本人' : subj.kind;
    const fid = 'at' + a.hearingId + a.subjectKind + a.subjectId;
    const set = (k, v) => { a[k] = v; A.changed(); };
    const out = a.status !== '欠席';
    const foreign = a.srcKind === '外国';
    const srcText = (foreign ? '出発地：外国（旅費は実費。日当・宿泊料は警告 H9）'
      : a.srcKey ? '出発地：' + a.srcLabel + '（この期日だけ）' : '出発地：' + (subj.courtLabel || '（基準の簡易裁判所が未選択）') + '（既定）')
      + (a.noFare ? '　旅費：請求せず（日当・宿泊料のみ）' : '');
    const amount = !out ? '' : !r ? '計上しない' : r.Dropped ? '計上しない' : SH.UI.yen(r.Amount) + '円';
    return h('div', { class: 'att' + (out ? ' on' : '') },
      h('div', { class: 'row tight' },
        h('span', { class: 'tag' }, role), h('b', { class: 'aname' }, subj.name || ''), h('span', { class: 'sub' }, ROLE_ITEM(role)),
        select(fid + '-st', ['出頭', 'Web', '欠席'], a.status, (v) => set('status', v), { label: '出欠' }),
        checkbox(fid + '-sum', a.summoned, '呼出', (v) => set('summoned', v), { title: '手続法規の定めによる出頭命令・呼出しを受けた人（人ごと）' }),
        out ? h('span', { class: 'row tight' }, '日数', numInput(fid + '-days', a.days, (v) => set('days', Math.max(0, Math.trunc(v || 0))), { class: 'num tiny', label: '日数' })) : null,
        out && a.status === '出頭' ? h('span', { class: 'row tight' }, '泊数', numInput(fid + '-n', a.nights, (v) => set('nights', Math.max(0, Math.trunc(v || 0))), { class: 'num tiny', label: '泊数' })) : null,
        out && a.status === '出頭' && a.nights > 0 ? select(fid + '-lodge', [{ value: '', text: '（宿泊地）' }].concat(lodging), a.lodgingCode, (v) => set('lodgingCode', v), { label: '宿泊地' }) : null,
        out ? h('span', { class: 'sub' }, foreign ? '外国' : (r ? r.Km : 0) + 'km') : null,
        h('b', { class: 'amt' }, amount)),
      out ? h('div', { class: 'row tight sub' },
        !foreign && !a.noFare ? checkbox(fid + '-act', a.useActual, '実費による', (v) => set('useActual', v)) : null,
        !a.noFare && (a.useActual || foreign) ? h('span', { class: 'row tight' }, '実費（往復）', numInput(fid + '-fare', a.actualFare, (v) => set('actualFare', Math.max(0, Math.trunc(v || 0))), { class: 'num short', label: '旅費の実費' }), '円') : null,
        !a.noFare && (a.useActual || foreign) ? checkbox(fid + '-nr', a.normalRoute, '通常の経路', (v) => set('normalRoute', v)) : null,
        !a.noFare && a.useActual && !foreign ? checkbox(fid + '-rc', a.receipts, '領収書あり', (v) => set('receipts', v)) : null,
        !foreign ? h('span', { class: 'row tight' }, '距離の上書き', numInput(fid + '-km', a.kmOverride || null, (v) => set('kmOverride', Math.max(0, Math.trunc(v || 0))), { class: 'num tiny', label: '距離の上書き（km）' }), 'km') : null,
        !foreign ? checkbox(fid + '-500', a.within500m, '半径500m以内', (v) => set('within500m', v)) : null,
        role === '訴訟代理人' ? h('span', { class: 'row tight' }, '上限の手入力', numInput(fid + '-cap', a.capOverride || null, (v) => set('capOverride', Math.max(0, Math.trunc(v || 0))), { class: 'num short', label: '上限の手入力' }), '円') : null,
        r && r.Dropped ? h('span', { class: 'err' }, r.Dropped) : null,
        r && r.Cap && r.Amount < r.Gross ? h('span', { class: 'warn' }, '上限 ' + SH.UI.yen(r.Cap) + '円に減額') : null) : null,
      out ? h('div', { class: 'row tight sub' }, srcText,
        button('変更', () => A.pickCourt('この期日の出発地', a.srcLabel, (c) => {
          if (c) Object.assign(a, { srcKind: c.kind, srcLabel: c.label, srcKey: c.key, srcLat: c.lat, srcLon: c.lon, within500m: false });
          else clearSrc(s, a);
          A.changed(); }), { class: 'small' }),
        button('外国から', () => { Object.assign(a, { srcKind: '外国', srcLabel: '外国', srcKey: '', srcLat: 0, srcLon: 0, within500m: false }); A.changed(); }, { class: 'small' }),
        a.srcKind || a.srcKey ? button('×', () => { clearSrc(s, a); A.changed(); }, { class: 'icon', label: '出発地を既定に戻す' }) : null,
        // 【2026-11-24】旅費を請求しない（日当だけを請求する）。Web・欠席はもともと旅費が生じない
        button(a.noFare ? '旅費を請求する' : '請求せず', () => set('noFare', !a.noFare),
          { class: 'small' + (a.noFare ? ' primary' : ''), title: '旅費を請求せず、日当（・宿泊料）だけを請求する', label: a.noFare ? '旅費を請求する（請求せずを取り消す）' : '旅費を請求しない' }),
        poolsHere.length >= 2 ? select(fid + '-pool', [{ value: 0, text: '区分：既定' }].concat(poolsHere.map((p) => ({ value: p.id, text: p.name }))), a.poolOverride || 0,
          (v) => set('poolOverride', Number(v)), { label: '費用区分' }) : null) : null);
  }
  function clearSrc(s, a) {
    const hg = s.hearings.find((x) => x.id === a.hearingId);
    const f = hg ? s.inst500.find((q) => q.instanceId === hg.instanceId && q.subjectKind === a.subjectKind && q.subjectId === a.subjectId) : null;
    Object.assign(a, { srcKind: '', srcLabel: '', srcKey: '', srcLat: 0, srcLon: 0, within500m: f ? f.within500m : false });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
