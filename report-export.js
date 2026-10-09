/* ══════════════════════════════════════════════════════════════
   심의 보고서 — PDF · Word(.docx) 받기
   · PDF : 보고서 화면을 그대로 A4에 옮긴다 (html2pdf — 화면과 모양이 같다)
   · Word: 표·문단을 docx 문서로 새로 짠다 (받은 뒤 Word에서 고쳐 쓸 수 있다)
   라이브러리는 버튼을 처음 누를 때만 CDN에서 불러온다. 파일은 브라우저 기본 다운로드 폴더로 저장된다.
   ══════════════════════════════════════════════════════════════ */
var RPT_LIBS = {
  pdf: { src: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js', ready: function () { return typeof html2pdf !== 'undefined'; } },
  docx: { src: 'https://cdn.jsdelivr.net/npm/docx@9.0.2/build/index.umd.min.js', ready: function () { return typeof docx !== 'undefined'; } },
};
var RPT_FONT = '맑은 고딕';

function rptLoadLib(name) {
  var lib = RPT_LIBS[name];
  if (lib.ready()) return Promise.resolve();
  if (!lib.loading) {
    lib.loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = lib.src;
      s.onload = function () { lib.ready() ? resolve() : reject(new Error('라이브러리를 읽지 못했습니다')); };
      s.onerror = function () { lib.loading = null; reject(new Error('라이브러리를 받지 못했습니다 (인터넷 연결 확인)')); };
      document.head.appendChild(s);
    });
  }
  return lib.loading;
}
function rptFileBase() { return '심의보고서_' + (rptState.meta.dong || '사업지') + '_' + rptState.meta.date.replace(/\./g, ''); }
function rptCurrentText() {
  var ta = document.getElementById('rptText');
  return (ta ? ta.value : rptState.text.map(function (t) { return '- ' + t; }).join('\n\n'));
}
async function rptWithBusy(btnId, label, job) {
  var btn = document.getElementById(btnId), old = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = label; }
  try { await job(); }
  catch (e) { console.error(e); setStatus('err', '보고서 파일 만들기 실패: ' + e.message); }
  finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
}

/* ── PDF ── 화면 문서를 복제해 문안 입력칸을 일반 글로 바꾼 뒤 A4로 옮긴다 */
function downloadReportPdf() {
  if (!rptState) return;
  return rptWithBusy('rptPdfBtn', 'PDF 만드는 중…', async function () {
    await rptLoadLib('pdf');
    var src = document.querySelector('#rptView .rpt-doc');
    var doc = src.cloneNode(true);
    var ta = doc.querySelector('textarea'), pt = doc.querySelector('.rpt-print-text');
    if (ta) ta.remove();
    if (pt) { pt.textContent = rptCurrentText(); pt.style.display = 'block'; }
    doc.querySelectorAll('.rpt-sr').forEach(function (el) { el.remove(); });
    doc.classList.add('rpt-pdf');
    await html2pdf().set({
      margin: [10, 8, 12, 8],
      filename: rptFileBase() + '.pdf',
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'h2', '.rpt-cond'] },
    }).from(doc).save();
    setStatus('ok', 'PDF 저장 완료 — 브라우저 다운로드 폴더의 ' + rptFileBase() + '.pdf');
  });
}

