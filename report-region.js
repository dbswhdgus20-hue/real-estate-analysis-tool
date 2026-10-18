/* ══════════════════════════════════════════════════════════════
   분석 보고서 — 「가. 지역 시장 지표」 (반경에 걸친 시군구, 아파트, 5개년)
     1) 매매 가격 추이 (표 + 꺾은선)   2) 전월세 가격 추이 (표 + 꺾은선)
     3) 매매 거래량 증감 (표)           4) 인구·전입 지표 (표 — API 연동 전에는 틀만)
   계산은 RptCore.regionStats, 인구는 report-pop.js의 rptLoadPopulation이 채운다.
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
// 구마다 지표 여러 줄 — 첫 칸은 구 이름(행 병합)
function rgnRows(groups, metrics, region) {
  return groups.map(function (g) {
    return metrics.map(function (mt, i) {
      return '<tr' + (g.total ? ' class="rpt-total"' : '') + '>' +
        (i ? '' : '<th scope="rowgroup" rowspan="' + metrics.length + '" class="rpt-dong">' + rptEsc(g.name) + '</th>') +
        '<td>' + mt.label + '</td>' + region.years.map(function (y) { return mt.cell(g.byYear[y]); }).join('') + '</tr>';
    }).join('');
  }).join('');
}
function rgnGroups(region) { return region.gus.concat(region.gus.length > 1 ? [Object.assign({ total: true }, region.total)] : []); }

function rgnPriceTable(region, endYm) {
  return '<table class="rpt-table"><thead>' + rgnHead(region, endYm, ['시군구', '지표']) + '</thead><tbody>' +
    rgnRows(rgnGroups(region), [
      { label: '평균 거래가', cell: function (b) { return rgnCell(b.trade.avg); } },
      { label: '전용 3.3㎡당', cell: function (b) { return '<td class="num rpt-strong">' + rptN(b.trade.py) + '</td>'; } },
    ], region) + '</tbody></table>';
}
function rgnRentTable(region, endYm) {
  return '<table class="rpt-table"><thead>' + rgnHead(region, endYm, ['시군구', '지표 (건수)']) + '</thead><tbody>' +
    rgnRows(rgnGroups(region), [
      { label: '전세 보증금', cell: function (b) { return rgnCell(b.jeonse.avg, b.jeonse.cnt); } },
      { label: '월세 보증금', cell: function (b) { return rgnCell(b.wolse.dep, b.wolse.cnt); } },
      { label: '월세', cell: function (b) { return rgnCell(b.wolse.rent); } },
    ], region) + '</tbody></table>';
}
function rgnPct(v) { return v == null ? '-' : (v > 0 ? '+' : '') + v + '%'; }
function rgnVolumeTable(region, endYm) {
  return '<table class="rpt-table"><thead>' + rgnHead(region, endYm, ['시군구', '지표']) + '</thead><tbody>' +
    rgnRows(rgnGroups(region), [
      { label: '매매 건수', cell: function (b) { return '<td class="num rpt-strong">' + rptN(b.trade.cnt) + '</td>'; } },
      { label: '전년 대비', cell: function (b) { return '<td class="num">' + rgnPct(b.yoy) + (b.yoySame ? '<span class="rpt-n"> 동기</span>' : '') + '</td>'; } },
    ], region) + '</tbody></table>';
}
/* 인구 표 주석 — 화면·Excel·Word 공통 */
function rgnPopNotes(st) {
  if (st.pop && st.pop.loading) return ['인구·전입 지표를 받는 중이라 비어 있음 — 표가 채워진 뒤 다시 내려받으면 들어감.'];
  var names = {}; st.region.gus.forEach(function (g) { names[g.sgg] = g.name; });
  return PopCore.notes(st.pop, st.region.years, names);
}
/* 인구 표만 다시 그린다 (보고서를 먼저 띄운 뒤 받는 대로 채움 — 문안 입력칸은 건드리지 않는다) */
function rgnRefreshPop() {
  var box = document.getElementById('rgnPop');
  if (box && rptState && rptState.region) box.innerHTML = rgnPopTable(rptState);
}
function rgnPopTable(st) {
  var region = st.region, pop = st.pop, years = region.years;
  var loading = pop && pop.loading, connected = pop && !pop.error && !loading;
  var groups = region.gus.length ? region.gus : st.lawds.map(function (k) { return { sgg: k, name: k }; });
  var unitOf = function (k) { return connected && pop.meta && pop.meta.unit ? pop.meta.unit[k] : ''; };   // 일반구 → 시 단위 전입·전출
  var body = groups.map(function (g) {
    return RPT_POP_FIELDS.map(function (f, i) {
      return '<tr>' + (i ? '' : '<th scope="rowgroup" rowspan="' + RPT_POP_FIELDS.length + '" class="rpt-dong">' + rptEsc(g.name) + '</th>') +
        '<td>' + f.label + (unitOf(g.sgg) && /^move|^net/.test(f.k) ? '<span class="rpt-n"> (' + rptEsc(unitOf(g.sgg)) + ')</span>' : '') + '</td>' + years.map(function (y) {
          var src = connected ? pop : loading ? pop.partial : null;
          var v = src && src[g.sgg] && src[g.sgg][y] ? src[g.sgg][y][f.k] : null;
          return '<td class="num' + (connected || v != null ? '' : ' rpt-pending') + '">' + (v == null ? (connected ? '-' : loading ? '…' : pop && pop.error ? '-' : '연동 예정') : (f.k === 'popChg' || f.k === 'net' ? (v > 0 ? '+' : '') : '') + rptN(v)) + '</td>';
        }).join('') + '</tr>';
    }).join('');
  }).join('');
  return '<table class="rpt-table"><thead><tr><th>시군구</th><th>지표</th>' + years.map(function (y) { return '<th>' + y + '</th>'; }).join('') +
    '</tr></thead><tbody>' + body + '</tbody></table>' +
    '<p class="rpt-foot">' + (loading ? '행정안전부 주민등록 통계 받는 중' + (pop.total ? ' (' + pop.done + '/' + pop.total + ')' : '') +
        ' — 처음 보는 지역은 1~3분 걸리고, 한 번 받은 기간은 다음부터 바로 나옵니다.'
      : pop && pop.error ? '인구 지표를 불러오지 못했습니다: ' + rptEsc(pop.error) + '.'
      : rgnPopNotes(st).map(rptEsc).join('<br>')) + '</p>';
}

