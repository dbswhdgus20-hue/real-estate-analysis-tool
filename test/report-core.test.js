// 심의 보고서 계산 로직 테스트 — 실행: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../report-core.js');

// 실거래 응답 한 건 (금액은 만원, 쉼표 포함 문자열 — RTMS 응답 그대로)
function trade(year, man, ar = '84.97') {
  return { dealYear: String(year), dealMonth: '5', dealDay: '1', dealAmount: man.toLocaleString('en-US'), excluUseAr: ar };
}
function complex(over) {
  return { key: over.name, type: '아파트', dong: '성성동', buildYear: '2018', dist: 1000, trades: [], ...over };
}
const OPTS = { band: 84, convPy: 34, maxAge: 15, baseYear: 2024, unitPrice: 580000, unitPy: 16500 };

test('만원 문자열을 천원 숫자로 바꾼다', () => {
  assert.equal(R.toThousand('47,965'), 479650);
  assert.equal(R.toThousand(''), 0);
});

test('기준 평형 대역 안의 전용면적만 인정한다', () => {
  assert.equal(R.inBand('84.97', 84), true);
  assert.equal(R.inBand('59.99', 84), false);
  assert.equal(R.inBand('114.0', 114), true);
});

test('준공 N년 이내 아파트만 대상이고 임대·오피스텔은 뺀다', () => {
  assert.equal(R.eligible(complex({ buildYear: '2009' }), OPTS), true);   // 2024-15
  assert.equal(R.eligible(complex({ buildYear: '2008' }), OPTS), false);
  assert.equal(R.eligible(complex({ type: '오피스텔' }), OPTS), false);
  assert.equal(R.eligible(complex({ saleType: '임대' }), OPTS), false);
});

test('단지별 연평균과 기준연도 가격·건수, 본건대비를 계산한다', () => {
  const c = complex({ name: '레이크타운푸르지오1차', trades: [
    trade(2021, 61077), trade(2022, 54788), trade(2023, 47127),
    trade(2024, 47000), trade(2024, 48930), trade(2024, 40000, '59.98'),
  ] });
  const r = R.summarizeComplex(c, OPTS);
  assert.equal(r.byYear[2021].avg, 610770);
  assert.equal(r.byYear[2024].cnt, 2);              // 59㎡ 거래는 빠진다
  assert.equal(r.byYear[2024].avg, 479650);
  assert.equal(r.ratio, Math.round(479650 / 580000 * 100));
});

test('기준연도 거래가 없으면 가장 최근 연도로 본건대비를 낸다 (PDF 33번 단지 방식)', () => {
  const c = complex({ name: 'A', trades: [trade(2023, 31517)] });
  const r = R.summarizeComplex(c, OPTS);
  assert.equal(r.byYear[2024].cnt, 0);
  assert.equal(r.ratio, 54);
});

test('보고서: 동별로 묶고 거리순으로 번호를 매기며 구·동 평균을 낸다', () => {
  const list = [
    complex({ name: '먼단지', dong: '불당동', dist: 5000, trades: [trade(2024, 60000)] }),
    complex({ name: '가까운단지', dong: '성성동', dist: 500, trades: [trade(2024, 50000), trade(2024, 52000)] }),
    complex({ name: '오래된단지', dong: '성성동', buildYear: '1995', trades: [trade(2024, 30000)] }),
    complex({ name: '거래없음', dong: '성성동', trades: [trade(2019, 30000)] }),
  ];
  const rep = R.buildReport(list, OPTS);
  assert.deepEqual(rep.rows.map((r) => r.name), ['가까운단지', '먼단지']);
  assert.deepEqual(rep.rows.map((r) => r.no), [1, 2]);
  assert.equal(rep.gu.cnt, 3);
  assert.equal(rep.gu.avg, Math.round((500000 + 520000 + 600000) / 3));
  assert.equal(rep.gu.py, Math.round(rep.gu.avg / 34));
  assert.deepEqual(rep.ranks.map((d) => d.dong), ['불당동', '성성동']);
  assert.equal(rep.summaryYear, 2024);
});

test('기준연도 거래가 하나도 없으면 직전 연도로 요약한다', () => {
  const rep = R.buildReport([complex({ name: 'A', trades: [trade(2023, 50000)] })], OPTS);
  assert.equal(rep.summaryYear, 2023);
  assert.equal(rep.gu.avg, 500000);
});

test('분양권: 단지별로 묶어 최근 3개년 평균과 본건 비율을 낸다', () => {
  const rows = [
    { aptNm: '성성비스타동원', umdNm: '성성동', ...trade(2024, 53158) },
    { aptNm: '성성비스타동원', umdNm: '성성동', ...trade(2022, 53763) },
    { aptNm: '포레나천안노태1단지', umdNm: '성성동', ...trade(2024, 49898) },
    { aptNm: '옛단지', umdNm: '두정동', ...trade(2020, 40000) },
  ];
  const s = R.summarizeSilv(rows, OPTS);
  assert.deepEqual(s.rows.map((r) => r.name), ['성성비스타동원', '포레나천안노태1단지']);
  assert.equal(s.rows[0].byYear[2022].avg, 537630);
  assert.equal(s.cur.avg, Math.round((531580 + 498980) / 2));
  assert.equal(s.ratio, Math.round(580000 / s.cur.avg * 100));
});

