// 訴訟費用額計算機（Web 版）― 計算エンジン本体（Phase 1〜7）
// 参照実装 engine/CostEngine.ps1（PowerShell）をそのまま移したもの。関数の名前・順序・警告の文言をそろえてある
// （参照実装の結果と 1 件ずつ突き合わせて確かめる。tests/）。
(function (g) {
  'use strict';
  const SH = g.SH;
  const { prop, roundYen, roundYenGov, sortedUniqNums, uniq, numSort, yen, psStringCompare } = SH;

  // ---- 事件 ------------------------------------------------------------------
  function newCase(o) {
    const opt = Object.assign({}, o.Options || {});
    if (!('OpponentMode' in opt)) opt.OpponentMode = 'none';
    if (!('OpponentIds' in opt)) opt.OpponentIds = [];
    if (!('ClaimedTotals' in opt)) opt.ClaimedTotals = {};
    return {
      Parties: o.Parties || [], Instances: o.Instances || [], Pools: o.Pools || [],
      OpponentScopes: o.OpponentScopes || [], Claims: o.Claims || [], Rulings: o.Rulings || [],
      Costs: o.Costs || [], Options: opt, SeedDebts: o.SeedDebts || []
    };
  }

  const getInstance = (c, id) => c.Instances.find((x) => x.Id === id);
  const getPool = (c, id) => c.Pools.find((x) => x.Id === id);
  const getParty = (c, id) => c.Parties.find((x) => x.Id === id);
  const getInstanceOfPool = (c, poolId) => getPool(c, poolId).InstanceId;
  const getObMode = (o) => prop(o, 'Mode', 'joint');
  function getIsGov(c, id) { const p = getParty(c, id); return p ? !!prop(p, 'IsGov', false) : false; }
  function testAnyGov(c, obligors) { return obligors.some((x) => getIsGov(c, x)); }
  function getPartyKind(c, id) { const p = getParty(c, id); return p ? prop(p, 'Kind', '') : ''; }
  function getPartyName(c, id) { const p = getParty(c, id); return p ? prop(p, 'Name', '当事者' + id) : '当事者' + id; }

  function pairKey(poolId, a, b) { return a <= b ? poolId + '|' + a + '|' + b : poolId + '|' + b + '|' + a; }

  function getCandidates(c, dominant, poolId, j) {
    return c.Parties.filter((p) => p.Id !== j && dominant.has(pairKey(poolId, j, p.Id))).map((p) => p.Id);
  }
  function testBears(ruling, col, who) {
    return ruling.Obligations.some((o) => o.Column === col && o.Obligors.includes(who));
  }
  // 相手方の範囲の推定
  function getScopeSuggestion(c, j, m) {
    for (const r of c.Rulings) if (testBears(r, j, m) || testBears(r, m, j)) return true;
    for (const r of c.Rulings) {
      for (const p of c.Parties) {
        const k = p.Id;
        if (k === j || k === m) continue;
        if ((testBears(r, j, k) && testBears(r, m, k)) || (testBears(r, k, j) && testBears(r, k, m))) return false;
      }
    }
    return true;
  }

  // 金額を重みで割り、1円未満を四捨五入。合計が合わなければ Diffs に記録する（自動調整しない）
  function splitAmount(amount, weights, result, label) {
    const keys = [...weights.keys()].sort(numSort);
    let sumW = 0; for (const k of keys) sumW += weights.get(k);
    const alloc = new Map(); let sumA = 0;
    for (const k of keys) { const a = roundYen(amount * weights.get(k) / sumW); alloc.set(k, a); sumA += a; }
    if (sumA !== amount) result.Diffs.push(label + ' = ' + (amount - sumA) + ' 円');
    return alloc;
  }

  // 振り分けの重み（書実研15号 B説・分属で共通）
  function getAttributionWeights(c, instanceId, party, item, targets, relatedId, result, label) {
    if (relatedId > 0) {
      if (targets.includes(relatedId)) return new Map([[relatedId, 1.0]]);
      result.Warnings.push('振り分け: 関係する相手方（当事者' + relatedId + '）が振り分け先にいないため共通の費用として扱った（' + label + '）');
    }
    let w = new Map();
    if (item === 1) {
      const instClaims = c.Claims.filter((x) => x.InstanceId === instanceId);
      const own = instClaims.filter((x) => x.From === party && targets.includes(x.To));
      let anyRow = false; const noRow = [];
      for (const m of targets) {
        const cl = own.length > 0 ? instClaims.filter((x) => x.From === party && x.To === m)
                                  : instClaims.filter((x) => x.From === m && x.To === party);
        if (cl.length === 0) { w.set(m, 0.0); noRow.push(m); continue; }
        anyRow = true;
        let sum = 0; for (const x of cl) sum += Number(x.Amount);
        w.set(m, sum);
      }
      if (anyRow) {
        let total = 0; for (const m of targets) total += w.get(m);
        if (total > 0) {
          if (noRow.length > 0) result.Warnings.push('振り分け: 請求のない相手（当事者' + noRow.join('・') + '）には手数料を振り分けない（' + label + '）');
          return w;
        }
        result.Warnings.push('振り分け: 請求額がすべて0円のため人数で按分した（' + label + '）');
      } else {
        result.Warnings.push('振り分け: 請求額が未入力のため人数で按分した（' + label + '）');
      }
      w = new Map();
    }
    for (const m of targets) w.set(m, 1.0);
    return w;
  }

  // ---- Phase 1 費用の集計 ------------------------------------------------------
  function phase1(c, result) {
    let hasApplicant = false;
    for (const p of c.Parties) {
      const kind = String(prop(p, 'Kind', ''));
      if (!['申立人', '相手方', 'その他'].includes(kind)) result.Errors.push('V6: 当事者の区分が不正（申立人／相手方／その他のいずれか）(当事者' + p.Id + " '" + kind + "')");
      if (kind === '申立人') hasApplicant = true;
    }
    if (!hasApplicant) result.Errors.push('V6: 申立人がいない');

    const rows = [];
    for (const cost of c.Costs) {
      const payers = prop(cost, 'Payers', []);
      const rel = prop(cost, 'RelatedId', 0);
      if (payers.length < 2) {
        const partyOfCost = payers.length === 1 ? payers[0] : cost.PartyId;
        rows.push({ PartyId: partyOfCost, PoolId: cost.PoolId, Item: cost.Item, Amount: cost.Amount, RelatedId: rel,
                    Label: prop(cost, 'Label', ''), AppCost: !!prop(cost, 'AppCost', false), Shared: false, SegNo: prop(cost, 'SegNo', 1) });
        continue;
      }
      const instId = getInstanceOfPool(c, cost.PoolId);
      let w = new Map(); for (const p of payers) w.set(p, 1.0);
      if (cost.Item === 1) {
        const wc = new Map(); let anyRow = false; const noRow = [];
        const instClaims = c.Claims.filter((x) => x.InstanceId === instId);
        const anyFrom = instClaims.some((x) => payers.includes(x.From));
        for (const p of payers) {
          const cl = anyFrom ? instClaims.filter((x) => x.From === p) : instClaims.filter((x) => x.To === p);
          if (cl.length === 0) { wc.set(p, 0.0); noRow.push(p); continue; }
          anyRow = true;
          let sum = 0; for (const x of cl) sum += Number(x.Amount);
          wc.set(p, sum);
        }
        if (!anyRow) {
          result.Warnings.push('共同支出: 請求額が未入力のため人数で振り分けた（区分' + cost.PoolId + ' 号' + cost.Item + '）');
        } else {
          let total = 0; for (const p of payers) total += wc.get(p);
          if (total > 0) {
            w = wc;
            if (noRow.length > 0) result.Warnings.push('共同支出: 請求のない支出者（当事者' + noRow.join('・') + '）には手数料を振り分けない（区分' + cost.PoolId + ' 号' + cost.Item + '）');
          } else result.Warnings.push('共同支出: 請求額がすべて0円のため人数で振り分けた（区分' + cost.PoolId + ' 号' + cost.Item + '）');
        }
      }
      const alloc = splitAmount(cost.Amount, w, result, '共同支出の振り分け差額: 区分' + cost.PoolId + ' 号' + cost.Item);
      for (const p of [...alloc.keys()].sort(numSort)) {
        rows.push({ PartyId: p, PoolId: cost.PoolId, Item: cost.Item, Amount: alloc.get(p), RelatedId: rel,
                    Label: prop(cost, 'Label', ''), AppCost: !!prop(cost, 'AppCost', false), Shared: true, SegNo: prop(cost, 'SegNo', 1) });
      }
    }
    result.ExpandedCosts = rows;

    const costMap = new Map();
    const outsiders = [];
    for (const cost of rows) {
      if (getPartyKind(c, cost.PartyId) === 'その他') {
        if (!outsiders.includes(cost.PartyId)) outsiders.push(cost.PartyId);
        continue;
      }
      if (c.Options.OpponentMode !== 'none' && c.Options.OpponentIds.includes(cost.PartyId)) continue;
      const k = cost.PartyId + '|' + cost.PoolId + '|' + cost.Item + '|' + cost.RelatedId;
      costMap.set(k, (costMap.get(k) || 0) + cost.Amount);
    }
    for (const o of outsiders) result.Warnings.push('V7: 当事者' + o + ' は申立人・相手方でない（区分 その他）ため、その費用を計上しない（相殺にも使わない）');

    if (c.Options.OpponentMode === 'A') {
      for (const r of c.Rulings) for (const o of r.Obligations) for (const ob of o.Obligors) {
        if (!c.Options.OpponentIds.includes(ob)) result.Errors.push('V5: モードAだが、相手方以外(当事者' + ob + ')が負担者になっている');
      }
    }
    // D2: 申立書記載の費用総額を超えていないか（書実研15号 88頁）
    for (const partyKey of Object.keys(c.Options.ClaimedTotals)) {
      let total = 0;
      for (const cost of result.ExpandedCosts) if (cost.PartyId === Number(partyKey)) total += cost.Amount;
      const claimed = Number(c.Options.ClaimedTotals[partyKey]);
      if (total > claimed) result.Warnings.push('D2: 当事者' + partyKey + ' の費用総額 ' + total + ' 円が申立書記載の総額 ' + claimed + ' 円を超えている（確定額は申立総額を超えられない）');
    }
    result.C = costMap;
  }

  // ---- Phase 2 支配条項の決定 ---------------------------------------------------
  function phase2(c, result) {
    const dom = new Map();
    const rankOf = (r) => getInstance(c, r.RulingInstanceId).Rank;
    for (const pool of c.Pools) {
      for (const pa of c.Parties) {
        for (const pb of c.Parties) {
          if (pa.Id >= pb.Id) continue;
          const cands = c.Rulings.filter((r) => r.ScopePools.includes(pool.Id) && r.ScopeParties.includes(pa.Id) && r.ScopeParties.includes(pb.Id));
          if (cands.length === 0) continue;
          const ranked = cands.slice().sort((x, y) => rankOf(y) - rankOf(x));
          const top = ranked[0];
          const topRank = rankOf(top);
          if (ranked.filter((r) => rankOf(r) === topRank).length > 1) result.Errors.push('V1: 同一審級の条項が重複 (pool=' + pool.Id + ', ' + pa.Id + '-' + pb.Id + ')');
          dom.set(pairKey(pool.Id, pa.Id, pb.Id), top);
        }
      }
    }
    result.Dominant = dom;

    const questions = [];
    for (const pool of c.Pools) {
      for (const pj of c.Parties) {
        const j = pj.Id;
        if (getPartyKind(c, j) === 'その他') continue;
        if (c.Options.OpponentMode !== 'none' && c.Options.OpponentIds.includes(j)) continue;
        const cands = getCandidates(c, dom, pool.Id, j);
        const rulingIds = uniq(cands.map((m) => dom.get(pairKey(pool.Id, j, m)).Id));
        if (rulingIds.length < 2) continue;
        const sugg = new Map();
        for (const m of cands) sugg.set(m, getScopeSuggestion(c, j, m));
        if (![...sugg.values()].includes(true)) for (const m of cands) sugg.set(m, true);
        for (const m of cands) {
          const ans = c.OpponentScopes.filter((x) => x.PoolId === pool.Id && x.PartyId === j && x.OpponentId === m);
          questions.push({ PoolId: pool.Id, PartyId: j, OpponentId: m, RulingId: dom.get(pairKey(pool.Id, j, m)).Id,
                           Suggested: !!sugg.get(m), Answered: ans.length > 0, Included: ans.length > 0 && !!ans[0].Included });
        }
      }
    }
    result.ScopeQuestions = questions;
  }

  // ---- Phase 3 費用の分属 --------------------------------------------------------
  function phase3(c, result) {
    const base = [];
    const reported = new Set();
    for (const k of [...result.C.keys()].sort(psStringCompare)) {
      const parts = k.split('|').map(Number);
      const j = parts[0], poolId = parts[1], item = parts[2], rel = parts[3];
      const amount = result.C.get(k);
      if (amount === 0) continue;
      const instId = getPool(c, poolId).InstanceId;
      const cands = getCandidates(c, result.Dominant, poolId, j);
      if (cands.length === 0) {
        result.Errors.push('V2: 支配する条項が無い費用がある (当事者' + j + ', pool=' + poolId + ', 号' + item + ', ' + amount + ' 円)。STEP 4 で条項を確認してください');
        continue;
      }
      const qs = result.ScopeQuestions.filter((q) => q.PoolId === poolId && q.PartyId === j);
      let opponents;
      if (qs.length === 0) opponents = cands;
      else {
        opponents = qs.filter((q) => q.Answered && q.Included).map((q) => q.OpponentId);
        const msg = qs.some((q) => !q.Answered) ? '相手方の範囲が未確定です' : opponents.length === 0 ? '相手方の範囲に誰も含まれていません' : '';
        if (msg !== '') {
          if (!reported.has(j + '|' + poolId)) {
            result.Errors.push('V2b: ' + msg + ' (当事者' + j + ', pool=' + poolId + ')。STEP 5 で相手方の範囲を確定してください');
            reported.add(j + '|' + poolId);
          }
          continue;
        }
      }
      const Rof = new Map();
      for (const m of opponents) Rof.set(m, result.Dominant.get(pairKey(poolId, j, m)));
      const distinctIds = uniq(opponents.map((m) => Rof.get(m).Id));
      if (distinctIds.length === 1) {
        base.push({ RulingId: distinctIds[0], PartyId: j, PoolId: poolId, Item: item, RelatedId: rel, AttributedTo: 0, Amount: amount });
        continue;
      }
      const label = '当事者' + j + ' pool=' + poolId + ' 号' + item;
      const w = getAttributionWeights(c, instId, j, item, opponents, rel, result, label);
      const alloc = splitAmount(amount, w, result, '分属差額: ' + label);
      for (const m of [...alloc.keys()].sort(numSort)) {
        base.push({ RulingId: Rof.get(m).Id, PartyId: j, PoolId: poolId, Item: item, RelatedId: rel, AttributedTo: m, Amount: alloc.get(m) });
      }
      result.Attribution.push({ Party: j, Pool: poolId, Item: item, Alloc: alloc });
    }
    result.Base = base;
  }

  // ---- Phase 4 基礎額と債務の生成 ------------------------------------------------
  function phase4(c, result) {
    const debts = [];
    for (const d of c.SeedDebts) debts.push({ Creditor: d.Creditor, Obligors: d.Obligors.slice(), Amount: d.Amount });
    for (const r of c.Rulings) {
      for (const j of r.ScopeParties) {
        const entries = result.Base.filter((e) => e.RulingId === r.Id && e.PartyId === j && r.ScopePools.includes(e.PoolId));
        let baseAmt = 0; for (const e of entries) baseAmt += e.Amount;
        if (baseAmt === 0) continue;
        result.BaseAmounts.set(r.Id + '|' + j, baseAmt);
        const obs = r.Obligations.filter((o) => o.Column === j);
        if (obs.length === 0) { result.Errors.push('V-d: 条項' + r.Id + ' に当事者' + j + ' の列の負担割合が無い(基礎額 ' + baseAmt + ' 円)'); continue; }
        let shareSum = 0; for (const o of obs) shareSum += o.Num / o.Den;
        if (Math.abs(shareSum - 1.0) > 1e-9) { result.Errors.push('V-d: 条項' + r.Id + ' 当事者' + j + ' の列和が 1 でない (' + fmtDouble(shareSum) + ')'); continue; }
        let sum = 0;
        for (const o of obs) {
          const share = o.Num / o.Den;
          const amt = roundYenGov(baseAmt * share, getIsGov(c, j), testAnyGov(c, o.Obligors));
          sum += amt;
          if (o.Obligors.includes(j)) continue;
          const group = o.Obligors.slice();
          if (group.length >= 2 && getObMode(o) === 'split') {
            const perG = new Map(); for (const x of group) perG.set(x, 0.0);
            for (const e of entries) {
              const label = '条項' + r.Id + ' 当事者' + j + ' 号' + e.Item;
              if (e.AttributedTo > 0 && group.includes(e.AttributedTo)) { perG.set(e.AttributedTo, perG.get(e.AttributedTo) + e.Amount); continue; }
              let w;
              if (e.AttributedTo > 0) {
                result.Warnings.push('分割: 当事者' + e.AttributedTo + ' に分属した費用が分割の群に入っていないため人数で按分した（' + label + '）');
                w = new Map(); for (const x of group) w.set(x, 1.0);
              } else {
                w = getAttributionWeights(c, getInstanceOfPool(c, e.PoolId), j, e.Item, group, e.RelatedId, result, label);
              }
              let sumW = 0; for (const v of w.values()) sumW += v;
              for (const [x, v] of w) perG.set(x, perG.get(x) + e.Amount * v / sumW);
            }
            let gsum = 0;
            for (const x of group.slice().sort(numSort)) {
              const ga = roundYenGov(perG.get(x) * share, getIsGov(c, j), getIsGov(c, x));
              gsum += ga;
              if (ga > 0) debts.push({ Creditor: j, Obligors: [x], Amount: ga });
            }
            if (gsum !== amt) result.Diffs.push('検算差額（分割）: 条項' + r.Id + ' 当事者' + j + ' = ' + (amt - gsum) + ' 円');
            continue;
          }
          debts.push({ Creditor: j, Obligors: o.Obligors.slice(), Amount: amt });
        }
        if (sum !== baseAmt) result.Diffs.push('検算差額: 条項' + r.Id + ' 当事者' + j + ' = ' + (baseAmt - sum) + ' 円');
      }
    }
    result.Debts = debts;
  }
  // PowerShell が double を文字列にする形（有効数字 15 桁。1.0999999999999999 → 1.1）
  function fmtDouble(x) { return String(Number(x.toPrecision(15))); }

  // ---- Phase 5 共同訴訟人の間の負担の検査 ----------------------------------------
  function phase5(c, result) {
    const groups = [];
    for (const r of c.Rulings) for (const o of r.Obligations) if (o.Obligors.length >= 2) groups.push(o.Obligors);
    for (const r of c.Rulings) {
      for (const o of r.Obligations) {
        const j = o.Column;
        if (o.Obligors.includes(j)) continue;
        for (const k of o.Obligors) {
          for (const gr of groups) {
            if (gr.includes(j) && gr.includes(k)) {
              result.Warnings.push('V-g: 条項' + r.Id + ' で当事者' + j + ' の費用を当事者' + k + ' が負担する行がある。両者は同じ負担者群に入っており、共同訴訟人の間には償還関係が生じない');
              break;
            }
          }
        }
      }
    }
  }

  // ---- Phase 6 相殺（民訴法71条。債務者ごとに独立して相殺する） ------------------
  function reduceSlices(slices, offset, result) {
    const by = (x, y) => (y.Amount - x.Amount) || (x.DebtIndex - y.DebtIndex);
    const ordered = slices.filter((s) => !s.Joint).sort(by).concat(slices.filter((s) => s.Joint).sort(by));
    let rest = offset;
    for (const sl of ordered) {
      if (rest <= 0) break;
      const cut = Math.min(rest, sl.Amount);
      sl.Amount -= cut; rest -= cut;
      result.OffsetLog.push('  充当: 債権者' + sl.Creditor + ' 債務者' + sl.Debtor + '（' + (sl.Joint ? '連帯債務の持ち分' : '単独債務') + '）-' + cut + ' -> ' + sl.Amount);
    }
  }
  function phase6(c, result) {
    result.DebtsBeforeOffset = result.Debts.map((d) => ({ Creditor: d.Creditor, Obligors: d.Obligors.slice(), Amount: d.Amount }));
    const debts = result.Debts;
    const slices = [];
    debts.forEach((d, i) => { for (const x of d.Obligors) slices.push({ DebtIndex: i, Debtor: x, Creditor: d.Creditor, Joint: d.Obligors.length >= 2, Amount: d.Amount }); });
    const ids = c.Parties.map((p) => p.Id).sort(numSort);
    for (const i of ids) {
      for (const j of ids) {
        if (i >= j) continue;
        const sij = slices.filter((s) => s.Debtor === i && s.Creditor === j);
        const sji = slices.filter((s) => s.Debtor === j && s.Creditor === i);
        if (sij.length === 0 || sji.length === 0) continue;
        let a = 0; for (const s of sij) a += s.Amount;
        let b = 0; for (const s of sji) b += s.Amount;
        const offset = Math.min(a, b);
        if (offset <= 0) continue;
        result.OffsetLog.push('相殺 (' + i + ',' + j + '): 対当額 ' + offset + ' 円');
        reduceSlices(sij, offset, result);
        reduceSlices(sji, offset, result);
      }
    }
    const out = [];
    debts.forEach((d, i) => {
      const mine = slices.filter((s) => s.DebtIndex === i);
      if (mine.length === 1) {
        if (mine[0].Amount > 0) out.push({ Creditor: mine[0].Creditor, Obligors: [mine[0].Debtor], Amount: mine[0].Amount });
        return;
      }
      const common = Math.min(...mine.map((s) => s.Amount));
      if (common > 0) out.push({ Creditor: d.Creditor, Obligors: d.Obligors.slice(), Amount: common });
      for (const s of mine) { const extra = s.Amount - common; if (extra > 0) out.push({ Creditor: s.Creditor, Obligors: [s.Debtor], Amount: extra }); }
    });
    result.Debts = out;
  }

  // ---- Phase 7 集計（処分権主義） ------------------------------------------------
  function getNormalizedDebts(debts) {
    const agg = new Map();
    for (const d of debts) {
      const k = d.Obligors.slice().sort(numSort).join('+') + '->' + d.Creditor;
      agg.set(k, (agg.get(k) || 0) + d.Amount);
    }
    return [...agg.keys()].sort(psStringCompare).map((k) => k + ':' + agg.get(k));
  }
  function phase7(c, result) {
    const ordered = [], notOrdered = [];
    for (const d of result.Debts) {
      const toApplicant = getPartyKind(c, d.Creditor) === '申立人';
      const opp = d.Obligors.filter((x) => getPartyKind(c, x) === '相手方');
      const nonOpp = d.Obligors.filter((x) => getPartyKind(c, x) !== '相手方');
      if (!toApplicant || opp.length === 0) { notOrdered.push(d); continue; }
      if (nonOpp.length > 0) {
        // 参照実装では Report.ps1 の Get-PartyLabel（立場で書く）が CostEngine.ps1 の同名の関数を上書きしている
        const nn = nonOpp.map((x) => SH.partyLabel(c, x)).join('及び');
        const on = opp.map((x) => SH.partyLabel(c, x)).join('及び');
        const how = opp.length >= 2 ? '連帯して全額を命じた' : '全額を命じた';
        result.Notes.push(nn + 'は相手方ではないため、連帯債務者として主文に掲げない（' + SH.partyLabel(c, d.Creditor) + 'に対する金' + yen(d.Amount) + '円は、' + on + 'に' + how + '）');
        ordered.push({ Creditor: d.Creditor, Obligors: opp, Amount: d.Amount });
        continue;
      }
      ordered.push(d);
    }
    const agg = new Map();
    for (const d of ordered) {
      const k = d.Obligors.slice().sort(numSort).join('+') + '->' + d.Creditor;
      if (agg.has(k)) agg.get(k).Amount += d.Amount;
      else agg.set(k, { Creditor: d.Creditor, Obligors: d.Obligors.slice(), Amount: d.Amount });
    }
    result.Debts = [...agg.values()];
    result.NotOrdered = notOrdered;
    const cap = new Map();
    for (const d of result.Debts) cap.set(d.Creditor, (cap.get(d.Creditor) || 0) + d.Amount);
    result.Cap = cap;
    result.Normalized = getNormalizedDebts(result.Debts);
    result.NotOrderedNormalized = getNormalizedDebts(result.NotOrdered);
  }

  function calculate(c) {
    const result = {
      C: new Map(), Dominant: new Map(), ScopeQuestions: [], Base: [], BaseAmounts: new Map(), ExpandedCosts: [],
      Debts: [], DebtsBeforeOffset: [], Normalized: [], Cap: new Map(), NotOrdered: [], NotOrderedNormalized: [],
      Errors: [], Warnings: [], Diffs: [], OffsetLog: [], Attribution: [], Notes: []
    };
    phase1(c, result); phase2(c, result); phase3(c, result); phase4(c, result);
    phase5(c, result); phase6(c, result); phase7(c, result);
    return result;
  }

  // STEP 5（支配関係の確認）用: Phase 1・2 だけ
  function calcPhase12(c) {
    const result = { C: new Map(), Dominant: new Map(), ScopeQuestions: [], ExpandedCosts: [], Errors: [], Warnings: [], Diffs: [] };
    phase1(c, result); phase2(c, result);
    return result;
  }

  Object.assign(SH, { newCase, calculate, calcPhase12, getAttributionWeights, getIsGov, testAnyGov, getObMode, getInstance, getPool, getParty,
                      getInstanceOfPool, getPartyKind, getPartyName, getNormalizedDebts, pairKey });
})(typeof globalThis !== 'undefined' ? globalThis : this);
