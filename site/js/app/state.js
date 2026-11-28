// 訴訟費用額計算機（Web 版）― 入力の状態と、退避 JSON
//   状態は退避 JSON と同じキー（camelCase）。ただし配列の項目（scopePools・obligors・attendees[].parties・
//   options.opponentIds）は配列で持ち、書き出すときにカンマ区切りの文字列にする。
//   ここにある入力はブラウザのメモリの中だけにあり、どこにも送らず、保存もしない（閉じれば消える）。
(function (g) {
  'use strict';
  const SH = g.SH;
  const A = (SH.App = SH.App || {});
  A.STEPS = A.STEPS || {};
  const { prop, toInt } = SH;

  const ITEM_NAMES = SH.ITEM_NAMES;   // report.js（「1号 手数料」…「18号 …」）
  const FIXED_LABEL = { 1: '手数料', 6: '書類の作成及び提出の費用', 7: '官庁等からの書類交付費用', 8: '翻訳料' };
  const AUTO_ITEMS = [4, 5, 6, 7, 8];

  function today() { return SH.UI.todayStr(); }

  function empty() {
    return {
      header: { caseNoMo: '', courtName: '', division: '', clerk: '', issueDay: today(), role: '', signer: '' },
      options: { opponentMode: 'none', opponentIds: [] },
      parties: [], attendees: [], instances: [], pools: [], partyPools: [], opponentScopes: [], claims: [],
      rulings: [], obligations: [], costs: [], freeRows: [], selectedItems: [], hearings: [], attendance: [], inst500: []
    };
  }

  // ---- 読み込み --------------------------
  const ints = (v) => SH.toIntArray(v);
  const str = (v) => (v == null ? '' : String(v));
  const num = (v, d) => (v == null || v === '' || !isFinite(Number(v)) ? d : Number(v));
  const bool = (v) => v === true || v === 'true';
  const dateStr = (v) => { if (v == null || v === '') return ''; const n = SH.dayOf(v); return n == null ? '' : SH.dayStr(n); };

  function fromJSON(j) {
    if (j == null || typeof j !== 'object' || Array.isArray(j)) throw new Error('JSON の形が違います（{ … } の形の退避 JSON を貼り付けてください）');
    if (!Array.isArray(j.parties) && !Array.isArray(j.instances)) throw new Error('訴訟費用額計算機の退避 JSON ではないようです（parties・instances がありません）');
    const s = empty();
    const hd = j.header || {};
    s.header = { caseNoMo: str(hd.caseNoMo), courtName: str(hd.courtName), division: str(hd.division), clerk: str(hd.clerk),
                 issueDay: dateStr(hd.issueDay) || today(),
                 // role＝'applicant' なら申立人・代理人が使う。signer＝申立書の記名
                 role: hd.role === 'applicant' ? 'applicant' : '', signer: str(hd.signer) };
    const op = j.options || {};
    s.options = { opponentMode: ['none', 'A', 'B'].includes(op.opponentMode) ? op.opponentMode : 'none', opponentIds: ints(op.opponentIds) };
    const arr = (k) => (Array.isArray(j[k]) ? j[k] : []);
    s.parties = arr('parties').map((p) => ({
      id: toInt(p.id), kind: str(p.kind || '相手方'), name: str(p.name), address: str(p.address),
      claimedTotal: p.claimedTotal == null || p.claimedTotal === '' ? null : toInt(p.claimedTotal),
      courtKind: str(p.courtKind), courtLabel: str(p.courtLabel), courtKey: str(p.courtKey),
      lat: num(p.lat, 0), lon: num(p.lon, 0), isGov: bool(p.isGov) }));
    s.attendees = arr('attendees').map((a) => ({
      id: toInt(a.id), kind: str(a.kind || '訴訟代理人'), name: str(a.name),
      courtKind: str(a.courtKind), courtLabel: str(a.courtLabel), courtKey: str(a.courtKey),
      lat: num(a.lat, 0), lon: num(a.lon, 0), parties: ints(a.parties).sort(SH.numSort),
      title: str(a.title) }));   // 書面での肩書き
    s.instances = arr('instances').map((i) => ({
      id: toInt(i.id), rank: toInt(i.rank), name: str(i.name), caseNo: str(i.caseNo), start: dateStr(i.start),
      venueKind: str(i.venueKind), venueLabel: str(i.venueLabel), venueKey: str(i.venueKey),
      venueLat: num(i.venueLat, 0), venueLon: num(i.venueLon, 0), filingDate: dateStr(i.filingDate) }));
    s.pools = arr('pools').map((p) => ({ id: toInt(p.id), instanceId: toInt(p.instanceId), kind: str(p.kind || '本体'), name: str(p.name) }));
    s.partyPools = arr('partyPools').map((q) => ({ instanceId: toInt(q.instanceId), partyId: toInt(q.partyId), poolId: toInt(q.poolId) }));
    s.opponentScopes = arr('opponentScopes').map((q) => ({ poolId: toInt(q.poolId), partyId: toInt(q.partyId), opponentId: toInt(q.opponentId), included: bool(q.included) }));
    s.claims = arr('claims').map((c) => ({ instanceId: toInt(c.instanceId), from: toInt(c.from), to: toInt(c.to), amount: num(c.amount, 0) }));
    s.rulings = arr('rulings').map((r) => ({ id: toInt(r.id), rulingInstanceId: toInt(r.rulingInstanceId), poolId: toInt(prop(r, 'poolId', 0)),
                                             scopePools: ints(r.scopePools), scopeParties: ints(r.scopeParties) }));
    // エンジン形式（rulings[].obligations の入れ子）も読む
    let obs = arr('obligations');
    if (obs.length === 0) {
      let oid = 0;
      for (const r of arr('rulings')) for (const o of (Array.isArray(r.obligations) ? r.obligations : [])) obs.push(Object.assign({ id: ++oid, rulingId: r.id }, o));
    }
    s.obligations = obs.map((o) => ({ id: toInt(o.id), rulingId: toInt(o.rulingId), column: toInt(o.column), num: num(o.num, 0), den: num(o.den, 1),
                                      mode: str(o.mode), obligors: ints(o.obligors) }));
    s.costs = arr('costs').map((c) => ({
      poolId: toInt(c.poolId), partyId: toInt(prop(c, 'partyId', 0)), item: toInt(c.item), segNo: toInt(prop(c, 'segNo', 1)) || 1,
      amount: toInt(c.amount), label: str(c.label), relatedPartyId: toInt(prop(c, 'relatedPartyId', 0)),
      payerKey: c.payerKey != null ? str(c.payerKey) : (Array.isArray(c.payers) ? c.payers.join('+') : ''),
      appCost: bool(c.appCost), sortKey: c.sortKey == null || c.sortKey === '' ? null : Number(c.sortKey) }));
    s.freeRows = arr('freeRows').map((f) => ({ id: toInt(f.id), poolId: toInt(f.poolId), partyId: toInt(f.partyId), item: toInt(f.item),
                                               label: str(f.label), amount: f.amount == null || f.amount === '' ? null : toInt(f.amount),
                                               appCost: bool(f.appCost), relatedId: toInt(prop(f, 'relatedId', 0)) }));
    s.selectedItems = arr('selectedItems').map((x) => ({ poolId: toInt(x.poolId), item: toInt(x.item) }));
    s.hearings = arr('hearings').map((h) => ({
      id: toInt(h.id), instanceId: toInt(h.instanceId), date: dateStr(h.date) || today(), seq: toInt(prop(h, 'seq', 1)) || 1, kind: str(h.kind),
      venueKind: str(h.venueKind), venueLabel: str(h.venueLabel), venueKey: str(h.venueKey), venueLat: num(h.venueLat, 0), venueLon: num(h.venueLon, 0) }));
    s.attendance = arr('attendance').map((a) => ({
      hearingId: toInt(a.hearingId), subjectKind: str(a.subjectKind), subjectId: toInt(a.subjectId), status: str(a.status || '欠席'),
      days: toInt(prop(a, 'days', 1)), nights: toInt(prop(a, 'nights', 0)), lodgingCode: str(a.lodgingCode), kmOverride: toInt(prop(a, 'kmOverride', 0)),
      within500m: bool(a.within500m), useActual: bool(a.useActual), actualFare: toInt(prop(a, 'actualFare', 0)), normalRoute: bool(a.normalRoute),
      receipts: bool(a.receipts), capOverride: toInt(prop(a, 'capOverride', 0)), summoned: bool(a.summoned),
      srcKind: str(a.srcKind), srcLabel: str(a.srcLabel), srcKey: str(a.srcKey), srcLat: num(a.srcLat, 0), srcLon: num(a.srcLon, 0),
      poolOverride: toInt(prop(a, 'poolOverride', 0)), noFare: bool(a.noFare) }));
    s.inst500 = arr('inst500').map((f) => ({ instanceId: toInt(f.instanceId), subjectKind: str(f.subjectKind), subjectId: toInt(f.subjectId), within500m: bool(f.within500m) }));
    return s;
  }

  // ---- 書き出し（キーの順は固定） ------------------------------------
  //   out: 最後の計算の結果（主文・計算書・内訳）。JSON に添える（読み込みでは使わない）
  function toJSON(s, out) {
    const csv = (a) => (a || []).join(',');
    out = out || {};
    return {
      parties: s.parties.map((p) => ({ id: p.id, kind: p.kind, name: p.name, address: p.address, claimedTotal: p.claimedTotal,
                                      courtKind: p.courtKind, courtLabel: p.courtLabel, courtKey: p.courtKey, lat: p.lat, lon: p.lon, isGov: p.isGov })),
      header: { caseNoMo: s.header.caseNoMo, courtName: s.header.courtName, division: s.header.division, clerk: s.header.clerk,
                issueDay: s.header.issueDay || '', role: s.header.role || '', signer: s.header.signer || '' },
      instances: s.instances.map((i) => ({ id: i.id, rank: i.rank, name: i.name, caseNo: i.caseNo, start: i.start,
                                          venueKind: i.venueKind, venueLabel: i.venueLabel, venueKey: i.venueKey,
                                          venueLat: i.venueLat, venueLon: i.venueLon, filingDate: i.filingDate || '' })),
      attendees: s.attendees.map((a) => ({ id: a.id, kind: a.kind, name: a.name, courtKind: a.courtKind, courtLabel: a.courtLabel,
                                          courtKey: a.courtKey, lat: a.lat, lon: a.lon, parties: csv(a.parties.slice().sort(SH.numSort)), title: a.title || '' })),
      pools: s.pools.map((p) => ({ id: p.id, instanceId: p.instanceId, kind: p.kind, name: p.name })),
      partyPools: s.partyPools.map((q) => ({ instanceId: q.instanceId, partyId: q.partyId, poolId: q.poolId })),
      opponentScopes: s.opponentScopes.map((q) => ({ poolId: q.poolId, partyId: q.partyId, opponentId: q.opponentId, included: q.included })),
      claims: s.claims.map((c) => ({ instanceId: c.instanceId, from: c.from, to: c.to, amount: c.amount })),
      rulings: s.rulings.map((r) => ({ id: r.id, rulingInstanceId: r.rulingInstanceId, poolId: r.poolId, scopePools: csv(r.scopePools), scopeParties: csv(r.scopeParties) })),
      obligations: s.obligations.map((o) => ({ id: o.id, rulingId: o.rulingId, column: o.column, num: o.num, den: o.den, mode: o.mode, obligors: csv(o.obligors) })),
      costs: s.costs.map((c) => ({ poolId: c.poolId, partyId: c.partyId, item: c.item, segNo: c.segNo, amount: c.amount, label: c.label,
                                  relatedPartyId: c.relatedPartyId, payerKey: c.payerKey, appCost: c.appCost, sortKey: c.sortKey })),
      freeRows: s.freeRows.map((f) => ({ id: f.id, poolId: f.poolId, partyId: f.partyId, item: f.item, label: f.label, amount: f.amount,
                                        appCost: f.appCost, relatedId: f.relatedId })),
      selectedItems: s.selectedItems.map((x) => ({ poolId: x.poolId, item: x.item })),
      hearings: s.hearings.map((h) => ({ id: h.id, instanceId: h.instanceId, date: h.date, seq: h.seq, kind: h.kind, venueKind: h.venueKind,
                                        venueLabel: h.venueLabel, venueKey: h.venueKey, venueLat: h.venueLat, venueLon: h.venueLon })),
      attendance: s.attendance.map((a) => ({ hearingId: a.hearingId, subjectKind: a.subjectKind, subjectId: a.subjectId, status: a.status,
        days: a.days, nights: a.nights, lodgingCode: a.lodgingCode, kmOverride: a.kmOverride, within500m: a.within500m, useActual: a.useActual,
        actualFare: a.actualFare, normalRoute: a.normalRoute, receipts: a.receipts, capOverride: a.capOverride, summoned: a.summoned,
        srcKind: a.srcKind, srcLabel: a.srcLabel, srcKey: a.srcKey, srcLat: a.srcLat, srcLon: a.srcLon, poolOverride: a.poolOverride, noFare: !!a.noFare })),
      inst500: s.inst500.map((f) => ({ instanceId: f.instanceId, subjectKind: f.subjectKind, subjectId: f.subjectId, within500m: f.within500m })),
      decree: out.decree || [],
      sheet2: out.sheet2 || [],
      breakdown: out.breakdown || [],
      options: { opponentMode: s.options.opponentMode, opponentIds: csv(s.options.opponentIds) }
    };
  }

  // ---- 補助 -----------------------------------------------------------------------------
  const nextId = (list, key) => list.reduce((m, x) => Math.max(m, Number(x[key || 'id']) || 0), 0) + 1;
  const instSorted = (s) => s.instances.slice().sort((a, b) => a.rank - b.rank);
  const instOf = (s, id) => s.instances.find((i) => i.id === id);
  const poolOf = (s, id) => s.pools.find((p) => p.id === id);
  const partyOf = (s, id) => s.parties.find((p) => p.id === id);
  const partyName = (s, id) => { const p = partyOf(s, id); return p ? (p.name || '当事者' + id) : '当事者' + id; };
  const poolsOfInst = (s, instId) => s.pools.filter((p) => p.instanceId === instId);
  const poolsSorted = (s) => s.pools.slice().sort((a, b) => a.id - b.id);

  // 当事者の費用区分（その審級の行が無ければ本体）
  function ownPool(s, partyId, instId) {
    const q = s.partyPools.find((x) => x.instanceId === instId && x.partyId === partyId);
    if (q) return q.poolId;
    const b = s.pools.find((p) => p.instanceId === instId && p.kind === '本体');
    return b ? b.id : 0;
  }

  // 単価マスタ（正規化したもの）と、費用区分 × 号 の単価区間
  let MASTER = null;
  const master = () => (MASTER || (MASTER = SH.normalizeMaster(SH.MASTERS.rates)));
  const SEG_ITEMS = [4, 5, 6, 7, 8, 12, 18];
  function rateSegments(s) {
    const insts = s.instances.filter((i) => i.start).map((i) => ({ Id: i.id, Rank: i.rank, StartDate: i.start, FilingDate: i.filingDate || null }));
    const ids = new Set(insts.map((i) => i.Id));
    const pools = s.pools.filter((p) => ids.has(p.instanceId)).map((p) => ({ Id: p.id, InstanceId: p.instanceId }));
    const segs = SH.buildRateSegments(insts, pools, master(), SEG_ITEMS);
    // 区間が 2 つ以上ある（費用区分 × 号）には IsSplit と表示名を付ける
    const cnt = new Map();
    for (const x of segs) { const k = x.PoolId + '|' + x.Item; cnt.set(k, (cnt.get(k) || 0) + 1); }
    for (const x of segs) { x.IsSplit = cnt.get(x.PoolId + '|' + x.Item) > 1; x.Label = '区間' + x.SegNo + '：' + SH.dayStr(x.From, '/') + '〜'; }
    return segs;
  }
  const segsOf = (segs, poolId, item) => segs.filter((x) => x.PoolId === poolId && x.Item === item);

  // ---- 4号・5号（STEP 7 の期日と出欠から起こす） ------------------------
  function hearingRun(s, segs) {
    segs = segs || rateSegments(s);
    const hc = SH.toHearingCase(toJSON(s));
    const r = SH.getHearingCosts(hc, { Segments: segs });
    return { result: r, segs };
  }
  // colCosts の 4号・5号を入れ替える
  function syncHearingCosts(s, segs) {
    const { result, segs: sg } = hearingRun(s, segs);
    const rows = result.CostRows.map((cr) => {
      const seg = sg.find((x) => x.PoolId === cr.PoolId && x.Item === cr.Item && x.SegNo === cr.SegNo);
      return { poolId: cr.PoolId, partyId: 0, item: cr.Item, segNo: cr.SegNo, amount: cr.Amount,
               label: cr.Label + (seg && seg.IsSplit ? ' ' + seg.Label : ''), relatedPartyId: 0,
               payerKey: cr.Payers.slice().sort(SH.numSort).join('+'), appCost: false, sortKey: cr.SortKey };
    });
    s.costs = s.costs.filter((c) => c.item !== 4 && c.item !== 5).concat(rows);
    return result;
  }

  // ---- 計算エンジンに渡す事件 ------------------------------------------------------------
  function engineCase(s) { return SH.toCase(toJSON(s)); }

  // 計算に効く入力の写し（STEP 9 で計算したあとに入力が変わったかを見る）
  function calcSig(s) {
    const j = toJSON(s);
    delete j.decree; delete j.sheet2; delete j.breakdown;
    return JSON.stringify(j);
  }

  Object.assign(A, {
    ITEM_NAMES, FIXED_LABEL, AUTO_ITEMS, empty, fromJSON, toJSON, nextId, instSorted, instOf, poolOf, partyOf, partyName,
    poolsOfInst, poolsSorted, ownPool, master, rateSegments, segsOf, hearingRun, syncHearingCosts, engineCase, calcSig
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
