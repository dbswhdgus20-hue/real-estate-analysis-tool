/* ══════════════════════════════════════════════════════════════
   우측 상세 패널 — 단지 하나를 한눈에
     ① 핵심 숫자 (2×2)  ② 단지 정보  ③ 분양 (공고·최초 분양가)  ④ 평형별  ⑤ 전월세  ⑥ 상세(접힘)
   예전 패널은 같은 값이 여러 섹션에 겹쳐 있었다 (세대수·준공 ↔ 건축개요, 평균 전세가 ↔ 전월세,
   면적 정보 ↔ 타입별 구성, 분양 공고 ↔ 최초 분양가). 값마다 한 곳에만 둔다.
   index.html 전역(curComplex, supplyOf, pyPrice, applyAF, afActive, buildingRows, lotCell, geoSrcCell,
   roadAddr, getBunyangStatus, openBunyangDetail, fmt, ym)과 presale.js(renderPresaleSection)를 쓴다.
   ══════════════════════════════════════════════════════════════ */
function dpEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function dpMan(d) { return parseInt(String(d.dealAmount || d.deposit || '0').replace(/[^0-9]/g, ''), 10) || 0; }
function dpAvg(a) { return a.length ? Math.round(a.reduce(function (s, x) { return s + x; }, 0) / a.length) : 0; }
function dpEok(man) { return !man ? '-' : man >= 10000 ? (man / 10000).toFixed(man >= 100000 ? 1 : 2).replace(/\.?0+$/, '') + '억' : fmt(man) + '만'; }
function dpDate(d) { return d.dealYear + '.' + String(d.dealMonth || '').padStart(2, '0') + '.' + String(d.dealDay || '').padStart(2, '0'); }
function dpRow(k, v, cls) { return v ? '<div class="drow"><span class="dk">' + k + '</span><span class="dv' + (cls ? ' ' + cls : '') + '">' + v + '</span></div>' : ''; }
function dpSec(title, body, badge) {
  return body ? '<section class="dsec"><h3 class="dsec-title">' + title + (badge ? ' ' + badge : '') + '</h3>' + body + '</section>' : '';
}
function dpTrades(c) { return afActive() ? applyAF(c.trades) : c.trades; }

/* ① 핵심 숫자 — 라벨과 같은 값(면적 필터 반영)을 맨 위에 */
function dpKpis(c) {
  var tr = dpTrades(c), amts = tr.map(dpMan).filter(Boolean), avg = dpAvg(amts);
  var py = pyPrice(c, tr), basis = c.type === '오피스텔' ? '전용' : '공급';
  var last = tr.slice().sort(function (a, b) { return dpDate(b).localeCompare(dpDate(a)); })[0];
  var cards = [
    [c.presale ? '분양권 평균' : '평균 거래가', dpEok(avg), amts.length ? '최저 ' + dpEok(Math.min.apply(null, amts)) + ' · 최고 ' + dpEok(Math.max.apply(null, amts)) : ''],
    ['평당가 (' + basis + ')', py ? fmt(py.v) + '만' : '-', py && py.est ? '공급면적 추정 포함' : ''],
  ];
  if (c.presale && c._initRep) {
    var st = typeof presaleTradeStats === 'function' ? presaleTradeStats(c) : null;
    cards.push(['최초 분양가 (' + c._initRep.groupLabel + ')', dpEok(Math.round(c._initRep.price / 10)), '평당 ' + fmt(Math.round(c._initRep.py / 10)) + '만']);
    cards.push(['프리미엄', st ? (st.avgPct > 0 ? '+' : '') + st.avgPct + '%' : '-', st ? (st.avgPrem >= 0 ? '+' : '') + dpEok(Math.round(st.avgPrem / 10)) + ' · ' + st.n + '건' : '']);
  } else {
    var js = c.rents.filter(function (d) { return d._rt === '전세'; }).map(dpMan).filter(Boolean), jAvg = dpAvg(js);
    cards.push(['거래', tr.length + '건', last ? '최근 ' + dpDate(last) : '']);
    cards.push(['전세가율', avg && jAvg ? Math.round(jAvg / avg * 100) + '%' : '-', jAvg ? '전세 평균 ' + dpEok(jAvg) : '']);
  }
  return '<div class="dp-kpis">' + cards.map(function (k) {
    return '<div class="dp-kpi"><span class="dp-kpi-k">' + k[0] + '</span><strong class="dp-kpi-v">' + k[1] + '</strong>' +
      (k[2] ? '<span class="dp-kpi-s">' + k[2] + '</span>' : '') + '</div>';
  }).join('') + '</div>' + (afActive() ? '<p class="dp-note">면적 필터가 적용된 값</p>' : '');
}