/* 꺾은선 — 구마다 한 줄, 끝점에 구 이름을 직접 붙이고 범례를 둔다. 점에 마우스를 올리면 값(<title>) */
function rgnLineChart(region, pick, opts) {
  var W = 640, H = 230, L = 64, R = 96, T = 14, B = 30, years = region.years;
  var series = region.gus.slice().sort(function (a, b) { return a.sgg.localeCompare(b.sgg); }).slice(0, RGN_COLORS.length)
    .map(function (g, i) { return { name: g.name, color: RGN_COLORS[i], pts: years.map(function (y) { return { y: y, v: pick(g.byYear[y]) }; }) }; });
  var vals = []; series.forEach(function (s) { s.pts.forEach(function (p) { if (p.v != null) vals.push(p.v); }); });
  if (!vals.length) return '<p class="rpt-empty">그래프로 그릴 값이 없습니다.</p>';
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = hi - lo || hi * 0.1 || 1;
  var step = Math.pow(10, Math.floor(Math.log10(span / 4))); [1, 2, 2.5, 5, 10].some(function (m) { if (span / (step * m) <= 5) { step *= m; return true; } return false; });
  var y0 = Math.floor((lo - span * 0.08) / step) * step, y1 = Math.ceil((hi + span * 0.08) / step) * step;
  var X = function (i) { return L + (W - L - R) * (years.length > 1 ? i / (years.length - 1) : 0.5); };
  var Y = function (v) { return T + (H - T - B) * (1 - (v - y0) / (y1 - y0)); };
  var g = '';
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
    if (last) g += '<text x="' + (X(years.indexOf(last.y)) + 8) + '" y="' + (Y(last.v) + 4) + '" font-size="11" fill="#333">' + rptEsc(s.name.split(' ').pop()) + '</text>';
  });
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

