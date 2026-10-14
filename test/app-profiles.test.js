'use strict';
// 서비스 분리 프로파일 검사 (tools/app-profiles.json, tools/build-dist.py).
//  1) 경계: 성장기록·교육(ssaeng) 파일은 공통 파일 중 허용 목록만 쓰고, 그 파일을 참조하는 비-ssaeng 파일은 app.js 뿐이다.
//  2) 한눈육아 빌드: index.html·sw.js 가 가리키는 파일이 전부 dist 에 있고 ssaeng 파일은 하나도 없다.
//  3) 한눈육아 빌드를 헤드리스 Chrome 에서 실제로 띄워(아이 프로필 심은 채) 잡히지 않은 예외가 없는지 본다. Chrome 이 없으면 3)만 건너뛴다.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process'), http = require('node:http'), assert = require('node:assert');
const root = path.resolve(__dirname, '..');
const prof = JSON.parse(fs.readFileSync(path.join(root, 'tools/app-profiles.json'), 'utf8'));
const ss = new Set(prof.ssaeng.js);
const files = [...fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f), ...fs.readdirSync(path.join(root, 'js/capture')).map(f => 'js/capture/' + f)];
ss.forEach(f => assert(fs.existsSync(path.join(root, f)), 'ssaeng 목록의 파일이 없음: ' + f));
prof.ssaeng.css.concat(prof.ssaeng.html, prof.ssaeng.data).forEach(f => assert(fs.existsSync(path.join(root, f)), 'ssaeng 목록의 파일이 없음: ' + f));

// 1) 경계
const exp = {};
files.forEach(f => { const t = fs.readFileSync(path.join(root, f), 'utf8'); for (const m of t.matchAll(/root\.([A-Za-z0-9_]+)\s*=\s*(?:api|factory)/g)) exp[m[1]] = f; for (const m of t.matchAll(/(?:window|globalThis|self)\.([A-Z][A-Za-z0-9_]+)\s*=/g)) if (!exp[m[1]]) exp[m[1]] = f; });
const uses = f => { const t = fs.readFileSync(path.join(root, f), 'utf8'); return Object.keys(exp).filter(g => exp[g] !== f && new RegExp('\\b' + g + '\\b').test(t)).map(g => exp[g]); };
const outsiders = files.filter(f => !ss.has(f) && f !== 'js/app.js' && uses(f).some(u => ss.has(u)));
assert.deepStrictEqual(outsiders, [], '성장·교육 파일을 직접 쓰는 비-ssaeng 파일(app.js 제외): ' + outsiders);
const needs = new Set(); [...ss].forEach(f => uses(f).filter(u => !ss.has(u)).forEach(u => needs.add(u)));
const extra = [...needs].filter(u => !prof.ssaeng_allowed_core_deps.includes(u));
assert.deepStrictEqual(extra, [], 'ssaeng 파일이 허용 목록 밖의 공통 파일을 새로 쓰고 있음: ' + extra);

// 2) 한눈육아 빌드
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hannun-dist-'));
cp.execFileSync('python3', [path.join(root, 'tools/build-dist.py'), '--app', 'hannun', '--worktree', '--out', out], { stdio: 'pipe' });
const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m => m[1].split('?')[0]).filter(r => !/^(https?:|data:|mailto:)/.test(r));
refs.forEach(r => assert(fs.existsSync(path.join(out, r)), 'dist 에 없는 참조: ' + r));
const sw = fs.readFileSync(path.join(out, 'sw.js'), 'utf8');
[...sw.matchAll(/^\s*"\.\/([^"]*)",?\s*$/gm)].forEach(m => m[1] && assert(fs.existsSync(path.join(out, m[1])), 'sw.js 가 가리키는 파일이 dist 에 없음: ' + m[1]));
[...prof.ssaeng.js, ...prof.ssaeng.css, ...prof.ssaeng.html].forEach(f => { assert(!fs.existsSync(path.join(out, f)), '한눈육아 dist 에 ssaeng 파일이 남음: ' + f); assert(!html.includes(f) && !sw.includes('./' + f), '한눈육아 index/sw 에 ssaeng 참조가 남음: ' + f); });
console.log('profiles: boundary + hannun build OK');

// 3) 실제 부팅 — 앱은 계정 모드 고정이라 로그인 없이는 랜딩까지만 그려진다. 랜딩이 뜨고 잡히지 않은 예외가 없는지 본다.
//    (성장·교육 호출은 app.js 안에서 growthActive()/typeof 가드 뒤에 있다 — 가드 없이 쓰는 곳은 존재하지 않는 #tab-trend 를 통하는 죽은 경로뿐이다.)
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(CHROME)) { console.log('SKIP boot: Chrome 없음'); process.exit(0); }
const server = http.createServer((q, r) => { const u = q.url.split('?')[0]; const f = path.join(out, u === '/' ? 'index.html' : u); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(f)] || 'application/octet-stream'); r.end(b); }); });
server.listen(0, '127.0.0.1', () => {
  const r = cp.spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'hn-chrome-')), '--virtual-time-budget=8000', '--enable-logging=stderr', '--v=0', '--dump-dom', `http://127.0.0.1:${server.address().port}/index.html`], { encoding: 'utf8', timeout: 90000 });
  server.close();
  const uncaught = (r.stderr || '').split('\n').filter(l => /CONSOLE/.test(l) && /Uncaught|ReferenceError|TypeError/.test(l));
  const landed = (r.stdout || '').includes('육아하며 시기마다');
  if (uncaught.length || !landed) { console.error(`FAIL boot: 랜딩 ${landed ? '표시' : '없음'}, 예외 ${uncaught.length}건\n` + uncaught.slice(0, 3).join('\n')); process.exit(1); }
  console.log('boot(hannun 빌드): 랜딩 표시, 잡히지 않은 예외 없음');
  process.exit(0);
});