/* ② 단지 정보 — 기본 정보와 건축개요를 합쳐 값마다 한 번만 */
function dpInfo(c) {
  var b = c._bld && typeof c._bld === 'object' ? c._bld : null, n = c._bunyang;
  var hh = (b && b.hhld) || Number(c.kaptCnt) || (c.presale && n && Number(n.TOT_SUPLY_HSHLDCO)) || 0;
  var built = c.presale
    ? (n && n.MVN_PREARNGE_YM ? String(n.MVN_PREARNGE_YM).replace(/^(\d{4})(\d{2})$/, '$1.$2') + ' 입주예정' : '미준공')
    : (b && (ym(b.aprLast) || ym(b.aprFirst))) || (c.buildYear ? c.buildYear + '년' : '');
  var scale = b ? [b.dongs ? b.dongs + '개동' : '', b.flrUp ? '최고 ' + b.flrUp + '층' : ''].filter(Boolean).join(' · ') : '';
  var sale = c.type === '아파트' && !c.presale && c.saleType ? c.saleType : '';
  var type = '<span class="badge ' + (c.type === '아파트' ? 'b-apt' : 'b-oft') + '">' + c.type + '</span>' +
    (c.presale ? ' <span class="badge b-presale">준공 전 · 분양권</span>' : '') + (sale && sale !== '분양' ? ' <span class="badge b-warn">' + dpEsc(sale) + '</span>' : '');
  var dist = c.dist == null ? '' : c.dist >= 1000 ? (c.dist / 1000).toFixed(1) + 'km' : c.dist + 'm';
  var addr = c.roadText ? roadAddr(c) : (c.dong + (c.jibunTxt ? ' ' + c.jibunTxt : ''));
  var bldNote = c.presale ? '' : c._bld === 'loading' ? '<span class="badge b-quiet">대장 조회 중</span>' : '';
  return dpSec('단지 정보',
    dpRow('유형', type) + dpRow('세대', hh ? fmt(hh) + '세대' + (sale === '분양' ? ' · 분양' : '') : '') + dpRow(c.presale ? '입주' : '준공', built) +
    dpRow('규모', scale) + dpRow('사업지 거리', dist ? '<span class="badge b-dist">' + dist + '</span>' : '') +
    dpRow('주소', addr ? '<span class="dp-addr">' + dpEsc(addr) + '</span>' : ''), bldNote);
}

/* ③ 분양 — 준공 전 단지는 presale.js의 공고·최초 분양가, 준공 단지에 붙은 공고는 요약만 */
function dpSale(c) {
  if (c.presale && typeof renderPresaleSection === 'function') return renderPresaleSection(c);
  var d = c._bunyang;
  if (!d) return '';
  var st = getBunyangStatus(d);
  var url = /^https:\/\/www\.applyhome\.co\.kr\//.test(String(d.PBLANC_URL || '')) ? d.PBLANC_URL : '';
  return dpSec('분양 공고', dpRow('공고', dpEsc(d.HOUSE_NM || '-')) +
    dpRow('모집공고', dpEsc(d.RCRIT_PBLANC_DE || '')) + dpRow('공급', d.TOT_SUPLY_HSHLDCO ? fmt(Number(d.TOT_SUPLY_HSHLDCO)) + '세대' : '') +
    '<div class="drow dp-links">' + (url ? '<a href="' + dpEsc(url) + '" target="_blank" rel="noopener">공고문</a>' : '') +
    '<a href="javascript:void(0)" onclick="openBunyangDetail(curComplex._bunyang)">분양 정보 전체</a></div>',
    '<span class="badge" style="background:' + st.bg + ';color:#fff">' + st.txt + '</span>');
}