test('분양권: 같은 단지가 이름 표기만 다르면(띄어쓰기·별칭) 법정동+지번으로 하나로 묶는다', () => {
  const rows = [
    { aptNm: '천안 백석 센트레빌 파크디션', umdNm: '백석동', jibun: '1022', ...trade(2023, 48644) },
    { aptNm: '천안백석센트레빌파크디션', umdNm: '백석동', jibun: '1022', ...trade(2024, 48181) },
    { aptNm: '천안백석센트레빌파크디션', umdNm: '백석동', jibun: '1022', ...trade(2024, 47272) },
    { aptNm: '부성역우남퍼스트빌', umdNm: '부대동', jibun: '', ...trade(2024, 41546) },
    { aptNm: '부성역 우남퍼스트빌', umdNm: '부대동', ...trade(2024, 41000) },
  ];
  const s = R.summarizeSilv(rows, OPTS);
  assert.equal(s.rows.length, 2);
  const cv = s.rows.find((r) => r.dong === '백석동');
  assert.equal(cv.name, '천안백석센트레빌파크디션');          // 가장 많이 쓰인 표기
  assert.equal(cv.total, 3);
  assert.equal(s.rows.find((r) => r.dong === '부대동').total, 2);   // 지번이 없으면 띄어쓰기 뺀 이름으로
});

test('분양권: 최초 분양가가 붙은 단지만으로 평균 프리미엄(%)을 거래 건수 가중으로 낸다', () => {
  const rows = [
    { no: 1, name: 'A', latest: 550000, total: 3, init: { price: 500000 } },   // +10%
    { no: 2, name: 'B', latest: 480000, total: 1, init: { price: 500000 } },   // -4%
    { no: 3, name: 'C', latest: 600000, total: 9, init: null },
  ];
  const r = R.silvPremium({ rows });
  assert.equal(rows[0].premPct, 10);
  assert.equal(rows[1].premPct, -4);
  assert.equal(rows[2].premPct, null);
  assert.equal(r, Math.round((10 * 3 + -4 * 1) / 4 * 10) / 10);
  assert.equal(R.silvPremium({ rows: [rows[2]] }), null);
});

test('검토 문안: 분양권 프리미엄이 있으면 최초 분양가 대비 문장을 붙인다', () => {
  const rep = R.buildReport([complex({ name: 'A', trades: [trade(2024, 50000)] })], OPTS);
  const silv = { cur: { avg: 515280, cnt: 2 }, ratio: 113, premAvg: 6.5 };
  const text = R.narrative(rep, silv, { ...OPTS, guName: '천안시 서북구', siteDong: '' }).join('\n');
  assert.match(text, /분양권 실거래가격 평균은 515,280천원/);
  assert.match(text, /최초 분양가\(84타입 대표 평형\) 대비 평균 약 \+6\.5% 수준/);
});

test('검토 문안: PDF와 같은 틀로 구 평균·순위·본건 비교를 쓴다', () => {
  const list = [
    complex({ name: '불당지웰더샵', dong: '불당동', trades: [trade(2024, 82233)] }),
    complex({ name: '레이크타운푸르지오3차', dong: '성성동', trades: [trade(2024, 57763)] }),
    complex({ name: '백석아이파크', dong: '백석동', trades: [trade(2024, 33344)] }),
  ];
  const rep = R.buildReport(list, OPTS);
  const text = R.narrative(rep, null, { ...OPTS, guName: '천안시 서북구', siteDong: '성성동' }).join('\n');
  assert.match(text, /천안시 서북구의 2024년 84타입\(준공 15년 내\) 공동주택의 실거래가 평균 거래금액은/);
  assert.match(text, /불당동이 822,330천원\(@24,186천원\)으로 1위/);
  assert.match(text, /성성동이 577,630천원\(@16,989천원\)으로 2위/);
  assert.match(text, /본건 계획분양가는 @16,500천원\(세대당 580,000천원\)/);
  assert.match(text, /「레이크타운푸르지오3차」\(577,630천원\)/);
  assert.match(text, /유사한 수준임/);
});

test('분양가를 넣지 않으면 본건 비교 문장을 쓰지 않는다', () => {
  const rep = R.buildReport([complex({ name: 'A', trades: [trade(2024, 50000)] })], { ...OPTS, unitPrice: 0, unitPy: 0 });
  assert.equal(rep.rows[0].ratio, null);
  const text = R.narrative(rep, null, { ...OPTS, unitPrice: 0, unitPy: 0, guName: '가구', siteDong: '' }).join('\n');
  assert.doesNotMatch(text, /본건 계획분양가/);
});
