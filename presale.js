/* ══════════════════════════════════════════════════════════════
   준공 전 단지 — 청약홈 공고의 최초 분양가를 붙이고 프리미엄을 보여준다
   · 단지 라벨은 그대로 분양권 거래 평균(평당가). 최초 분양가는 우측 상세 패널에만 적는다.
   · 공급면적은 공고의 실제 값으로 바꿔 평당가를 다시 칠한다 (추정 전용률 대신).
   · 계산은 presale-core.js(PresaleCore). 여기서는 조회·캐시·화면만 다룬다.
   index.html 전역(allComplexes, curComplex, PROXY_BASE, API_MODE, qs, runPool, lsGetT, lsSetT,
   refreshPriceFor, renderDetail, renderTable)을 쓴다.
   ══════════════════════════════════════════════════════════════ */
var MDL_LS = 'kirt.mdl.v2.';   // v2: 세대 = 일반+특별공급 (v1은 일반공급만)
var MDL_TTL = 30 * 24 * 3600 * 1000;          // 공고 주택형은 바뀌지 않으므로 30일 보관
var PRESALE_BAND = { lo: 83, hi: 86 };   // 대표 평형 — 전용 84㎡ 대역 (공고에 없으면 세대가 가장 많은 평형)
var APPLYHOME_URL = /^https:\/\/www\.applyhome\.co\.kr\//;
var presaleGen = 0;

function psEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function psMan(v) { return v == null ? '-' : Math.round(v / 10).toLocaleString('ko-KR'); }   // 천원 → 만원 표기
function psSigned(v) { return (v > 0 ? '+' : '') + v.toLocaleString('ko-KR'); }

async function loadModels(houseNo) {
  var cached = lsGetT(MDL_LS + houseNo, MDL_TTL);
  if (cached) return cached;
  var r = await fetch(PROXY_BASE + '/bunyang-mdl?' + qs({ houseNo: houseNo, page: 1, perPage: 100 }), { cache: 'default' });
  var j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  if (!r.ok || !j || !Array.isArray(j.data)) throw new Error((j && (j.error || j.msg)) || ('HTTP ' + r.status));
  var models = PresaleCore.parseModels(j.data);
  if (models.length) lsSetT(MDL_LS + houseNo, models);
  return models;
}

// 분양 공고와 합쳐진 준공 전 단지마다 주택형별 분양가를 받아 붙인다 (분양 공고 매칭이 끝난 뒤 호출)
async function applyPresaleModels() {
  if (API_MODE !== 'proxy' || typeof PresaleCore === 'undefined') return;
  var gen = ++presaleGen;
  var list = Object.keys(allComplexes).map(function (k) { return allComplexes[k]; })
    .filter(function (c) { return c.presale && c._bunyang && c._bunyang.HOUSE_MANAGE_NO && !c._models; });
  if (!list.length) return;
  await runPool(list, async function (c) {
    try {
      var models = await loadModels(c._bunyang.HOUSE_MANAGE_NO);
      if (gen !== presaleGen) return;                      // 그사이 새 분석이 시작됐다
      c._models = models;
      c._initRep = PresaleCore.repPrice(models, PRESALE_BAND);
      refreshPriceFor(c);                                  // 공급면적이 실제 값으로 바뀌었으니 평당가 다시 칠하기
      if (curComplex === c && document.getElementById('detailPanel').classList.contains('open')) { renderDetail(); renderTable(); }
    } catch (e) {
      c._modelsErr = e.message;
      console.warn('[최초 분양가] ' + c.name + ' → ' + e.message);
    }
  }, 2);
  console.log('[최초 분양가] 준공 전 단지 ' + list.length + '곳 조회');
}

// 공고의 실제 공급면적 (supplyOf가 부른다) — 맞는 주택형이 없으면 null
function presaleSupply(c, excluUseAr) {
  if (!c || !c.presale || !c._models || typeof PresaleCore === 'undefined') return null;
  var m = PresaleCore.matchModel(c._models, excluUseAr);
  if (!m || !(m.sup > 0)) return null;
  var v = parseFloat(excluUseAr);
  return { supply: Math.round(m.sup * 100) / 100, supplyPy: Math.round(m.sup / 3.3058 * 10) / 10,
           ratio: Math.round(v / m.sup * 1000) / 10, src: 'notice', ty: m.label };
}

// 대표 평형 거래들의 평균 거래가·프리미엄
function presaleTradeStats(c) {
  var rep = c._initRep;
  if (!rep) return null;
  var prem = [], amts = [];
  (c.trades || []).forEach(function (d) {
    var m = PresaleCore.matchModel(rep.models, d.excluUseAr);
    if (!m || m.ph || rep.types.indexOf(m.label) === -1) return;     // 대표 평형 주택형 거래만, PH 제외
    var p = PresaleCore.premium(d.dealAmount, m);
    if (p) { prem.push(p); amts.push(p.amt + p.init); }
  });
  if (!prem.length) return null;
  var avg = function (a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; };
  return { n: prem.length, avgAmt: Math.round(avg(amts)), avgPrem: Math.round(avg(prem.map(function (p) { return p.amt; }))),
           avgPct: Math.round(avg(prem.map(function (p) { return p.pct; })) * 10) / 10 };
}

