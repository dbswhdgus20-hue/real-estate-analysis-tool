// 최초 분양가·프리미엄 계산 테스트 — 실행: npm test
// 자료는 청약홈 「e편한세상 성성호수공원」(2025000036) 주택형별 응답 실측값 (2026-10-09)
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../presale-core.js');

const RAW = [
  { HOUSE_TY: '084.9752A', SUPLY_AR: '113.5344', SUPLY_HSHLDCO: 149, SPSPLY_HSHLDCO: 0, LTTOT_TOP_AMOUNT: '58230' },
  { HOUSE_TY: '084.9748B', SUPLY_AR: '113.5561', SUPLY_HSHLDCO: 120, SPSPLY_HSHLDCO: 0, LTTOT_TOP_AMOUNT: '56890' },
  { HOUSE_TY: '084.9933C', SUPLY_AR: '113.9970', SUPLY_HSHLDCO: 100, SPSPLY_HSHLDCO: 0, LTTOT_TOP_AMOUNT: '57700' },
  { HOUSE_TY: '084.9893D', SUPLY_AR: '113.5790', SUPLY_HSHLDCO: 97, SPSPLY_HSHLDCO: 0, LTTOT_TOP_AMOUNT: '57490' },
  { HOUSE_TY: '105.8363', SUPLY_AR: '140.4707', SUPLY_HSHLDCO: 136, SPSPLY_HSHLDCO: 0, LTTOT_TOP_AMOUNT: '83210' },
  { HOUSE_TY: '175.4124', SUPLY_AR: '234.8173', SUPLY_HSHLDCO: 2, SPSPLY_HSHLDCO: 0, LTTOT_TOP_AMOUNT: '231830' },
  { HOUSE_TY: '191.0991', SUPLY_AR: '258.0925', SUPLY_HSHLDCO: 5, SPSPLY_HSHLDCO: 0, LTTOT_TOP_AMOUNT: '254810' },
];
const BAND84 = { lo: 83, hi: 86 };

test('주택형 응답을 읽는다 — 세대는 일반공급+특별공급, 금액은 천원', () => {
  const m = P.parseModels([{ HOUSE_TY: '084.9752A', SUPLY_AR: '113.5344', SUPLY_HSHLDCO: 100, SPSPLY_HSHLDCO: 49, LTTOT_TOP_AMOUNT: '58230' }]);
  assert.deepEqual(m[0], { ty: '084.9752A', label: '84A', ex: 84.9752, sup: 113.5344, supPy: 34.34, hh: 149, top: 582300 });
});

test('PH 기준: 평당 분양가가 대표 평형보다 20% 이상 비싸고 세대 비중이 2% 미만이면 제외', () => {
  const r = P.repPrice(P.parseModels(RAW), BAND84);
  assert.deepEqual(r.models.filter((x) => x.ph).map((x) => x.label), ['175', '191']);   // 평당 +95%, 비중 0.1~0.3%
  assert.equal(r.models.find((x) => x.label === '105').ph, false);                     // 평당 +17%, 비중 22% — 일반 대형
});

test('비싸도 세대가 많으면(일반 대형), 세대가 적어도 평당이 비슷하면(테라스 등) PH가 아니다', () => {
  const raw = [
    { HOUSE_TY: '084.0000A', SUPLY_AR: '112', SUPLY_HSHLDCO: 300, LTTOT_TOP_AMOUNT: '50000' },
    { HOUSE_TY: '084.0000T', SUPLY_AR: '112', SUPLY_HSHLDCO: 3, LTTOT_TOP_AMOUNT: '51500' },     // 평당 +3% 테라스
    { HOUSE_TY: '134.0000', SUPLY_AR: '178', SUPLY_HSHLDCO: 40, LTTOT_TOP_AMOUNT: '100000' },    // 평당 +26%, 비중 11.7%
    { HOUSE_TY: '084.0000P', SUPLY_AR: '112', SUPLY_HSHLDCO: 2, LTTOT_TOP_AMOUNT: '70000' },     // 평당 +40%, 비중 0.6%
  ];
  const r = P.repPrice(P.parseModels(raw), BAND84);
  assert.deepEqual(r.models.filter((x) => x.ph).map((x) => x.label), ['84P']);
  assert.deepEqual(r.types, ['84A', '84T']);                       // 84㎡ 안의 펜트하우스는 대표 분양가에서 빠진다
});

test('대표 평형(84㎡) 분양가: 세대수 가중 평균, 천원 단위', () => {
  const r = P.repPrice(P.parseModels(RAW), BAND84);
  const want = Math.round((582300 * 149 + 568900 * 120 + 577000 * 100 + 574900 * 97) / 466 / 10) * 10;
  assert.equal(r.price, want);
  assert.deepEqual(r.types, ['84A', '84B', '84C', '84D']);
  assert.equal(r.hh, 466);
  assert.equal(r.py, Math.round(want / r.supPy));
  assert.equal(r.groupLabel, '84㎡');
});

test('84㎡가 없는 공고는 세대수가 가장 많은 평형(같은 전용 정수부 묶음)을 대표로 쓴다', () => {
  const raw = [
    { HOUSE_TY: '059.9A', SUPLY_AR: '80', SUPLY_HSHLDCO: 90, LTTOT_TOP_AMOUNT: '40000' },
    { HOUSE_TY: '059.8B', SUPLY_AR: '79', SUPLY_HSHLDCO: 60, LTTOT_TOP_AMOUNT: '39000' },
    { HOUSE_TY: '074.9A', SUPLY_AR: '99', SUPLY_HSHLDCO: 120, LTTOT_TOP_AMOUNT: '48000' },
  ];
  const r = P.repPrice(P.parseModels(raw), BAND84);
  assert.deepEqual(r.types, ['59A', '59B']);                       // 59㎡ 묶음 150세대 > 74㎡ 120세대
  assert.equal(r.groupLabel, '59㎡');
});

test('거래 전용면적을 가장 가까운 주택형에 맞추고 프리미엄을 낸다', () => {
  const m = P.parseModels(RAW);
  // 실거래 전용면적은 소수 4자리까지 온다 (84.9933 → 84C, 84.9893 → 84D)
  assert.equal(P.matchModel(m, '84.9933').label, '84C');
  assert.equal(P.matchModel(m, '84.9893').label, '84D');
  assert.equal(P.matchModel(m, '59.9'), null);
  const pr = P.premium('60,853', P.matchModel(m, '84.9933'));
  assert.deepEqual(pr, { init: 577000, amt: 608530 - 577000, pct: Math.round((608530 / 577000 - 1) * 1000) / 10 });
});

test('응답이 비었거나 분양가가 0이면 대표 분양가를 내지 않는다', () => {
  assert.equal(P.repPrice([], BAND84), null);
  assert.equal(P.repPrice(P.parseModels([{ HOUSE_TY: '084.9A', SUPLY_AR: '113', SUPLY_HSHLDCO: 50, LTTOT_TOP_AMOUNT: '0' }]), BAND84), null);
});
