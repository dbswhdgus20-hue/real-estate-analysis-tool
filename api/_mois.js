/**
 * 행정안전부 주민등록 통계 (공공데이터포털, 같은 인증키) — 분석 보고서 「인구·전입 지표」용
 *
 *  pop-stat : 주민등록 인구 및 세대현황 (행정동 기준)  /1741000/admmPpltnHhStus/selectAdmmPpltnHhStus
 *             시도 코드 + 한 달을 주면 그 시도의 시군구(일반구 포함) 인구·세대수를 모두 준다.
 *             실측(2026-10-18): 2022.09부터 조회되고, 12개월을 한 번에 물으면 13(기간 초과)이 난다.
 *  dong-pop : 법정동별 주민등록 인구 및 세대현황  /1741000/stdgPpltnHhStus/selectStdgPpltnHhStus (별도 활용신청)
 *             사업지 법정동 하나의 인구·세대수. 법정동이 행정동 여럿에 걸치면 행이 나뉘어 와서 더한다.
 *  pop-move : 지역별 인구이동 현황  /1741000/ppltnDataStus/selectPpltnDataStus
 *             전입지·전출지 코드가 둘 다 필수이고 기간은 3개월 이내, 2022.10부터 제공.
 *             lv=2(시군구)로 물으면 일반구는 시기에 따라 구 단위 또는 시 단위로 나온다 → 시 단위로 맞춰 집계한다.
 *             전국 합계 코드가 없어 시도 19개(강원·전북 옛 코드 포함)를 전입·전출 방향으로 각각 부른다.
 *             같은 단위 안의 이동(예: 천안시→천안시)은 전입·전출에서 뺀다 (통계청 순이동 기준과 같음).
 */
'use strict';

const BASE = process.env.UPSTREAM_BASE || 'https://apis.data.go.kr';
const POP_PATH = '/1741000/admmPpltnHhStus/selectAdmmPpltnHhStus';
const STDG_PATH = '/1741000/stdgPpltnHhStus/selectStdgPpltnHhStus';
const MOVE_PATH = '/1741000/ppltnDataStus/selectPpltnDataStus';
const SIDO = ['11', '26', '27', '28', '29', '30', '31', '36', '41', '43', '44', '46', '47', '48', '50'];
// 강원(42→51, 2023.06)·전북(45→52, 2024.01)은 기간에 맞는 코드만 부른다 — 호출 하나가 4~7초라 줄일수록 빠르다
function sidoFor(frYm, toYm) {
  const out = SIDO.slice();
  if (+frYm < 202307) out.push('42');
  if (+toYm >= 202306) out.push('51');
  if (+frYm < 202402) out.push('45');
  if (+toYm >= 202401) out.push('52');
  return out;
}
const ROWS = 100;          // 이 서비스의 페이지 최대 크기
const CONCURRENCY = 12;     // 실측(2026-10-18): 6개면 분기당 22초, 12개 이상이면 9초 안팎 (상류 응답이 느림)
const NO_DATA = '3';       // NODATA_ERROR — 그 조합에 이동이 없거나 옛 코드인 경우

class MoisError extends Error {
  constructor(msg) { super(msg); this.upstream = true; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callOnce(path, params, key) {
  const qs = new URLSearchParams({ serviceKey: key, type: 'JSON', numOfRows: String(ROWS), ...params });
  const r = await fetch(`${BASE}${path}?${qs}`, { signal: AbortSignal.timeout(20000) });
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); } catch (e) {
    const m = text.match(/<returnAuthMsg>([^<]*)<|<errMsg>([^<]*)</);
    throw new MoisError(`주민등록 통계 응답 오류 HTTP ${r.status}${m ? ' ' + (m[1] || m[2]) : ''}`);
  }
  const auth = (j.OpenAPI_ServiceResponse || {}).cmmMsgHeader;
  if (auth) throw new MoisError(`주민등록 통계 오류 ${auth.returnReasonCode || ''} ${auth.returnAuthMsg || auth.errMsg || ''}`.trim());
  const head = (j.Response || {}).head || {};
  const code = String(head.resultCode ?? '');
  if (code === NO_DATA) return { items: [], total: 0 };
  if (code !== '0') throw new MoisError(`주민등록 통계 오류 ${code} ${head.resultMsg || ''}`.trim());
  const it = ((j.Response || {}).items || {}).item;
  return { items: !it ? [] : Array.isArray(it) ? it : [it], total: parseInt(head.totalCount, 10) || 0 };
}

