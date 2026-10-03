/**
 * 공공데이터포털 호출 공통 모듈 (서버리스 함수 · 로컬 서버 공용)
 *
 *  - 서비스키는 환경변수에서만 읽는다. 클라이언트로 나가지 않는다.
 *  - 요청한 numOfRows를 서버가 깎는 서비스가 있어(건축물대장은 100으로 강제)
 *    1페이지 응답이 알려주는 numOfRows를 실제 페이지 크기로 삼는다.
 *  - 남은 페이지는 동시에 받는다. 대장은 한 단지가 44페이지까지 간다.
 */
'use strict';

const { XMLParser } = require('fast-xml-parser');

const BASE = process.env.UPSTREAM_BASE || 'https://apis.data.go.kr';
const ODCLOUD = process.env.ODCLOUD_BASE || 'https://api.odcloud.kr';
const PAGE_SIZE = 1000;      // 요청값. 서버가 깎으면 응답 numOfRows를 따른다
const MAX_ROWS = 40000;      // 호출단위당 최대 행 수 (안전장치)
const PAGE_CONCURRENCY = 8;  // 서버리스는 실행시간 상한이 있어 로컬보다 높게

const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });

// 호출 가능한 엔드포인트 화이트리스트. 여기 없는 경로는 프록시하지 않는다.
const ROUTES = {
  'apt-trade': {
    path: '/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev',
    params: ['LAWD_CD', 'DEAL_YMD'], cache: 'monthly',
  },
  'apt-rent': {
    path: '/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
    params: ['LAWD_CD', 'DEAL_YMD'], cache: 'monthly',
  },
  'offi-trade': {
    path: '/1613000/RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade',
    params: ['LAWD_CD', 'DEAL_YMD'], cache: 'monthly',
  },
  'offi-rent': {
    path: '/1613000/RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent',
    params: ['LAWD_CD', 'DEAL_YMD'], cache: 'monthly',
  },
  // 청약홈 분양정보 — 호스트와 응답 형식(JSON)이 달라 별도 경로로 처리
  //   gu  → cond[HSSPLY_ADRES::LIKE] (공급위치에 시군구명이 들어간다)
  //   sido→ cond[SUBSCRPT_AREA_CODE_NM::EQ]
  // 대괄호 이름을 그대로 받지 않는 이유: express(qs)는 대괄호를 중첩 객체로
  // 풀어버리고 Vercel은 평문으로 두어, 같은 요청이 두 곳에서 달리 보인다.
  'bunyang': {
    host: 'odcloud',
    path: '/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail',
    params: ['page', 'perPage', 'gu', 'sido'], cache: 'daily', json: true,
    rename: {
      gu: 'cond[HSSPLY_ADRES::LIKE]',
      sido: 'cond[SUBSCRPT_AREA_CODE_NM::EQ]',
    },
  },
  // 건축물대장은 numOfRows를 100으로 강제한다 (실측 확인 — 1000을 보내도 100)
  'ledger-area': {
    path: '/1613000/BldRgstHubService/getBrExposPubuseAreaInfo',
    params: ['sigunguCd', 'bjdongCd', 'bun', 'ji', 'platGbCd'], cache: 'static',
    pageSize: 100,
  },
  // 건축개요 — 총괄표제부(단지 전체)와 표제부(동별)를 병합해 쓴다
  'ledger-recap': {
    path: '/1613000/BldRgstHubService/getBrRecapTitleInfo',
    params: ['sigunguCd', 'bjdongCd', 'bun', 'ji', 'platGbCd'], cache: 'static',
    pageSize: 100,
  },
  'ledger-title': {
    path: '/1613000/BldRgstHubService/getBrTitleInfo',
    params: ['sigunguCd', 'bjdongCd', 'bun', 'ji', 'platGbCd'], cache: 'static',
    pageSize: 100,
  },
};

class UpstreamError extends Error {
  constructor(msg, transient = false) { super(msg); this.upstream = true; this.transient = transient; }
}

