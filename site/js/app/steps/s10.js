// STEP 10 出力 ― Excel の作成とダウンロード（ブラウザの中で作る。どこにも送らない）、入力内容の保存（JSON ファイル）
(function (g) {
  'use strict';
  const SH = g.SH, A = SH.App;
  const { h, button, toast } = SH.UI;

  // ファイルをダウンロードさせる（ブラウザの中で作ったデータを、利用者の手元に保存するだけ）
  A.download = function (name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  const safeName = (t) => String(t || '').replace(/[\\/:*?"<>|\r\n]/g, '').trim();
  A.baseName = function () {
    const s = A.state;
    if (!A.isApplicant() && s.header.caseNoMo) return safeName(s.header.caseNoMo);
    const i = A.instSorted(s)[0];
    return safeName(i && i.caseNo) || '訴訟費用額計算';
  };

  A.STEPS[10] = {
    render(root) {
      const s = A.state;
      const fresh = A.outFresh();
      const errs = A.out ? A.out.result.Errors.length : 0;
      const why = !A.out ? 'STEP 9 で［計算する］を押してください' : !fresh ? '計算した後に入力が変わっています。STEP 9 で計算し直してください' : errs ? 'エラーがあります。STEP 9 で直してから計算し直してください' : '';
      const applicant = A.isApplicant();
      const dl = (text, fn, kind, primary) => button(text, () => run(fn, kind), { class: primary ? 'primary' : '', disabled: !!why });
      const excel = h('section', { class: 'card' },
        h('h2', null, '書面の作成（Word・Excel）'),
        h('p', { class: 'hint' }, applicant
          ? '訴訟費用額確定処分の申立書（Word）と費用計算書（Excel）を、このブラウザの中で作ってダウンロードします。入力はどこにも送られません。'
          : '処分書（Word）と別紙の計算書（Excel。計算書・内訳・データの 3 シート）を、このブラウザの中で作ってダウンロードします。入力はどこにも送られず、メールも使いません。'),
        applicant ? [
          h('div', { class: 'row' }, dl('申立書（Word）', 'makeWord', 'applicant', true), dl('費用計算書（Excel）', 'makeExcel', 'applicant', true)),
          h('p', { class: 'label' }, '処分の見込み（確かめる用）'),
          h('div', { class: 'row' }, dl('主文案（Word）', 'makeWord', 'clerk'), dl('計算書（Excel）', 'makeExcel', 'clerk'))
        ] : h('div', { class: 'row' }, dl('処分書（Word）', 'makeWord', 'clerk', true), dl('計算書（Excel）', 'makeExcel', 'clerk', true)),
        why ? h('p', { class: 'err' }, why) : null,
        h('p', { class: 'hint' }, applicant ? '申立書は下書きです。内容と提出先の裁判所の様式を確かめてから提出してください。' : '処分書・計算書は起案の下書きです。内容を確かめ、所定の方法で処分をしてください（民訴規則26条）。'));

      const json = JSON.stringify(A.toJSON(s, A.outForJSON()), null, 4);
      const ta = h('textarea', { class: 'json', rows: 14, readonly: true, 'aria-label': '保存用の JSON' });
      ta.value = json;
      const save = h('section', { class: 'card' },
        h('h2', null, '入力内容の保存（JSON）'),
        h('p', { class: 'hint' }, 'このアプリは、入力をサーバーにもブラウザにも保存しません（閉じると消えます）。続きをするときは、JSON ファイルを保存しておき、STEP 1 で読み込みます。'),
        h('div', { class: 'row' },
          button('JSON ファイルを保存', () => { A.download(A.baseName() + '.json', json, 'application/json'); }, { class: 'primary' }),
          button('クリップボードにコピー', () => {
            const done = () => toast('コピーしました');
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(json).then(done, () => { ta.select(); document.execCommand('copy'); done(); });
            else { ta.select(); document.execCommand('copy'); done(); }
          })),
        ta,
        h('p', { class: 'hint warn' }, 'JSON には当事者の氏名・住所などがそのまま入っています。保存場所と消去は、所属の情報の取扱いの定めに従ってください。'),
        A.renderDataNote('s10'));
      root.append(h('div', { class: 'cols' }, excel, save));
    },
    validate() { return ''; }
  };

  async function run(fn, kind) {
    try {
      const { name, blob } = await A[fn](kind);
      A.download(name, blob);
      toast('作りました（' + name + '）');
    } catch (e) {
      console.error(e);
      toast('ファイルを作れませんでした: ' + e.message, 'err');
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
