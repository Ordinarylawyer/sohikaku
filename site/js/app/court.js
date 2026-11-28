// 裁判所の選択。簡易裁判所マスター（438 庁）から選ぶ。
//   選んだ結果: { kind: '簡裁'|'地家裁'|'高裁'|'最高裁', label: 表示名, key: 距離を測る簡裁, lat, lon }
//   地方裁判所・高等裁判所・最高裁判所を選んでも、距離は同じ所にある簡易裁判所の位置で測る
(function (g) {
  'use strict';
  const SH = g.SH, A = SH.App;
  const { h, radios, button, modal, closeModal } = SH.UI;
  const KINDS = [{ value: '簡裁', text: '簡易裁判所' }, { value: '地家裁', text: '地方裁判所・家庭裁判所' }, { value: '高裁', text: '高等裁判所' }, { value: '最高裁', text: '最高裁判所' }];

  function view(kind) {
    const cs = SH.MASTERS.courts;
    if (kind === '簡裁') return cs.map((c) => ({ label: c.Court, c }));
    if (kind === '地家裁') return cs.filter((c) => c.DistFam).map((c) => ({ label: c.DistFam, c }));
    if (kind === '高裁') return cs.filter((c) => c.High).map((c) => ({ label: c.High, c }));
    return cs.filter((c) => c.Court === '東京簡易裁判所').map((c) => ({ label: '最高裁判所', c }));
  }

  // current: 今の選択の表示名。onPick(結果 | null)。null は「選択を取り消す」
  A.pickCourt = function (title, current, onPick) {
    let kind = '簡裁', q = '';
    const listBox = h('div', { class: 'courtlist', role: 'listbox', 'aria-label': '裁判所の一覧' });
    const count = h('p', { class: 'hint' });
    const search = h('input', { type: 'search', class: 'in wide', placeholder: '名前の一部で絞り込む（例: 函館／家庭／秋田／支部）', 'aria-label': '名前で絞り込む' });
    search.addEventListener('input', () => { q = search.value.trim(); fill(); });
    function fill() {
      const rows = view(kind).filter((v) => !q || v.label.includes(q));
      count.textContent = rows.length + ' 件';
      listBox.replaceChildren(...rows.slice(0, 600).map((v) => h('button', { type: 'button', class: 'courtrow', role: 'option',
        onclick: () => { closeModal(); onPick({ kind, label: v.label, key: v.c.Court, lat: Number(v.c.Lat), lon: Number(v.c.Lon) }); } },
        h('span', { class: 'cname' }, v.label), h('span', { class: 'caddr' }, v.c.Addr || ''))));
    }
    const kindBox = radios('courtkind', KINDS, kind, (v) => { kind = v; search.hidden = !(v === '簡裁' || v === '地家裁'); fill(); });
    const body = h('div', null,
      h('p', { class: 'hint' }, '4号・5号の距離は、2 つの簡易裁判所の主たる庁舎の間の直線距離（1km 未満切捨て）で測ります（費用規則2条1項1号）。'),
      kindBox, search, count, listBox,
      h('p', { class: 'hint' }, '選択中: ' + (current || '（なし）')));
    modal(title || '裁判所の選択', body, [
      { text: '選択を取り消す', class: 'danger-outline', onclick: () => { onPick(null); } },
      { text: '← 戻る' }], { class: 'wide' });
    fill();
    search.focus();
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
