/* ══════════════════════════════════════════════════════════════
   심의 보고서 — 보고서 화면 · Excel · 인쇄 (report.js가 만든 rptState를 그린다)
   표 구성은 사전심의 자료를 따른다.
     가. 공동주택단지(입주 N년 내 + 전용 84㎡) 최근 3개년 실거래가격 평균
     나. 동별 평균과 순위
     다. 최근 3개년 분양권 실거래가격 평균
     라. 검토 문안 (자동 작성 → 고쳐 쓸 수 있음)
   ══════════════════════════════════════════════════════════════ */
function rptTitle(o) { return '공동주택단지(입주 ' + o.maxAge + '년 내 + 전용 ' + o.band + '㎡) 최근 3개년 실거래가격 평균'; }

function rptRatioCell(r) {
  if (r.ratio == null) return '<td class="num">-</td>';
  return '<td class="num' + (r.ratio >= RPT_RATIO_HI ? ' rpt-hi' : '') + '">' + r.ratio + '%</td>';
}

function rptTradeTable(rep, o) {
  var y = rep.years, head =
    '<tr><th>구분</th><th>No</th><th>단지명</th><th>세대수</th><th>준공</th>' +
    '<th>' + y[0] + '</th><th>' + y[1] + '</th><th>' + y[2] + '</th>' +
    '<th>' + rptYY(y[3]) + '가격</th><th>' + rptYY(y[3]) + '건수</th><th>본건대비</th></tr>';
  var body = '', seen = {};
  rep.rows.forEach(function (r) {
    var span = rep.rows.filter(function (x) { return x.dong === r.dong; }).length;
    var dongCell = seen[r.dong] ? '' : '<th scope="rowgroup" rowspan="' + span + '" class="rpt-dong">' + rptEsc(r.dong) + '</th>';
    seen[r.dong] = 1;
    body += '<tr>' + dongCell + '<td class="num">' + r.no + '</td><td>' + rptEsc(r.name) + '</td>' +
      '<td class="num">' + rptN(r.households) + '</td><td class="num">' + rptEsc(r.buildYear) + '</td>' +
      y.slice(0, 3).map(function (yy) { return '<td class="num">' + rptN(r.byYear[yy].avg) + '</td>'; }).join('') +
      '<td class="num rpt-strong">' + rptN(r.cur.avg) + '</td><td class="num">' + r.cur.cnt + '</td>' + rptRatioCell(r) + '</tr>';
  });
  if (!rep.rows.length) body = '<tr><td colspan="11" class="rpt-empty">조건에 맞는 단지가 없습니다. 기준 평형이나 준공 연수를 넓혀 보세요.</td></tr>';
  return '<table class="rpt-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
}

function rptDongTable(rep, meta) {
  var rows = rep.ranks.map(function (d) {
    var mine = d.dong === meta.dong ? ' class="rpt-mine"' : '';
    return '<tr' + mine + '><td class="num">' + d.rank + '</td><td>' + rptEsc(d.dong) + '</td><td class="num">' + d.complexes + '</td>' +
      '<td class="num">' + rptN(d.cnt) + '</td><td class="num">' + rptN(d.avg) + '</td><td class="num rpt-strong">@' + rptN(d.py) + '</td></tr>';
  }).join('');
  return '<table class="rpt-table rpt-narrow"><thead><tr><th>순위</th><th>법정동</th><th>단지 수</th><th>' + rep.summaryYear +
    '년 거래</th><th>평균 거래가</th><th>평당가</th></tr></thead><tbody>' + rows +
    '<tr class="rpt-total"><td></td><td>' + rptEsc(meta.scope) + '</td><td class="num">' + rep.gu.complexes + '</td><td class="num">' + rptN(rep.gu.cnt) +
    '</td><td class="num">' + rptN(rep.gu.avg) + '</td><td class="num rpt-strong">@' + rptN(rep.gu.py) + '</td></tr></tbody></table>';
}

