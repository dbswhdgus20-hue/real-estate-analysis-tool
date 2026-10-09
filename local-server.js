/* ══════════════════════════════════════════════════════════════
   로컬 실행용 서버 — Vercel 없이 PC에서 지도·실거래·심의 보고서까지 돌려 본다
     실행: npm install (처음 한 번) → npm run local → http://localhost:3000
   · 화면 파일(index.html 등)을 그대로 내주고
   · /api/health, /api/config, /api/<경로> 는 api/ 폴더의 Vercel 함수를 그대로 실행한다
   · 키는 .env.local 에서만 읽는다 (.gitignore의 .env* 규칙으로 커밋되지 않음)
   · 이 PC에서만 접속되도록 127.0.0.1 에만 연다
   ══════════════════════════════════════════════════════════════ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
};

// .env.local → process.env (이미 설정된 값은 덮지 않는다)
function loadEnv(file) {
  if (!fs.existsSync(file)) return false;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
  return true;
}

// Vercel 함수가 쓰는 res.status().json() 형태를 Node 기본 응답에 맞춘다
function vercelRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
    return res;
  };
  return res;
}

const handlers = {
  health: require('./api/health.js'),
  config: require('./api/config.js'),
  route: require('./api/[route].js'),
};

async function handleApi(req, res, url) {
  const name = url.pathname.slice('/api/'.length);
  const query = Object.fromEntries(url.searchParams);
  req.query = query;
  vercelRes(res);
  if (name === 'health') return handlers.health(req, res);
  if (name === 'config') return handlers.config(req, res);
  if (!/^[a-z-]+$/.test(name)) return res.status(404).json({ ok: false, error: '알 수 없는 경로' });
  req.query = { ...query, route: name };
  return handlers.route(req, res);
}

function serveFile(res, url) {
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.resolve(ROOT, '.' + rel);
  // 저장소 밖, 숨김 파일(.env.local · .git), 서버 코드는 내주지 않는다
  const parts = path.relative(ROOT, file).split(path.sep);
  if (!file.startsWith(ROOT + path.sep) || parts.some((p) => p.startsWith('.')) || ['api', 'node_modules'].includes(parts[0])) {
    res.writeHead(404); return res.end('Not found');
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}

const hasEnv = loadEnv(path.join(ROOT, '.env.local'));
http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    Promise.resolve(handleApi(req, res, url)).catch((e) => {
      console.error('[로컬 서버] API 오류', e);
      if (!res.headersSent) vercelRes(res).status(500).json({ ok: false, error: e.message });
    });
    return;
  }
  serveFile(res, url);
}).listen(PORT, HOST, () => {
  console.log(`인근 실거래 분석 — http://localhost:${PORT}`);
  if (!hasEnv) console.warn('※ .env.local 파일이 없습니다. .env.example을 복사해 키를 넣어 주세요.');
  if (!process.env.KAKAO_JS_KEY) console.warn('※ KAKAO_JS_KEY가 비어 있어 지도가 뜨지 않습니다.');
  if (!process.env.DATA_SERVICE_KEY && !process.env.DATA_GO_KR_KEY) console.warn('※ DATA_SERVICE_KEY가 비어 있어 실거래를 받지 못합니다.');
});
