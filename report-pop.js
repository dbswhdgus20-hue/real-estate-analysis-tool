/* ══════════════════════════════════════════════════════════════
   분석 보고서 — 인구·전입 지표 (행정안전부 주민등록 통계, 서버 경로 pop-stat · pop-move)
     · 인구·세대수: 각 연도 12월 말. 진행 중인 해는 나와 있는 가장 최근 달
     · 전입·전출: 시군구 밖과의 이동 연간 합계 (월별 자료를 3개월씩 받아 더한다)
       일반구(천안시 서북구 등)는 상류가 시 단위로만 주므로 시 전체 값을 쓰고 주석에 적는다
     · 자료 시작: 인구 2022.09, 인구이동 2022.10 — 그 전 연도는 비운다
   계산(PopCore)은 Node 테스트에서도 쓰고, 조회(rptLoadPopulation)는 브라우저 전용이다.
   ══════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var MOVE_FROM = 202210;   // 인구이동 자료 시작 월
  var POP_FROM = 202209;    // 인구 자료 시작 월

  /** 한 해에서 받을 3개월 구간 — lastMonth(진행 중인 해의 마지막 달)까지만 */
  function quarters(year, lastMonth) {
    var out = [];
    for (var m = 1; m <= lastMonth; m += 3) {
      var fr = year * 100 + m, to = year * 100 + Math.min(m + 2, lastMonth);
      if (to < MOVE_FROM) continue;
      out.push([Math.max(fr, MOVE_FROM), to]);
    }
    return out;
  }

  /** 연도마다 인구를 읽을 달 — 지난해는 12월, 진행 중인 해는 endYm부터 거꾸로 (자료가 늦게 나온다) */
  function popMonths(year, endYm) {
    var last = Math.floor(endYm / 100) === year ? endYm % 100 : 12, out = [];
    for (var m = last; m >= Math.max(1, last - 2); m--) if (year * 100 + m >= POP_FROM) out.push(year * 100 + m);
    return out;
  }

  /**
   * 조회 결과를 연도별 표 값으로 묶는다
   *  popRows : { 'YYYYMM': [{code, pop, hh}] }        — 시도별 응답을 합친 것
   *  moves   : { lawd: { unit:{code,name}, months:{ 'YYYYMM': {moveIn, moveOut} } } }
   *  반환    : { lawd: { year: {pop, hh, popChg, moveIn, moveOut, net} }, meta: {...} }
   */
  function assemble(lawds, years, endYm, popRows, moves) {
    var out = { meta: { popYm: {}, moveMonths: {}, unit: {} } };
    var curYear = Math.floor(endYm / 100);
    var popAt = function (lawd, ym) {
      var hit = (popRows[ym] || []).filter(function (x) { return x.code === lawd + '00000'; })[0];
      return hit && hit.pop != null ? hit : null;
    };
    var popOfYear = function (lawd, y) {
      var ms = popMonths(y, endYm);
      for (var i = 0; i < ms.length; i++) { var h = popAt(lawd, ms[i]); if (h) return { ym: ms[i], v: h }; }
      return null;
    };
    lawds.forEach(function (k) {
      var mv = moves[k] || { months: {} };
      if (mv.unit && mv.unit.code && mv.unit.code !== k + '00000') out.meta.unit[k] = mv.unit.name;
      out[k] = {};
      [years[0] - 1].concat(years).forEach(function (y, i) {
        var p = popOfYear(k, y);
        if (i === 0) { out[k]._prev = p; return; }
        if (p && (y === curYear || !out.meta.popYm[y])) out.meta.popYm[y] = p.ym;
        var prev = i === 1 ? out[k]._prev : (out[k][y - 1] ? { v: { pop: out[k][y - 1].pop } } : null);
        var lastM = y === curYear ? endYm % 100 : 12, mIn = 0, mOut = 0, n = 0, maxM = 0;
        for (var m = 1; m <= lastM; m++) {
          var r = mv.months[String(y * 100 + m)];
          if (!r) continue;
          mIn += r.moveIn; mOut += r.moveOut; n++; maxM = m;
        }
        // 지난해는 12개월이 다 있어야 연간 합계로 쓴다 (2022년은 10월부터라 비운다)
        var full = y === curYear ? n > 0 && n === maxM : n === 12;
        if (full && y === curYear) out.meta.moveMonths[y] = maxM;
        out[k][y] = {
          pop: p ? p.v.pop : null, hh: p ? p.v.hh : null,
          popChg: p && prev && prev.v && prev.v.pop != null ? p.v.pop - prev.v.pop : null,
          moveIn: full ? mIn : null, moveOut: full ? mOut : null, net: full ? mIn - mOut : null,
        };
      });
      delete out[k]._prev;
    });
    return out;
  }

  /** 표 아래 주석 — 화면·Excel·Word가 같은 문장을 쓴다 */
  function notes(pop, years, names) {
    if (!pop || pop.error) return [];
    var m = pop.meta || {}, curYear = years[years.length - 1], fmt = function (ym) { return Math.floor(ym / 100) + '.' + String(ym % 100).padStart(2, '0'); };
    var cur = m.popYm && m.popYm[curYear], out = [];
    out.push('인구·세대수: 각 연도 12월 말 기준' + (cur && cur % 100 !== 12 ? ' (' + curYear + '년은 ' + fmt(cur) + ' 말)' : '') + '. 인구 증감은 전년 말 대비.');
    var mm = m.moveMonths && m.moveMonths[curYear];
    out.push('전입·전출: 다른 시군구와의 이동 연간 합계' + (mm && mm < 12 ? ' (' + curYear + '년은 1~' + mm + '월)' : '') + '. 같은 시군구 안의 이동은 뺌.');
    Object.keys(m.unit || {}).forEach(function (k) {
      out.push((names[k] || k) + '의 전입·전출은 ' + m.unit[k] + ' 전체 값임 (구 단위 자료 미제공).');
    });
    if (years[0] * 100 + 12 < 202301) out.push('전입·전출 자료는 2022년 10월부터 제공되어 2022년까지는 비움.');
    out.push('출처: 행정안전부 「주민등록 인구 및 세대현황」·「지역별 인구이동 현황」(공공데이터포털).');
    return out;
  }

  var api = { quarters: quarters, popMonths: popMonths, assemble: assemble, notes: notes, MOVE_FROM: MOVE_FROM, POP_FROM: POP_FROM };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PopCore = api;
})(this);