/** 일시 오류(시간 초과·연결)만 두 번 더 시도한다 */
async function call(path, params, key) {
  for (let i = 1; ; i++) {
    try { return await callOnce(path, params, key); }
    catch (e) {
      const again = !e.upstream || /HTTP 5|HTTP_ERROR|TIMEOUT/i.test(e.message);
      if (i >= 3 || !again) throw e;
      await sleep(400 * i);
    }
  }
}

async function callAll(path, params, key) {
  const first = await call(path, { ...params, pageNo: '1' }, key);
  let items = first.items;
  const pages = Math.min(Math.ceil(first.total / ROWS), 30);
  for (let p = 2; p <= pages; p++) items = items.concat((await call(path, { ...params, pageNo: String(p) }, key)).items);
  return items;
}

async function pool(jobs, n) {
  const out = new Array(jobs.length);
  let idx = 0;
  const lane = async () => { for (;;) { const i = idx++; if (i >= jobs.length) return; out[i] = await jobs[i](); } };
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, lane));
  return out;
}

const num = (v) => { const n = parseInt(String(v ?? '').replace(/,/g, ''), 10); return Number.isFinite(n) ? n : null; };

/** 시도 하나, 한 달의 시군구별 인구·세대수 */
async function popStat({ sido, ym }, key) {
  const items = await callAll(POP_PATH, { admmCd: sido + '00000000', srchFrYm: ym, srchToYm: ym, lv: '2', regSeCd: '1' }, key);
  return {
    ym,
    items: items.map((x) => ({ code: String(x.admmCd || ''), name: String(x.sggNm || ''), pop: num(x.totNmprCnt), hh: num(x.hhCnt) })),
  };
}

/** 법정동 하나, 한 달의 인구·세대수 — 리(里) 주소는 읍면 합계로 찾는다 */
async function dongPop({ stdgCd, ym }, key) {
  const items = await callAll(STDG_PATH, { stdgCd, srchFrYm: ym, srchToYm: ym, lv: '3', regSeCd: '1' }, key);
  const pick = (code) => items.filter((x) => String(x.stdgCd || '') === code);
  let rows = pick(stdgCd);
  if (!rows.length && !stdgCd.endsWith('00')) rows = pick(stdgCd.slice(0, 8) + '00');
  if (!rows.length) return { ym, found: false };
  const sum = (f) => rows.reduce((a, x) => a + (num(x[f]) || 0), 0);
  return { ym, found: true, name: String(rows[0].stdgNm || ''), pop: sum('totNmprCnt'), hh: sum('hhCnt'), parts: rows.length };
}

