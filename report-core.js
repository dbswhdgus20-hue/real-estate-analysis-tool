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
    // 같은 단지가 시기마다 「천안 백석 센트레빌」·「천안백석센트레빌」처럼 다르게 신고된다 → 법정동+지번으로 묶고,
    // 지번이 없으면 띄어쓰기를 뺀 이름으로 묶는다. 표시 이름은 가장 많이 쓰인 표기.
    var nameKey = function (s) { return String(s || '').replace(/\s+/g, ''); };
    rows.forEach(function (d) {
      var dong = (d.umdNm || '').trim(), lot = String(d.jibun || '').trim();
      var k = dong + '|' + (lot ? '#' + lot : nameKey(d.aptNm));
      var g = groups[k] = groups[k] || { dong: dong, names: {}, trades: [] };
      var nm = (d.aptNm || '').trim();
      g.names[nm] = (g.names[nm] || 0) + 1;
      g.trades.push(d);
    });
    var list = Object.keys(groups).map(function (k) {
      var g = groups[k], byYear = byYearOf(g.trades, years, o.band);
      var total = years.reduce(function (s, y) { return s + byYear[y].cnt; }, 0);
      var name = Object.keys(g.names).sort(function (a, b) { return g.names[b] - g.names[a]; })[0];
      return { name: name, dong: g.dong, byYear: byYear, cur: byYear[o.baseYear], total: total, latest: latestAvg(byYear, years) };
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

  /* 지역(시군구) 지표 — 반경 안 구마다 5개년 아파트 매매·전월세를 집계한다.
     complexes: 각 단지에 sgg(시군구코드 5자리)가 붙은 목록. 분양권(presale)·오피스텔은 뺀다.
     매매: 건수·평균 거래가·전용 3.3㎡당 평균가(공급면적 추정 없이 전용 기준이라 객관적), 전년 대비 건수 증감(%)
     전월세: 전세 건수·평균 보증금, 월세 건수·평균 보증금·평균 월세 */
  var PY_M2 = 3.3058;
  function emptyYear() { return { t: [], p: [], j: [], wd: [], wr: [], m: {} }; }   // m: 월별 매매 건수 (전년 동기 비교용)
  function finishYear(b) {
    return {
      trade: { cnt: b.t.length, avg: mean(b.t), py: b.p.length ? Math.round(b.p.reduce(function (s, x) { return s + x; }, 0) / b.p.length) : null },
      jeonse: { cnt: b.j.length, avg: mean(b.j) },
      wolse: { cnt: b.wd.length, dep: mean(b.wd), rent: mean(b.wr) },
    };
  }
  function regionStats(complexes, o) {
    var years = [], acc = {}, all = {};
    for (var y0 = o.baseYear - 4; y0 <= o.baseYear; y0++) { years.push(y0); all[y0] = emptyYear(); }
    complexes.forEach(function (c) {
      if (c.type !== '아파트' || c.presale || !c.sgg) return;
      var g = acc[c.sgg] = acc[c.sgg] || (function () { var b = {}; years.forEach(function (y) { b[y] = emptyYear(); }); return b; })();
      (c.trades || []).forEach(function (d) {
        var y = parseInt(d.dealYear, 10), amt = toThousand(d.dealAmount), ar = parseFloat(d.excluUseAr);
        if (!g[y] || !amt) return;
        var mo = parseInt(d.dealMonth, 10) || 0;
        [g[y], all[y]].forEach(function (b) { b.t.push(amt); if (ar > 0) b.p.push(amt / (ar / PY_M2)); b.m[mo] = (b.m[mo] || 0) + 1; });
      });
      (c.rents || []).forEach(function (d) {
        var y = parseInt(d.dealYear, 10), dep = toThousand(d.deposit), mon = toThousand(d.monthlyRent);
        if (!g[y]) return;
        [g[y], all[y]].forEach(function (b) {
          if (d._rt === '월세') { if (dep || mon) { b.wd.push(dep); b.wr.push(mon); } }
          else if (dep) b.j.push(dep);
        });
      });
    });
    // 마지막 해가 일부 월만 있으면(endMonth < 12) 전년 같은 기간(1~endMonth월)과 비교한다 — 1년 전체와 견주면 감소로 잘못 읽힌다
    var endMonth = o.endMonth && o.endMonth < 12 ? o.endMonth : 0;
    function upTo(b, m) { var c = 0; for (var k in b.m) if (+k <= m) c += b.m[k]; return c; }
    function finish(raw) {
      var byYear = {};
      years.forEach(function (y, i) {
        byYear[y] = finishYear(raw[y]);
        var same = endMonth && y === o.baseYear;
        var cur = same ? upTo(raw[y], endMonth) : byYear[y].trade.cnt;
        var prev = i ? (same ? upTo(raw[years[i - 1]], endMonth) : byYear[years[i - 1]].trade.cnt) : 0;
        byYear[y].yoy = i && prev ? Math.round((cur / prev - 1) * 1000) / 10 : null;
        byYear[y].yoySame = !!same;
      });
      return byYear;
    }
    var names = o.names || {};
    var gus = Object.keys(acc).sort().map(function (k) { return { sgg: k, name: names[k] || k, byYear: finish(acc[k]) }; });
    return { years: years, gus: gus, total: { name: '합계', byYear: finish(all) } };
  }

  // 지역 요약 문장 — 사업지 소재 구의 첫해·기준연도 수치만 나란히 적는다 (증감 평가 없음)
  function regionNarrative(region, sgg, endYm) {
    var g = (region.gus || []).filter(function (x) { return x.sgg === sgg; })[0];
    if (!g) return [];
    var y0 = region.years[0], y1 = region.years[region.years.length - 1];
    var partial = endYm && String(endYm).slice(0, 4) === String(y1) && String(endYm).slice(4) !== '12';
    var lab1 = y1 + '년' + (partial ? '(1~' + parseInt(String(endYm).slice(4), 10) + '월)' : '');
    var a = g.byYear[y0], b = g.byYear[y1], out = [];
    out.push(g.name + ' 아파트 매매는 ' + y0 + '년 ' + n(a.trade.cnt) + '건, ' + lab1 + ' ' + n(b.trade.cnt) + '건이며, 전용 3.3㎡당 평균가는 ' +
      y0 + '년 ' + n(a.trade.py) + '천원, ' + y1 + '년 ' + n(b.trade.py) + '천원임.');
    if (a.jeonse.avg || b.jeonse.avg) out.push(g.name + ' 아파트 전세 평균 보증금은 ' + y0 + '년 ' + n(a.jeonse.avg) + '천원, ' + y1 + '년 ' + n(b.jeonse.avg) + '천원임.');
    return out;
  }

  // 분양권 단지별 프리미엄(%) = 최근 거래 평균 ÷ 최초 분양가(대표 평형) − 1, 전체는 거래 건수 가중 평균.
  // row.init은 report.js가 청약홈 공고로 붙인다 (PresaleCore.repPrice 결과, 천원)
  function silvPremium(silv) {
    var sum = 0, w = 0;
    (silv.rows || []).forEach(function (r) {
      r.premPct = r.init && r.init.price && r.latest ? Math.round((r.latest / r.init.price - 1) * 1000) / 10 : null;
      if (r.premPct != null) { sum += r.premPct * (r.total || 1); w += (r.total || 1); }
    });
    return w ? Math.round(sum / w * 10) / 10 : null;
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
      // 분석보고서는 판단을 읽는 사람에게 맡긴다 — '유사·높음' 같은 평가 없이 비율만 적는다
      var t = '본건 계획분양가는 @' + n(unitPy) + '천원(세대당 ' + n(o.unitPrice) + '천원)으로 ' + gu + ' 공동주택 평균 평당가의 약 ' + p + '% 수준임.';
      if (near.length) {
        var nearAvg = mean(near.map(function (r) { return r.latest; }));
        t += ' ' + d + ' 소재 ' + near.map(function (r) { return '「' + r.name + '」(' + n(r.latest) + '천원)'; }).join(', ')
          + '의 ' + y + '년 실거래가격 평균은 ' + n(nearAvg) + '천원이며, 본건 세대당 분양가는 이의 약 ' + pct(o.unitPrice, nearAvg) + '% 수준임.';
      }
      out.push(t);
    }

    if (silv && silv.cur && silv.cur.avg) {
      var u = y + '년 ' + gu + ' 분양권 실거래가격 평균은 ' + won(silv.cur.avg, cp) + ' 수준';
      if (silv.premAvg != null) u += '으로 최초 분양가(' + o.band + '타입 대표 평형) 대비 평균 약 ' + (silv.premAvg > 0 ? '+' : '') + silv.premAvg + '% 수준이며';
      u += o.unitPrice ? (silv.premAvg != null ? ', ' : '으로 ') + '본건은 이들 대비 약 ' + silv.ratio + '% 수준임.' : '임.';
      out.push(u);
    }
    return out;
  }

  var api = {
    BANDS: BANDS, toThousand: toThousand, inBand: inBand, eligible: eligible,
    summarizeComplex: summarizeComplex, buildReport: buildReport, summarizeSilv: summarizeSilv,
    narrative: narrative, compareDong: compareDong, silvPremium: silvPremium, regionStats: regionStats, regionNarrative: regionNarrative,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RptCore = api;
})(this);
