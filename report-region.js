/* ══════════════════════════════════════════════════════════════
   분석 보고서 — 지역 지표 두 섹션 (반경에 걸친 시군구 + 사업지 법정동, 5개년)
     가. 인구·세대 (수요 기반)        — 인구·세대 증감, 순이동
     나. 주택 거래·가격 (시장 반응)   — 1) 매매 거래량  2) 매매 가격(표+꺾은선)  3) 전월세 가격(표+꺾은선)
   흐름: 사람이 늘고 줄어드는 것(수요) → 거래량 → 매매가 → 전월세 순으로 읽히게 둔다.
   계산은 RptCore.regionStats, 인구는 report-pop.js의 rptLoadPopulation이 채운다.
   region.gus의 dong:true 항목이 사업지 법정동(키 'dong')이다.
   판단 표현 없이 수치만 보여 준다. 색은 dataviz 검증(밝은 배경, CVD 분리) 통과 팔레트.
   ══════════════════════════════════════════════════════════════ */
var RGN_COLORS = ['#3756B0', '#C0702A', '#4A9BD9', '#8E3E14'];   // 구 순서대로 고정 (순위로 다시 칠하지 않는다)

function rgnYearLabel(y, endYm) {
  var e = String(endYm || '');
  return e.slice(0, 4) === String(y) && e.slice(4) !== '12' ? y + ' (1~' + parseInt(e.slice(4), 10) + '월)' : String(y);
}
function rgnCell(v, cnt) {
  return '<td class="num">' + rptN(v) + (cnt != null ? ' <span class="rpt-n">(' + rptN(cnt) + ')</span>' : '') + '</td>';
}
function rgnHead(region, endYm, first) {
  return '<tr><th>' + first[0] + '</th><th>' + first[1] + '</th>' + region.years.map(function (y) { return '<th>' + rgnYearLabel(y, endYm) + '</th>'; }).join('') + '</tr>';
}
function rgnGroupName(g) { return g.dong ? g.name + ' (사업지)' : g.name; }
function rgnGroupTh(g, span) {
  return '<th scope="rowgroup" rowspan="' + span + '" class="rpt-dong">' + rptEsc(g.name) +
    (g.dong ? '<br><span class="rpt-n">사업지 법정동</span>' : '') + '</th>';
}
// 구마다 지표 여러 줄 — 첫 칸은 구 이름(행 병합)
function rgnRows(groups, metrics, region) {
  return groups.map(function (g) {
    return metrics.map(function (mt, i) {
      return '<tr' + (g.total ? ' class="rpt-total"' : g.dong ? ' class="rpt-mine"' : '') + '>' + (i ? '' : rgnGroupTh(g, metrics.length)) +
        '<td>' + mt.label + '</td>' + region.years.map(function (y) { return mt.cell(g.byYear[y]); }).join('') + '</tr>';
    }).join('');
  }).join('');
}
// 시군구들 → (둘 이상이면) 합계 → 사업지 법정동
function rgnGroups(region) {
  var gus = region.gus.filter(function (g) { return !g.dong; }), dong = region.gus.filter(function (g) { return g.dong; });
  return gus.concat(gus.length > 1 ? [Object.assign({ total: true }, region.total)] : [], dong);
}