/** 시군구 하나의 월별 전입·전출 (단위 밖과의 이동만) */
async function popMove({ admmCd, frYm, toYm }, key) {
  const base = { srchFrYm: frYm, srchToYm: toYm, lv: '2' };
  const jobs = [];
  sidoFor(frYm, toYm).forEach((s) => {
    const sd = s + '00000000';
    jobs.push(() => callAll(MOVE_PATH, { ...base, mvinAdmmCd: admmCd, mvtAdmmCd: sd }, key).then((r) => ({ dir: 'in', r })));
    jobs.push(() => callAll(MOVE_PATH, { ...base, mvinAdmmCd: sd, mvtAdmmCd: admmCd }, key).then((r) => ({ dir: 'out', r })));
  });
  const res = await pool(jobs, CONCURRENCY);
  // 일반구(5번째 자리가 0이 아님 — 천안시 서북구 44133 등)는 시 단위로 묶는다.
  // 실측(2026-10-18): 2024년 상반기까지는 구 단위 행이, 그 뒤로는 시 단위 행만 온다 → 연도 간 기준을 맞춘다
  const cityLevel = admmCd[4] !== '0';
  const unitCode = cityLevel ? admmCd.slice(0, 4) + '000000' : admmCd;
  const unitOf = (c) => (cityLevel && c.slice(0, 4) === admmCd.slice(0, 4) ? unitCode : c);
  const months = {};
  let unitName = '';
  const m = (ym) => (months[ym] = months[ym] || { moveIn: 0, moveOut: 0, inner: 0 });
  // 실측: 2023.01을 강원 새 코드(51)로 물어도 옛 코드(42) 행이 그대로 온다 → 경계 분기에서 두 번 세지 않게 거른다
  const seen = new Set();
  res.forEach(({ dir, r }) => r.forEach((x) => {
    const id = [dir, x.statsYm, x.mvinAdmmCd, x.mvtAdmmCd].join('|');
    if (seen.has(id)) return;
    seen.add(id);
    const inC = unitOf(String(x.mvinAdmmCd || '')), outC = unitOf(String(x.mvtAdmmCd || ''));
    const n = num(x.totNmprCnt) || 0, ym = String(x.statsYm || '');
    const mine = dir === 'in' ? inC : outC;
    if (mine !== unitCode) return;          // 같은 시의 다른 구 행 (구 단위 시절) — 반대편에서 센다
    if (!unitName) unitName = String((dir === 'in' ? x.mvinSggNm : x.mvtSggNm) || '').split(' ')[0];
    if (inC === outC) { if (dir === 'in') m(ym).inner += n; return; }
    if (dir === 'in') m(ym).moveIn += n; else m(ym).moveOut += n;
  }));
  return { unit: { code: unitCode, name: unitName }, months };
}

const ROUTES = {
  'pop-stat': { re: { sido: /^\d{2}$/, ym: /^\d{6}$/ }, run: popStat },
  'dong-pop': { re: { stdgCd: /^\d{10}$/, ym: /^\d{6}$/ }, run: dongPop },
  'pop-move': { re: { admmCd: /^\d{10}$/, frYm: /^\d{6}$/, toYm: /^\d{6}$/ }, run: popMove },
};

/** 확정된 과거 달은 오래, 최근 두 달은 하루만 캐시 */
function cacheAge(lastYm) {
  const d = new Date(), cur = d.getFullYear() * 100 + d.getMonth() + 1;
  const ym = parseInt(lastYm, 10), monthsAgo = (Math.floor(cur / 100) - Math.floor(ym / 100)) * 12 + (cur % 100) - (ym % 100);
  return monthsAgo >= 2 ? 180 * 24 * 3600 : 24 * 3600;
}

function monthsBetween(fr, to) {
  return (Math.floor(to / 100) - Math.floor(fr / 100)) * 12 + (to % 100) - (fr % 100);
}

async function handleMois(name, query, key) {
  const spec = ROUTES[name];
  const params = {};
  for (const [k, re] of Object.entries(spec.re)) {
    const v = String(query[k] ?? '');
    if (!re.test(v)) return { status: 400, body: { ok: false, error: `파라미터 형식 오류: ${k}` } };
    params[k] = v;
  }
  if (name === 'pop-move') {
    const gap = monthsBetween(+params.frYm, +params.toYm);
    if (gap < 0 || gap > 2) return { status: 400, body: { ok: false, error: '기간은 3개월 이내' } };
  }
  try {
    const out = await spec.run(params, key);
    return {
      status: 200,
      headers: { 'Cache-Control': `public, s-maxage=${cacheAge(params.ym || params.toYm)}, stale-while-revalidate=86400` },
      body: { ok: true, ...out },
    };
  } catch (e) {
    console.warn(`[상류 오류] ${name}`, params, '→', e.message);
    return { status: e.upstream ? 502 : 500, body: { ok: false, error: e.message } };
  }
}

module.exports = { handleMois, MOIS_ROUTES: Object.keys(ROUTES) };
