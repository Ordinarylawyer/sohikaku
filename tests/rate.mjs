// 単価区間・単価・距離・6〜8号の算定（参照実装のテスト TC-18・TC-19・TC-25 を移したもの。架空のマスタ）
import { loadSH } from './load.mjs';
const SH = loadSH();
let pass = 0, fail = 0;
function Eq(name, got, exp) {
  if (JSON.stringify(got) === JSON.stringify(exp)) pass++;
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`); }
}
const D = SH.dayOf, Ymd = (n) => SH.dayStr(n);
const MRow = (code, eff, amt, abol) => ({ ItemCode: code, EffectiveDate: eff, Amount: amt, AbolishedDate: abol || null });
const C = SH.CURRENT_RATES;
const master = SH.normalizeMaster([
  MRow('NITTOU', '2020-01-01', 3950), MRow('RYOHI_KINKYORI', '2003-04-01', 300), MRow('RYOHI_DOITSU', '2003-04-01', 300),
  MRow('RYOHI_KM_10_100', '2003-04-01', 30), MRow('RYOHI_KM_100_301', '2003-04-01', 50), MRow('RYOHI_KM_301_MIMAN', '2003-04-01', 50),
  MRow('RYOHI_KM_301_IJO', '2003-04-01', 40), MRow('YUBIN_1SHU', '2019-10-01', 100), MRow('YUBIN_1SHU', '2024-10-01', 200),
  MRow('KAKITOME', '2019-10-01', 300), MRow('KAKITOME', '2025-01-01', 400),
  MRow('SHUKUHAKU_KO', '2003-04-01', 10000, '2025-04-01'), MRow('SHUKUHAKU_OTSU', '2003-04-01', 9000, '2025-04-01'),
  MRow('SHUKUHAKU_13', '2025-04-01', 21000), MRow('SHUKUHAKU_27', '2025-04-01', 16000),
  ...['SHORUI_1_KIHON', 'SHORUI_1_SHUCHO', 'SHORUI_1_SHOSHO', 'SHORUI_2', 'SHORUI_2_2_KIHON', 'SHORUI_2_2_KASAN', 'SHORUI_3', 'SHORUI_3_TA',
      'SHORUI_5', 'SHORUI_SHOKKEN', 'SHORUI_KOJO_1', 'SHORUI_KOJO_2'].map((c) => MRow(c, '2003-04-01', C[c]))
]);

// 【7号】【8号】
Eq('7号 1200+3x110x2', SH.getCertFee(1200, 3, 110), 1860);
Eq('8号 F2J 5', SH.getTranslationFee('F2J', 5), 8000);
Eq('8号 J2F 5', SH.getTranslationFee('J2F', 5), 15000);

// TC-18
const codes7 = SH.getItemRateCodes(master, 7);
let s = SH.getRateSegments(D('2024-06-01'), D('2025-03-31'), master, codes7);
Eq('a 2区間', s.length, 2); Eq('  区間1の終期', Ymd(s[0].To), '2024-09-30'); Eq('  区間2の始期', Ymd(s[1].From), '2024-10-01');
Eq('b 1区間', SH.getRateSegments(D('2024-06-01'), D('2024-09-30'), master, codes7).length, 1);
const codes12 = SH.getItemRateCodes(master, 12);
const s12 = SH.getRateSegments(D('2024-11-01'), D('2025-01-09'), master, codes12);
Eq('c 12号 2区間', s12.length, 2); Eq('  区間2の始期', Ymd(s12[1].From), '2025-01-01');
const ra = SH.getSegmentRates(master, codes12, s12[0].From), rb = SH.getSegmentRates(master, codes12, s12[1].From);
Eq('d', [ra.YUBIN_1SHU, ra.KAKITOME, rb.YUBIN_1SHU, rb.KAKITOME], [200, 300, 200, 400]);
const codes4 = SH.getItemRateCodes(master, 4);
Eq('e 4号のコード数', codes4.length, 11);
const s4 = SH.getRateSegments(D('2025-01-10'), D('2025-06-30'), master, codes4);
Eq('  2区間', s4.length, 2); Eq('  区間2の始期', Ymd(s4[1].From), '2025-04-01');
Eq('f 区間1の宿泊地', SH.getLodgingCodes(master, s4[0].From).join(','), 'SHUKUHAKU_KO,SHUKUHAKU_OTSU');
Eq('  区間2の宿泊地', SH.getLodgingCodes(master, s4[1].From).join(','), 'SHUKUHAKU_13,SHUKUHAKU_27');
Eq('g', [SH.getRateAt(master, 'SHUKUHAKU_KO', D('2025-03-31')), SH.getRateAt(master, 'SHUKUHAKU_KO', D('2025-04-01')),
         SH.getRateAt(master, 'SHUKUHAKU_13', D('2025-03-31')), SH.getRateAt(master, 'SHUKUHAKU_13', D('2025-04-01'))], [10000, null, null, 21000]);
const s4old = SH.getRateSegments(D('2019-06-01'), D('2024-10-31'), master, codes4);
Eq('h 2区間', s4old.length, 2);
Eq('  区間1 の未登録', SH.getMissingRateCodes(master, 4, s4old[0].From).join(','), 'NITTOU');
Eq('  区間2 の未登録', SH.getMissingRateCodes(master, 4, s4old[1].From).join(','), '');
Eq('i 6号', SH.getMissingRateCodes(master, 6, D('2024-01-01')).join(','), 'SHORUI_6');
const spans = SH.getInstanceSpans([{ Id: 3, Rank: 3, StartDate: '2025-01-10' }, { Id: 1, Rank: 1, StartDate: '2019-06-01' }, { Id: 2, Rank: 2, StartDate: '2024-11-01' }]);
const sp = (id) => spans.find((x) => x.InstanceId === id);
Eq('j', [Ymd(sp(1).EndDate), Ymd(sp(2).EndDate), Ymd(sp(3).EndDate)], ['2024-10-31', '2025-01-09', '9999-12-31']);
const so = SH.getRateSegments(sp(3).StartDate, sp(3).EndDate, master, codes4);
Eq('  終わりが無くても 2区間', so.length, 2); Eq('  区間2の終期', Ymd(so[1].To), '9999-12-31');

// k〜o 申立ての日で新旧を決める改定
const MF = (code, eff, amt, fb) => ({ ItemCode: code, EffectiveDate: eff, Amount: amt, AbolishedDate: null, FilingBasis: fb });
const mF = SH.normalizeMaster([
  MF('YUBIN_1SHU', '2004-01-01', 80, false), MF('YUBIN_1SHU', '2014-04-01', 82, true), MF('YUBIN_1SHU', '2019-10-01', 84, true),
  MF('YUBIN_1SHU', '2024-09-17', 84, false), MF('YUBIN_1SHU', '2024-10-01', 110, false),
  MF('KAKITOME', '2004-01-01', 420, false), MF('KAKITOME', '2014-04-01', 430, true), MF('KAKITOME', '2019-10-01', 435, true),
  MF('KAKITOME', '2023-10-01', 480, true), MF('KAKITOME', '2024-09-17', 480, false)]);
const c12 = SH.getItemRateCodes(mF, 12), c7 = SH.getItemRateCodes(mF, 7);
const segText = (segs, codes, fd) => segs.map((x) => {
  const rt = SH.getSegmentRates(mF, codes, x.From, fd);
  return Ymd(x.From) + '~' + (x.To === SH.OPEN_END ? '' : Ymd(x.To)) + ':' + codes.map((c) => rt[c]).join('/');
}).join(' | ');
const E = SH.OPEN_END;
Eq('k', segText(SH.getRateSegments(D('2023-06-01'), E, mF, c12, D('2023-06-01')), c12, D('2023-06-01')),
   '2023-06-01~2024-09-16:84/435 | 2024-09-17~2024-09-30:84/480 | 2024-10-01~:110/480');
Eq('  対照', segText(SH.getRateSegments(D('2023-06-01'), E, mF, c12), c12, null),
   '2023-06-01~2023-09-30:84/435 | 2023-10-01~2024-09-16:84/480 | 2024-09-17~2024-09-30:84/480 | 2024-10-01~:110/480');
Eq('l', segText(SH.getRateSegments(D('2013-05-01'), D('2016-12-31'), mF, c12, D('2013-05-01')), c12, D('2013-05-01')), '2013-05-01~2016-12-31:80/420');
Eq('m', segText(SH.getRateSegments(D('2019-06-01'), E, mF, c7, D('2019-06-01')), c7, D('2019-06-01')),
   '2019-06-01~2024-09-16:82 | 2024-09-17~2024-09-30:84 | 2024-10-01~:110');
const sN = SH.getInstanceSpans([{ Id: 1, Rank: 1, StartDate: '2023-11-01', FilingDate: '2023-09-01' }]);
Eq('n', Ymd(sN[0].FilingDate), '2023-09-01');
Eq('  84/435', segText(SH.getRateSegments(sN[0].StartDate, D('2024-09-16'), mF, c12, sN[0].FilingDate), c12, sN[0].FilingDate), '2023-11-01~2024-09-16:84/435');
const sN2 = SH.getInstanceSpans([{ Id: 1, Rank: 1, StartDate: '2023-11-01' }]);
Eq('  未入力なら開始日', Ymd(sN2[0].FilingDate), '2023-11-01');
Eq('  未登録なし', SH.getMissingRateCodes(mF, 12, D('2023-11-01'), sN2[0].FilingDate).length, 0);
Eq('  書留', SH.getSegmentRates(mF, c12, D('2023-11-01'), sN2[0].FilingDate).KAKITOME, 480);
const sO = SH.getInstanceSpans([{ Id: 1, Rank: 1, StartDate: '2013-05-01' }, { Id: 2, Rank: 2, StartDate: '2019-06-01' }, { Id: 3, Rank: 3, StartDate: '2023-11-01', FilingDate: '2023-06-01' }]);
const segTextO = (p, codes) => SH.getRateSegments(p.StartDate, p.EndDate, mF, codes, p.FilingDate)
  .map((x) => Ymd(x.From) + ':' + codes.map((c) => SH.getSegmentRates(mF, codes, x.From, p.FilingDate)[c]).join('/')).join(' | ');
Eq('o 審級1', segTextO(sO[0], c12), '2013-05-01:80/420');
Eq('  審級2', segTextO(sO[1], c7), '2019-06-01:82');
Eq('  審級3', segTextO(sO[2], c12), '2023-11-01:84/435 | 2024-09-17:84/480 | 2024-10-01:110/480');

// TC-19 単価を引数で受け取る
const r2 = { RYOHI_KINKYORI: 400, RYOHI_DOITSU: 350, RYOHI_KM_10_100: 35, RYOHI_KM_100_301: 55, RYOHI_KM_301_MIMAN: 60, RYOHI_KM_301_IJO: 45,
  SHORUI_1_KIHON: 2000, SHORUI_1_SHUCHO: 1100, SHORUI_1_SHOSHO: 1200, SHORUI_2: 850, SHORUI_2_2_KIHON: 1050, SHORUI_2_2_KASAN: 1060,
  SHORUI_3: 1070, SHORUI_3_TA: 550, SHORUI_5: 810, SHORUI_6: 520, SHORUI_SHOKKEN: 830, SHORUI_KOJO_1: 900, SHORUI_KOJO_2: 1100,
  HONYAKU_GAI_NICHI: 1700, HONYAKU_NICHI_GAI: 3100 };
Eq('19a-f 旅費', [SH.getTravelFare(9, false, false, r2), SH.getTravelFare(0, true, false, r2), SH.getTravelFare(0, true, true, r2),
                  SH.getTravelFare(50, false, false, r2), SH.getTravelFare(100, false, false, r2), SH.getTravelFare(301, false, false, r2)],
   [400, 350, 0, 1750, 5500, 18045]);
Eq('19g 実費', SH.getTravelWithActual(100, false, false, 6000, true, true, r2).Amount, 6000);
Eq('19h-j 6号', [SH.getDocFee1(21, 66, 6, 'none', r2), SH.getDocFee1(5, 15, 1, 'settlement', r2), SH.getDocFee1(5, 15, 1, 'labor', r2)], [13200, 1100, 900]);
Eq('19k-q 別表第二', [SH.getDocFeeOther('2', {}, r2), SH.getDocFeeOther('2-2', { Claims: 1001 }, r2), SH.getDocFeeOther('3', {}, r2),
                      SH.getDocFeeOther('3', { OtherCreditor: true }, r2), SH.getDocFeeOther('5', {}, r2), SH.getDocFeeOther('6', {}, r2),
                      SH.getDocFeeOther('exofficio', {}, r2)], [850, 3170, 1070, 550, 810, 520, 830]);
Eq('19r-s 翻訳', [SH.getTranslationFee('F2J', 5, r2), SH.getTranslationFee('J2F', 5, r2)], [8500, 15500]);
let threw = false; try { SH.getDocFee1(5, 15, 1, 'none', { SHORUI_1_SHUCHO: 1000 }); } catch { threw = true; }
Eq('19t 単価が無ければ止まる', threw, true);

// TC-25 直線距離
const km = [[36.239697, 137.969406, 35.67511, 139.752594, 172], [35.67511, 139.752594, 35.67511, 139.752594, 0],
  [35.468174, 139.5979, 35.480125, 139.631393, 3], [36.311192, 139.797318, 36.377922, 139.736557, 9],
  [35.67511, 139.752594, 35.856518, 139.648438, 22], [35.67511, 139.752594, 35.446644, 139.641769, 27],
  [34.695023, 135.503983, 34.682735, 135.176208, 30], [35.67511, 139.752594, 35.605728, 140.123291, 34],
  [34.695023, 135.503983, 35.009846, 135.764496, 42], [36.566624, 136.662582, 36.683826, 137.206757, 50],
  [34.347084, 134.050232, 33.842049, 132.768692, 130], [35.178574, 136.898773, 34.695023, 135.503983, 138],
  [35.67511, 139.752594, 34.695023, 135.503983, 401], [38.256725, 140.868561, 34.400799, 132.46254, 867],
  [43.058674, 141.338837, 33.576515, 130.378067, 1421], [26.208338, 127.686035, 35.67511, 139.752594, 1556],
  [43.326481, 145.577698, 24.336464, 124.16082, 2875]];
Eq('25 距離', km.map((k) => SH.getTravelKm(k[0], k[1], k[2], k[3])), km.map((k) => k[4]));
Eq('25b', [SH.getTravelFare(SH.getTravelKm(36.239697, 137.969406, 35.67511, 139.752594)), SH.getTravelFare(9)], [8600, 300]);

// 丸め（参照実装のテスト TC-23 と国等の端数）
Eq('round 0.5→1 / 2.5→3 / 1.0000005', [SH.roundYen(0.5), SH.roundYen(2.5), SH.roundYen(1.4999999999), SH.roundYen(-2.5)], [1, 3, 2, -3]);
Eq('gov', [SH.roundYenGov(10.9, true, false), SH.roundYenGov(0.4, false, true), SH.roundYenGov(10.5, false, false)], [10, 1, 11]);
Eq('yenJP', ['６５００', '１万', '１０万００５０', '１億', '０'], [SH.yenJP(6500), SH.yenJP(10000), SH.yenJP(100050), SH.yenJP(100000000), SH.yenJP(0)]);

// TC-35 旅費を請求しない（NoFare。参照実装のテスト TC-35 と同じ事件）
{
  const T = { Key: '東京簡易裁判所', Lat: 35.693825, Lon: 139.742380 }, M = { Key: '松本簡易裁判所', Lat: 36.233480, Lon: 137.968430 };
  const P = (Id, Kind, Name, c) => ({ Id, Kind, Name, CourtKey: c.Key, Lat: c.Lat, Lon: c.Lon });
  const hc = {
    Parties: [P(1, '申立人', '原告X', M), P(2, '相手方', '被告Y', T)], Attendees: [P(21, '訴訟代理人', '弁護士H', M)],
    AttendeeParties: [{ AttendeeId: 21, PartyId: 1 }],
    Instances: [{ Id: 1, Rank: 1, Name: '第一審', VenueKey: T.Key, VenueLat: T.Lat, VenueLon: T.Lon }], PartyPools: [],
    Pools: [{ Id: 1, InstanceId: 1, Kind: '本体', Name: '第一審の訴訟費用' }],
    Hearings: [{ Id: 351, InstanceId: 1, HDate: '2025-06-02', Seq: 1, Kind: '口頭弁論' }, { Id: 352, InstanceId: 1, HDate: '2025-06-09', Seq: 1, Kind: '口頭弁論' }],
    Attendance: [
      { HearingId: 351, SubjectKind: 'party', SubjectId: 1, Status: '出頭', Days: 2, Nights: 1, LodgingCode: 'SHUKUHAKU_13', NoFare: true },
      { HearingId: 351, SubjectKind: 'attendee', SubjectId: 21, Status: '出頭', Days: 1, UseActual: true, ActualFare: 12000, NormalRoute: true, Receipts: false, Summoned: true, NoFare: true },
      { HearingId: 351, SubjectKind: 'party', SubjectId: 2, Status: 'Web', Days: 1, NoFare: true },
      { HearingId: 352, SubjectKind: 'party', SubjectId: 2, Status: '出頭', Days: 1, SrcKind: '外国', SrcLabel: '外国', NoFare: true },
      { HearingId: 352, SubjectKind: 'party', SubjectId: 1, Status: '出頭', Days: 1 }]
  };
  const r = SH.getHearingCosts(hc, { LodgingRates: { SHUKUHAKU_13: 21000 } });
  const row = (n, hid) => r.Rows.find((x) => x.Name === n && x.HearingId === hid) || {};
  Eq('35a 出頭でも旅費 0', [row('原告X', 351).Amount, row('原告X', 351).Fare], [28900, 0]);
  Eq('35b 代理人も旅費 0', row('弁護士H', 351).Amount, 3950);
  Eq('35c Web', row('被告Y', 351).Amount, 3950);
  Eq('35d 外国・請求せず', row('被告Y', 352).Fare, 0);
  Eq('35e 請求せずでない行', row('原告X', 352).Fare, 8500);
  Eq('35f 警告は H9 だけ・実費未入力を添えない', [r.Warnings.map((w) => w.split(':')[0]).join(','), r.Warnings[0].includes('実費が未入力')], ['H9', false]);
  const j = SH.toHearingCase({ attendance: [{ hearingId: 1, subjectKind: 'party', subjectId: 1, noFare: true }, { hearingId: 1, subjectKind: 'party', subjectId: 2 }] });
  Eq('35g JSON の noFare', j.Attendance.map((a) => a.NoFare), [true, false]);
}

// TC-36 書面による準備手続の協議は「期日」に当たらない（民訴法176条2項。参照実装のテスト TC-36 と同じ事件）
{
  const T = { Key: '東京簡易裁判所', Lat: 35.693825, Lon: 139.742380 }, M = { Key: '松本簡易裁判所', Lat: 36.233480, Lon: 137.968430 };
  const P = (Id, Kind, Name, c) => ({ Id, Kind, Name, CourtKey: c.Key, Lat: c.Lat, Lon: c.Lon });
  const hc = {
    Parties: [P(1, '申立人', '原告X', M), P(2, '相手方', '被告Y', T)], Attendees: [P(21, '訴訟代理人', '弁護士H', M)],
    AttendeeParties: [{ AttendeeId: 21, PartyId: 1 }],
    Instances: [{ Id: 1, Rank: 1, Name: '第一審', VenueKey: T.Key, VenueLat: T.Lat, VenueLon: T.Lon }], PartyPools: [],
    Pools: [{ Id: 1, InstanceId: 1, Kind: '本体', Name: '第一審の訴訟費用' }],
    Hearings: [{ Id: 361, InstanceId: 1, HDate: '2025-06-02', Seq: 1, Kind: '口頭弁論' }, { Id: 362, InstanceId: 1, HDate: '2025-06-16', Seq: 1, Kind: '書面による準備手続の協議' }],
    Attendance: [
      { HearingId: 361, SubjectKind: 'party', SubjectId: 1, Status: '出頭', Days: 1 },
      { HearingId: 362, SubjectKind: 'party', SubjectId: 1, Status: 'Web', Days: 1 },
      { HearingId: 362, SubjectKind: 'attendee', SubjectId: 21, Status: '出頭', Days: 1 }]
  };
  const r = SH.getHearingCosts(hc, {});
  Eq('36a 協議の行は計上しない', r.Rows.filter((x) => x.HearingId === 362).length, 0);
  Eq('36b 口頭弁論の行は計上する', (r.Rows.find((x) => x.HearingId === 361) || {}).Fare, 8500);
  Eq('36c 明細は口頭弁論の 1 本だけ', r.CostRows.length, 1);
  Eq('36d 警告 H10 が行ごとに出る', r.Warnings.map((w) => w.split(':')[0]), ['H10', 'H10']);
  Eq('36e H10 の文言', r.Warnings[0], 'H10: 原告X 2025/06/16 : 書面による準備手続の協議（民訴法176条2項）は「期日」に当たらないため計上しない');
}

console.log(`rate: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
