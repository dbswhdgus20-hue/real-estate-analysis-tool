/* ══════════════════════════════════════════════════════════════
   준공 전 단지 — 최초 분양가·프리미엄 계산 (화면과 무관한 순수 함수)
   자료: 청약홈 「APT 분양정보 주택형별 상세」(getAPTLttotPblancMdl)
     HOUSE_TY  주택형 (예: 084.9752A — 전용면적 + 타입 글자)
     SUPLY_AR  공급면적(㎡) · SUPLY_HSHLDCO 일반공급 · SPSPLY_HSHLDCO 특별공급 · LTTOT_TOP_AMOUNT 최고 분양가(만원)

   ■ 대표 평형
     공고에 기준 평형(기본 전용 84㎡ 대역) 주택형이 있으면 그 묶음, 없으면 세대수가 가장 많은
     평형(전용면적 정수부가 같은 주택형 묶음). 대표 분양가 = 묶음 안 주택형 최고가의 세대수 가중 평균.

   ■ PH(펜트하우스·최상층 특화) 제외 기준 — 두 조건을 모두 만족하면 대표 분양가·프리미엄 계산에서 뺀다
     ① 평당 분양가(최고가 ÷ 공급평)가 대표 평형 평당 분양가보다 PH_PREMIUM(30%) 이상 높다
        총액이 아니라 평당으로 본다 — 큰 평형은 총액이 당연히 비싸다 (105㎡: 총액 +44%, 평당 +17%)
     ② 그 주택형 세대가 공고 전체의 PH_SHARE(2%) 미만 — 초고층·최상층에만 둔 소수 세대
     근거 (2026-10-09, 전국 공고 113건·주택형 754개 실측):
       평당 +20~30% 구간은 0개로 비어 있고, +30% 이상 42개는 모두 세대 비중 1% 이하(1~7세대)였다.
       그래서 경계를 빈 구간 위쪽인 30%로 둔다 (20%와 결과는 같고 더 보수적).
       주택형 이름의 P·T 표기는 쓰지 않는다 — T(테라스)는 평당 +2~7%로 일반 가격인 경우가 많았다.

   금액은 천원 (만원 × 10). 브라우저에서는 window.PresaleCore, Node 테스트에서는 module.exports.
   ══════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var PY_M2 = 3.3058;
  var PH_PREMIUM = 0.30;      // 평당 분양가가 대표 평형보다 이만큼 이상 비싸고 (2026-10-09 사용자 결정: 30%)
  var PH_SHARE = 0.02;        // 세대 비중이 이 미만이면 PH로 본다
  var MATCH_TOL = 0.5;        // 거래 전용면적과 주택형 전용면적 허용 차이(㎡)

  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }

  function parseModels(items) {
    return (items || []).map(function (x) {
      var ty = String(x.HOUSE_TY || '').trim();
      var ex = num(ty.replace(/[A-Za-z].*$/, ''));
      var letter = (ty.match(/[A-Za-z]+$/) || [''])[0].toUpperCase();
      var sup = num(x.SUPLY_AR);
      return {
        ty: ty, label: Math.floor(ex) + letter, ex: ex, sup: sup,
        supPy: Math.round(sup / PY_M2 * 100) / 100,
        hh: num(x.SUPLY_HSHLDCO) + num(x.SPSPLY_HSHLDCO),
        top: Math.round(num(x.LTTOT_TOP_AMOUNT)) * 10,
      };
    }).filter(function (m) { return m.ex > 0; });
  }

  function weighted(list, f) {
    var w = list.reduce(function (s, m) { return s + (m.hh || 1); }, 0);
    return list.reduce(function (s, m) { return s + f(m) * (m.hh || 1); }, 0) / w;
  }
  function perPy(m) { return m.top / m.supPy; }

  // 대표 평형 묶음 — 기준 대역 안 주택형, 없으면 세대가 가장 많은 평형(전용 정수부) 묶음
  function repGroup(ok, band) {
    var inBand = ok.filter(function (m) { return m.ex >= band.lo && m.ex < band.hi; });
    if (inBand.length) return inBand;
    var g = {};
    ok.forEach(function (m) { var k = Math.floor(m.ex); (g[k] = g[k] || []).push(m); });
    var sum = function (l) { return l.reduce(function (s, m) { return s + m.hh; }, 0); };
    return Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return sum(b) - sum(a); })[0];
  }

  /* 대표 평형 분양가 + PH 판정. 돌려주는 models는 입력을 복사해 ph 표시를 붙인 것 (입력은 건드리지 않는다)
     → { price, supPy, py, hh, types, groupLabel, basePy, models } 또는 null */
  function repPrice(models, band) {
    var ok = models.filter(function (m) { return m.top > 0 && m.sup > 0; });
    if (!ok.length) return null;
    var total = ok.reduce(function (s, m) { return s + m.hh; }, 0) || 1;
    var group = repGroup(ok, band);
    var basePy = weighted(group, perPy);                 // PH 판정의 기준 평당가 (소수 세대라 PH 영향은 미미)
    var flagged = models.map(function (m) {
      var ph = m.top > 0 && m.sup > 0 && perPy(m) >= basePy * (1 + PH_PREMIUM) && m.hh / total < PH_SHARE;
      return Object.assign({}, m, { ph: ph, ppy: m.top > 0 && m.sup > 0 ? Math.round(perPy(m)) : null });
    });
    var pick = group.filter(function (m) {
      return !flagged.some(function (f) { return f.ty === m.ty && f.ph; });
    });
    if (!pick.length) return null;
    var price = Math.round(weighted(pick, function (m) { return m.top; }) / 10) * 10;   // 만원 단위 반올림
    var supPy = Math.round(weighted(pick, function (m) { return m.supPy; }) * 100) / 100;
    return {
      price: price, supPy: supPy, py: Math.round(price / supPy),
      hh: pick.reduce(function (s, m) { return s + (m.hh || 1); }, 0),
      types: pick.map(function (m) { return m.label; }),
      groupLabel: Math.floor(pick[0].ex) + '㎡', basePy: Math.round(basePy), models: flagged,
    };
  }

  function matchModel(models, excluUseAr) {
    var ex = num(excluUseAr), best = null;
    models.forEach(function (m) {
      var d = Math.abs(m.ex - ex);
      if (d <= MATCH_TOL && (!best || d < best.d)) best = { m: m, d: d };
    });
    return best ? best.m : null;
  }

  // 거래 한 건의 프리미엄 — 거래금액(만원 문자열) − 해당 주택형 최고 분양가
  function premium(dealAmount, model) {
    if (!model || !(model.top > 0)) return null;
    var amt = Math.round(num(dealAmount)) * 10;
    if (!(amt > 0)) return null;
    return { init: model.top, amt: amt - model.top, pct: Math.round((amt / model.top - 1) * 1000) / 10 };
  }

  var api = { PH_PREMIUM: PH_PREMIUM, PH_SHARE: PH_SHARE, parseModels: parseModels, repPrice: repPrice, matchModel: matchModel, premium: premium };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PresaleCore = api;
})(this);
