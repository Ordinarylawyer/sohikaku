// 訴訟費用額計算機（Web 版）― 退避 JSON を計算エンジンの事件に変換する
// 参照実装 engine/CaseJson.ps1（PowerShell）を移したもの。
(function (g) {
  'use strict';
  const SH = g.SH;
  const { prop, toInt } = SH;

  function toIntArray(v) {
    if (v == null) return [];
    if (typeof v === 'string') return v.split(/[,+]/).filter((s) => s !== '').map((s) => toInt(s));
    return SH.asArray(v).map((x) => toInt(x));
  }
  const toDateOrNull = (v) => (v == null || String(v) === '' ? null : SH.dayOf(v));
  const bool = (v) => !!v && v !== 'false';

  function payersOf(c) {
    const arr = prop(c, 'payers', null);
    if (arr != null) return toIntArray(arr);
    const pk = String(prop(c, 'payerKey', ''));
    if (pk === '') return [];
    return pk.split('+').filter((s) => s !== '').map((s) => toInt(s));
  }

  function toCase(json) {
    const parties = SH.asArray(prop(json, 'parties', [])).map((p) => ({
      Id: toInt(p.id), Kind: prop(p, 'kind', ''), Name: prop(p, 'name', '当事者' + p.id), IsGov: bool(prop(p, 'isGov', false)) }));
    const instances = SH.asArray(prop(json, 'instances', [])).map((i) => ({
      Id: toInt(i.id), Rank: toInt(i.rank), Name: prop(i, 'name', ''),
      StartDate: toDateOrNull(prop(i, 'start', null)), FilingDate: toDateOrNull(prop(i, 'filingDate', null)) }));
    const pools = SH.asArray(prop(json, 'pools', [])).map((p) => ({
      Id: toInt(p.id), InstanceId: toInt(p.instanceId), Kind: prop(p, 'kind', '本体'), Name: prop(p, 'name', '') }));
    const scopes = SH.asArray(prop(json, 'opponentScopes', [])).map((s) => ({
      PoolId: toInt(s.poolId), PartyId: toInt(s.partyId), OpponentId: toInt(s.opponentId), Included: bool(s.included) }));
    const claims = SH.asArray(prop(json, 'claims', [])).map((c) => ({
      InstanceId: toInt(c.instanceId), From: toInt(c.from), To: toInt(c.to), Amount: Number(c.amount) }));
    const topObs = SH.asArray(prop(json, 'obligations', []));
    const rulings = SH.asArray(prop(json, 'rulings', [])).map((r) => {
      const rid = toInt(r.id);
      let src = prop(r, 'obligations', null);
      if (src == null) src = topObs.filter((o) => toInt(prop(o, 'rulingId', 0)) === rid);
      const obs = SH.asArray(src).map((o) => ({
        Column: toInt(o.column), Num: Number(o.num), Den: Number(o.den), Obligors: toIntArray(o.obligors), Mode: prop(o, 'mode', 'joint') }));
      return { Id: rid, RulingInstanceId: toInt(r.rulingInstanceId), ScopePools: toIntArray(r.scopePools),
               ScopeParties: toIntArray(r.scopeParties), Obligations: obs };
    });
    const costs = SH.asArray(prop(json, 'costs', [])).map((c) => ({
      PoolId: toInt(c.poolId), PartyId: toInt(prop(c, 'partyId', 0)), Item: toInt(c.item), Amount: toInt(c.amount),
      Label: prop(c, 'label', ''), RelatedId: toInt(prop(c, 'relatedPartyId', 0)), Payers: payersOf(c),
      AppCost: bool(prop(c, 'appCost', false)),
      SegNo: toInt(prop(c, 'segNo', 1)) || 1 }));            // 単価区間（計算には使わない。内訳の並びに使う）
    const opt = {};
    const jo = prop(json, 'options', null);
    if (jo != null) {
      opt.OpponentMode = prop(jo, 'opponentMode', 'none');
      opt.OpponentIds = toIntArray(prop(jo, 'opponentIds', []));
      const ct = prop(jo, 'claimedTotals', null);
      if (ct != null) { const h = {}; for (const k of Object.keys(ct)) h[String(toInt(k))] = toInt(ct[k]); opt.ClaimedTotals = h; }
    }
    return SH.newCase({ Parties: parties, Instances: instances, Pools: pools, Claims: claims, Rulings: rulings,
                        Costs: costs, Options: opt, OpponentScopes: scopes });
  }

  function toHearingCase(json) {
    const court = (o) => ({ CourtKey: String(prop(o, 'courtKey', '')), Lat: Number(prop(o, 'lat', 0)), Lon: Number(prop(o, 'lon', 0)) });
    const parties = SH.asArray(prop(json, 'parties', [])).map((p) => Object.assign(
      { Id: toInt(p.id), Kind: prop(p, 'kind', ''), Name: prop(p, 'name', '当事者' + p.id) }, court(p)));
    const attendees = SH.asArray(prop(json, 'attendees', [])).map((a) => Object.assign(
      { Id: toInt(a.id), Kind: prop(a, 'kind', ''), Name: prop(a, 'name', '') }, court(a)));
    const links = [];
    for (const a of SH.asArray(prop(json, 'attendees', []))) {
      for (const pid of toIntArray(prop(a, 'parties', null))) links.push({ AttendeeId: toInt(a.id), PartyId: pid });
    }
    const instances = SH.asArray(prop(json, 'instances', [])).map((i) => ({
      Id: toInt(i.id), Rank: toInt(i.rank), Name: prop(i, 'name', ''),
      StartDate: toDateOrNull(prop(i, 'start', null)), FilingDate: toDateOrNull(prop(i, 'filingDate', null)),
      VenueKey: String(prop(i, 'venueKey', '')), VenueLat: Number(prop(i, 'venueLat', 0)), VenueLon: Number(prop(i, 'venueLon', 0)) }));
    const pools = SH.asArray(prop(json, 'pools', [])).map((p) => ({
      Id: toInt(p.id), InstanceId: toInt(p.instanceId), Kind: prop(p, 'kind', '本体'), Name: prop(p, 'name', '') }));
    const partyPools = SH.asArray(prop(json, 'partyPools', [])).map((p) => ({
      InstanceId: toInt(p.instanceId), PartyId: toInt(p.partyId), PoolId: toInt(p.poolId) }));
    const hearings = SH.asArray(prop(json, 'hearings', [])).map((h) => ({
      Id: toInt(h.id), InstanceId: toInt(h.instanceId), HDate: String(prop(h, 'date', '2000-01-01')),
      Seq: toInt(prop(h, 'seq', 1)), Kind: String(prop(h, 'kind', '')),
      VenueKey: String(prop(h, 'venueKey', '')), VenueLat: Number(prop(h, 'venueLat', 0)), VenueLon: Number(prop(h, 'venueLon', 0)) }));
    const attendance = SH.asArray(prop(json, 'attendance', [])).map((a) => ({
      HearingId: toInt(a.hearingId), SubjectKind: String(a.subjectKind), SubjectId: toInt(a.subjectId),
      Status: String(prop(a, 'status', '欠席')), Days: toInt(prop(a, 'days', 1)), Nights: toInt(prop(a, 'nights', 0)),
      LodgingCode: String(prop(a, 'lodgingCode', '')), KmOverride: toInt(prop(a, 'kmOverride', 0)),
      Within500m: bool(prop(a, 'within500m', false)), UseActual: bool(prop(a, 'useActual', false)),
      ActualFare: toInt(prop(a, 'actualFare', 0)), NormalRoute: bool(prop(a, 'normalRoute', false)),
      Receipts: bool(prop(a, 'receipts', false)), CapOverride: toInt(prop(a, 'capOverride', 0)),
      Summoned: bool(prop(a, 'summoned', false)),
      SrcKind: String(prop(a, 'srcKind', '')), SrcLabel: String(prop(a, 'srcLabel', '')), SrcKey: String(prop(a, 'srcKey', '')),
      SrcLat: Number(prop(a, 'srcLat', 0)), SrcLon: Number(prop(a, 'srcLon', 0)), PoolOverride: toInt(prop(a, 'poolOverride', 0)),
      NoFare: bool(prop(a, 'noFare', false)) }));       // 旅費を請求しない（2026-11-24）
    return { Parties: parties, Attendees: attendees, AttendeeParties: links, Instances: instances, Pools: pools,
             PartyPools: partyPools, Hearings: hearings, Attendance: attendance };
  }

  Object.assign(SH, { toIntArray, toCase, toHearingCase });
})(typeof globalThis !== 'undefined' ? globalThis : this);
