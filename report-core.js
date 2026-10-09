/* ══════════════════════════════════════════════════════════════
   심의 보고서 — 계산 로직 (화면과 무관한 순수 함수)
   사전심의 자료 「Ⅳ-2. 인근 최근 3개년 실거래가격」의 방식을 따른다.
     · 대상: 사업지 소재 시군구(또는 반경) 공동주택 중 준공 N년 이내, 기준 평형(전용 84㎡ 등) 거래
     · 단지별: 최근 3개년 연평균 + 기준연도 평균·건수 + 본건대비(단지 가격 ÷ 본건 세대당 분양가)
     · 동별·구 전체: 기준연도 거래 평균, 평당가 = 평균가 ÷ 환산 공급평(84타입 = 34평)
     · 분양권: 단지별 최근 3개년 평균, 본건 분양가가 그 평균의 몇 % 인지
   금액 단위는 천원 (RTMS 응답의 만원 × 10).
   브라우저에서는 window.RptCore, Node 테스트에서는 module.exports로 쓴다.
   ══════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  // 기준 평형 → 전용면적 대역(㎡, lo 이상 hi 미만)과 평당가 환산용 공급평
  var BANDS = {
    59: { lo: 57, hi: 62, py: 25 },
    74: { lo: 72, hi: 77, py: 30 },
    84: { lo: 83, hi: 86, py: 34 },
    101: { lo: 99, hi: 104, py: 40 },
    114: { lo: 112, hi: 117, py: 45 },
  };
  var SIMILAR_PCT = 10;    // 본건 분양가가 비교 단지 평균의 ±10% 안이면 '유사'
  var COMPARE_MAX = 4;     // 문안에 이름을 드는 비교 단지 수

  function toThousand(man) {
    var n = parseInt(String(man || '').replace(/[^0-9]/g, ''), 10);
    return isFinite(n) ? n * 10 : 0;
  }
  function inBand(ar, band) {
    var b = BANDS[band], v = parseFloat(ar);
    return !!b && v >= b.lo && v < b.hi;
  }
  // 평균은 만원 단위로 반올림한 뒤 천원으로 적는다 (심의자료: 591,625 → 591,630)
  function mean(a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length / 10) * 10 : null; }
  function pct(a, b) { return a && b ? Math.round(a / b * 100) : null; }
  function yearsOf(o) { return [o.baseYear - 3, o.baseYear - 2, o.baseYear - 1, o.baseYear]; }

  function eligible(c, o) {
    var by = parseInt(c.buildYear, 10);
    return c.type === '아파트' && c.saleType !== '임대' && by >= o.baseYear - o.maxAge;
  }

  // 거래 목록 → 연도별 {avg, cnt, amts}
  function byYearOf(trades, years, band) {
    var out = {};
    years.forEach(function (y) { out[y] = { avg: null, cnt: 0, amts: [] }; });
    trades.forEach(function (d) {
      var y = parseInt(d.dealYear, 10), amt = toThousand(d.dealAmount);
      if (!out[y] || !amt || !inBand(d.excluUseAr, band)) return;
      out[y].amts.push(amt);
    });
    years.forEach(function (y) { out[y].cnt = out[y].amts.length; out[y].avg = mean(out[y].amts); });
    return out;
  }
  // 기준연도에 거래가 없으면 가장 최근 연도 평균으로 본건과 비교한다
  function latestAvg(byYear, years) {
    for (var i = years.length - 1; i >= 0; i--) if (byYear[years[i]].cnt) return byYear[years[i]].avg;
    return null;
  }

  function summarizeComplex(c, o) {
    var years = yearsOf(o), byYear = byYearOf(c.trades || [], years, o.band);
    var latest = latestAvg(byYear, years);
    var total = years.reduce(function (s, y) { return s + byYear[y].cnt; }, 0);
    return {
      key: c.key, name: c.name, dong: c.dong || '', buildYear: c.buildYear || '',
      households: Number(c.households || c.kaptCnt) || null, dist: c.dist == null ? null : c.dist,
      byYear: byYear, cur: byYear[o.baseYear], latest: latest, total: total,
      ratio: o.unitPrice ? pct(latest, o.unitPrice) : null,
    };
  }

  function distOrInf(v) { return v == null ? Infinity : v; }
  function byDistThenName(a, b) { return distOrInf(a.dist) - distOrInf(b.dist) || a.name.localeCompare(b.name, 'ko'); }

  // 동별로 묶되, 사업지에서 가까운 단지가 있는 동부터 (PDF의 성성동 → 백석동 → 두정동 → 불당동 순서)
  function orderByDong(rows) {
    var groups = {};
    rows.forEach(function (r) { (groups[r.dong] = groups[r.dong] || []).push(r); });
    var dongs = Object.keys(groups).map(function (d) {
      var list = groups[d].slice().sort(byDistThenName);
      return { dong: d, rows: list, dist: list[0].dist };
    });
    dongs.sort(function (a, b) { return distOrInf(a.dist) - distOrInf(b.dist) || a.dong.localeCompare(b.dong, 'ko'); });
    var out = [];
    dongs.forEach(function (g) { g.rows.forEach(function (r) { out.push(r); }); });
    return out.map(function (r, i) { return Object.assign({}, r, { no: i + 1 }); });
  }

  function summarizeYear(rows, year, convPy) {
    var amts = [];
    rows.forEach(function (r) { amts = amts.concat(r.byYear[year].amts); });
    var avg = mean(amts);
    return { avg: avg, cnt: amts.length, py: avg ? Math.round(avg / convPy) : null, complexes: rows.length };
  }

  function buildReport(complexes, o) {
    var rows = orderByDong(complexes.filter(function (c) { return eligible(c, o); })
      .map(function (c) { return summarizeComplex(c, o); })
      .filter(function (r) { return r.total > 0; }));
    var hasCur = rows.some(function (r) { return r.cur.cnt > 0; });
    var year = hasCur ? o.baseYear : o.baseYear - 1;
    var dongNames = [];
    rows.forEach(function (r) { if (dongNames.indexOf(r.dong) === -1) dongNames.push(r.dong); });
    var dongs = dongNames.map(function (d) {
      var s = summarizeYear(rows.filter(function (r) { return r.dong === d; }), year, o.convPy);
      return Object.assign({ dong: d }, s);
    });
    var ranks = dongs.filter(function (d) { return d.cnt > 0; }).slice()
      .sort(function (a, b) { return b.avg - a.avg; })
      .map(function (d, i) { return Object.assign({}, d, { rank: i + 1 }); });
    return {
      rows: rows, dongs: dongs, ranks: ranks, summaryYear: year, years: yearsOf(o),
      gu: summarizeYear(rows, year, o.convPy), opts: o,
    };
  }

  // 분양권 거래 (RTMS 분양권전매) — 준공연도가 없어 연식 조건 없이 단지명·법정동으로 묶는다
  function summarizeSilv(rows, o) {
    var years = [o.baseYear - 2, o.baseYear - 1, o.baseYear], groups = {};
    rows.forEach(function (d) {
      var k = (d.aptNm || '').trim() + '|' + (d.umdNm || '').trim();
      (groups[k] = groups[k] || { name: (d.aptNm || '').trim(), dong: (d.umdNm || '').trim(), trades: [] }).trades.push(d);
    });
    var list = Object.keys(groups).map(function (k) {
      var g = groups[k], byYear = byYearOf(g.trades, years, o.band);
      var total = years.reduce(function (s, y) { return s + byYear[y].cnt; }, 0);
      return { name: g.name, dong: g.dong, byYear: byYear, cur: byYear[o.baseYear], total: total, latest: latestAvg(byYear, years) };
    }).filter(function (r) { return r.total > 0; });
    list.sort(function (a, b) { return a.dong.localeCompare(b.dong, 'ko') || a.name.localeCompare(b.name, 'ko'); });
    var amts = [];
    list.forEach(function (r) { amts = amts.concat(r.cur.amts); });
    var avg = mean(amts);
    return {
      rows: list.map(function (r, i) { return Object.assign({}, r, { no: i + 1 }); }),
      years: years, cur: { avg: avg, cnt: amts.length, py: avg ? Math.round(avg / o.convPy) : null },
      ratio: o.unitPrice ? pct(o.unitPrice, avg) : null,
    };
  }

  function n(v) { return v == null ? '-' : Number(v).toLocaleString('ko-KR'); }
  function won(v, convPy) { return n(v) + '천원(@' + n(Math.round(v / convPy)) + '천원)'; }

  // 본건과 비교할 동: 사업지 소재 동에 대상 단지가 있으면 그 동, 없으면 가장 가까운 동
  function compareDong(rep, siteDong) {
    var has = function (d) { return rep.rows.some(function (r) { return r.dong === d && r.latest; }); };
    if (siteDong && has(siteDong)) return siteDong;
    var first = rep.rows.filter(function (r) { return r.latest; })[0];
    return first ? first.dong : null;
  }

  // 검토 문안 — 사전심의 자료의 문장 틀을 따른다. 정성 평가(입지·브랜드)는 사람이 덧붙인다.
  function narrative(rep, silv, o) {
    var out = [], y = rep.summaryYear, gu = o.guName || '사업지 소재 시군구', cp = o.convPy;
    if (!rep.rows.length || !rep.gu.avg) return ['기준 조건에 맞는 실거래가 없어 문안을 만들지 못했습니다. 기준 평형이나 준공 연수를 넓혀 보세요.'];
    var s = gu + '의 ' + y + '년 ' + o.band + '타입(준공 ' + o.maxAge + '년 내) 공동주택의 실거래가 평균 거래금액은 ' + won(rep.gu.avg, cp) + '이며';
    var top = rep.ranks[0];
    if (top) {
      s += ', ' + gu + ' 내 공동주택 가격 평균은 ' + top.dong + '이 ' + won(top.avg, cp) + '으로 1위';
      var site = rep.ranks.filter(function (d) { return d.dong === o.siteDong; })[0]
        || rep.ranks.filter(function (d) { return d.dong === compareDong(rep, o.siteDong); })[0];
      if (site && site.rank > 1) s += ', 본건 공동주택과 인접한 ' + site.dong + '이 ' + won(site.avg, cp) + '으로 ' + site.rank + '위';
      s += '를 기록 중임.';
    } else s += '.';
    out.push(s);

    if (o.unitPrice && rep.gu.py) {
      var unitPy = o.unitPy || Math.round(o.unitPrice / cp);
      var p = pct(unitPy, rep.gu.py);
      var d = compareDong(rep, o.siteDong);
      // 사업지에서 가까운 순(번호 순)으로 COMPARE_MAX곳 — 심의자료도 ①~④ 인접 단지를 들었다
      var near = rep.rows.filter(function (r) { return r.dong === d && r.latest; }).slice(0, COMPARE_MAX);
      var t = '본건 계획분양가는 @' + n(unitPy) + '천원(세대당 ' + n(o.unitPrice) + '천원)으로 ' + gu + ' 공동주택 평균 대비 약 ' + p + '% 수준';
      if (near.length) {
        var nearAvg = mean(near.map(function (r) { return r.latest; }));
        var diff = pct(o.unitPrice, nearAvg) - 100;
        var level = Math.abs(diff) <= SIMILAR_PCT ? '유사한' : diff > 0 ? '다소 높은' : '낮은';
        t += (p > 100 ? '으로 높으나, ' : '이며, ') + d + ' 소재 ' + near.map(function (r) { return '「' + r.name + '」(' + n(r.latest) + '천원)'; }).join(', ')
          + ' 등의 ' + y + '년 실거래가격 평균 대비 ' + level + ' 수준임.';
      } else t += '임.';
      out.push(t);
    }

    if (silv && silv.cur && silv.cur.avg) {
      var u = y + '년 ' + gu + ' 분양권 실거래가격 평균은 ' + won(silv.cur.avg, cp) + ' 수준';
      u += o.unitPrice ? '으로 본건은 이들 대비 약 ' + silv.ratio + '% 수준임.' : '임.';
      out.push(u);
    }
    return out;
  }

  var api = {
    BANDS: BANDS, toThousand: toThousand, inBand: inBand, eligible: eligible,
    summarizeComplex: summarizeComplex, buildReport: buildReport, summarizeSilv: summarizeSilv,
    narrative: narrative, compareDong: compareDong,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RptCore = api;
})(this);
