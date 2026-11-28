// 訴訟費用額計算機（Web 版）― 主文・計算書（シート2）・小計の整形
// 参照実装 engine/Report.ps1（PowerShell）の Get-Decree / Get-CostSubtotals / Get-Sheet2 を移したもの。
(function (g) {
  'use strict';
  const SH = g.SH;
  const { prop, roundYen, roundYenGov, numSort, uniq, yen } = SH;

  // 主文の金額: 和式の 4 桁位取り・全角（6500 → ６５００ ／ 10000 → １万 ／ 100050 → １０万００５０）
  function yenJP(n) {
    if (n <= 0) return '０';
    const gs = [n % 10000, Math.floor(n / 10000) % 10000, Math.floor(n / 100000000) % 10000, Math.floor(n / 1000000000000)];
    const units = ['', '万', '億', '兆'];
    const idx = [0, 1, 2, 3].filter((i) => gs[i] > 0);
    const hi = Math.max(...idx), lo = Math.min(...idx);
    let out = '';
    for (let i = hi; i >= lo; i--) out += (i === hi ? String(gs[i]) : String(gs[i]).padStart(4, '0')) + units[i];
    return out.replace(/[0-9]/g, (d) => '０１２３４５６７８９'[+d]);
  }

  // 当事者の書き方: 立場で書く。同じ立場が 2 人以上なら氏名を添える。その他は氏名
  function partyLabel(c, id) {
    const p = c.Parties.find((x) => x.Id === id);
    if (!p) return '当事者' + id;
    const kind = p.Kind;
    if (kind !== '申立人' && kind !== '相手方') return String(p.Name);
    const same = c.Parties.filter((x) => x.Kind === kind);
    return same.length >= 2 ? kind + p.Name : kind;
  }

  function getDecree(c, result) {
    let lines = [];
    if (result.Debts.length === 0) return ['相手方が申立人に対して支払うべき訴訟費用額はない。'];
    const handled = new Set();
    // (1) 純粋な連帯債務は 1 項にまとめる
    for (const d of result.Debts.filter((x) => x.Obligors.length >= 2)) {
      let pure = true;
      for (const x of d.Obligors) {
        if (result.Debts.some((o) => o.Creditor === d.Creditor && o.Obligors.includes(x) && o !== d)) { pure = false; break; }
      }
      if (!pure) continue;
      const names = d.Obligors.slice().sort(numSort).map((x) => partyLabel(c, x));
      lines.push(names.join('及び') + 'は、連帯して、' + partyLabel(c, d.Creditor) + 'に対し、' + yenJP(d.Amount) + '円を支払え。');
      for (const x of d.Obligors) handled.add(x + '|' + d.Creditor);
    }
    // (2) それ以外は債務者ごとに 1 項
    const obligorIds = [];
    for (const d of result.Debts) for (const o of d.Obligors) if (!obligorIds.includes(o)) obligorIds.push(o);
    for (const x of obligorIds.slice().sort(numSort)) {
      const creditors = uniq(result.Debts.filter((d) => d.Obligors.includes(x)).map((d) => d.Creditor)).sort(numSort);
      for (const j of creditors) {
        if (handled.has(x + '|' + j)) continue;
        const ds = result.Debts.filter((d) => d.Creditor === j && d.Obligors.includes(x));
        let total = 0; for (const d of ds) total += d.Amount;
        if (total <= 0) continue;
        const joint = ds.filter((d) => d.Obligors.length >= 2);
        const xn = partyLabel(c, x), jn = partyLabel(c, j);
        if (joint.length === 0) {
          lines.push(xn + 'は、' + jn + 'に対し、' + yenJP(total) + '円を支払え。');
        } else if (joint.length === ds.length && joint.length === 1) {
          const o = joint[0].Obligors.filter((y) => y !== x).map((y) => partyLabel(c, y));
          lines.push(xn + 'は、' + jn + 'に対し、' + o.join('及び') + 'と連帯して' + yenJP(total) + '円を支払え。');
        } else {
          const frags = joint.map((d) => {
            const o = d.Obligors.filter((y) => y !== x).map((y) => partyLabel(c, y));
            return joint.length === 1 ? '内' + yenJP(d.Amount) + '円の限度で、' + o.join('及び') + 'と'
                                      : '内' + yenJP(d.Amount) + '円の限度で' + o.join('及び') + 'と';
          });
          const tail = frags.length === 1 ? frags[0] + '連帯して' : frags.join('、') + 'それぞれ連帯して';
          lines.push(xn + 'は、' + jn + 'に対し、' + yenJP(total) + '円（ただし、' + tail + '）を支払え。');
        }
      }
    }
    if (lines.length >= 2) lines = lines.map((l, i) => (i + 1) + '　' + l);
    return lines;
  }

  const ITEM_NAMES = {
    1: '1号 手数料', 2: '2号 法11条1項の費用', 3: '3号 執行官の手数料及び費用',
    4: '4号 当事者等の旅費・日当・宿泊料', 5: '5号 代理人の旅費・日当・宿泊料',
    6: '6号 書類の作成及び提出の費用', 7: '7号 官庁等からの書類交付費用',
    8: '8号 翻訳料', 9: '9号 文書等の送付費用', 10: '10号 裁判所選任弁護士の報酬及び費用',
    11: '11号 登録免許税', 12: '12号 債務名義正本の交付等の費用', 13: '13号 公証人の送達費用',
    14: '14号 官庁等の書類交付費用', 15: '15号 管理人・管財人の報酬及び費用', 16: '16号 地代等の代払',
    17: '17号 第三債務者の供託費用', 18: '18号 民法385条の通知費用'
  };
  const itemName = (n) => ITEM_NAMES[n] || (n + '号');

  // 費用計算書の小計行（11条1項の申立ての費用があれば、本案／申立て／合計の 3 行）
  function getCostSubtotals(c, result) {
    const out = [];
    const sum = (rows) => rows.reduce((t, x) => t + x.Amount, 0);
    for (const pool of c.Pools) {
      for (const party of c.Parties) {
        const pr = result.ExpandedCosts.filter((x) => x.PoolId === pool.Id && x.PartyId === party.Id);
        if (pr.length === 0) continue;
        const app = pr.filter((x) => x.AppCost);
        if (app.length === 0) { out.push({ PoolId: pool.Id, PartyId: party.Id, Name: '小計', Amount: sum(pr) }); continue; }
        const main = pr.filter((x) => !x.AppCost);
        out.push({ PoolId: pool.Id, PartyId: party.Id, Name: '小計（本案の費用）', Amount: sum(main) });
        out.push({ PoolId: pool.Id, PartyId: party.Id, Name: '小計（申立ての費用）', Amount: sum(app) });
        out.push({ PoolId: pool.Id, PartyId: party.Id, Name: '合計', Amount: sum(pr) });
      }
    }
    return out;
  }

  const ITEM_LAW = {
    1: '民訴費用法２①、３別表第１・１', 2: '民訴費用法２②、11Ⅰ①',
    4: '民訴費用法２④、民訴費用規２', 5: '民訴費用法２⑤、民訴費用規２',
    6: '民訴費用法２⑥、民訴費用規２の２', 7: '民訴費用法２⑦、民訴費用規２の３',
    8: '民訴費用法２⑧、民訴費用規３'
  };
  const itemLaw = (n) => ITEM_LAW[n] || '';
  const row = (Seq, Kind, No, Text, Amount, Paren, PartyId, Note) => ({ Seq, Kind, No, Text, Amount, Paren, PartyId, Note });

  // 費用区分の並び → 号。その中は入力順
  function sortCostRows(c, rows) {
    const out = [];
    for (const pl of c.Pools) {
      const inPool = rows.filter((r) => r.PoolId === pl.Id);
      for (const item of SH.sortedUniqNums(inPool.map((r) => r.Item))) out.push(...inPool.filter((r) => r.Item === item));
    }
    return out;
  }

  // 1号の摘要（審級の名前から）
  function feeName(c, poolId) {
    const pl = SH.getPool(c, poolId);
    const kind = String(prop(pl, 'Kind', '本体'));
    if (kind === '附帯控訴') return '附帯控訴提起手数料';
    if (kind === '附帯上告') return '附帯上告提起手数料';
    if (kind === '補助参加') return '補助参加申出手数料';
    if (kind !== '本体') return '手数料';
    const nm = String(prop(SH.getInstance(c, pl.InstanceId), 'Name', ''));
    if (nm.includes('上告受理')) return '上告受理申立て手数料';
    if (nm === '第一審') return '訴え提起手数料';
    if (nm === '控訴審') return '控訴提起手数料';
    if (nm === '上告審') return '上告提起手数料';
    if (nm === '抗告審') return '抗告提起手数料';
    return '手数料';
  }
  function costRowText(c, r) {
    const lb = String(prop(r, 'Label', ''));
    if (r.Item === 1 && (lb === '' || lb.startsWith('手数料'))) return feeName(c, r.PoolId) + (lb.length > 3 ? lb.substring(3) : '');
    if (lb) return lb;
    return itemName(r.Item);
  }
  function baseEntryText(c, result, e, multiPool, poolName) {
    const names = [];
    for (const r of result.ExpandedCosts) {
      if (r.PartyId === e.PartyId && r.PoolId === e.PoolId && r.Item === e.Item && r.RelatedId === e.RelatedId) {
        const n = costRowText(c, r);
        if (!names.includes(n)) names.push(n);
      }
    }
    let t = names.length > 0 ? names.join('・') : e.Item === 1 ? feeName(c, e.PoolId) : itemName(e.Item);
    if (multiPool) t = poolName.get(e.PoolId) + '　' + t;
    return t;
  }

  function getSheet2(c, result) {
    const out = [];
    let seq = 0;
    const multiPool = c.Pools.length >= 2;
    const poolName = new Map(c.Pools.map((pl) => [pl.Id, String(pl.Name)]));
    const order = c.Parties.filter((p) => p.Kind === '申立人').concat(c.Parties.filter((p) => p.Kind === '相手方'));
    const add = (...a) => { seq++; out.push(row(seq, ...a)); };

    for (const party of order) {
      const pr = result.ExpandedCosts.filter((x) => x.PartyId === party.Id);
      if (pr.length === 0) continue;
      add('head', 0, '（' + partyLabel(c, party.Id) + '分）', null, false, party.Id, '');
      const main = sortCostRows(c, pr.filter((x) => !x.AppCost));
      const app = sortCostRows(c, pr.filter((x) => x.AppCost));
      let no = 0, sub1 = 0, sub2 = 0;
      const itemRow = (r) => {
        let text = costRowText(c, r);
        if (multiPool) text = poolName.get(r.PoolId) + '　' + text;
        add('item', no, text, r.Amount, false, party.Id, itemLaw(r.Item));
      };
      for (const r of main) { no++; sub1 += r.Amount; itemRow(r); }
      if (app.length > 0) {
        add('sub', 0, '（以上の小計）', sub1, true, party.Id, '');
        for (const r of app) { no++; sub2 += r.Amount; itemRow(r); }
        add('sub', 0, '（以上の小計）', sub2, true, party.Id, '');
      }
      add('total', 0, '合計', sub1 + sub2, false, party.Id, '');

      const myRulings = c.Rulings.filter((r) => (result.BaseAmounts.get(r.Id + '|' + party.Id) || 0) > 0);
      for (const r of myRulings) {
        const baseAmt = result.BaseAmounts.get(r.Id + '|' + party.Id);
        const inBase = result.Base.filter((e) => e.RulingId === r.Id && e.PartyId === party.Id && r.ScopePools.includes(e.PoolId) && e.Amount > 0);
        let where = '';
        if (myRulings.length >= 2) {
          const pls = SH.sortedUniqNums(inBase.map((e) => e.PoolId)).map((id) => poolName.get(id));
          if (pls.length > 0) where = '・' + pls.join('・');
        }
        const entries = inBase.slice().sort((a, b) => (a.PoolId - b.PoolId) || (a.Item - b.Item) || (a.RelatedId - b.RelatedId) || (a.AttributedTo - b.AttributedTo));
        const colObs = r.Obligations.filter((o) => o.Column === party.Id);
        for (const o of colObs) {
          if (o.Obligors.includes(party.Id)) continue;
          const group = o.Obligors.slice().sort(numSort);
          const names = group.map((x) => partyLabel(c, x));
          const share = o.Num / o.Den;
          const isSplit = group.length >= 2 && SH.getObMode(o) === 'split';
          let colSum = 0; for (const o2 of colObs) colSum += o2.Num / o2.Den;
          const colOk = Math.abs(colSum - 1.0) <= 1e-9;
          const joint = group.length >= 2 && !isSplit ? '（連帯）' : '';
          add('prorate', 0, '案分計算（' + names.join('及び') + '負担分' + where + '）' + joint, null, false, party.Id, '');

          if (isSplit) {
            const dummy = { Warnings: [], Diffs: [] };
            for (const gg of group) {
              if (!colOk) break;
              const parts = []; let perG = 0;
              for (const e of entries) {
                let v;
                if (e.AttributedTo > 0 && group.includes(e.AttributedTo)) v = e.AttributedTo === gg ? e.Amount : 0;
                else if (e.AttributedTo > 0) v = e.Amount / group.length;
                else {
                  const w = SH.getAttributionWeights(c, SH.getInstanceOfPool(c, e.PoolId), party.Id, e.Item, group, e.RelatedId, dummy, '');
                  let sumW = 0; for (const val of w.values()) sumW += val;
                  v = sumW > 0 ? e.Amount * (w.get(gg) || 0) / sumW : 0;
                }
                perG += v;
                parts.push({ E: e, V: v });
              }
              if (perG <= 0) continue;
              add('prorate', 0, '（' + partyLabel(c, gg) + '関係分）', null, false, party.Id, '');
              for (const pp of parts) {
                const pv = roundYen(pp.V);
                if (pv <= 0) continue;
                let t = baseEntryText(c, result, pp.E, multiPool, poolName);
                if (pv !== pp.E.Amount) t += '　' + yen(pp.E.Amount) + '円のうち';
                add('prorate', 0, t, pv, false, party.Id, '');
              }
              const ga = roundYenGov(perG * share, SH.getIsGov(c, party.Id), SH.getIsGov(c, gg));
              add('prorate', 0, yen(roundYen(perG)) + '円×' + o.Num + '／' + o.Den, ga, false, party.Id, '');
            }
            continue;
          }
          if (entries.some((e) => e.AttributedTo > 0)) {
            for (const e of entries) {
              let t = baseEntryText(c, result, e, multiPool, poolName);
              if (e.AttributedTo > 0) {
                const all = result.C.get(party.Id + '|' + e.PoolId + '|' + e.Item + '|' + e.RelatedId) || 0;
                t += '　' + yen(all) + '円のうち' + partyLabel(c, e.AttributedTo) + '関係分';
              }
              add('prorate', 0, t, e.Amount, false, party.Id, '');
            }
          }
          const amt = roundYenGov(baseAmt * share, SH.getIsGov(c, party.Id), SH.testAnyGov(c, o.Obligors));
          add('prorate', 0, yen(baseAmt) + '円×' + o.Num + '／' + o.Den, amt, false, party.Id, '');
        }
      }
    }

    // 法定相殺（民訴法71条3項）
    const before = result.DebtsBeforeOffset || [];
    const ids = c.Parties.map((p) => p.Id).sort(numSort);
    const kindOf = (id) => prop(SH.getParty(c, id), 'Kind', '');
    for (const i of ids) {
      for (const j of ids) {
        if (i >= j) continue;
        let aSum = 0, bSum = 0;
        for (const d of before) {
          if (d.Creditor === j && d.Obligors.includes(i)) aSum += d.Amount;
          if (d.Creditor === i && d.Obligors.includes(j)) bSum += d.Amount;
        }
        if (aSum <= 0 || bSum <= 0) continue;
        let firstId = i, secondId = j, firstAmt, secondAmt;
        if (kindOf(i) === '申立人' && kindOf(j) === '相手方') { firstId = j; secondId = i; firstAmt = bSum; secondAmt = aSum; }
        else { firstAmt = aSum; secondAmt = bSum; }
        const offAmt = kindOf(firstId) === '相手方' && kindOf(secondId) === '申立人' ? Math.max(firstAmt - secondAmt, 0) : Math.abs(aSum - bSum);
        add('offset', 0, '法定相殺（民事訴訟法71条３項）', null, false, 0, '');
        add('offset', 0, partyLabel(c, firstId) + '負担額' + yen(firstAmt) + '円−' + partyLabel(c, secondId) + '負担額' + yen(secondAmt) + '円', offAmt, false, 0, '');
      }
    }
    return out;
  }

  Object.assign(SH, { yenJP, partyLabel, getDecree, getCostSubtotals, getSheet2, itemName, feeName, costRowText, ITEM_NAMES });
})(typeof globalThis !== 'undefined' ? globalThis : this);