// 보고서 화면의 「가. 지역 시장 지표」 섹션 전체
function rgnSection(st) {
  var r = st.region, e = st.endYm, gus = r.gus.map(function (g) { return g.name; }).join(', ');
  return '<section><h2>가. 지역 시장 지표 — ' + rptEsc(gus || '반경 내 시군구') + ' (아파트, 최근 5개년)</h2>' +
    // rgn-keep: 소제목과 표를 PDF 한 쪽에 같이 둔다 (report-export.js의 pagebreak.avoid)
    '<div class="rgn-keep"><h3>1) 매매 가격 추이</h3>' + rgnPriceTable(r, e) + '</div>' + rgnPriceChart(r) +
    '<div class="rgn-keep"><h3>2) 전월세 가격 추이</h3>' + rgnRentTable(r, e) + '</div>' + rgnRentChart(r) +
    '<div class="rgn-keep"><h3>3) 매매 거래량 증감</h3>' + rgnVolumeTable(r, e) + '</div>' +
    '<div class="rgn-keep"><h3>4) 인구·전입 지표</h3><div id="rgnPop">' + rgnPopTable(st) + '</div></div>' +
    '<p class="rpt-foot">사업지 반경에 걸친 시군구 전체의 아파트 거래(분양권 제외, 해제거래 제외, ' + rptEsc(st.meta.direct) + '). ' +
    '전용 3.3㎡당 = 거래가 ÷ 전용면적(평)의 평균으로 공급면적 추정 없이 계산. 마지막 연도는 조회 시점까지의 값이며, 그 해의 전년 대비(동기)는 전년 같은 기간과 비교. 괄호는 건수.</p></section>';
}

