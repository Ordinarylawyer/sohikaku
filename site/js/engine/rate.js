// 訴訟費用額計算機（Web 版）― 費目別の金額算定・単価区間・距離・期日と出欠（4号・5号）
// 参照実装 engine/RateCalc.ps1（PowerShell）を移したもの。日付は「日の番号」（SH.dayOf）で持つ。
(function (g) {
  'use strict';
  const SH = g.SH;
  const { prop, numSort, uniq, dayOf, dayStr, OPEN_END } = SH;

  // 現行条文の額（関数の既定値。アプリでは単価マスタから引いた額を渡す）
  const CURRENT_RATES = {
    NITTOU: 3950, RYOHI_KINKYORI: 300, RYOHI_DOITSU: 300, RYOHI_KM_10_100: 30, RYOHI_KM_100_301: 50,
    RYOHI_KM_301_MIMAN: 50, RYOHI_KM_301_IJO: 40,
    SHORUI_1_KIHON: 1500, SHORUI_1_SHUCHO: 1000, SHORUI_1_SHOSHO: 1000, SHORUI_2: 800,
    SHORUI_2_2_KIHON: 1000, SHORUI_2_2_KASAN: 1000, SHORUI_3: 1000, SHORUI_3_TA: 500,
    SHORUI_5: 800, SHORUI_6: 500, SHORUI_SHOKKEN: 800, SHORUI_KOJO_1: 800, SHORUI_KOJO_2: 1000,
    HONYAKU_GAI_NICHI: 1600, HONYAKU_NICHI_GAI: 3000
  };
  const TRAVEL_CODES = ['NITTOU', 'RYOHI_KINKYORI', 'RYOHI_DOITSU', 'RYOHI_KM_10_100', 'RYOHI_KM_100_301', 'RYOHI_KM_301_MIMAN', 'RYOHI_KM_301_IJO'];
  const ITEM_FIXED_CODES = {
    4: TRAVEL_CODES, 5: TRAVEL_CODES,
    6: ['SHORUI_1_KIHON', 'SHORUI_1_SHUCHO', 'SHORUI_1_SHOSHO', 'SHORUI_2', 'SHORUI_2_2_KIHON', 'SHORUI_2_2_KASAN',
        'SHORUI_3', 'SHORUI_3_TA', 'SHORUI_5', 'SHORUI_6', 'SHORUI_SHOKKEN', 'SHORUI_KOJO_1', 'SHORUI_KOJO_2'],
    7: ['YUBIN_1SHU'], 8: ['HONYAKU_GAI_NICHI', 'HONYAKU_NICHI_GAI'],
    12: ['YUBIN_1SHU', 'KAKITOME'], 18: ['YUBIN_1SHU', 'KAKITOME']
  };
  const LODGING_PREFIX = 'SHUKUHAKU_';
  const LODGING_ITEMS = [4, 5];

  function hasRate(rates, code) { return rates && Object.prototype.hasOwnProperty.call(rates, code) && rates[code] != null; }
  function getRate(rates, code) {
    if (!hasRate(rates, code)) throw new Error('単価未登録: ' + code);
    return SH.toInt(rates[code]);
  }

  // ---- 4号・5号 旅費（1回の出頭の往復分） --------------------------------------
  function getTravelFare(km, sameCourt, within500m, rates) {
    rates = rates || CURRENT_RATES;
    if (sameCourt) return within500m ? 0 : getRate(rates, 'RYOHI_DOITSU');
    const dist = Math.floor(km);
    if (dist < 10) return getRate(rates, 'RYOHI_KINKYORI');
    if (dist < 100) return dist * getRate(rates, 'RYOHI_KM_10_100');
    if (dist < 301) return dist * getRate(rates, 'RYOHI_KM_100_301');
    return 300 * getRate(rates, 'RYOHI_KM_301_MIMAN') + (dist - 300) * getRate(rates, 'RYOHI_KM_301_IJO');
  }
  // 実費認定（費用法2条4号イ(1)ただし書）
  function getTravelWithActual(km, sameCourt, within500m, actualFare, normalRoute, receipts, rates) {
    const fixed = getTravelFare(km, sameCourt, within500m, rates);
    if (!(actualFare > 0)) return { Amount: fixed, UsedActual: false, Warning: '' };
    const why = [];
    if (!normalRoute) why.push('通常の経路及び方法であることの確認がない');
    if (!receipts) why.push('領収書・乗車券等の提出の確認がない');
    if (actualFare <= fixed) why.push('実費（' + actualFare + ' 円）が規則の額（' + fixed + ' 円）以下');
    if (why.length > 0) return { Amount: fixed, UsedActual: false, Warning: '実費によらず規則の額: ' + why.join('／') };
    return { Amount: actualFare, UsedActual: true, Warning: '' };
  }
  const getDailyAllowance = (days, unit) => days * (unit == null ? CURRENT_RATES.NITTOU : unit);
  const getLodging = (nights, unit) => nights * unit;

  // ---- 6号 書類の作成及び提出の費用（費用規則2条の2・別表第二） ----------------
  function getDocFee1(pleadings, exhibits, opponents, deduction, rates) {
    rates = rates || CURRENT_RATES;
    let base = getRate(rates, 'SHORUI_1_KIHON');
    if (pleadings > 5) base += Math.ceil((pleadings - 5) / 15) * getRate(rates, 'SHORUI_1_SHUCHO');
    if (exhibits > 15) base += Math.ceil((exhibits - 15) / 50) * getRate(rates, 'SHORUI_1_SHOSHO');
    let amt = base * Math.ceil(opponents / 5);
    if (deduction === 'settlement') amt -= getRate(rates, 'SHORUI_KOJO_1');
    else if (deduction === 'labor') amt -= getRate(rates, 'SHORUI_KOJO_2');
    return amt;
  }
  function getDocFeeOther(rowKey, opt, rates) {
    opt = opt || {}; rates = rates || CURRENT_RATES;
    switch (rowKey) {
      case '2': return getRate(rates, 'SHORUI_2');
      case '2-2': {
        const n = opt.Claims ? SH.toInt(opt.Claims) : 0;
        let a = getRate(rates, 'SHORUI_2_2_KIHON');
        if (n > 500) a += Math.ceil((n - 500) / 500) * getRate(rates, 'SHORUI_2_2_KASAN');
        return a;
      }
      case '3': return opt.OtherCreditor ? getRate(rates, 'SHORUI_3_TA') : getRate(rates, 'SHORUI_3');
      case '5': return getRate(rates, 'SHORUI_5');
      case '6': return getRate(rates, 'SHORUI_6');
      case 'exofficio': return getRate(rates, 'SHORUI_SHOKKEN');
      default: throw new Error('未知の項: ' + rowKey);
    }
  }
  // 7号（費用規則2条の3）
  const getCertFee = (feeTotal, deliveries, firstClassRate) => SH.toInt(feeTotal + deliveries * firstClassRate * 2);
  // 8号 翻訳料
  function getTranslationFee(dir, sheets, rates) {
    rates = rates || CURRENT_RATES;
    if (dir === 'F2J') return sheets * getRate(rates, 'HONYAKU_GAI_NICHI');
    if (dir === 'J2F') return sheets * getRate(rates, 'HONYAKU_NICHI_GAI');
    throw new Error('その他は裁判所が相当と認める額(直接入力)');
  }

  // ---- 単価マスタと単価区間（docs/02 §1.8・§1.8.1） ---------------------------
  // マスタの行: { ItemCode, EffectiveDate(日の番号), Amount, AbolishedDate(日の番号|null), FilingBasis }
  function normalizeMaster(rows) {
    return rows.map((r) => ({ ItemCode: r.ItemCode, EffectiveDate: dayOf(r.EffectiveDate), Amount: Number(r.Amount),
                              AbolishedDate: dayOf(r.AbolishedDate), FilingBasis: !!r.FilingBasis, ItemName: r.ItemName || '' }));
  }
  function getItemRateCodes(master, item) {
    let codes = [];
    if (ITEM_FIXED_CODES[item]) codes = codes.concat(ITEM_FIXED_CODES[item]);
    if (LODGING_ITEMS.includes(item)) codes = codes.concat(uniq(master.filter((r) => r.ItemCode.startsWith(LODGING_PREFIX)).map((r) => r.ItemCode)).sort(ordinalCompare));
    return codes;
  }
  // コードは英大文字・数字・_ だけなので序数で並べてよい（PowerShell の読み順とも一致する）
  function ordinalCompare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function getFilingCut(master, codes, date, filingDate) {
    if (filingDate == null) return null;
    const u = master.filter((r) => codes.includes(r.ItemCode) && !r.FilingBasis && r.EffectiveDate <= date)
                    .sort((a, b) => b.EffectiveDate - a.EffectiveDate);
    if (u.length > 0 && u[0].EffectiveDate > filingDate) return u[0].EffectiveDate;
    return filingDate;
  }
  function getRateSegments(start, end, master, codes, filingDate) {
    const dates = [];
    for (const row of master.filter((r) => codes.includes(r.ItemCode))) {
      if (filingDate == null || !row.FilingBasis || row.EffectiveDate <= filingDate) dates.push(row.EffectiveDate);
      if (row.AbolishedDate != null) dates.push(row.AbolishedDate);
    }
    const cuts = SH.sortedUniqNums(dates.filter((d) => d > start && d <= end));
    const segs = []; let cur = start, no = 1;
    for (const cd of cuts) { segs.push({ SegNo: no, From: cur, To: cd - 1 }); cur = cd; no++; }
    segs.push({ SegNo: no, From: cur, To: end });
    return segs;
  }
  // 審級ごとの期間。最後の審級は終わりが無い
  function getInstanceSpans(instances) {
    const sorted = instances.slice().sort((a, b) => a.Rank - b.Rank);
    return sorted.map((inst) => {
      const next = sorted.find((x) => x.Rank > inst.Rank);
      const start = dayOf(inst.StartDate);
      const end = next ? dayOf(next.StartDate) - 1 : OPEN_END;
      const fd = inst.FilingDate != null && inst.FilingDate !== '' ? dayOf(inst.FilingDate) : start;
      return { InstanceId: inst.Id, StartDate: start, EndDate: end, FilingDate: fd };
    });
  }
  function getRateAt(master, code, date, filingCut) {
    const rows = master.filter((r) => r.ItemCode === code && (filingCut == null || !r.FilingBasis || r.EffectiveDate <= filingCut));
    if (rows.some((r) => r.AbolishedDate != null && r.AbolishedDate <= date)) return null;
    const hit = rows.filter((r) => r.EffectiveDate <= date).sort((a, b) => b.EffectiveDate - a.EffectiveDate);
    return hit.length === 0 ? null : SH.toInt(hit[0].Amount);
  }
  function getSegmentRates(master, codes, date, filingDate) {
    const table = {};
    const cut = getFilingCut(master, codes, date, filingDate);
    for (const code of codes) table[code] = getRateAt(master, code, date, cut);
    return table;
  }
  function getMissingRateCodes(master, item, date, filingDate) {
    if (!ITEM_FIXED_CODES[item]) return [];
    const cut = getFilingCut(master, getItemRateCodes(master, item), date, filingDate);
    return ITEM_FIXED_CODES[item].filter((c) => getRateAt(master, c, date, cut) == null);
  }
  function getLodgingCodes(master, date) {
    const all = uniq(master.filter((r) => r.ItemCode.startsWith(LODGING_PREFIX)).map((r) => r.ItemCode)).sort(ordinalCompare);
    return all.filter((c) => getRateAt(master, c, date, null) != null);
  }
  // 費用区分 × 号 の単価区間
  //   Rates: 固定コード → 単価、LodgingRates: 宿泊料コード → 単価、Missing: 引けない固定コード（'、' 区切り。空なら計算できる）
  function buildRateSegments(instances, pools, master, items) {
    const spans = getInstanceSpans(instances);
    const out = [];
    for (const pl of pools) {
      const sp = spans.find((s) => s.InstanceId === pl.InstanceId);
      if (!sp || sp.StartDate == null) continue;
      for (const item of items) {
        const codes = getItemRateCodes(master, item);
        for (const seg of getRateSegments(sp.StartDate, sp.EndDate, master, codes, sp.FilingDate)) {
          const all = getSegmentRates(master, codes, seg.From, sp.FilingDate);
          const rates = {}, lodging = {};
          for (const code of codes) (code.startsWith(LODGING_PREFIX) ? lodging : rates)[code] = all[code];
          out.push({ PoolId: pl.Id, Item: item, SegNo: seg.SegNo, From: seg.From, To: seg.To, Rates: rates, LodgingRates: lodging,
                     Missing: getMissingRateCodes(master, item, seg.From, sp.FilingDate).join('、') });
        }
      }
    }
    return out;
  }

  // ---- 直線距離（Lambert–Andoyer。GRS80） -------------------------------------
  function getDistanceKm(lat1, lon1, lat2, lon2) {
    const ellA = 6378137.0, ellF = 1.0 / 298.257222101, rad = Math.PI / 180.0;
    const bet1 = Math.atan((1.0 - ellF) * Math.tan(lat1 * rad));
    const bet2 = Math.atan((1.0 - ellF) * Math.tan(lat2 * rad));
    const dLon = (lon2 - lon1) * rad;
    let cosS = Math.sin(bet1) * Math.sin(bet2) + Math.cos(bet1) * Math.cos(bet2) * Math.cos(dLon);
    if (cosS > 1.0) cosS = 1.0;
    if (cosS < -1.0) cosS = -1.0;
    const sigma = Math.acos(cosS);
    if (sigma <= 0.0) return 0.0;
    const sinP = Math.sin((bet1 + bet2) / 2.0) * Math.cos((bet2 - bet1) / 2.0);
    const cosQ = Math.cos((bet1 + bet2) / 2.0) * Math.sin((bet2 - bet1) / 2.0);
    const cosH = Math.cos(sigma / 2.0), sinH = Math.sin(sigma / 2.0), sinS = Math.sin(sigma);
    const termX = (sigma - sinS) * sinP * sinP / (cosH * cosH);
    const termY = (sigma + sinS) * cosQ * cosQ / (sinH * sinH);
    return ellA * (sigma - (ellF / 2.0) * (termX + termY)) / 1000.0;
  }
  const getTravelKm = (lat1, lon1, lat2, lon2) => Math.floor(getDistanceKm(lat1, lon1, lat2, lon2));

  // ---- 期日・出欠 → 費用明細（判定順 ①〜⑥） ----------------------------------
  function hPoolId(c, partyId, instanceId) {
    const mine = c.PartyPools.filter((x) => x.PartyId === partyId && x.InstanceId === instanceId);
    if (mine.length > 0) return mine[0].PoolId;
    const honntai = c.Pools.filter((x) => x.InstanceId === instanceId && prop(x, 'Kind', '本体') === '本体');
    if (honntai.length > 0) return honntai[0].Id;
    const any = c.Pools.filter((x) => x.InstanceId === instanceId);
    return any.length > 0 ? any[0].Id : 0;
  }
  function hSource(at, subj) {
    const k = String(prop(at, 'SrcKey', ''));
    if (k !== '' && String(prop(at, 'SrcKind', '')) !== '外国') {
      let la = Number(prop(at, 'SrcLat', 0)), lo = Number(prop(at, 'SrcLon', 0));
      if (la === 0) { la = null; lo = null; }
      return { Key: k, Lat: la, Lon: lo, Overridden: true };
    }
    return { Key: String(prop(subj, 'CourtKey', '')), Lat: prop(subj, 'Lat', null), Lon: prop(subj, 'Lon', null), Overridden: false };
  }
  function hForeignWarning(name, date, normalRoute, fare) {
    let t = 'H9: ' + name + ' ' + dayStr(date, '/') + ' : 外国との間の旅行のため旅費は実費（法2条4号イ(2)）。' +
            '日当・宿泊料は証人の例による（同ロ・ハただし書）ので額を確かめてください';
    if (!normalRoute) t += '。通常の経路・方法でなければ旅費も証人の例による';
    if (fare <= 0) t += '。実費が未入力（0 円）';
    return t;
  }
  function hSegment(segments, poolId, item, date, rates, lodgingRates) {
    if (segments.length === 0) return { SegNo: 1, Rates: rates, LodgingRates: lodgingRates, Missing: '' };
    const hit = segments.filter((s) => s.PoolId === poolId && s.Item === item && s.From <= date && date <= s.To);
    return hit.length === 0 ? null : hit[0];
  }
  function partyWord(c, payerId) {
    const p = c.Parties.find((x) => x.Id === payerId);
    if (!p) return '当事者' + payerId;
    if (p.Kind === '申立人' || p.Kind === '相手方') {
      const same = c.Parties.filter((x) => x.Kind === p.Kind);
      return same.length >= 2 ? p.Kind + p.Name : String(p.Kind);
    }
    return String(p.Name);
  }
  function hearingLabel(c, rows, withName) {
    const f = rows[0];
    const who = f.Payers.map((id) => partyWord(c, id)).join('・');
    let role = { '本人': '本人', '訴訟代理人': '代理人', 'その他の法定代理人等': '法定代理人等' }[f.Role];
    if (role === undefined) role = String(f.Role);
    if (withName) role += '（' + f.Name + '）';
    const kai = SH.sortedUniqNums(rows.map((r) => r.HNo)).map((n) => '第' + n + '回').join('、');
    const kind = String(f.HKind);
    if (f.Item === 5) return who + role + kind + '期日出頭日当及び旅費（' + kai + '）';
    return who + role + '出頭日当及び旅費（' + kai + kind + '）';
  }

  // c: { Parties, Attendees, AttendeeParties, Instances, Pools, PartyPools, Hearings, Attendance }
  // 期日の種類のうち、法2条4号・5号の「裁判所が定めた期日」に当たらないもの
  const NOT_HEARING_KIND = '書面による準備手続の協議';
  SH.NOT_HEARING_KIND = NOT_HEARING_KIND;
  function getHearingCosts(c, opts) {
    opts = opts || {};
    const segments = opts.Segments || [];
    const rates = opts.Rates || CURRENT_RATES;
    const lodgingRates = opts.LodgingRates || {};
    const warn = [], rows = [];
    const byHearing = new Map(c.Hearings.map((h) => [h.Id, h]));
    const hDateOf = (h) => dayOf(prop(h, 'HDate', '2000-01-01'));
    // 「第○回」＝ その審級・その種類の期日の中で何回目か
    const hNoOf = new Map();
    const groupsH = new Map();
    for (const h of c.Hearings) {
      const k = h.InstanceId + '|' + String(prop(h, 'Kind', ''));
      if (!groupsH.has(k)) groupsH.set(k, []);
      groupsH.get(k).push(h);
    }
    for (const grp of groupsH.values()) {
      const sorted = grp.slice().sort((a, b) => (hDateOf(a) - hDateOf(b)) || (SH.toInt(prop(a, 'Seq', 1)) - SH.toInt(prop(b, 'Seq', 1))));
      sorted.forEach((h, i) => hNoOf.set(h.Id, i + 1));
    }
    const byInst = new Map(c.Instances.map((i) => [i.Id, i]));
    const byParty = new Map(c.Parties.map((p) => [p.Id, p]));
    const byAtt = new Map(c.Attendees.map((a) => [a.Id, a]));

    // ① 行ごとの額
    for (const at of c.Attendance) {
      const status = String(prop(at, 'Status', '欠席'));
      if (status === '欠席') continue;
      const h = byHearing.get(at.HearingId);
      if (!h) { warn.push('H2: 存在しない期日を指す出欠の行がある（HearingId=' + at.HearingId + '）'); continue; }
      const inst = byInst.get(h.InstanceId);
      const hDate = hDateOf(h);
      const sKind = String(at.SubjectKind);
      const rkey = h.Id + '|' + sKind + '|' + at.SubjectId;
      let subj, role, item, payers;
      if (sKind === 'party') {
        subj = byParty.get(at.SubjectId); role = '本人'; item = 4; payers = [at.SubjectId];
      } else {
        subj = byAtt.get(at.SubjectId);
        role = String(prop(subj, 'Kind', ''));
        item = role === '訴訟代理人' ? 5 : 4;
        payers = c.AttendeeParties.filter((x) => x.AttendeeId === at.SubjectId).map((x) => x.PartyId).sort(numSort);
      }
      if (!subj) { warn.push('H2: 存在しない出頭者を指す出欠の行がある（SubjectId=' + at.SubjectId + '）'); continue; }
      const name = String(prop(subj, 'Name', '?'));
      // 書面による準備手続の協議（民訴法176条2項）は、手続法規上の「期日」ではないので 4号・5号を計上しない（2026-11-27 ユーザー）
      if (String(prop(h, 'Kind', '')) === NOT_HEARING_KIND) {
        warn.push('H10: ' + name + ' ' + dayStr(hDate, '/') + ' : ' + NOT_HEARING_KIND + '（民訴法176条2項）は「期日」に当たらないため計上しない'); continue;
      }
      if (payers.length === 0) {
        warn.push('H3: ' + name + ' は、この審級（' + prop(inst, 'Name', h.InstanceId) + '）に在籍する当事者を代理していないため計上しない'); continue;
      }
      const poolOvr = SH.toInt(prop(at, 'PoolOverride', 0));
      const ovrOk = poolOvr > 0 && c.Pools.some((x) => x.Id === poolOvr && x.InstanceId === h.InstanceId);
      const poolIds = SH.sortedUniqNums(payers.map((p) => hPoolId(c, p, h.InstanceId)));
      const poolId = ovrOk ? poolOvr : poolIds[0];
      if (!ovrOk && poolIds.length > 1) warn.push('H8: ' + name + ' が代理する当事者の費用区分が分かれているため、区分 ' + poolId + ' にまとめて計上した');

      const seg = hSegment(segments, poolId, item, hDate, rates, lodgingRates);
      if (!seg) { warn.push('H7: ' + dayStr(hDate, '/') + ' の期日に対応する単価区間がないため計上しない'); continue; }
      if (String(prop(seg, 'Missing', '')) !== '') { warn.push('H7: ' + dayStr(hDate, '/') + ' の期日は単価が未登録（' + seg.Missing + '）のため計上しない'); continue; }
      const segRates = prop(seg, 'Rates', rates);
      const segLodging = prop(seg, 'LodgingRates', lodgingRates);

      let venueKey = String(prop(h, 'VenueKey', '')), venueLat = prop(h, 'VenueLat', null), venueLon = prop(h, 'VenueLon', null);
      if (venueKey === '') { venueKey = String(prop(inst, 'VenueKey', '')); venueLat = prop(inst, 'VenueLat', null); venueLon = prop(inst, 'VenueLon', null); }
      if (venueKey === '') { warn.push('H1: ' + dayStr(hDate, '/') + ' の出頭場所が未設定のため計上しない'); continue; }

      const foreign = String(prop(at, 'SrcKind', '')) === '外国';
      const src = hSource(at, subj);
      const sameCourt = !foreign && src.Key === venueKey && venueKey !== '';
      const within500 = !!prop(at, 'Within500m', false);
      let km = Number(prop(at, 'KmOverride', 0));
      if (!(km > 0)) {
        if (foreign || venueLat == null || src.Lat == null) km = 0;
        else km = getTravelKm(Number(src.Lat), Number(src.Lon), Number(venueLat), Number(venueLon));
      }
      const days = SH.toInt(prop(at, 'Days', 1));
      const nights = SH.toInt(prop(at, 'Nights', 0));
      // 【2026-11-24】旅費を請求しない（日当だけを請求する）行。出頭でも旅費は 0（Web・欠席はもともと旅費が生じない）
      const noFare = !!prop(at, 'NoFare', false);
      let fare = 0, lodge = 0, usedActual = false;
      if (status !== 'Web' && foreign) {
        fare = noFare ? 0 : Math.max(0, SH.toInt(prop(at, 'ActualFare', 0))); usedActual = !noFare;
        warn.push(hForeignWarning(name, hDate, !!prop(at, 'NormalRoute', false), noFare ? 1 : fare));
      }
      if (status !== 'Web') {
        if (!foreign && noFare) { fare = 0; usedActual = false; }
        else if (!foreign) {
          const actual = prop(at, 'UseActual', false) ? SH.toInt(prop(at, 'ActualFare', 0)) : 0;
          const tw = getTravelWithActual(km, sameCourt, within500, actual, !!prop(at, 'NormalRoute', false), !!prop(at, 'Receipts', false), segRates);
          fare = tw.Amount; usedActual = tw.UsedActual;
          if (tw.Warning) warn.push('H5: ' + name + ' ' + dayStr(hDate, '/') + ' : ' + tw.Warning);
        }
        lodge = 0;
        if (nights > 0) {
          const code = String(prop(at, 'LodgingCode', ''));
          if (!hasRate(segLodging, code)) warn.push('H4: ' + name + ' ' + dayStr(hDate, '/') + ' の宿泊地の単価が引けない（' + code + '）ため宿泊料を 0 とした');
          else lodge = getLodging(nights, SH.toInt(segLodging[code]));
        }
      }
      const daily = getDailyAllowance(days, getRate(segRates, 'NITTOU'));
      rows.push({
        RKey: rkey, HearingId: h.Id, InstanceId: h.InstanceId, PoolId: poolId, SegNo: SH.toInt(seg.SegNo),
        HDate: hDate, Seq: SH.toInt(prop(h, 'Seq', 1)), HKind: String(prop(h, 'Kind', '')), HNo: hNoOf.get(h.Id),
        Summoned: !!prop(at, 'Summoned', false), SubjectKind: sKind, SubjectId: at.SubjectId, Role: role, Name: name,
        Item: item, PayerKey: payers.join('+'), Payers: payers, Status: status, Km: SH.toInt(km), SameCourt: sameCourt, Within500m: within500,
        SrcKey: foreign ? '' : src.Key, SrcOverridden: !!src.Overridden, Foreign: foreign, NoFare: noFare,
        Days: days, Nights: nights, UsedActual: usedActual,
        Fare: SH.toInt(fare), Daily: SH.toInt(daily), Lodge: SH.toInt(lodge),
        Amount: SH.toInt(fare + daily + lodge), Gross: SH.toInt(fare + daily + lodge),
        CapOverride: SH.toInt(prop(at, 'CapOverride', 0)), Cap: 0, Dropped: ''
      });
    }

    // ② 同じ日に複数の期日 → 後の期日は計上しない
    for (const r of rows) {
      const better = rows.some((x) => x.RKey !== r.RKey && x.SubjectKind === r.SubjectKind && x.SubjectId === r.SubjectId &&
        x.HDate === r.HDate && (x.Seq < r.Seq || (x.Seq === r.Seq && x.HearingId < r.HearingId)));
      if (better) r.Dropped = '②同日の後の期日';
    }
    // ③ 4号かっこ書 ／ ④ 5号かっこ書（最も低額の1人。期日 × 当事者。呼出しを受けた者は対象外）
    for (const targetRole of ['その他の法定代理人等', '訴訟代理人']) {
      const label = targetRole === '訴訟代理人' ? '④5号かっこ書（最も低額の1人）' : '③4号かっこ書（最も低額の1人）';
      const live = rows.filter((x) => x.Dropped === '' && x.Role === targetRole && !x.Summoned);
      for (const r of live) {
        let keep = false;
        for (const p of r.Payers) {
          const better = live.some((x) => x.RKey !== r.RKey && x.HearingId === r.HearingId && x.Payers.includes(p) &&
            (x.Amount < r.Amount || (x.Amount === r.Amount && x.SubjectId < r.SubjectId)));
          if (!better) { keep = true; break; }
        }
        if (!keep) r.Dropped = label;
      }
    }
    // ⑤ 5号本文かっこ書（当事者等が出頭していれば、その当事者の訴訟代理人は計上しない）
    for (const r of rows.filter((x) => x.Dropped === '' && x.Role === '訴訟代理人')) {
      if (r.Summoned) continue;
      for (const p of r.Payers) {
        if (rows.some((x) => x.HearingId === r.HearingId && x.Role !== '訴訟代理人' && x.Payers.includes(p))) {
          r.Dropped = '⑤5号本文かっこ書（当事者等が出頭・呼出しなし）'; break;
        }
      }
    }
    // ⑥ 5号ただし書（当事者等が出頭した場合の額を超えられない）
    for (const r of rows.filter((x) => x.Dropped === '' && x.Role === '訴訟代理人')) {
      let cap;
      if (r.CapOverride > 0) cap = r.CapOverride;
      else {
        cap = 0;
        const h = byHearing.get(r.HearingId), inst = byInst.get(r.InstanceId);
        let vKey = String(prop(h, 'VenueKey', '')), vLat = prop(h, 'VenueLat', null), vLon = prop(h, 'VenueLon', null);
        if (vKey === '') { vKey = String(prop(inst, 'VenueKey', '')); vLat = prop(inst, 'VenueLat', null); vLon = prop(inst, 'VenueLon', null); }
        const seg4 = hSegment(segments, r.PoolId, 4, r.HDate, rates, lodgingRates);
        const segRates = prop(seg4, 'Rates', rates);
        for (const p of r.Payers) {
          const actual = rows.filter((x) => x.Dropped === '' && x.Role !== '訴訟代理人' && x.HearingId === r.HearingId && x.Payers.includes(p));
          if (actual.length > 0) cap += actual.reduce((t, x) => t + x.Amount, 0);
          else {
            const pp = byParty.get(p);
            const pAt = c.Attendance.find((x) => x.HearingId === r.HearingId && String(x.SubjectKind) === 'party' && x.SubjectId === p) || null;
            const pSrc = hSource(pAt, pp);
            const same = pSrc.Key === vKey && vKey !== '';
            let kmP = 0;
            if (vLat != null && pSrc.Lat != null) kmP = getTravelKm(Number(pSrc.Lat), Number(pSrc.Lon), Number(vLat), Number(vLon));
            cap += getTravelFare(kmP, same, false, segRates) + getDailyAllowance(r.Days, getRate(segRates, 'NITTOU'));
          }
        }
      }
      r.Cap = SH.toInt(cap);
      if (r.Amount > cap) {
        warn.push('H6: 5号ただし書により ' + r.Name + ' ' + dayStr(r.HDate, '/') + ' の額 ' + r.Amount + ' 円を上限 ' + cap + ' 円に減額した');
        r.Amount = SH.toInt(cap);
      }
    }

    // 費用明細の行に束ねる（費用区分 × 号 × 単価区間 × 支出者 × 出頭者 × 期日の種類）
    const kept = rows.filter((x) => x.Dropped === '');
    const groups = new Map();
    for (const x of kept) {
      const k = x.PoolId + '|' + x.Item + '|' + x.SegNo + '|' + x.PayerKey + '|' + x.SubjectKind + ':' + x.SubjectId + '|' + x.HKind;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(x);
    }
    const peopleOf = new Map();
    const roleKey = (f) => f.PoolId + '|' + f.Item + '|' + f.SegNo + '|' + f.PayerKey + '|' + f.Role + '|' + f.HKind;
    for (const grp of groups.values()) {
      const f = grp[0], k = roleKey(f);
      if (!peopleOf.has(k)) peopleOf.set(k, []);
      if (!peopleOf.get(k).includes(f.Name)) peopleOf.get(k).push(f.Name);
    }
    const costRows = [];
    for (const grp of groups.values()) {
      const f = grp[0];
      const minH = Math.min(...grp.map((x) => x.HearingId));
      const kindNum = f.SubjectKind === 'party' ? 0 : 1;
      costRows.push({
        PoolId: f.PoolId, PartyId: 0, Item: f.Item, SegNo: f.SegNo,
        Amount: grp.reduce((t, x) => t + x.Amount, 0),
        Label: hearingLabel(c, grp, peopleOf.get(roleKey(f)).length >= 2),
        RelatedId: 0, Payers: f.Payers.slice(),
        SortKey: ((f.PoolId * 100 + f.Item) * 100 + f.SegNo) * 100000000 + (minH * 1000 + kindNum * 500 + f.SubjectId)
      });
    }
    costRows.sort((a, b) => a.SortKey - b.SortKey);
    return { Rows: rows, Costs: kept, CostRows: costRows, Warnings: warn };
  }

  Object.assign(SH, {
    CURRENT_RATES, ITEM_FIXED_CODES, LODGING_PREFIX, getRate, getTravelFare, getTravelWithActual, getDailyAllowance, getLodging,
    getDocFee1, getDocFeeOther, getCertFee, getTranslationFee,
    normalizeMaster, getItemRateCodes, getFilingCut, getRateSegments, getInstanceSpans, getRateAt, getSegmentRates,
    getMissingRateCodes, getLodgingCodes, buildRateSegments, getDistanceKm, getTravelKm, getHearingCosts
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