/* ④ 평형별 — 전용면적 정수부로 묶어 공급평·건수·평균가·평당가를 한 표에 (예전 '면적 정보'+'타입별 구성') */
function dpTypes(c) {
  var g = {};
  dpTrades(c).forEach(function (d) {
    var a = parseFloat(d.excluUseAr || '0');
    if (a > 0) (g[Math.floor(a)] = g[Math.floor(a)] || []).push(d);
  });
  var keys = Object.keys(g).map(Number).sort(function (a, b) { return a - b; });
  if (!keys.length) return '';
  var srcs = {};
  var rows = keys.map(function (k) {
    var list = g[k], ars = list.map(function (d) { return parseFloat(d.excluUseAr); }).sort(function (a, b) { return a - b; });
    var rep = ars[Math.floor(ars.length / 2)], sp = c.type === '오피스텔' ? null : supplyOf(c, rep);
    if (sp) srcs[sp.src] = 1;
    var avg = dpAvg(list.map(dpMan).filter(Boolean)), py = pyPrice(c, list);
    return '<tr><td>' + k + '㎡</td><td class="r">' + (c.type === '오피스텔' ? (rep / 3.3058).toFixed(1) : sp ? Number(sp.supplyPy).toFixed(1) : '-') + '</td>' +
      '<td class="r">' + list.length + '</td><td class="r">' + dpEok(avg) + '</td><td class="r">' + (py ? fmt(py.v) : '-') + '</td></tr>';
  }).join('');
  var led = c._ledger && typeof c._ledger === 'object' ? c._ledger : null;
  var src = c.type === '오피스텔' ? '<span class="badge b-quiet">전용 기준</span>'
    : srcs.ledger ? '<span class="badge b-apt" title="건축물대장 ' + (led ? led.ho.toLocaleString() + '호' : '') + ' 실측">공급 대장</span>'
    : srcs.notice ? '<span class="badge b-apt" title="청약홈 공고의 주택형별 공급면적">공급 분양공고</span>'
    : '<span class="badge b-est" title="건축년도별 전용률로 추정">공급 추정</span>';
  return dpSec('평형별', '<table class="dp-tbl"><thead><tr><th>평형</th><th class="r">' + (c.type === '오피스텔' ? '전용평' : '공급평') +
    '</th><th class="r">건수</th><th class="r">평균가</th><th class="r">평당(만)</th></tr></thead><tbody>' + rows + '</tbody></table>', src);
}

/* ⑤ 전월세 — 있을 때만 */
function dpRents(c) {
  if (!c.rents.length) return '';
  var j = c.rents.filter(function (d) { return d._rt === '전세'; }), w = c.rents.filter(function (d) { return d._rt === '월세'; });
  var wr = w.map(function (d) { return parseInt(String(d.monthlyRent || '0').replace(/[^0-9]/g, ''), 10) || 0; }).filter(Boolean);
  return dpSec('전월세',
    dpRow('전세', j.length ? j.length + '건 · 평균 ' + dpEok(dpAvg(j.map(dpMan).filter(Boolean))) : '') +
    dpRow('월세', w.length ? w.length + '건 · 보증금 ' + dpEok(dpAvg(w.map(dpMan).filter(Boolean))) + ' / 월 ' + fmt(dpAvg(wr)) + '만' : ''));
}

/* ⑥ 상세 — 확인용 자료는 접어 둔다 */
function dpMore(c) {
  var rows = dpRow('지번', lotCell(c)) + dpRow('단지 고유번호', c.aptSeq ? dpEsc(c.aptSeq) : '') + dpRow('좌표 출처', geoSrcCell(c));
  buildingRows(c, false).forEach(function (r) {
    if (r[0] === '준공' || r[0] === '규모') return;          // 위 '단지 정보'에 있다
    rows += dpRow(r[0], dpEsc(r[1]));
  });
  var led = c._ledger && typeof c._ledger === 'object';
  if (led) {
    var top = c.trades[0] && supplyOf(c, c.trades[0].excluUseAr);
    if (top && top.src === 'ledger') rows += dpRow('실측 전용률', top.ratio + '%') + dpRow('계약면적', top.contract + '㎡');
  }
  return '<details class="dp-more"><summary>상세 · 건축물대장</summary>' + rows + '</details>';
}

function renderDetail() {
  if (!curComplex) return;
  var c = curComplex;
  document.getElementById('detailPanel').classList.add('open');
  relayoutMap();
  document.getElementById('dpTitle').textContent = c.name;
  document.getElementById('dpSub').textContent = c.dong + (c.dist != null ? ' · 사업지 ' + (c.dist >= 1000 ? (c.dist / 1000).toFixed(1) + 'km' : c.dist + 'm') : '');
  var body = document.getElementById('dpBody'), keep = body.querySelector('.dp-more[open]');
  body.innerHTML = dpKpis(c) + dpInfo(c) + dpSale(c) + dpTypes(c) + dpRents(c) + dpMore(c);
  if (keep) body.querySelector('.dp-more').open = true;     // 다시 그려도 펼친 상태 유지
}