// 우측 상세 패널 — 분양 섹션 (공고 + 주택형별 분양가). 대표 분양가·프리미엄 숫자는 패널 맨 위 카드에 있다
function renderPresaleSection(c) {
  if (!c.presale) return '';
  var d = c._bunyang;
  var wrap = function (body, badge) {
    return '<section class="dsec"><h3 class="dsec-title">분양 ' + (badge || '') + '</h3>' + body + '</section>';
  };
  var muted = function (t) { return '<div class="drow"><span class="dp-muted">' + t + '</span></div>'; };
  if (!d) return wrap(muted('청약홈 공고를 찾지 못해 최초 분양가를 표시할 수 없습니다'));
  var st = getBunyangStatus(d);
  var badge = '<span class="badge" style="background:' + st.bg + ';color:#fff">' + st.txt + '</span>';
  var head = '<div class="drow"><span class="dk">공고</span><span class="dv dp-addr">' + psEsc(d.HOUSE_NM || '-') + '</span></div>' +
    '<div class="drow"><span class="dk">모집공고</span><span class="dv">' + psEsc(d.RCRIT_PBLANC_DE || '-') + '</span></div>';   // 공급 세대는 '단지 정보'에 있다
  var url = APPLYHOME_URL.test(String(d.PBLANC_URL || '')) ? d.PBLANC_URL : '';
  var links = '<div class="drow dp-links">' + (url ? '<a href="' + psEsc(url) + '" target="_blank" rel="noopener">공고문</a>' : '') +
    '<a href="javascript:void(0)" onclick="openBunyangDetail(curComplex._bunyang)">분양 정보 전체</a></div>';
  if (!c._models) {
    return wrap(head + muted(c._modelsErr ? '분양가를 불러오지 못했습니다 (' + psEsc(c._modelsErr) + ')' : '주택형별 분양가 불러오는 중…') + links, badge);
  }
  var rep = c._initRep;
  var phTip = '평당 분양가가 대표 평형보다 ' + Math.round(PresaleCore.PH_PREMIUM * 100) + '% 이상 비싸고 세대가 공고의 ' +
    Math.round(PresaleCore.PH_SHARE * 100) + '% 미만 — 펜트하우스·최상층 특화로 보고 대표 분양가·프리미엄에서 제외';
  var rows = (rep ? rep.models : c._models).map(function (m) {
    var isRep = rep && rep.types.indexOf(m.label) !== -1 && !m.ph;
    return '<tr' + (m.ph ? ' class="ps-ph" title="' + phTip + '"' : isRep ? ' class="ps-rep" title="대표 평형"' : '') + '>' +
      '<td>' + psEsc(m.label) + (m.ph ? ' <span class="ps-x">PH</span>' : '') + '</td>' +
      '<td class="r">' + m.hh + '</td><td class="r">' + psMan(m.top) + '</td><td class="r">' + (m.ppy ? psMan(m.ppy) : '-') + '</td></tr>';
  }).join('');
  return wrap(head +
    '<table class="dp-tbl"><thead><tr><th>주택형</th><th class="r">세대</th><th class="r">분양가(만)</th><th class="r">평당(만)</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p class="dp-note">굵게 = 대표 평형 (' + (rep ? rep.groupLabel : '84㎡') + '), 흐리게 = PH 제외 (평당 +' + Math.round(PresaleCore.PH_PREMIUM * 100) +
    '% 이상 & 세대 ' + Math.round(PresaleCore.PH_SHARE * 100) + '% 미만). 분양가는 주택형별 최고가, 발코니 확장 별도.</p>' + links, badge);
}

// 거래표의 분양가·프리미엄 칸 (준공 전 단지에서만)
function presaleHeadCells(c) { return c && c.presale ? '<th class="r">분양가(만)</th><th class="r">프리미엄(만)</th>' : ''; }
function presaleRowCells(c, d) {
  if (!c || !c.presale) return '';
  var p = PresaleCore.premium(d.dealAmount, PresaleCore.matchModel(c._models || [], d.excluUseAr));
  if (!p) return '<td class="r">-</td><td class="r">-</td>';
  return '<td class="r">' + psMan(p.init) + '</td><td class="r" style="font-weight:600;color:' + (p.amt >= 0 ? '#6A2C00' : '#41548B') + '">' +
    psSigned(Math.round(p.amt / 10)) + ' <span style="font-weight:400;font-size:10px">(' + psSigned(p.pct) + '%)</span></td>';
}
