'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../report-pop.js');

test('quarters: 3개월씩 자르고 진행 중인 해는 마지막 달까지, 2022.10 이전은 뺀다', () => {
  assert.deepStrictEqual(P.quarters(2025, 12), [[202501, 202503], [202504, 202506], [202507, 202509], [202510, 202512]]);
  assert.deepStrictEqual(P.quarters(2026, 8), [[202601, 202603], [202604, 202606], [202607, 202608]]);
  assert.deepStrictEqual(P.quarters(2022, 12), [[202210, 202212]]);
});

test('popMonths: 지난해는 12월, 진행 중인 해는 최근 달부터 거꾸로 3개월', () => {
  assert.deepStrictEqual(P.popMonths(2024, 202610), [202412, 202411, 202410]);
  assert.deepStrictEqual(P.popMonths(2026, 202610), [202610, 202609, 202608]);
  assert.deepStrictEqual(P.popMonths(2021, 202610), []);
});

function months(year, upTo, inV, outV) {
  const o = {};
  for (let m = 1; m <= upTo; m++) o[String(year * 100 + m)] = { moveIn: inV, moveOut: outV };
  return o;
}

test('assemble: 인구·세대 증감과 순이동을 계산하고, 12개월이 안 되는 지난해 순이동은 비운다', () => {
  const popRows = {
    202212: [{ code: '4413300000', pop: 1000, hh: 400 }],
    202312: [{ code: '4413300000', pop: 1100, hh: 450 }],
    202609: [{ code: '4413300000', pop: 1200, hh: 500 }],
  };
  const moves = { 44133: { unit: { code: '4413000000', name: '천안시' }, months: { ...months(2022, 12, 0, 0), ...months(2023, 12, 10, 4), ...months(2026, 9, 5, 5) } } };
  for (let m = 1; m <= 9; m++) delete moves[44133].months[String(202200 + m)];
  const dongRows = { 202212: { pop: 100, hh: 40 }, 202312: { pop: 130, hh: 52 } };
  const out = P.assemble(['44133'], [2022, 2023, 2024, 2025, 2026], 202610, popRows, moves, dongRows);
  const r = out['44133'];
  assert.strictEqual(r[2022].pop, 1000);
  assert.strictEqual(r[2022].popChg, null);          // 2021년 자료 없음
  assert.strictEqual(r[2022].net, null);             // 10~12월뿐
  assert.strictEqual(r[2023].popChg, 100);
  assert.strictEqual(r[2023].hhChg, 50);
  assert.strictEqual(r[2023].net, 72);
  assert.strictEqual(r[2023].moveIn, undefined);     // 표에는 순이동만 둔다
  assert.strictEqual(r[2024].pop, null);
  assert.strictEqual(r[2026].pop, 1200);             // 10월 자료가 없어 9월 말
  assert.strictEqual(r[2026].popChg, null);          // 2025년 말이 없으면 비움
  assert.strictEqual(r[2026].net, 0);
  assert.strictEqual(out.meta.popYm[2026], 202609);
  assert.strictEqual(out.meta.moveMonths[2026], 9);
  assert.strictEqual(out.meta.unit['44133'], '천안시');
  assert.strictEqual(out.dong[2023].pop, 130);       // 사업지 법정동
  assert.strictEqual(out.dong[2023].hhChg, 12);
  assert.strictEqual(out.dong[2023].net, null);      // 법정동 순이동 자료 없음
  assert.strictEqual(P.assemble(['44133'], [2023], 202312, popRows, {}, null).dong, undefined);
});

test('narrative: 인구·세대·순이동을 수치로만 쓴다', () => {
  const pop = { meta: { popYm: { 2026: 202609 }, unit: { 44133: '천안시' } },
    44133: { 2022: { pop: 1000, hh: 400, net: null }, 2023: { pop: 1100, hh: 450, net: 72 }, 2026: { pop: 1200, hh: 500, net: -3 } } };
  const t = P.narrative(pop, [2022, 2023, 2026], { 44133: '천안시 서북구' }).join(' ');
  assert.match(t, /2022년 말 1,000명, 2026\.09 말 1,200명/);
  assert.match(t, /순이동\(천안시 전체\)은 2023년 \+72명, 2026년 -3명/);
  assert.doesNotMatch(t, /증가세|감소세|양호|우수/);
  assert.deepStrictEqual(P.narrative({ loading: true }, [2022], { a: 'x' }), []);
});

test('notes: 기준 시점·시 단위 대체·출처를 적는다', () => {
  const pop = { meta: { popYm: { 2026: 202609 }, moveMonths: { 2026: 9 }, unit: { 44133: '천안시' }, dongName: '업성동' } };
  const t = P.notes(pop, [2022, 2023, 2024, 2025, 2026], { 44133: '천안시 서북구' }).join(' ');
  assert.match(t, /2026년은 2026\.09 말/);
  assert.match(t, /1~9월/);
  assert.match(t, /천안시 서북구의 순이동은 천안시 전체/);
  assert.match(t, /업성동\(사업지 법정동\)/);
  assert.match(t, /2022년 10월부터/);
  assert.match(t, /행정안전부/);
  assert.deepStrictEqual(P.notes({ error: 'x' }, [2026], {}), []);
});