/* 상류가 간헐적으로 뱉는 일시 오류. 실측 확인 (2026-09-26):
   건축물대장 총괄표제부가 같은 파라미터로 한 번은 SERVICETIMEOUT_ERROR(05)를 주고
   바로 다시 부르면 정상(00)으로 왔다. 쿼터 초과·키 오류는 재시도해도 같으므로 제외. */
const TRANSIENT = /SERVICETIMEOUT|SERVICE_TIMEOUT|HTTP_ERROR|SERVER_ERROR|연결실패|일시적/i;
const isTransient = (m) => TRANSIENT.test(String(m || ''));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function itemsOf(json) {
  const it = json?.response?.body?.items?.item;
  if (!it) return [];
  return Array.isArray(it) ? it : [it];
}

/** 캐시 수명 — 확정된 과거 월은 사실상 영구, 당월·전월만 짧게 */
function maxAge(kind, params) {
  if (kind === 'static') return 180 * 24 * 3600;            // 건축물대장 180일
  if (kind === 'daily') return 6 * 3600;                    // 분양정보 6시간
  const ym = String(params.DEAL_YMD || '');
  if (!/^\d{6}$/.test(ym)) return 6 * 3600;
  const now = new Date();
  const cur = now.getFullYear() * 100 + (now.getMonth() + 1);
  const prev = now.getMonth() === 0 ? (now.getFullYear() - 1) * 100 + 12 : cur - 1;
  return parseInt(ym, 10) >= prev ? 6 * 3600 : 365 * 24 * 3600;
}

/** 요청 파라미터를 화이트리스트로 거른다 */
function pickParams(spec, query) {
  const out = {};
  for (const k of spec.params) {
    const v = query[k];
    if (v === undefined || v === '') continue;
    if (!/^[\w가-힣.\-]{1,32}$/.test(String(v))) {
      const e = new Error(`파라미터 형식 오류: ${k}`);
      e.badRequest = true;
      throw e;
    }
    out[k] = String(v);
  }
  return out;
}

/**
 * 반환 필드를 클라이언트가 지정한 것으로 줄인다.
 * 실거래 응답은 한 건에 35개 필드가 달려 있어, 그대로 내리면
 * 수천 건에서 수 MB가 되고 서버리스 응답 한도(4.5MB)에 걸린다.
 */
function trimFields(rows, fieldsParam) {
  if (!fieldsParam) return rows;
  const want = String(fieldsParam).split(',')
    .map(s => s.trim()).filter(s => /^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(s)).slice(0, 40);
  if (!want.length) return rows;
  return rows.map(r => {
    const o = {};
    for (const f of want) o[f] = r[f] != null ? String(r[f]).trim() : '';
    return o;
  });
}

async function fetchPage(spec, params, no, size, key) {
  const qs = new URLSearchParams({
    serviceKey: key, pageNo: String(no), numOfRows: String(size), ...params,
  });
  const r = await fetch(`${BASE}${spec.path}?${qs}`, { signal: AbortSignal.timeout(25000) });
  const text = await r.text();
  const json = parser.parse(text);

  const code = String(
    json?.response?.header?.resultCode ??
    json?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode ?? ''
  );
  // 실거래는 000, 건축물대장은 00을 정상으로 쓴다
  if (code && !['000', '00', '0'].includes(code)) {
    const msg = json?.response?.header?.resultMsg
      ?? json?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnAuthMsg ?? '';
    const err = json?.OpenAPI_ServiceResponse?.cmmMsgHeader?.errMsg ?? '';
    const full = `${code} ${msg} ${err}`.trim();
    throw new UpstreamError(full, isTransient(full));
  }
  return json;
}

/** 일시 오류면 짧게 쉬었다 다시 부른다 (최대 3회) */
async function fetchPageRetry(spec, params, no, size, key) {
  let last;
  for (let i = 1; i <= 3; i++) {
    try {
      return await fetchPage(spec, params, no, size, key);
    } catch (e) {
      last = e;
      const again = e.transient || e.name === 'TimeoutError' || e.name === 'AbortError'
        || /fetch failed|ECONNRESET|ETIMEDOUT/i.test(String(e.message));
      if (i === 3 || !again) throw e;
      console.warn(`[재시도 ${i}/2] ${spec.path} p${no} → ${e.message}`);
      await sleep(350 * i);
    }
  }
  throw last;
}