function rgnPriceTable(region, endYm) {
  return '<table class="rpt-table"><thead>' + rgnHead(region, endYm, ['지역', '지표']) + '</thead><tbody>' +
    rgnRows(rgnGroups(region), [
      { label: '평균 거래가', cell: function (b) { return rgnCell(b.trade.avg); } },
      { label: '전용 3.3㎡당', cell: function (b) { return '<td class="num rpt-strong">' + rptN(b.trade.py) + '</td>'; } },
    ], region) + '</tbody></table>';
}
function rgnRentTable(region, endYm) {
  return '<table class="rpt-table"><thead>' + rgnHead(region, endYm, ['지역', '지표 (건수)']) + '</thead><tbody>' +
    rgnRows(rgnGroups(region), [
      { label: '전세 보증금', cell: function (b) { return rgnCell(b.jeonse.avg, b.jeonse.cnt); } },
      { label: '월세 보증금', cell: function (b) { return rgnCell(b.wolse.dep, b.wolse.cnt); } },
      { label: '월세', cell: function (b) { return rgnCell(b.wolse.rent); } },
    ], region) + '</tbody></table>';
}
function rgnPct(v) { return v == null ? '-' : (v > 0 ? '+' : '') + v + '%'; }
function rgnVolumeTable(region, endYm) {
  return '<table class="rpt-table"><thead>' + rgnHead(region, endYm, ['지역', '지표']) + '</thead><tbody>' +
    rgnRows(rgnGroups(region), [
      { label: '매매 건수', cell: function (b) { return '<td class="num rpt-strong">' + rptN(b.trade.cnt) + '</td>'; } },
      { label: '전년 대비', cell: function (b) { return '<td class="num">' + rgnPct(b.yoy) + (b.yoySame ? '<span class="rpt-n"> 동기</span>' : '') + '</td>'; } },
    ], region) + '</tbody></table>';
}

/* ── 가. 인구·세대 ── */
// 인구 표의 줄 — 시군구들, 그다음 사업지 법정동 (거래가 없어도 인구는 보여 준다)
function rgnPopGroups(st) {
  var gus = st.region.gus.filter(function (g) { return !g.dong; });
  if (!gus.length) gus = st.lawds.map(function (k) { return { sgg: k, name: k }; });
  var dong = st.region.gus.filter(function (g) { return g.dong; })[0] || (st.meta.dong ? { sgg: 'dong', name: st.meta.dong, dong: true } : null);
  return gus.concat(dong ? [dong] : []);
}
function rgnPopNames(st) {
  var names = {};
  rgnPopGroups(st).forEach(function (g) { names[g.sgg] = rgnGroupName(g); });
  return names;
}
/* 인구 표 주석 — 화면·Excel·Word 공통 */
function rgnPopNotes(st) {
  if (st.pop && st.pop.loading) return ['인구·세대 지표를 받는 중이라 비어 있음 — 표가 채워진 뒤 다시 내려받으면 들어감.'];
  if (st.pop && st.pop.error) return ['인구 지표를 불러오지 못함: ' + st.pop.error];
  return PopCore.notes(st.pop, st.region.years, rgnPopNames(st));
}
function rgnPopValue(st, src, sgg, y, f) {
  var v = src && src[sgg] && src[sgg][y] ? src[sgg][y][f.k] : null;
  return v == null ? null : (f.sign && v > 0 ? '+' : '') + rptN(v);
}
/* 인구 표만 다시 그린다 (보고서를 먼저 띄운 뒤 받는 대로 채움 — 문안 입력칸은 건드리지 않는다) */
function rgnRefreshPop() {
  var box = document.getElementById('rgnPop');
  if (box && rptState && rptState.region) box.innerHTML = rgnPopTable(rptState);
}
function rgnPopTable(st) {
  var pop = st.pop, years = st.region.years;
  var loading = pop && pop.loading, connected = pop && !pop.error && !loading;
  var src = connected ? pop : loading ? pop.partial : null;
  var unitOf = function (k) { return src && src.meta && src.meta.unit ? src.meta.unit[k] : ''; };   // 일반구 → 시 단위 순이동
  var body = rgnPopGroups(st).map(function (g) {
    return RPT_POP_FIELDS.map(function (f, i) {
      var unit = f.k === 'net' && unitOf(g.sgg) ? '<span class="rpt-n"> (' + rptEsc(unitOf(g.sgg)) + ')</span>' : '';
      return '<tr' + (g.dong ? ' class="rpt-mine"' : '') + '>' + (i ? '' : rgnGroupTh(g, RPT_POP_FIELDS.length)) +
        '<td>' + f.label + unit + '</td>' + years.map(function (y) {
          var v = rgnPopValue(st, src, g.sgg, y, f);
          var wait = loading && v == null && !(g.dong && src && src.meta && (src.meta.dongError || f.k === 'net'));
          return '<td class="num' + (v == null && !connected ? ' rpt-pending' : '') + '">' + (v != null ? v : wait ? '…' : pop ? '-' : '연동 예정') + '</td>';
        }).join('') + '</tr>';
    }).join('');
  }).join('');
  return '<table class="rpt-table"><thead><tr><th>지역</th><th>지표</th>' + years.map(function (y) { return '<th>' + y + '</th>'; }).join('') +
    '</tr></thead><tbody>' + body + '</tbody></table>' +
    '<p class="rpt-foot">' + (loading ? '행정안전부 주민등록 통계 받는 중' + (pop.total ? ' (' + pop.done + '/' + pop.total + ')' : '') +
        ' — 처음 보는 지역은 1~3분 걸리고, 한 번 받은 기간은 다음부터 바로 나옵니다.'
      : rgnPopNotes(st).map(rptEsc).join('<br>')) + '</p>';
}