/* ── Excel 시트 4장 ── */
function rgnSheets(st) {
  var r = st.region, ys = r.years, NUM = '#,##0', head = function (a, b) { return [a, b].concat(ys.map(function (y) { return rgnYearLabel(y, st.endYm); })); };
  var rows = function (title, unit, metrics) {
    var R = [[title], [unit], [], head('시군구', '지표')];
    rgnGroups(r).forEach(function (g) { metrics.forEach(function (mt, i) { R.push([i ? '' : g.name, mt[0]].concat(ys.map(function (y) { return mt[1](g.byYear[y]); }))); }); });
    return R;
  };
  var fmt = {}; ys.forEach(function (_, i) { fmt[i + 2] = NUM; });
  var w = [16, 16].concat(ys.map(function () { return 13; }));
  var pop = st.pop && !st.pop.error ? st.pop : null, P = [['인구·전입 지표'], ['단위 명·세대'], [], ['시군구', '지표'].concat(ys)];
  (r.gus.length ? r.gus : []).forEach(function (g) {
    RPT_POP_FIELDS.forEach(function (f, i) { P.push([i ? '' : g.name, f.label].concat(ys.map(function (y) { return pop && pop[g.sgg] && pop[g.sgg][y] ? pop[g.sgg][y][f.k] : null; }))); });
  });
  if (st.pop && st.pop.error) P.push([], ['불러오지 못함: ' + st.pop.error]);
  else { P.push([]); rgnPopNotes(st).forEach(function (t) { P.push([t]); }); }
  return [
    ['지역 매매', rptSheet(rows('아파트 매매 가격 추이 (최근 5개년)', '단위 천원 · 전용 3.3㎡당 = 거래가 ÷ 전용평 평균', [
      ['거래 건수', function (b) { return b.trade.cnt; }], ['평균 거래가', function (b) { return b.trade.avg; }], ['전용 3.3㎡당', function (b) { return b.trade.py; }]]), w, fmt)],
    ['지역 전월세', rptSheet(rows('아파트 전월세 가격 추이 (최근 5개년)', '단위 천원', [
      ['전세 건수', function (b) { return b.jeonse.cnt; }], ['전세 평균 보증금', function (b) { return b.jeonse.avg; }],
      ['월세 건수', function (b) { return b.wolse.cnt; }], ['월세 평균 보증금', function (b) { return b.wolse.dep; }], ['평균 월세', function (b) { return b.wolse.rent; }]]), w, fmt)],
    ['거래량 증감', rptSheet(rows('아파트 매매 거래량 증감 (최근 5개년)', '전년 대비 = 올해 건수 ÷ 전년 건수 − 1 (마지막 연도는 조회 시점까지)', [
      ['매매 건수', function (b) { return b.trade.cnt; }], ['전년 대비(%)', function (b) { return b.yoy; }], ['비교 기준', function (b) { return b.yoySame ? '전년 동기' : '전년 전체'; }]]), w, fmt)],
    ['인구 지표', rptSheet(P, w, fmt)],
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
      var cells = i ? [] : [k.cell(g.name, { center: true, bold: true, rowSpan: metrics.length })];
      rows.push(cells.concat([k.cell(mt[0])], ys.map(function (y) { return k.cell(mt[1](g.byYear[y]), { num: true, bold: !!g.total }); })));
    });
  });
  return k.table(['시군구', '지표'].concat(ys.map(function (y) { return rgnYearLabel(y, st.endYm); })), rows);
}
async function rgnDocxBody(k, st) {
  var r = st.region, H3 = function (t) { return k.para(t, { run: { bold: true, size: 19 }, spacing: { before: 160, after: 80 } }); };
  var chart = async function (markup) {
    if (markup.indexOf('<svg') === -1) return k.para('');
    var png = await rgnSvgToPng(markup.slice(markup.indexOf('<svg'), markup.indexOf('</svg>') + 6), 600);
    return new k.D.Paragraph({ children: [new k.D.ImageRun({ type: 'png', data: png, transformation: { width: 600, height: 216 } })], spacing: { before: 80, after: 80 } });
  };
  var cntOf = function (v, c) { return rptN(v) + (c ? ' (' + rptN(c) + ')' : ''); };
  var pop = st.pop && !st.pop.error ? st.pop : null;
  var popRows = [];
  r.gus.forEach(function (g) {
    RPT_POP_FIELDS.forEach(function (f, i) {
      var cells = i ? [] : [k.cell(g.name, { center: true, bold: true, rowSpan: RPT_POP_FIELDS.length })];
      popRows.push(cells.concat([k.cell(f.label)], r.years.map(function (y) {
        var v = pop && pop[g.sgg] && pop[g.sgg][y] ? pop[g.sgg][y][f.k] : null;
        return k.cell(v == null ? '-' : (f.k === 'popChg' || f.k === 'net') && v > 0 ? '+' + rptN(v) : rptN(v), { num: true });
      })));
    });
  });
  return [
    k.para('가. 지역 시장 지표 — ' + r.gus.map(function (g) { return g.name; }).join(', ') + ' (아파트, 최근 5개년)', { run: { bold: true, size: 22 }, spacing: { before: 280, after: 120 } }),
    H3('1) 매매 가격 추이 (천원)'),
    rgnDocxTable(k, st, [['평균 거래가', function (b) { return rptN(b.trade.avg); }], ['전용 3.3㎡당', function (b) { return rptN(b.trade.py); }]]),
    await chart(rgnPriceChart(r)),
    H3('2) 전월세 가격 추이 (천원, 괄호는 건수)'),
    rgnDocxTable(k, st, [['전세 보증금', function (b) { return cntOf(b.jeonse.avg, b.jeonse.cnt); }], ['월세 보증금', function (b) { return cntOf(b.wolse.dep, b.wolse.cnt); }],
      ['월세', function (b) { return rptN(b.wolse.rent); }]]),
    await chart(rgnRentChart(r)),
    H3('3) 매매 거래량 증감'),
    rgnDocxTable(k, st, [['매매 건수', function (b) { return rptN(b.trade.cnt); }], ['전년 대비', function (b) { return rgnPct(b.yoy) + (b.yoySame ? ' (동기)' : ''); }]]),
    H3('4) 인구·전입 지표'),
    popRows.length ? k.table(['시군구', '지표'].concat(r.years.map(String)), popRows) : k.para('-'),
  ].concat((st.pop && st.pop.error ? ['인구 지표를 불러오지 못함: ' + st.pop.error] : rgnPopNotes(st)).map(function (t, i) {
    return k.para(t, { run: { size: 16, color: '666666' }, spacing: { before: i ? 0 : 60 } });
  }));
}