function rptSilvTable(st) {
  if (st.silvErr) {
    var hint = kaptKeyError(st.silvErr) ? '공공데이터포털에서 「국토교통부_아파트 분양권전매 실거래가 자료」를 활용신청하면 채워집니다.'
      : '잠시 뒤 「조건 바꾸기」에서 다시 만들어 보세요.';
    return '<p class="rpt-empty">' + rptEsc(st.silvErr) + '<br>' + hint + '</p>';
  }
  var s = st.silv;
  if (!s) return '<p class="rpt-empty">분양권 실거래를 포함하지 않았습니다.</p>';
  if (!s.rows.length) return '<p class="rpt-empty">조건에 맞는 분양권 거래가 없습니다.</p>';
  var y = s.years;
  var body = s.rows.map(function (r) {
    var pc = r.premPct == null ? '-' : (r.premPct > 0 ? '+' : '') + r.premPct + '%';
    return '<tr><td class="num">' + r.no + '</td><td>' + rptEsc(r.name) + '</td><td>' + rptEsc(r.dong) + '</td>' +
      '<td class="num">' + rptN(r.notice && r.notice.hh) + '</td><td class="num">' + rptEsc((r.notice && r.notice.ym) || '-') + '</td>' +
      '<td class="num rpt-strong">' + rptN(r.init && r.init.price) + '</td>' +
      '<td class="num">' + rptN(r.byYear[y[0]].avg) + '</td><td class="num">' + rptN(r.byYear[y[1]].avg) + '</td>' +
      '<td class="num rpt-strong">' + rptN(r.cur.avg) + '</td><td class="num">' + r.cur.cnt + '</td>' +
      '<td class="num' + (r.premPct > 0 ? ' rpt-hi' : '') + '">' + pc + '</td></tr>';
  }).join('');
  var foot = y[2] + '년 분양권 평균' + (s.premAvg != null ? ' · 최초 분양가 대비 평균 ' + (s.premAvg > 0 ? '+' : '') + s.premAvg + '%' : '') +
    (s.ratio ? ' · 본건은 약 ' + s.ratio + '% 수준' : '');
  return '<table class="rpt-table"><thead><tr><th>No</th><th>단지명</th><th>법정동</th><th>세대수</th><th>분양</th><th>최초 분양가</th><th>' + y[0] + '</th><th>' + y[1] +
    '</th><th>' + rptYY(y[2]) + '가격</th><th>' + rptYY(y[2]) + '건수</th><th>분양가 대비</th></tr></thead><tbody>' + body +
    '<tr class="rpt-total"><td></td><td colspan="7">' + rptEsc(foot) + '</td><td class="num rpt-strong">' + rptN(s.cur.avg) + '</td><td class="num">' + s.cur.cnt +
    '</td><td></td></tr></tbody></table>' +
    '<p class="rpt-foot">최초 분양가 = 청약홈 공고의 대표 평형(전용 ' + rptState.o.band + '㎡, 없으면 세대가 가장 많은 평형) 주택형별 최고 분양가를 세대수로 가중 평균 ' +
    '(발코니 확장 별도). PH 제외 = 평당 분양가가 대표 평형보다 ' + Math.round(PresaleCore.PH_PREMIUM * 100) + '% 이상 비싸고 세대가 공고의 ' + Math.round(PresaleCore.PH_SHARE * 100) + '% 미만인 주택형. ' +
    '분양가 대비 = 최근 거래 평균 ÷ 최초 분양가 − 1. 세대수·분양 = 공고의 공급세대·모집공고 연월.</p>';
    '세대 이하 주택형 제외, 발코니 확장 별도). 분양가 대비 = 최근 거래 평균 ÷ 최초 분양가 − 1. 세대수·분양 = 공고의 공급세대·모집공고 연월.</p>';
}

