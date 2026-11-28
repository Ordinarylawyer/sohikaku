// 訴訟費用額計算機（Web 版）― 画面の骨組み（見出し・ステップバー・戻る／次へ・描き直し）
(function (g) {
  'use strict';
  const SH = g.SH;
  const A = SH.App;
  const { h, button } = SH.UI;

  A.state = A.empty();
  A.step = 1;
  A.out = null;        // 最後の計算の結果 { sig, case, result, decree, sheet2, subtotals, breakdown }
  A.view = {};         // 画面ごとの選択（入力ではないので JSON に入れない）
  A.STEPS = A.STEPS || {};
  const TITLES = ['基本情報', '当事者', '審級・費用区分', '負担の裁判', '支配関係の確認', '費目の選択', '期日と出欠', '費用入力', '計算結果', '出力'];
  A.TITLES = TITLES;

  // 入力を変えたら呼ぶ。描き直しは少し遅らせ、Tab で移った先の欄にフォーカスを戻す
  let pending = false;
  A.changed = function () {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; render(); }, 0);
  };
  A.go = function (n) {
    if (n < 1 || n > 10) return;
    if (A.step === 7 || n === 8 || n === 9) A.syncHearings();
    A.step = n;
    render(true);
    window.scrollTo(0, 0);
  };
  A.syncHearings = function () {
    try { A.hearing = A.syncHearingCosts(A.state); } catch (e) { console.error(e); }
  };
  A.reset = function (s) { A.state = s || A.empty(); A.out = null; A.view = {}; A.hearing = null; };
  A.isApplicant = () => A.state.header.role === 'applicant';

  function render(scrollTop) {
    const fid = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fid : null;
    const main = document.getElementById('app');
    const st = A.STEPS[A.step];
    document.getElementById('stepname').textContent = 'STEP ' + A.step + ' ／ 10　' + TITLES[A.step - 1];
    // ステップバー
    const bar = document.getElementById('stepbar');
    bar.replaceChildren(...TITLES.map((t, i) => h('button', { type: 'button', class: 'stepitem' + (i + 1 === A.step ? ' cur' : ''),
      'aria-current': i + 1 === A.step ? 'step' : null, onclick: () => A.go(i + 1) }, (i + 1) + '. ' + t)));
    // 本体
    main.replaceChildren();
    let msg = '';
    try {
      if (A.renderIntro) { const intro = A.renderIntro(A.step); if (intro) main.appendChild(intro); }
      st.render(main);
      msg = st.validate ? st.validate() || '' : '';
    } catch (e) {
      console.error(e);
      main.appendChild(h('p', { class: 'err' }, '画面の表示中に問題が起きました: ' + e.message));
    }
    // フッター
    const foot = document.getElementById('footer');
    const canNext = !msg || (st.nextAlways === true);
    foot.replaceChildren(
      A.step > 1 ? button('← 戻る', () => A.go(A.step - 1), { class: 'prev', fid: 'nav-prev' }) : h('span'),
      h('div', { class: 'valid', role: 'alert' }, msg),
      A.step < 10 ? button('次へ →', () => A.go(A.step + 1), { class: 'primary next', disabled: !canNext, fid: 'nav-next' }) : h('span'));
    if (fid) {
      const el = document.querySelector('[data-fid="' + CSS.escape(fid) + '"]');
      if (el) el.focus();
    }
    if (scrollTop) window.scrollTo(0, 0);
  }
  A.render = render;

  // 閉じる前の確認（入力があるとき）
  window.addEventListener('beforeunload', (e) => {
    if (A.state.parties.length || A.state.instances.length) { e.preventDefault(); e.returnValue = ''; }
  });
  document.addEventListener('DOMContentLoaded', () => {
    const mv = document.getElementById('mver');
    if (mv) mv.textContent = '単価マスタ：' + SH.MASTERS.version + ' 版';
    render();
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
