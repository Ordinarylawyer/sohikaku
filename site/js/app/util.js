// 訴訟費用額計算機（Web 版）― 画面の部品
//   DOM を組み立てる h()、お知らせ（toast）、小窓（modal）、数の書式など。外部のライブラリは使わない
(function (g) {
  'use strict';
  const SH = g.SH;
  const UI = (SH.UI = SH.UI || {});

  // h('div', { class: 'x', onclick: fn, dataset: {...} }, 子, 子, …)
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = !!v;
        else if (k === 'selected') el.selected = !!v;
        else if (k === 'disabled') el.disabled = !!v;
        else if (k === 'html') el.innerHTML = v; // 固定の文言だけに使う（入力された文字には使わない）
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    append(el, kids);
    return el;
  }
  function append(el, kids) {
    for (const k of kids) {
      if (k == null || k === false) continue;
      if (Array.isArray(k)) append(el, k);
      else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    }
  }

  // 入力欄。値が確定したとき（欄から離れた・Enter）に onCommit(値) を呼ぶ
  function textInput(fid, value, onCommit, opts) {
    opts = opts || {};
    const el = h('input', { type: opts.type || 'text', class: 'in ' + (opts.class || ''), value: value == null ? '' : value,
                           placeholder: opts.placeholder, 'data-fid': fid, 'aria-label': opts.label || opts.placeholder,
                           inputmode: opts.inputmode, min: opts.min, max: opts.max, step: opts.step, disabled: opts.disabled });
    el.addEventListener('change', () => onCommit(el.value));
    if (opts.type !== 'date') el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
    return el;
  }
  // 数の欄（空欄は null）
  function numInput(fid, value, onCommit, opts) {
    opts = Object.assign({ inputmode: 'numeric', class: 'num' }, opts || {});
    return textInput(fid, value == null ? '' : value, (v) => {
      const s = String(v).replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/[,，\s]/g, '');
      if (s === '') return onCommit(null);
      const n = Number(s);
      onCommit(isFinite(n) ? n : null);
    }, opts);
  }
  function select(fid, items, value, onChange, opts) {
    opts = opts || {};
    const el = h('select', { class: 'in ' + (opts.class || ''), 'data-fid': fid, 'aria-label': opts.label, disabled: opts.disabled },
      items.map((it) => {
        const v = typeof it === 'object' ? it.value : it;
        const t = typeof it === 'object' ? it.text : it;
        return h('option', { value: String(v), selected: String(v) === String(value) }, t);
      }));
    el.addEventListener('change', () => onChange(el.value));
    return el;
  }
  function checkbox(fid, checked, label, onChange, opts) {
    opts = opts || {};
    const box = h('input', { type: 'checkbox', checked, 'data-fid': fid, disabled: opts.disabled });
    box.addEventListener('change', () => onChange(box.checked));
    return h('label', { class: 'chk ' + (opts.class || ''), title: opts.title }, box, label ? h('span', null, label) : null);
  }
  function radios(name, items, value, onChange) {
    return h('div', { class: 'radios', role: 'radiogroup' }, items.map((it, i) => {
      const v = typeof it === 'object' ? it.value : it;
      const t = typeof it === 'object' ? it.text : it;
      const r = h('input', { type: 'radio', name, value: v, checked: String(v) === String(value), 'data-fid': name + '-' + i });
      r.addEventListener('change', () => { if (r.checked) onChange(v); });
      return h('label', { class: 'radio' }, r, h('span', null, t));
    }));
  }
  // 複数選択（チェックの並び）
  function multi(fid, items, selected, onChange) {
    const set = new Set(selected.map(String));
    return h('div', { class: 'multi' }, items.map((it) => checkbox(fid + '-' + it.value, set.has(String(it.value)), it.text, (on) => {
      const next = items.map((x) => x.value).filter((v) => (String(v) === String(it.value) ? on : set.has(String(v))));
      onChange(next);
    })));
  }
  function button(text, onclick, opts) {
    opts = opts || {};
    return h('button', { type: 'button', class: 'btn ' + (opts.class || ''), onclick, disabled: opts.disabled, title: opts.title,
                         'aria-label': opts.label, 'data-fid': opts.fid }, text);
  }
  const iconDel = (onclick, label) => button('🗑', onclick, { class: 'icon danger', label: label || '消去', title: label || '消去' });

  // お知らせ（数秒で消える）
  function toast(text, kind) {
    const box = document.getElementById('toasts');
    if (!box) return;
    const t = h('div', { class: 'toast ' + (kind || 'ok'), role: 'status' }, text);
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3200);
  }
  // 小窓。content は要素。buttons: [{text, onclick, class}]
  function modal(title, content, buttons, opts) {
    opts = opts || {};
    closeModal();
    const close = () => closeModal();
    const dlg = h('div', { class: 'modal-back', id: 'modal', onclick: (e) => { if (e.target.id === 'modal' && !opts.sticky) close(); } },
      h('div', { class: 'modal ' + (opts.class || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', null, title), h('div', { class: 'modal-body' }, content),
        h('div', { class: 'modal-foot' }, (buttons || [{ text: '閉じる' }]).map((b) =>
          button(b.text, () => { if (!b.onclick || b.onclick() !== false) close(); }, { class: b.class })))));
    document.body.appendChild(dlg);
    const f = dlg.querySelector('input,select,button');
    if (f) f.focus();
    document.addEventListener('keydown', escClose);
    return dlg;
  }
  function escClose(e) { if (e.key === 'Escape') closeModal(); }
  function closeModal() {
    const m = document.getElementById('modal');
    if (m) m.remove();
    document.removeEventListener('keydown', escClose);
  }

  const yen = (n) => (n == null || n === '' ? '' : SH.yen(Number(n)));
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  // 分数の表示（0.#### 形式）
  const frac = (x) => String(Math.round(x * 10000) / 10000);

  Object.assign(UI, { h, textInput, numInput, select, checkbox, radios, multi, button, iconDel, toast, modal, closeModal, yen, todayStr, frac });
})(typeof globalThis !== 'undefined' ? globalThis : this);