function renderReport() {
  var st = rptState, o = st.o, m = st.meta, rep = st.rep, view = document.getElementById('rptView');
  var cond = m.scope + ' · 기준연도 ' + o.baseYear + ' · 평당가 = 평균가 ÷ ' + o.convPy + '평 · 해제거래 제외 · ' + m.direct + ' · 단위 천원';
  view.innerHTML =
    '<div class="rpt-bar" role="toolbar" aria-label="보고서 도구">' +
    '<strong>심의 보고서</strong><span class="rpt-bar-meta">' + rptEsc(m.site) + '</span>' +
    '<button type="button" class="hbtn" onclick="openReportDialog()">조건 바꾸기</button>' +
    '<button type="button" class="hbtn" id="rptPdfBtn" onclick="downloadReportPdf()">PDF 받기</button>' +
    '<button type="button" class="hbtn" id="rptDocxBtn" onclick="downloadReportDocx()">Word 받기</button>' +
    '<button type="button" class="hbtn" onclick="exportReportExcel()">Excel 받기</button>' +
    '<button type="button" class="hbtn" onclick="window.print()">인쇄</button>' +
    '<button type="button" class="hbtn hbtn-run" onclick="closeReport()">지도로 돌아가기</button></div>' +
    '<article class="rpt-doc">' +
    '<header><h1>인근 최근 3개년 실거래가격 등</h1><p class="rpt-cond">' + rptEsc(cond) + '</p>' +
    '<p class="rpt-cond">사업지 ' + rptEsc(m.site) + ' (' + rptEsc(m.dong) + ') · 분석일 ' + m.date +
    (o.unitPrice ? ' · 본건 세대당 분양가 ' + rptN(o.unitPrice) + '천원' : '') + '</p></header>' +
    st.notes.map(function (n) { return '<p class="rpt-warn">' + rptEsc(n) + '</p>'; }).join('') +
    '<section><h2>가. ' + rptEsc(rptTitle(o)) + '</h2>' + rptTradeTable(rep, o) +
    '<p class="rpt-foot">' + rep.years.slice(0, 3).join('·') + '년은 연평균, ' + rptYY(rep.years[3]) + '가격은 ' + rep.years[3] +
    '년 평균(조회 시점까지). 본건대비 = 최근 가격 ÷ 본건 세대당 분양가, ' + RPT_RATIO_HI + '% 이상 강조. 임대 단지는 제외.</p></section>' +
    '<section><h2>나. ' + rep.summaryYear + '년 법정동별 평균</h2>' + rptDongTable(rep, m) + '</section>' +
    '<section><h2>다. 최근 3개년 분양권 실거래가격 평균</h2>' + rptSilvTable(st) + '</section>' +
    '<section><h2>라. 검토 문안</h2><label class="rpt-sr" for="rptText">검토 문안 (고쳐 쓸 수 있음)</label>' +
    '<textarea id="rptText" class="rpt-text" rows="8">' + rptEsc(st.text.map(function (t) { return '- ' + t; }).join('\n\n')) + '</textarea>' +
    '<div id="rptPrintText" class="rpt-print-text" aria-hidden="true"></div>' +
    '<p class="rpt-foot">입지·브랜드 같은 정성 의견은 직접 덧붙이세요. Excel과 인쇄에는 고친 내용이 그대로 들어갑니다.</p></section>' +
    '</article>';
  view.hidden = false;
  document.body.classList.add('rpt-open');
  view.scrollTop = 0;
}
// 인쇄할 때는 고친 문안을 일반 글로 옮겨 찍는다 (textarea는 인쇄 시 늘어나지 않는다)
window.addEventListener('beforeprint', function () {
  var ta = document.getElementById('rptText'), out = document.getElementById('rptPrintText');
  if (ta && out) out.textContent = ta.value;
});
function closeReport() {
  var v = document.getElementById('rptView');
  if (v) v.hidden = true;
  document.body.classList.remove('rpt-open');
}

