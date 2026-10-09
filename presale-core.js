/* ══════════════════════════════════════════════════════════════
   준공 전 단지 — 최초 분양가·프리미엄 계산 (화면과 무관한 순수 함수)
   자료: 청약홈 「APT 분양정보 주택형별 상세」(getAPTLttotPblancMdl)
     HOUSE_TY  주택형 (예: 084.9752A — 전용면적 + 타입 글자)
     SUPLY_AR  공급면적(㎡) · SUPLY_HSHLDCO 일반공급 세대 · LTTOT_TOP_AMOUNT 최고 분양가(만원)
   · 최초 분양가는 「대표 평형」(기본 전용 84㎡ 대역) 주택형의 세대수 가중 평균
   · 펜트하우스처럼 세대가 아주 적은 주택형(PH_MAX_HH 이하)은 계산에서 뺀다
   금액은 천원 (만원 × 10). 브라우저에서는 window.PresaleCore, Node 테스트에서는 module.exports.
   ══════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var PY_M2 = 3.3058;
  var PH_MAX_HH = 9;          // 이 세대수 이하 주택형은 펜트하우스·특수형으로 보고 대표 분양가에서 뺀다
  var MATCH_TOL = 0.5;        // 거래 전용면적과 주택형 전용면적 허용 차이(㎡)

  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }

  function parseModels(items) {
    return (items || []).map(function (x) {
      var ty = String(x.HOUSE_TY || '').trim();
      var ex = num(ty.replace(/[A-Za-z].*$/, ''));
      var letter = (ty.match(/[A-Za-z]+$/) || [''])[0].toUpperCase();
      var sup = num(x.SUPLY_AR), hh = num(x.SUPLY_HSHLDCO);
      return {
        ty: ty, label: Math.floor(ex) + letter, ex: ex, sup: sup,
        supPy: Math.round(sup / PY_M2 * 100) / 100, hh: hh,
        top: Math.round(num(x.LTTOT_TOP_AMOUNT)) * 10,
        ph: /PH/i.test(ty) || hh <= PH_MAX_HH,
      };
    }).filter(function (m) { return m.ex > 0; });
  }

  // 대표 평형 분양가 — band {lo, hi}(전용㎡) 안 주택형의 세대수 가중 평균. 없으면 세대가 가장 많은 주택형
  function repPrice(models, band) {
    var ok = models.filter(function (m) { return !m.ph && m.top > 0 && m.sup > 0; });
    if (!ok.length) return null;
    var pick = ok.filter(function (m) { return m.ex >= band.lo && m.ex < band.hi; }), fallback = false;
    if (!pick.length) { pick = [ok.slice().sort(function (a, b) { return b.hh - a.hh; })[0]]; fallback = true; }
    var w = pick.reduce(function (s, m) { return s + (m.hh || 1); }, 0);
    var avg = function (f) { return pick.reduce(function (s, m) { return s + f(m) * (m.hh || 1); }, 0) / w; };
    var price = Math.round(avg(function (m) { return m.top; }) / 10) * 10;     // 만원 단위 반올림
    var supPy = Math.round(avg(function (m) { return m.supPy; }) * 100) / 100;
    return { price: price, supPy: supPy, py: Math.round(price / supPy), hh: w, fallback: fallback,
             types: pick.map(function (m) { return m.label; }) };
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

  var api = { PH_MAX_HH: PH_MAX_HH, parseModels: parseModels, repPrice: repPrice, matchModel: matchModel, premium: premium };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PresaleCore = api;
})(this);
