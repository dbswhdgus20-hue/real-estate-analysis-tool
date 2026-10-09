/* ══════════════════════════════════════════════════════════════
   심의 보고서 — 화면·수집·내보내기
   계산은 report-core.js(RptCore)가 맡고, 여기서는
     ① 조건 입력 창  ② 필요한 기간의 실거래 확보(모자라면 기간을 맞춰 다시 분석)
     ③ 세대수(K-apt)·분양권 실거래 보충  ④ 보고서 화면  ⑤ Excel·인쇄
   를 처리한다. index.html의 전역(runAnalysis, lastRun, lastAllComplexes,
   allComplexes, fetchAllItems, kaptList, kaptBasic …)을 그대로 쓴다.
   ══════════════════════════════════════════════════════════════ */
var RPT_LS = 'kirt.rpt.opts.v1';
var RPT_RATIO_HI = 90;          // 본건대비 강조 기준(%) — 심의자료의 빨간 글씨
var rptState = null;            // 마지막으로 만든 보고서 {rep, silv, silvErr, text, o, meta}
var rptBusy = false;

function rptEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function rptN(v) { return v == null || v === '' ? '-' : Number(v).toLocaleString('ko-KR'); }
function rptYY(y) { return "'" + String(y).slice(2); }
function rptNowYm() { var d = new Date(); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0'); }

function rptDefaults() {
  return { band: 84, convPy: 34, maxAge: 15, baseYear: new Date().getFullYear(), scope: 'gu',
           unitPrice: '', unitPy: '', silv: true, households: true };
}
function rptLoadOpts() {
  try { var v = JSON.parse(localStorage.getItem(RPT_LS) || 'null'); if (v) return Object.assign(rptDefaults(), v, { baseYear: rptDefaults().baseYear }); }
  catch (e) { /* 저장값이 없거나 읽기 차단 — 기본값 사용 */ }
  return rptDefaults();
}
function rptSaveOpts(o) { try { localStorage.setItem(RPT_LS, JSON.stringify(o)); } catch (e) { /* 저장 실패는 무시해도 동작에 지장 없음 */ } }

/* ── ① 조건 입력 창 ── */
function rptEnsureDom() {
  if (document.getElementById('rptDialog')) return;
  var cy = new Date().getFullYear(), years = '';
  for (var y = cy; y >= cy - 5; y--) years += '<option value="' + y + '">' + y + '년</option>';
  var bands = Object.keys(RptCore.BANDS).map(function (b) { return '<option value="' + b + '">전용 ' + b + '㎡ (' + b + '타입)</option>'; }).join('');
  var wrap = document.createElement('div');
  wrap.innerHTML =
    '<dialog id="rptDialog" class="rpt-dialog" aria-labelledby="rptDlgTitle">' +
    '<form method="dialog" id="rptForm" class="rpt-form">' +
    '<h2 id="rptDlgTitle">심의 보고서 만들기</h2>' +
    '<p class="rpt-help">사전심의 자료 「인근 최근 3개년 실거래가격」과 같은 방식으로 비교표와 검토 문안을 만듭니다.</p>' +
    '<div class="rpt-grid">' +
    '<label>기준 평형<select id="rptBand">' + bands + '</select></label>' +
    '<label>평당가 환산 공급평<input id="rptConvPy" type="number" min="1" step="0.1" required></label>' +
    '<label>준공 연수 (이내)<input id="rptMaxAge" type="number" min="1" max="40" required></label>' +
    '<label>기준연도<select id="rptYear">' + years + '</select></label>' +
    '</div>' +
    '<fieldset class="rpt-scope"><legend>비교 범위</legend>' +
    '<label><input type="radio" name="rptScope" value="gu"> 사업지 소재 시군구 전체 (심의자료 방식)</label>' +
    '<label><input type="radio" name="rptScope" value="radius"> 지도의 반경 안 단지만 <span id="rptRadiusTxt"></span></label>' +
    '</fieldset>' +
    '<div class="rpt-grid">' +
    '<label>본건 세대당 분양가 (천원, 발코니 포함)<input id="rptUnit" type="number" min="0" step="1" placeholder="예: 580000"></label>' +
    '<label>본건 공급평당 분양가 (천원)<input id="rptUnitPy" type="number" min="0" step="1" placeholder="예: 16500"></label>' +
    '</div>' +
    '<label class="rpt-chk"><input id="rptSilv" type="checkbox"> 분양권 실거래 포함 (공공데이터포털 「아파트 분양권전매 실거래가」 활용신청 필요)</label>' +
    '<label class="rpt-chk"><input id="rptHh" type="checkbox"> 세대수 조회 (K-apt, 단지당 약 0.5초)</label>' +
    '<p class="rpt-note" id="rptNeed"></p>' +
    '<div class="rpt-actions"><button type="button" class="hbtn" onclick="rptCloseDialog()">취소</button>' +
    '<button type="submit" class="hbtn hbtn-run" id="rptGo">보고서 만들기</button></div>' +
    '</form></dialog>' +
    '<div id="rptView" class="rpt-view" hidden></div>';
  while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  document.getElementById('rptForm').addEventListener('submit', function (e) { e.preventDefault(); runReport(); });
  document.getElementById('rptBand').addEventListener('change', function () {
    document.getElementById('rptConvPy').value = RptCore.BANDS[this.value].py;
  });
  document.getElementById('rptYear').addEventListener('change', rptShowNeed);
  document.querySelectorAll('input[name=rptScope]').forEach(function (r) { r.addEventListener('change', rptShowNeed); });
}

function openReportDialog() {
  if (!curLat || !curLawd) { setStatus('err', '사업지 주소를 먼저 검색할 것'); return; }
  if (rptBusy || document.getElementById('runBtn').disabled) { setStatus('err', '분석이 끝난 뒤 다시 누르세요.'); return; }
  rptEnsureDom();
  var o = rptLoadOpts();
  document.getElementById('rptBand').value = o.band;
  document.getElementById('rptConvPy').value = o.convPy;
  document.getElementById('rptMaxAge').value = o.maxAge;
  document.getElementById('rptYear').value = o.baseYear;
  document.querySelectorAll('input[name=rptScope]').forEach(function (r) { r.checked = r.value === o.scope; });
  document.getElementById('rptUnit').value = o.unitPrice;
  document.getElementById('rptUnitPy').value = o.unitPy;
  document.getElementById('rptSilv').checked = !!o.silv;
  document.getElementById('rptHh').checked = !!o.households;
  document.getElementById('rptRadiusTxt').textContent = '(' + (selR >= 1000 ? selR / 1000 + 'km' : selR + 'm') + ')';
  rptShowNeed();
  document.getElementById('rptDialog').showModal();
}
function rptCloseDialog() { var d = document.getElementById('rptDialog'); if (d && d.open) d.close(); }

// 기준연도 기준으로 필요한 조회 기간 (3개년 전 1월 ~ 기준연도 말 또는 이번 달)
function rptNeedRange(year) {
  var now = rptNowYm(), end = year + '12';
  return { start: (year - 3) + '01', end: end > now ? now : end };
}
function rptCovered(o) {
  var need = rptNeedRange(o.baseYear);
  return !!lastRun && lastRun.lat === curLat && lastRun.lng === curLng && lastRun.type !== 'oft' &&
    lastRun.start <= need.start && lastRun.end >= need.end && (o.scope === 'gu' || lastRun.r === selR);
}
function rptShowNeed() {
  var y = parseInt(document.getElementById('rptYear').value, 10), need = rptNeedRange(y);
  var scope = (document.querySelector('input[name=rptScope]:checked') || {}).value || 'gu';
  var ok = rptCovered({ baseYear: y, scope: scope });
  document.getElementById('rptNeed').textContent = ok
    ? '지금 분석 결과로 바로 만듭니다.'
    : '필요한 기간(' + need.start.slice(0, 4) + '.' + need.start.slice(4) + ' ~ ' + need.end.slice(0, 4) + '.' + need.end.slice(4) +
      ')으로 실거래를 다시 받습니다. 지도도 이 기간으로 바뀝니다.';
}

function rptReadForm() {
  var o = {
    band: parseInt(document.getElementById('rptBand').value, 10),
    convPy: parseFloat(document.getElementById('rptConvPy').value),
    maxAge: parseInt(document.getElementById('rptMaxAge').value, 10),
    baseYear: parseInt(document.getElementById('rptYear').value, 10),
    scope: (document.querySelector('input[name=rptScope]:checked') || {}).value || 'gu',
    unitPrice: parseInt(document.getElementById('rptUnit').value, 10) || 0,
    unitPy: parseInt(document.getElementById('rptUnitPy').value, 10) || 0,
    silv: document.getElementById('rptSilv').checked,
    households: document.getElementById('rptHh').checked,
  };
  if (!RptCore.BANDS[o.band]) return { error: '기준 평형을 고르세요.' };
  if (!(o.convPy > 0)) return { error: '평당가 환산 공급평은 0보다 커야 합니다.' };
  if (!(o.maxAge >= 1 && o.maxAge <= 40)) return { error: '준공 연수는 1~40년 사이로 넣으세요.' };
  return o;
}

/* ── ② 데이터 확보 ── */
async function rptEnsureData(o) {
  if (rptCovered(o)) return true;
  var need = rptNeedRange(o.baseYear);
  document.getElementById('startYear').value = need.start.slice(0, 4);
  document.getElementById('startMonth').value = need.start.slice(4);
  document.getElementById('endYear').value = need.end.slice(0, 4);
  document.getElementById('endMonth').value = need.end.slice(4);
  var sel = document.getElementById('selType');
  if (sel.value === 'oft') sel.value = 'apt';
  return !!(await runAnalysis());
}
function rptSgg(c) {
  var t = (c.trades && c.trades[0]) || (c.rents && c.rents[0]) || {};
  return String(c.sigunguCd || t.sggCd || '').slice(0, 5);
}
// 분석 직후의 결과를 붙잡아 둔다 — 보고서를 만드는 사이 새 분석이 시작돼도 섞이지 않게
function rptSnapshot(o) {
  var list = o.scope === 'radius'
    ? Object.keys(allComplexes).map(function (k) { return allComplexes[k]; })
    : lastAllComplexes.filter(function (c) { return rptSgg(c) === lastRun.lawd; });
  // 직거래 제외는 지금 설정으로 다시 거른다 (반경 밖 단지는 지도 토글이 반영되지 않으므로)
  list = list.map(function (c) { return Object.assign({}, c, { trades: filterDirect(c.tradesAll || c.trades || []) }); });
  return { run: lastRun, complexes: list };
}

/* ── ③ 세대수 (K-apt) ── 이름이 하나로 맞을 때만 쓴다. 애매하면 비워 둔다 */
async function rptPickKapt(c, list) {
  var rentNm = /임대|행복주택/;
  var cand = list.filter(function (x) { return kaptNameHit(c.name, x.name); });
  if (!rentNm.test(c.name)) cand = cand.filter(function (x) { return !rentNm.test(x.name); });
  var exact = cand.filter(function (x) { return normHouseName(x.name) === normHouseName(c.name); });
  if (exact.length) cand = exact;
  if (cand.length === 1) return cand[0].code;
  for (var i = 0; i < cand.length && c.jibunTxt; i++) {
    var b = await kaptBasic(cand[i].code);
    if (lotKey(lotOfAddr(b.addr)) === lotKey(c.jibunTxt)) return cand[i].code;
  }
  return null;
}
async function rptFillHouseholds(list) {
  if (API_MODE !== 'proxy' || kaptBlocked) return kaptBlocked ? 'K-apt 활용신청이 필요해 세대수를 비웠습니다.' : '';
  var todo = list.filter(function (c) { return !c.kaptCnt && c.sigunguCd && c.bjdongCd; }), groups = {};
  todo.forEach(function (c) { var b = String(c.sigunguCd) + String(c.bjdongCd); (groups[b] = groups[b] || []).push(c); });
  var done = 0;
  try {
    for (var bjd in groups) {
      var kl = await kaptList(bjd);
      for (var i = 0; i < groups[bjd].length; i++) {
        var c = groups[bjd][i], code = await rptPickKapt(c, kl);
        if (code) {
          var info = await kaptBasic(code);
          c.kaptCode = code; c.kaptCnt = info.cnt || '';
          if (!c.saleType && info.sale) c.saleType = info.sale;   // 임대 단지는 비교에서 빠지게
        }
        setStatus('loading', '세대수 확인 중 ' + (++done) + '/' + todo.length + ' (K-apt)');
      }
    }
  } catch (e) {
    console.warn('[심의 보고서] 세대수 조회 중단 → ' + e.message);
    return '세대수 일부를 확인하지 못했습니다 (' + e.message + ').';
  }
  return '';
}

/* ── ③ 분양권 실거래 ── 좌표가 없어 시군구 단위로만 모은다 */
async function rptFetchSilv(o, run) {
  var need = rptNeedRange(o.baseYear), months = getMonths((o.baseYear - 2) + '01', need.end);
  var lawds = o.scope === 'radius' ? run.lawds : [run.lawd], tasks = [];
  lawds.forEach(function (l) { months.forEach(function (m) { tasks.push({ l: l, m: m }); }); });
  var fields = ['aptNm', 'umdNm', 'dealAmount', 'excluUseAr', 'dealYear', 'dealMonth', 'dealDay', 'cdealType', 'dealingGbn', 'ownershipGbn', 'sggCd'];
  var errors = {}, rows = [];
  var res = await runPool(tasks, async function (t) {
    var label = '분양권 ' + t.l + ' ' + t.m;
    var r = await fetchAllItems(API_SPECS.aptSilv, { LAWD_CD: t.l, DEAL_YMD: t.m }, fields, label);
    if (r.__apiError && r.length === 0) throw new Error(r.__apiError);
    return filterDirect(dropCanceled(r, label));
  }, FETCH_CONCURRENCY, function (d, total) { setStatus('loading', '분양권 실거래 수집 ' + d + '/' + total); });
  res.forEach(function (r) { if (r && r.__error) errors[r.__error] = 1; else if (r) rows = rows.concat(r); });
  var errList = Object.keys(errors);
  if (errList.length && !rows.length) return { error: '분양권 실거래를 받지 못했습니다: ' + errList[0] };
  return { rows: rows, partial: errList.length > 0 };
}

/* ── 실행 ── */
async function runReport() {
  if (rptBusy) return;
  var o = rptReadForm();
  if (o.error) { document.getElementById('rptNeed').textContent = o.error; return; }
  rptSaveOpts(o);
  rptCloseDialog();
  rptBusy = true;
  document.getElementById('rptBtn').disabled = true;
  try {
    if (!(await rptEnsureData(o)) || !lastRun) { setStatus('err', '실거래 수집이 끝나지 않아 보고서를 만들지 못했습니다.'); return; }
    document.getElementById('runBtn').disabled = true;    // 세대수·분양권을 받는 동안 새 분석을 막는다
    var snap = rptSnapshot(o), run = snap.run, complexes = snap.complexes, notes = [];
    if (o.households) {
      var hn = await rptFillHouseholds(complexes.filter(function (c) { return RptCore.eligible(c, o); }));
      if (hn) notes.push(hn);
    }
    var rep = RptCore.buildReport(complexes, o), silv = null, silvErr = '';
    if (o.silv) {
      var s = await rptFetchSilv(o, run);
      if (s.error) silvErr = s.error;
      else { silv = RptCore.summarizeSilv(s.rows, o); if (s.partial) notes.push('분양권 실거래 일부 구간을 받지 못했습니다.'); }
    }
    if (run.missing) notes.push('실거래 수집 중 누락 구간이 ' + run.missing + '건 있습니다 (콘솔 확인).');
    var text = RptCore.narrative(rep, silv, Object.assign({}, o, { guName: run.gu, siteDong: run.dong }));
    rptState = { rep: rep, silv: silv, silvErr: silvErr, text: text, o: o, notes: notes, meta: rptMeta(o, run) };
    renderReport();
    setStatus('ok', '심의 보고서 완료 · 대상 ' + rep.rows.length + '개 단지 · ' + rep.summaryYear + '년 ' + o.band + '타입 ' + rptN(rep.gu.cnt) + '건');
  } catch (e) {
    console.error(e);
    setStatus('err', '보고서 오류: ' + e.message);
  } finally {
    rptBusy = false;
    document.getElementById('rptBtn').disabled = false;
    document.getElementById('runBtn').disabled = false;
  }
}
function rptMeta(o, run) {
  var d = new Date();
  return {
    site: run.site || '', gu: run.gu || '', dong: run.dong || '',
    scope: o.scope === 'gu' ? (run.gu || '사업지 소재 시군구') + ' 전체' : '사업지 반경 ' + (run.r >= 1000 ? run.r / 1000 + 'km' : run.r + 'm'),
    date: d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0'),
    direct: EXCLUDE_DIRECT ? '직거래 제외' : '직거래 포함',
  };
}