/* ── Word ── */
function rptDocxKit() {
  var D = docx;
  function run(text, o) { return new D.TextRun(Object.assign({ text: String(text == null ? '' : text), font: RPT_FONT, size: 18 }, o || {})); }
  function para(text, o) {
    o = o || {};
    return new D.Paragraph({ children: [run(text, o.run)], alignment: o.align, spacing: o.spacing || { after: 60 }, heading: o.heading });
  }
  function cell(text, o) {
    o = o || {};
    return new D.TableCell({
      children: [para(text, { align: o.num ? D.AlignmentType.RIGHT : o.center ? D.AlignmentType.CENTER : D.AlignmentType.LEFT,
        run: { bold: !!o.bold, color: o.color, size: 17 }, spacing: { after: 0 } })],
      shading: o.fill ? { fill: o.fill, type: D.ShadingType.CLEAR, color: 'auto' } : undefined,
      rowSpan: o.rowSpan, verticalAlign: D.VerticalAlign.CENTER,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
    });
  }
  function table(head, rows) {
    var hr = new D.TableRow({ tableHeader: true, children: head.map(function (h) { return cell(h, { center: true, bold: true, fill: 'E6E6E6' }); }) });
    return new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [hr].concat(rows.map(function (r) { return new D.TableRow({ cantSplit: true, children: r }); })) });
  }
  return { D: D, run: run, para: para, cell: cell, table: table };
}
function rptDocxTrade(k, rep) {
  var y = rep.years, seen = {};
  var rows = rep.rows.map(function (r) {
    var cells = [];
    if (!seen[r.dong]) {
      seen[r.dong] = 1;
      cells.push(k.cell(r.dong, { center: true, bold: true, rowSpan: rep.rows.filter(function (x) { return x.dong === r.dong; }).length }));
    }
    return cells.concat([k.cell(r.no, { num: true }), k.cell(r.name), k.cell(rptN(r.households), { num: true }), k.cell(r.buildYear, { center: true }),
      k.cell(rptN(r.byYear[y[0]].avg), { num: true }), k.cell(rptN(r.byYear[y[1]].avg), { num: true }), k.cell(rptN(r.byYear[y[2]].avg), { num: true }),
      k.cell(rptN(r.cur.avg), { num: true, bold: true }), k.cell(r.cur.cnt, { num: true }),
      k.cell(r.ratio == null ? '-' : r.ratio + '%', { num: true, bold: r.ratio >= RPT_RATIO_HI, color: r.ratio >= RPT_RATIO_HI ? 'C00000' : undefined })]);
  });
  return k.table(['구분', 'No', '단지명', '세대수', '준공', String(y[0]), String(y[1]), String(y[2]), rptYY(y[3]) + '가격', rptYY(y[3]) + '건수', '본건대비'], rows);
}
function rptDocxDong(k, rep, meta) {
  var rows = rep.ranks.map(function (d) {
    var fill = d.dong === meta.dong ? 'E9F0F8' : undefined;
    return [k.cell(d.rank, { num: true, fill: fill }), k.cell(d.dong, { fill: fill }), k.cell(d.complexes, { num: true, fill: fill }),
      k.cell(rptN(d.cnt), { num: true, fill: fill }), k.cell(rptN(d.avg), { num: true, fill: fill }), k.cell('@' + rptN(d.py), { num: true, bold: true, fill: fill })];
  });
  rows.push([k.cell(''), k.cell(meta.scope, { bold: true }), k.cell(rep.gu.complexes, { num: true, bold: true }), k.cell(rptN(rep.gu.cnt), { num: true, bold: true }),
    k.cell(rptN(rep.gu.avg), { num: true, bold: true }), k.cell('@' + rptN(rep.gu.py), { num: true, bold: true })]);
  return k.table(['순위', '법정동', '단지 수', rep.summaryYear + '년 거래', '평균 거래가', '평당가'], rows);
}
function rptDocxSilv(k, st) {
  if (!st.silv) return k.para(st.silvErr || '분양권 실거래를 포함하지 않았습니다.', { run: { color: '666666' } });
  if (!st.silv.rows.length) return k.para('조건에 맞는 분양권 거래가 없습니다.', { run: { color: '666666' } });
  var s = st.silv, y = s.years;
  var rows = s.rows.map(function (r) {
    return [k.cell(r.no, { num: true }), k.cell(r.name), k.cell(r.dong), k.cell(rptN(r.byYear[y[0]].avg), { num: true }),
      k.cell(rptN(r.byYear[y[1]].avg), { num: true }), k.cell(rptN(r.cur.avg), { num: true, bold: true }), k.cell(r.cur.cnt, { num: true })];
  });
  rows.push([k.cell(''), k.cell(y[2] + '년 평균' + (s.ratio ? ' (본건 약 ' + s.ratio + '%)' : ''), { bold: true }), k.cell(''), k.cell(''), k.cell(''),
    k.cell(rptN(s.cur.avg), { num: true, bold: true }), k.cell(s.cur.cnt, { num: true, bold: true })]);
  return k.table(['No', '단지명', '법정동', String(y[0]), String(y[1]), rptYY(y[2]) + '가격', rptYY(y[2]) + '건수'], rows);
}
function rptDocxBody(k, st) {
  var o = st.o, m = st.meta, rep = st.rep, H = function (t) { return k.para(t, { run: { bold: true, size: 22 }, spacing: { before: 280, after: 120 } }); };
  var out = [
    k.para('인근 최근 3개년 실거래가격 등', { run: { bold: true, size: 32, color: '6A2C00' }, spacing: { after: 120 } }),
    k.para(m.scope + ' · 기준연도 ' + o.baseYear + ' · 평당가 = 평균가 ÷ ' + o.convPy + '평 · 해제거래 제외 · ' + m.direct + ' · 단위 천원', { run: { color: '666666' } }),
    k.para('사업지 ' + m.site + ' (' + m.dong + ') · 분석일 ' + m.date + (o.unitPrice ? ' · 본건 세대당 분양가 ' + rptN(o.unitPrice) + '천원' : ''), { run: { color: '666666' } }),
  ];
  st.notes.forEach(function (n) { out.push(k.para('※ ' + n, { run: { color: '41548B' } })); });
  out.push(H('가. ' + rptTitle(o)));
  out.push(rep.rows.length ? rptDocxTrade(k, rep) : k.para('조건에 맞는 단지가 없습니다.'));
  out.push(k.para(rep.years.slice(0, 3).join('·') + '년은 연평균, ' + rptYY(rep.years[3]) + '가격은 ' + rep.years[3] + '년 평균. 본건대비 = 최근 가격 ÷ 본건 세대당 분양가. 임대 단지 제외.',
    { run: { size: 16, color: '666666' }, spacing: { before: 60 } }));
  out.push(H('나. ' + rep.summaryYear + '년 법정동별 평균'));
  out.push(rptDocxDong(k, rep, m));
  out.push(H('다. 최근 3개년 분양권 실거래가격 평균'));
  out.push(rptDocxSilv(k, st));
  out.push(H('라. 검토 문안'));
  rptCurrentText().split(/\n+/).filter(function (l) { return l.trim(); })
    .forEach(function (l) { out.push(k.para(l, { run: { size: 20 }, spacing: { after: 120, line: 360 } })); });
  return out;
}
function downloadReportDocx() {
  if (!rptState) return;
  return rptWithBusy('rptDocxBtn', 'Word 만드는 중…', async function () {
    await rptLoadLib('docx');
    var k = rptDocxKit(), D = k.D;
    var doc = new D.Document({
      creator: '인근 실거래 분석', title: '심의 보고서',
      styles: { default: { document: { run: { font: RPT_FONT, size: 18 } } } },
      sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 800, right: 800 } } }, children: rptDocxBody(k, rptState) }],
    });
    var blob = await D.Packer.toBlob(doc);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = rptFileBase() + '.docx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    setStatus('ok', 'Word 저장 완료 — 브라우저 다운로드 폴더의 ' + rptFileBase() + '.docx');
  });
}