/* ── 브라우저: 서버에서 받아 PopCore.assemble로 묶는다 ── */
var RPT_POP_FIELDS = [
  { k: 'pop', label: '주민등록 인구' }, { k: 'popChg', label: '인구 증감' }, { k: 'hh', label: '세대수' },
  { k: 'moveIn', label: '전입' }, { k: 'moveOut', label: '전출' }, { k: 'net', label: '순이동 (전입−전출)' },
];
var POP_CACHE = 'kirt.mois.v2.';

/** 확정된 자료(두 달 이상 지난 달)만 브라우저에 남겨 다음 보고서부터 바로 쓴다 */
async function popGet(route, params, lastYm) {
  var key = POP_CACHE + route + '.' + Object.keys(params).map(function (k) { return params[k]; }).join('.');
  var d = new Date(), cur = d.getFullYear() * 100 + d.getMonth() + 1;
  var settled = (Math.floor(cur / 100) - Math.floor(lastYm / 100)) * 12 + cur % 100 - lastYm % 100 >= 2;
  if (settled) { try { var hit = localStorage.getItem(key); if (hit) return JSON.parse(hit); } catch (e) {} }
  var r = await fetch(PROXY_BASE + '/' + route + '?' + qs(params), { cache: 'no-store' });   // 확정 자료는 위 localStorage가 맡는다
  var j = null;
  try { j = await r.json(); } catch (e) {}
  if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || '주민등록 통계 HTTP ' + r.status);
  if (settled) { try { localStorage.setItem(key, JSON.stringify(j)); } catch (e) {} }
  return j;
}

async function rptLoadPopulation(lawds, years, endYm, onProgress) {
  try {
    // 통계는 달이 끝난 뒤 나온다 — 이번 달은 묻지 않는다 (물으면 10 INVALID_REQUEST_PARAMETER)
    var d = new Date(), lastPub = d.getMonth() === 0 ? (d.getFullYear() - 1) * 100 + 12 : d.getFullYear() * 100 + d.getMonth();
    if (endYm > lastPub) endYm = lastPub;
    var sidos = lawds.map(function (k) { return k.slice(0, 2); }).filter(function (s, i, a) { return a.indexOf(s) === i; });
    var popJobs = [];
    [years[0] - 1].concat(years).forEach(function (y) {
      PopCore.popMonths(y, endYm).forEach(function (ym) { sidos.forEach(function (s) { popJobs.push({ sido: s, ym: ym }); }); });
    });
    var moveJobs = [];
    lawds.forEach(function (k) {
      years.forEach(function (y) {
        var lastM = Math.floor(endYm / 100) === y ? endYm % 100 : 12;
        PopCore.quarters(y, lastM).forEach(function (q) { moveJobs.push({ lawd: k, fr: q[0], to: q[1] }); });
      });
    });
    var total = popJobs.length + moveJobs.length, done = 0;
    var partial = null;
    var tick = function () { done++; if (onProgress) onProgress(done, total, partial); };
    var popRows = {}, moves = {}, failed = 0;
    await runPool(popJobs, async function (j) {
      try {
        var r = await popGet('pop-stat', { sido: j.sido, ym: j.ym }, j.ym);
        popRows[j.ym] = (popRows[j.ym] || []).concat(r.items || []);
      } catch (e) { failed++; console.warn('[분석 보고서] 인구 조회 실패 ' + j.sido + ' ' + j.ym + ' → ' + e.message); }
      tick();
    }, 4);
    partial = PopCore.assemble(lawds, years, endYm, popRows, {});   // 인구·세대수는 먼저 보여 준다
    if (onProgress) onProgress(done, total, partial);
    await runPool(moveJobs, async function (j) {
      try {
        var r = await popGet('pop-move', { admmCd: j.lawd + '00000', frYm: j.fr, toYm: j.to }, j.to);
        var mv = moves[j.lawd] = moves[j.lawd] || { unit: null, months: {} };
        if (r.unit && !mv.unit) mv.unit = r.unit;
        Object.keys(r.months || {}).forEach(function (ym) { mv.months[ym] = r.months[ym]; });
      } catch (e) { failed++; console.warn('[분석 보고서] 인구이동 조회 실패 ' + j.lawd + ' ' + j.fr + '~' + j.to + ' → ' + e.message); }
      tick();
    }, 3);
    if (failed === total) throw new Error('주민등록 통계를 받지 못했습니다 (공공데이터포털 활용신청 확인)');
    var out = PopCore.assemble(lawds, years, endYm, popRows, moves);
    if (failed) out.meta.partial = failed;
    return out;
  } catch (e) {
    console.warn('[분석 보고서] 인구 지표 조회 실패 → ' + e.message);
    return { error: e.message };
  }
}