/* ── Excel ── 본건 분양가·환산평은 머리 칸에 두고 본건대비·평당가는 수식으로 참조한다 */
function rptSheet(rows, widths, fmt) {
  var plain = rows.map(function (r) { return r.map(function (c) { return c && typeof c === 'object' ? c.v : c; }); });
  var ws = XLSX.utils.aoa_to_sheet(plain);
  rows.forEach(function (r, ri) {
    r.forEach(function (c, ci) {
      var a = XLSX.utils.encode_cell({ r: ri, c: ci });
      if (!ws[a]) return;
      if (c && typeof c === 'object') { if (c.f) ws[a].f = c.f; if (c.z) ws[a].z = c.z; }
      else if (typeof c === 'number' && fmt[ci]) ws[a].z = fmt[ci];
    });
  });
  ws['!cols'] = widths.map(function (w) { return { wch: w }; });
  return ws;
}
function rptTradeSheet(st) {
  var rep = st.rep, o = st.o, y = rep.years, NUM = '#,##0';
  var R = [[rptTitle(o)], [st.meta.scope + ' · 기준연도 ' + o.baseYear + ' · 단위 천원 · 해제거래 제외 · ' + st.meta.direct],
    ['본건 세대당 분양가(천원)', o.unitPrice || null], [],
    ['구분', 'No', '단지명', '세대수', '준공', String(y[0]), String(y[1]), String(y[2]), rptYY(y[3]) + '가격', rptYY(y[3]) + '건수', '본건대비']];
  rep.rows.forEach(function (r) {
    var row = R.length + 1, latestCol = r.cur.cnt ? 'I' : r.byYear[y[2]].cnt ? 'H' : r.byYear[y[1]].cnt ? 'G' : 'F';
    R.push([r.dong, r.no, r.name, r.households, r.buildYear ? Number(r.buildYear) : '', r.byYear[y[0]].avg, r.byYear[y[1]].avg, r.byYear[y[2]].avg,
      r.cur.avg, r.cur.cnt,
      { v: r.ratio == null ? null : r.ratio / 100, f: 'IF(OR($B$3="",' + latestCol + row + '=""),"",' + latestCol + row + '/$B$3)', z: '0%' }]);
  });
  return rptSheet(R, [10, 5, 26, 8, 6, 12, 12, 12, 12, 8, 9], { 3: NUM, 5: NUM, 6: NUM, 7: NUM, 8: NUM });
}
function rptDongSheet(st) {
  var rep = st.rep, NUM = '#,##0';
  var R = [[rep.summaryYear + '년 법정동별 평균 (' + st.o.band + '타입, 준공 ' + st.o.maxAge + '년 내)'], ['단위 천원'],
    ['평당가 환산 공급평', st.o.convPy], [], ['순위', '법정동', '단지 수', '거래 건수', '평균 거래가', '평당가']];
  rep.ranks.concat([{ rank: '', dong: st.meta.scope, complexes: rep.gu.complexes, cnt: rep.gu.cnt, avg: rep.gu.avg, py: rep.gu.py }]).forEach(function (d) {
    var row = R.length + 1;
    R.push([d.rank, d.dong, d.complexes, d.cnt, d.avg, { v: d.py, f: 'IF(E' + row + '="","",ROUND(E' + row + '/$B$3,0))', z: NUM }]);
  });
  return rptSheet(R, [6, 22, 8, 10, 14, 12], { 3: NUM, 4: NUM });
}
function rptSilvSheet(st) {
  var R = [['최근 3개년 분양권 실거래가격 평균'], ['단위 천원']];
  if (!st.silv) { R.push([st.silvErr || '분양권 실거래를 포함하지 않았습니다.']); return rptSheet(R, [60], {}); }
  var y = st.silv.years;
  R.push([], ['No', '단지명', '법정동', '세대수', '분양', '최초 분양가', String(y[0]), String(y[1]), rptYY(y[2]) + '가격', rptYY(y[2]) + '건수', '분양가 대비']);
  st.silv.rows.forEach(function (r) {
    var row = R.length + 1, lat = r.cur.cnt ? 'I' : r.byYear[y[1]].cnt ? 'H' : 'G';
    R.push([r.no, r.name, r.dong, (r.notice && r.notice.hh) || null, (r.notice && r.notice.ym) || '', (r.init && r.init.price) || null,
      r.byYear[y[0]].avg, r.byYear[y[1]].avg, r.cur.avg, r.cur.cnt,
      { v: r.premPct == null ? null : r.premPct / 100, f: 'IF(OR(F' + row + '="",' + lat + row + '=""),"",' + lat + row + '/F' + row + '-1)', z: '0.0%' }]);
  });
  R.push(['', y[2] + '년 분양권 평균', '', '', '', '', '', '', st.silv.cur.avg, st.silv.cur.cnt, st.silv.premAvg == null ? null : { v: st.silv.premAvg / 100, z: '0.0%' }]);
  return rptSheet(R, [5, 26, 10, 8, 9, 13, 12, 12, 12, 8, 10], { 3: '#,##0', 5: '#,##0', 6: '#,##0', 7: '#,##0', 8: '#,##0' });
}
function exportReportExcel() {
  if (!rptState) return;
  if (typeof XLSX === 'undefined') { setStatus('err', 'Excel 라이브러리 로딩 중입니다. 잠시 후 다시 누르세요.'); return; }
  var ta = document.getElementById('rptText');
  var lines = (ta ? ta.value : rptState.text.join('\n')).split(/\n+/).filter(function (s) { return s.trim(); });
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, rptTradeSheet(rptState), '실거래 비교');
  XLSX.utils.book_append_sheet(wb, rptDongSheet(rptState), '동별 평균');
  XLSX.utils.book_append_sheet(wb, rptSilvSheet(rptState), '분양권');
  XLSX.utils.book_append_sheet(wb, rptSheet([['검토 문안']].concat(lines.map(function (l) { return [l]; })), [120], {}), '검토 문안');
  XLSX.writeFile(wb, rptFileBase() + '.xlsx');
  setStatus('ok', 'Excel 저장 완료 — 브라우저 다운로드 폴더의 ' + rptFileBase() + '.xlsx');
}
