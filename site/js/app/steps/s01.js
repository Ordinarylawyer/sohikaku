// STEP 1 基本情報 ― 使う人の立場、頭書き、相手方の費用の取扱い、入力の復元・全部消去
(function (g) {
  'use strict';
  const SH = g.SH, A = SH.App;
  const { h, textInput, radios, button, toast, modal } = SH.UI;

  const MODES = [
    { value: 'none', text: '通常（双方の費用を計上する）' },
    { value: 'A', text: '相手方のみが負担する（規則25条1項ただし書）' },
    { value: 'B', text: '相手方が費用計算書を提出しない（規則25条3項）' }
  ];

  function restoreFrom(text) {
    let j;
    try { j = JSON.parse(String(text).replace(/^﻿/, '').trim()); }
    catch (e) { toast('JSON として読めません。最初の「{」から最後の「}」まで全部貼り付けてください', 'err'); return false; }
    try { A.reset(A.fromJSON(j)); }
    catch (e) { toast(e.message, 'err'); return false; }
    A.syncHearings();
    toast('復元しました。STEP 9 で［計算する］を押し直してください');
    A.changed();
    return true;
  }
  A.restoreFrom = restoreFrom;

  A.STEPS[1] = {
    nextAlways: true,
    render(root) {
      const s = A.state, hd = s.header;
      const applicant = A.isApplicant();
      const set = (k) => (v) => { hd[k] = v; A.changed(); };

      root.append(
        h('section', { class: 'card' },
          h('h2', null, 'この計算機を使う人'),
          radios('role', [{ value: 'clerk', text: '裁判所書記官（処分書を起案する）' }, { value: 'applicant', text: '申立人・代理人（申立書を作る）' }],
                 applicant ? 'applicant' : 'clerk', (v) => { hd.role = v === 'applicant' ? 'applicant' : ''; if (v === 'applicant') { s.options.opponentMode = 'none'; s.options.opponentIds = []; } A.changed(); }),
          h('p', { class: 'hint' }, applicant
            ? '計算は書記官用と同じです。STEP 10 で、訴訟費用額確定処分の申立書（Word）と費用計算書（Excel）を作れます（処分の見込み〔主文案〕も確かめられます）。'
            : 'STEP 10 で、処分書（Word）と別紙の計算書（Excel）を作れます。')),
        h('div', { class: 'cols' },
          h('section', { class: 'card' },
            h('h2', null, applicant ? '申立書の頭書き' : '事件の表示（処分書の頭書き）'),
            applicant ? [
              field('宛先の裁判所', textInput('hd-court', hd.courtName, set('courtName'), { placeholder: '例: ○○地方裁判所' })),
              field('部・係', textInput('hd-div', hd.division, set('division'), { placeholder: '例: 民事第○部（空欄可）' })),
              field('申立人の表示（記名）', textInput('hd-signer', hd.signer, set('signer'), { placeholder: '例: 申立人代理人弁護士　甲野太郎' })),
              field('申立日', textInput('hd-day', hd.issueDay, set('issueDay'), { type: 'date' })),
              h('p', { class: 'hint' }, '基本事件の事件番号は STEP 3 で審級ごとに入れます。')
            ] : [
              field('申立事件番号', textInput('hd-caseno', hd.caseNoMo, set('caseNoMo'), { placeholder: '例: 令和８年（モ）第１２３号' })),
              field('裁判所', textInput('hd-court', hd.courtName, set('courtName'), { placeholder: '例: ○○地方裁判所' })),
              field('部', textInput('hd-div', hd.division, set('division'), { placeholder: '例: 民事第○部' })),
              field('書記官', textInput('hd-clerk', hd.clerk, set('clerk'), { placeholder: '氏名（肩書きは付けない）' })),
              field('処分日', textInput('hd-day', hd.issueDay, set('issueDay'), { type: 'date' })),
              h('p', { class: 'hint' }, '入れた文字はそのまま処分書に出ます。申立事件番号には事件名を付けません（「訴訟費用額確定処分申立事件」は自動で付きます）。')
            ]),
          applicant ? null : h('section', { class: 'card' },
            h('h2', null, '相手方の費用の取扱い'),
            radios('opmode', MODES, s.options.opponentMode, (v) => { s.options.opponentMode = v; if (v === 'none') s.options.opponentIds = []; A.changed(); }),
            s.options.opponentMode !== 'none' ? h('div', null,
              h('p', { class: 'label' }, '対象の相手方（費用を計上しない相手方）'),
              s.parties.length === 0 ? h('p', { class: 'hint' }, 'STEP 2 で当事者を登録してから選びます。')
                : SH.UI.multi('opp', s.parties.map((p) => ({ value: p.id, text: (p.name || '当事者' + p.id) + '（' + p.kind + '）' })),
                    s.options.opponentIds, (v) => { s.options.opponentIds = v.map(Number); A.changed(); }),
              s.options.opponentMode === 'B' ? h('p', { class: 'hint warn' }, '本来生じ得た相手方の償還請求権を計上しません。相手方が別途申立てをすることは妨げられません。') : null) : null,
            h('p', { class: 'hint' }, '民訴規則25条1項・3項／書実研15号 84頁・89頁（注36）'))),
        h('section', { class: 'card' },
          h('h2', null, '入力内容の復元'),
          h('p', { class: 'hint' }, 'STEP 10 で保存した JSON ファイルを選ぶか、JSON を下の欄に貼り付けて［復元する］を押します。'),
          h('div', { class: 'row' },
            fileButton(),
            button('全部消して新規', () => {
              modal('全部消して新規', h('p', null, '入力をすべて消します。元に戻せません。続きをする事件は、先に STEP 10 で JSON を保存してください。'),
                [{ text: '消す', class: 'danger', onclick: () => { A.reset(); toast('入力内容を消去しました'); A.changed(); } }, { text: 'やめる' }]);
            }, { class: 'danger-outline' })),
          (() => {
            const ta = h('textarea', { class: 'json', rows: 5, placeholder: '{ "parties": [ … ] … }', 'data-fid': 'restore-text', 'aria-label': '復元する JSON' });
            return h('div', null, ta, button('復元する', () => { if (ta.value.trim()) restoreFrom(ta.value); }, { class: 'primary' }));
          })(),
          A.renderDataNote('s1'))
      );
    }
  };

  function fileButton() {
    const inp = h('input', { type: 'file', accept: '.json,application/json,text/plain', class: 'hidden', 'aria-label': 'JSON ファイルを選ぶ' });
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const rd = new FileReader();   // 手元のファイルを読むだけ（送信しない）
      rd.onload = () => restoreFrom(rd.result);
      rd.readAsText(f, 'utf-8');
      inp.value = '';
    });
    return h('span', null, inp, button('JSON ファイルを選んで復元', () => inp.click(), { class: 'primary' }));
  }
  function field(label, input) { return h('label', { class: 'field' }, h('span', { class: 'label' }, label), input); }
  A.field = field;
})(typeof globalThis !== 'undefined' ? globalThis : this);