/* 꺾은선 — 지역마다 한 줄, 끝점에 이름을 직접 붙이고 범례를 둔다. 점에 마우스를 올리면 값(<title>) */
function rgnLineChart(region, pick, opts) {
  var W = 640, H = 230, L = 64, R = 96, T = 14, B = 30, years = region.years;
  var series = rgnGroups(region).filter(function (g) { return !g.total && !g.empty; }).slice(0, RGN_COLORS.length)
    .map(function (g, i) { return { name: rgnGroupName(g), tag: g.name.split(' ').pop(), color: RGN_COLORS[i], pts: years.map(function (y) { return { y: y, v: pick(g.byYear[y]) }; }) }; });
  var vals = []; series.forEach(function (s) { s.pts.forEach(function (p) { if (p.v != null) vals.push(p.v); }); });
  if (!vals.length) return '<p class="rpt-empty">그래프로 그릴 값이 없습니다.</p>';
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = hi - lo || hi * 0.1 || 1;
  var step = Math.pow(10, Math.floor(Math.log10(span / 4))); [1, 2, 2.5, 5, 10].some(function (m) { if (span / (step * m) <= 5) { step *= m; return true; } return false; });
  var y0 = Math.floor((lo - span * 0.08) / step) * step, y1 = Math.ceil((hi + span * 0.08) / step) * step;
  var X = function (i) { return L + (W - L - R) * (years.length > 1 ? i / (years.length - 1) : 0.5); };
  var Y = function (v) { return T + (H - T - B) * (1 - (v - y0) / (y1 - y0)); };
  var g = '', ends = [];
  for (var t = y0; t <= y1 + step / 2; t += step) {
    g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(t) + '" y2="' + Y(t) + '" stroke="#E6E6E6" stroke-width="1"/>' +
      '<text x="' + (L - 8) + '" y="' + (Y(t) + 4) + '" text-anchor="end" font-size="11" fill="#666">' + rptN(Math.round(t / opts.div)) + '</text>';
  }
  years.forEach(function (y, i) { g += '<text x="' + X(i) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="#666">' + y + '</text>'; });
  series.forEach(function (s) {
    var d = '', pen = false;
    s.pts.forEach(function (p, i) { if (p.v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.v).toFixed(1); pen = true; });
    g += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    s.pts.forEach(function (p, i) {
      if (p.v == null) return;
      g += '<circle cx="' + X(i) + '" cy="' + Y(p.v) + '" r="4" fill="' + s.color + '" stroke="#fff" stroke-width="2"><title>' +
        rptEsc(s.name) + ' ' + p.y + '년 ' + rptN(Math.round(p.v / opts.div)) + opts.unit + '</title></circle>';
    });
    var last = s.pts.filter(function (p) { return p.v != null; }).pop();
    if (last) ends.push({ x: X(years.indexOf(last.y)) + 8, y: Y(last.v) + 4, tag: s.tag });
  });
  // 끝 이름표가 겹치지 않게 위에서부터 13px 이상 벌린다
  ends.sort(function (a, b) { return a.y - b.y; }).forEach(function (e, i, a) { if (i && e.y - a[i - 1].y < 13) e.y = a[i - 1].y + 13; });
  ends.forEach(function (e) { g += '<text x="' + e.x + '" y="' + e.y + '" font-size="11" fill="#333">' + rptEsc(e.tag) + '</text>'; });
  var legend = series.length > 1 ? '<div class="rgn-legend">' + series.map(function (s) {
    return '<span><i style="background:' + s.color + '"></i>' + rptEsc(s.name) + '</span>';
  }).join('') + '</div>' : '';
  return '<figure class="rgn-chart"><figcaption>' + opts.title + ' <span>(' + opts.unit + ')</span></figcaption>' + legend +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + rptEsc(opts.title) + '" xmlns="http://www.w3.org/2000/svg" font-family="Malgun Gothic, sans-serif">' + g + '</svg></figure>';
}
function rgnPriceChart(region) {
  return rgnLineChart(region, function (b) { return b.trade.py; }, { title: '아파트 매매 전용 3.3㎡당 평균가', unit: '만원', div: 10 });
}
function rgnRentChart(region) {
  return rgnLineChart(region, function (b) { return b.jeonse.avg; }, { title: '아파트 전세 평균 보증금', unit: '만원', div: 10 });
}

function rgnAreaNames(st) {
  var gus = st.region.gus.filter(function (g) { return !g.dong; }).map(function (g) { return g.name; });
  return (gus.join(', ') || '반경 내 시군구') + (st.meta.dong ? ' · ' + st.meta.dong : '');
}
var RGN_TITLE_POP = '가. 인구·세대 — 수요 기반';
var RGN_TITLE_MKT = '나. 주택 거래·가격 — 시장 흐름';

// 보고서 화면의 가·나 섹션
// rgn-keep: 소제목과 표를 PDF 한 쪽에 같이 둔다 (report-export.js의 pagebreak.avoid)
function rgnSection(st) {
  var r = st.region, e = st.endYm;
  return '<section><h2>' + RGN_TITLE_POP + ' <span class="rpt-n">' + rptEsc(rgnAreaNames(st)) + ', 최근 5개년</span></h2>' +
    '<div class="rgn-keep"><div id="rgnPop">' + rgnPopTable(st) + '</div></div></section>' +
    '<section><h2>' + RGN_TITLE_MKT + ' <span class="rpt-n">아파트, 최근 5개년</span></h2>' +
    '<div class="rgn-keep"><h3>1) 매매 거래량 증감</h3>' + rgnVolumeTable(r, e) + '</div>' +
    '<div class="rgn-keep"><h3>2) 매매 가격 추이</h3>' + rgnPriceTable(r, e) + '</div>' + rgnPriceChart(r) +
    '<div class="rgn-keep"><h3>3) 전월세 가격 추이</h3>' + rgnRentTable(r, e) + '</div>' + rgnRentChart(r) +
    '<p class="rpt-foot">' + rgnMarketFoot(st) + '</p></section>';
}
function rgnMarketFoot(st) {
  var d = st.region.gus.filter(function (g) { return g.dong && g.empty; })[0];
  return (d ? d.name + '은 기간 중 준공 아파트 매매·전월세 거래가 없어 비움' + (d.presaleN ? ' (분양권 단지 ' + d.presaleN + '곳은 「마. 분양권」 표 참고)' : '') + '. ' : '') + '사업지 반경에 걸친 시군구 전체와 사업지 법정동의 아파트 거래(분양권 제외, 해제거래 제외, ' + rptEsc(st.meta.direct) + '). ' +
    '전용 3.3㎡당 = 거래가 ÷ 전용면적(평)의 평균으로 공급면적 추정 없이 계산. 마지막 연도는 조회 시점까지의 값이며, 그 해의 전년 대비(동기)는 전년 같은 기간과 비교. 괄호는 건수.';
}

/* ── Excel 시트 4장 (보고서 순서대로: 인구 → 거래량 → 매매 → 전월세) ── */
function rgnSheets(st) {
  var r = st.region, ys = r.years, NUM = '#,##0', head = function (a, b) { return [a, b].concat(ys.map(function (y) { return rgnYearLabel(y, st.endYm); })); };
  var rows = function (title, unit, metrics) {
    var R = [[title], [unit], [], head('지역', '지표')];
    rgnGroups(r).forEach(function (g) { metrics.forEach(function (mt, i) { R.push([i ? '' : rgnGroupName(g), mt[0]].concat(ys.map(function (y) { return mt[1](g.byYear[y]); }))); }); });
    return R;
  };
  var fmt = {}; ys.forEach(function (_, i) { fmt[i + 2] = NUM; });
  var w = [18, 16].concat(ys.map(function () { return 13; }));
  var pop = st.pop && !st.pop.error && !st.pop.loading ? st.pop : null;
  var P = [[RGN_TITLE_POP], ['단위 명·세대'], [], ['지역', '지표'].concat(ys)];
  rgnPopGroups(st).forEach(function (g) {
    RPT_POP_FIELDS.forEach(function (f, i) {
      P.push([i ? '' : rgnGroupName(g), f.label].concat(ys.map(function (y) { return pop && pop[g.sgg] && pop[g.sgg][y] ? pop[g.sgg][y][f.k] : null; })));
    });
  });
  P.push([]); rgnPopNotes(st).forEach(function (t) { P.push([t]); });
  return [
    ['인구·세대', rptSheet(P, w, fmt)],
    ['거래량 증감', rptSheet(rows('아파트 매매 거래량 증감 (최근 5개년)', '전년 대비 = 올해 건수 ÷ 전년 건수 − 1 (마지막 연도는 조회 시점까지)', [
      ['매매 건수', function (b) { return b.trade.cnt; }], ['전년 대비(%)', function (b) { return b.yoy; }], ['비교 기준', function (b) { return b.yoySame ? '전년 동기' : '전년 전체'; }]]), w, fmt)],
    ['지역 매매', rptSheet(rows('아파트 매매 가격 추이 (최근 5개년)', '단위 천원 · 전용 3.3㎡당 = 거래가 ÷ 전용평 평균', [
      ['거래 건수', function (b) { return b.trade.cnt; }], ['평균 거래가', function (b) { return b.trade.avg; }], ['전용 3.3㎡당', function (b) { return b.trade.py; }]]), w, fmt)],
    ['지역 전월세', rptSheet(rows('아파트 전월세 가격 추이 (최근 5개년)', '단위 천원', [
      ['전세 건수', function (b) { return b.jeonse.cnt; }], ['전세 평균 보증금', function (b) { return b.jeonse.avg; }],
      ['월세 건수', function (b) { return b.wolse.cnt; }], ['월세 평균 보증금', function (b) { return b.wolse.dep; }], ['평균 월세', function (b) { return b.wolse.rent; }]]), w, fmt)],
  ];
}

/* ── Word ── 표와 그래프(PNG로 바꿔 넣는다) */
/* SVG 꺾은선을 흰 바탕 PNG 캔버스로 — Word에는 바이트로, PDF에는 그림으로 넣는다
   (html2canvas는 width="100%"인 SVG를 확대해 잘라 그린다 → PDF도 그림으로 바꿔 넣는다) */
async function rgnSvgCanvas(svgMarkup, width) {
  var h = Math.round(width * 230 / 640);
  var svg = svgMarkup.replace('width="100%"', 'width="' + width + '" height="' + h + '"');
  var img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try { await new Promise(function (ok, bad) { img.onload = ok; img.onerror = function () { bad(new Error('그래프 변환 실패')); }; img.src = url; }); }
  finally { URL.revokeObjectURL(url); }
  var c = document.createElement('canvas'); c.width = width * 2; c.height = h * 2;
  var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
async function rgnSvgToPng(svgMarkup, width) {
  var c = await rgnSvgCanvas(svgMarkup, width);
  var b = await new Promise(function (ok) { c.toBlob(ok, 'image/png'); });
  return new Uint8Array(await b.arrayBuffer());
}
async function rgnSvgToImages(root) {
  var svgs = Array.prototype.slice.call(root.querySelectorAll('.rgn-chart svg'));
  for (var i = 0; i < svgs.length; i++) {
    var img = document.createElement('img');
    img.src = (await rgnSvgCanvas(svgs[i].outerHTML, 640)).toDataURL('image/png');
    img.style.cssText = 'display:block;width:100%;max-width:640px';
    svgs[i].replaceWith(img);
  }
}
function rgnDocxTable(k, st, metrics) {
  var r = st.region, ys = r.years, rows = [];
  rgnGroups(r).forEach(function (g) {
    metrics.forEach(function (mt, i) {
      var cells = i ? [] : [k.cell(rgnGroupName(g), { center: true, bold: true, rowSpan: metrics.length })];
      rows.push(cells.concat([k.cell(mt[0])], ys.map(function (y) { return k.cell(mt[1](g.byYear[y]), { num: true, bold: !!g.total }); })));
    });
  });
  return k.table(['지역', '지표'].concat(ys.map(function (y) { return rgnYearLabel(y, st.endYm); })), rows);
}
async function rgnDocxBody(k, st) {
  var r = st.region;
  var H2 = function (t) { return k.para(t, { run: { bold: true, size: 22 }, spacing: { before: 280, after: 120 } }); };
  var H3 = function (t) { return k.para(t, { run: { bold: true, size: 19 }, spacing: { before: 160, after: 80 } }); };
  var note = function (t, i) { return k.para(t, { run: { size: 16, color: '666666' }, spacing: { before: i ? 0 : 60 } }); };
  var chart = async function (markup) {
    if (markup.indexOf('<svg') === -1) return k.para('');
    var png = await rgnSvgToPng(markup.slice(markup.indexOf('<svg'), markup.indexOf('</svg>') + 6), 600);
    return new k.D.Paragraph({ children: [new k.D.ImageRun({ type: 'png', data: png, transformation: { width: 600, height: 216 } })], spacing: { before: 80, after: 80 } });
  };
  var cntOf = function (v, c) { return rptN(v) + (c ? ' (' + rptN(c) + ')' : ''); };
  var pop = st.pop && !st.pop.error && !st.pop.loading ? st.pop : null;
  var popRows = [];
  rgnPopGroups(st).forEach(function (g) {
    RPT_POP_FIELDS.forEach(function (f, i) {
      var cells = i ? [] : [k.cell(rgnGroupName(g), { center: true, bold: true, rowSpan: RPT_POP_FIELDS.length })];
      popRows.push(cells.concat([k.cell(f.label)], r.years.map(function (y) {
        var v = rgnPopValue(st, pop, g.sgg, y, f);
        return k.cell(v == null ? '-' : v, { num: true });
      })));
    });
  });
  return [
    H2(RGN_TITLE_POP + ' (' + rgnAreaNames(st) + ', 최근 5개년)'),
    popRows.length ? k.table(['지역', '지표'].concat(r.years.map(String)), popRows) : k.para('-'),
  ].concat(rgnPopNotes(st).map(note), [
    H2(RGN_TITLE_MKT + ' (아파트, 최근 5개년)'),
    H3('1) 매매 거래량 증감'),
    rgnDocxTable(k, st, [['매매 건수', function (b) { return rptN(b.trade.cnt); }], ['전년 대비', function (b) { return rgnPct(b.yoy) + (b.yoySame ? ' (동기)' : ''); }]]),
    H3('2) 매매 가격 추이 (천원)'),
    rgnDocxTable(k, st, [['평균 거래가', function (b) { return rptN(b.trade.avg); }], ['전용 3.3㎡당', function (b) { return rptN(b.trade.py); }]]),
    await chart(rgnPriceChart(r)),
    H3('3) 전월세 가격 추이 (천원, 괄호는 건수)'),
    rgnDocxTable(k, st, [['전세 보증금', function (b) { return cntOf(b.jeonse.avg, b.jeonse.cnt); }], ['월세 보증금', function (b) { return cntOf(b.wolse.dep, b.wolse.cnt); }],
      ['월세', function (b) { return rptN(b.wolse.rent); }]]),
    await chart(rgnRentChart(r)),
    note(rgnMarketFoot(st).replace(/&amp;/g, '&'), 0),
  ]);
}