async function fetchAll(spec, params, key) {
  const want = spec.pageSize || PAGE_SIZE;

  const first = await fetchPageRetry(spec, params, 1, want, key);
  let rows = itemsOf(first);
  const total = parseInt(first?.response?.body?.totalCount ?? rows.length, 10) || 0;
  const size = parseInt(first?.response?.body?.numOfRows ?? want, 10) || want;

  const needed = size ? Math.ceil(total / size) : 1;
  const cap = Math.max(1, Math.ceil(MAX_ROWS / size));
  const last = Math.min(needed, cap);

  if (last > 1) {
    const nums = [];
    for (let n = 2; n <= last; n++) nums.push(n);
    // 동시성 제한 풀
    let idx = 0;
    const out = new Array(nums.length);
    const lane = async () => {
      for (;;) {
        const i = idx++;
        if (i >= nums.length) return;
        out[i] = itemsOf(await fetchPageRetry(spec, params, nums[i], size, key));
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(PAGE_CONCURRENCY, nums.length) }, lane)
    );
    for (const g of out) rows = rows.concat(g);
  }

  return { items: rows, total, truncated: rows.length < total, pageSize: size, pages: last };
}

/** 라우트 하나를 처리해 {status, body, headers}를 돌려준다 (프레임워크 무관) */
async function handleRoute(routeName, query) {
  const key = process.env.DATA_GO_KR_KEY || process.env.DATA_SERVICE_KEY;
  if (!key) return { status: 500, body: { ok: false, error: '공공데이터 키(DATA_SERVICE_KEY) 미설정' } };

  const spec = ROUTES[routeName];
  if (!spec) return { status: 404, body: { ok: false, error: '알 수 없는 경로' } };

  let params;
  try { params = pickParams(spec, query); }
  catch (e) { return { status: 400, body: { ok: false, error: e.message } }; }

  try {
    // 청약홈은 JSON을 그대로 중계한다 (키만 서버에서 붙임)
    if (spec.json) {
      const mapped = {};
      for (const [k, v] of Object.entries(params)) mapped[(spec.rename && spec.rename[k]) || k] = v;
      const qs = new URLSearchParams({ serviceKey: key, ...mapped });
      const r = await fetch(`${ODCLOUD}${spec.path}?${qs}`, { signal: AbortSignal.timeout(25000) });
      let j = null, parseFailed = false;
      try { j = await r.json(); } catch (e) { parseFailed = true; }
      if (!r.ok) return { status: 502, body: { ok: false, error: `분양 API 오류 HTTP ${r.status}` } };
      if (parseFailed || !j) return { status: 502, body: { ok: false, error: '분양 API 응답을 JSON으로 읽지 못함' } };
      return {
        status: 200,
        headers: { 'Cache-Control': `public, s-maxage=${maxAge(spec.cache, params)}, stale-while-revalidate=86400` },
        body: j,
      };
    }
    const out = await fetchAll(spec, params, key);
    const age = maxAge(spec.cache, params);
    return {
      status: 200,
      // 엣지 CDN이 대신 캐시한다. 휘발성 파일시스템에서 디스크 캐시보다 낫다.
      headers: { 'Cache-Control': `public, s-maxage=${age}, stale-while-revalidate=86400` },
      body: { ...out, items: trimFields(out.items, query.fields), ok: true },
    };
  } catch (e) {
    console.warn(`[상류 오류] ${routeName}`, params, '→', e.message);
    return { status: e.upstream ? 502 : 500, body: { ok: false, error: e.message } };
  }
}


// Vercel 서버리스 진입점 — /api/apt-trade, /api/bunyang 등 동적 경로를 처리
module.exports = async (req, res) => {
  const { route, ...query } = req.query || {};
  const out = await handleRoute(String(route || ''), query);
  for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
  if (!out.headers || !out.headers['Cache-Control']) res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.body);
};
