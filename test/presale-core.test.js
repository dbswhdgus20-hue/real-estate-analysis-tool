// 최초 분양가·프리미엄 계산 테스트 — 실행: npm test
// 자료는 청약홈 「e편한세상 성성호수공원」(2025000036) 주택형별 응답 실측값 (2026-10-09)
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../presale-core.js');

const RAW = [
  { HOUSE_TY: '084.9752A', SUPLY_AR: '113.5344', SUPLY_HSHLDCO: 149, LTTOT_TOP_AMOUNT: '58230' },
  { HOUSE_TY: '084.9748B', SUPLY_AR: '113.5561', SUPLY_HSHLDCO: 120, LTTOT_TOP_AMOUNT: '56890' },
  { HOUSE_TY: '084.9933C', SUPLY_AR: '113.9970', SUPLY_HSHLDCO: 100, LTTOT_TOP_AMOUNT: '57700' },
  { HOUSE_TY: '084.9893D', SUPLY_AR: '113.5790', SUPLY_HSHLDCO: 97, LTTOT_TOP_AMOUNT: '57490' },
  { HOUSE_TY: '105.8363', SUPLY_AR: '140.4707', SUPLY_HSHLDCO: 136, LTTOT_TOP_AMOUNT: '83210' },
  { HOUSE_TY: '175.4124', SUPLY_AR: '234.8173', SUPLY_HSHLDCO: 2, LTTOT_TOP_AMOUNT: '231830' },
  { HOUSE_TY: '191.0991', SUPLY_AR: '258.0925', SUPLY_HSHLDCO: 5, LTTOT_TOP_AMOUNT: '254810' },
];
const BAND84 = { lo: 83, hi: 86 };

test('주택형 응답을 읽고, 세대가 적은 펜트하우스 등은 계산 제외로 표시한다', () => {
  const m = P.parseModels(RAW);
  assert.equal(m.length, 7);
  assert.deepEqual(m[0], { ty: '084.9752A', label: '84A', ex: 84.9752, sup: 113.5344, supPy: 34.34, hh: 149, top: 582300, ph: false });
  assert.deepEqual(m.filter((x) => x.ph).map((x) => x.label), ['175', '191']);
});

test('대표 평형(84㎡) 분양가: 세대수 가중 평균, PH 제외, 천원 단위', () => {
  const r = P.repPrice(P.parseModels(RAW), BAND84);
  const want = Math.round((582300 * 149 + 568900 * 120 + 577000 * 100 + 574900 * 97) / 466 / 10) * 10;
  assert.equal(r.price, want);
  assert.deepEqual(r.types, ['84A', '84B', '84C', '84D']);
  assert.equal(r.hh, 466);
  assert.equal(r.py, Math.round(want / r.supPy));
});

test('대표 평형 주택형이 없으면 PH가 아닌 것 중 세대가 가장 많은 주택형을 쓴다', () => {
  const r = P.repPrice(P.parseModels(RAW), { lo: 59, hi: 61 });
  assert.deepEqual(r.types, ['84A']);
  assert.equal(r.fallback, true);
});

test('거래 전용면적을 가장 가까운 주택형에 맞추고 프리미엄을 낸다', () => {
  const m = P.parseModels(RAW);
  // 실거래 전용면적은 소수 4자리까지 온다 (84.9933 → 84C, 84.9893 → 84D)
  assert.equal(P.matchModel(m, '84.9933').label, '84C');
  assert.equal(P.matchModel(m, '84.9893').label, '84D');
  assert.equal(P.matchModel(m, '84.9752').label, '84A');
  assert.equal(P.matchModel(m, '59.9'), null);
  const pr = P.premium('60,853', P.matchModel(m, '84.9933'));
  assert.deepEqual(pr, { init: 577000, amt: 608530 - 577000, pct: Math.round((608530 / 577000 - 1) * 1000) / 10 });
});

test('응답이 비었거나 분양가가 0이면 대표 분양가를 내지 않는다', () => {
  assert.equal(P.repPrice([], BAND84), null);
  assert.equal(P.repPrice(P.parseModels([{ HOUSE_TY: '084.9A', SUPLY_AR: '113', SUPLY_HSHLDCO: 50, LTTOT_TOP_AMOUNT: '0' }]), BAND84), null);
});
