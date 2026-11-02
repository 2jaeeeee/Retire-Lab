// 빌드: src/app.html + src/engine.js → dist/artifact (Claude 게시용) + dist/site (정적 호스팅 배포용)
const fs = require('fs'), path = require('path');
const R = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const SITE_URL = process.env.SITE_URL || 'https://retirelab.example.com';
const engine = R('src/engine.js');
const app = R('src/app.html').replace('/*__ENGINE__*/', () => engine);
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap">';
const desc = '현재 자산과 월 투자금으로 몇 살에 은퇴할 수 있는지, ISA·연금저축·IRP를 어떻게 나눠야 세후 자산이 더 남는지 계산하는 무료 은퇴 시뮬레이터.';
const favicon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#17324d"/><path d="M14 46 L28 32 L36 38 L50 20" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="50" cy="20" r="4" fill="#1baf7a"/></svg>';
const pageStyle = `<style>:root{--bg:#f3f5f7;--surface:#fff;--ink:#13202c;--ink-2:#4a5866;--muted:#6f7b88;--line:#e0e5ea;--accent:#17324d}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0e1318;--surface:#151c23;--ink:#e7ecf1;--ink-2:#aab5c0;--muted:#85909b;--line:#26313b;--accent:#9cc3ea;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0e1318;--surface:#151c23;--ink:#e7ecf1;--ink-2:#aab5c0;--muted:#85909b;--line:#26313b;--accent:#9cc3ea;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;font-size:15px;line-height:1.7}
main{max-width:720px;margin:0 auto;padding-block:40px 64px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1{font-size:26px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 6px}.meta{color:var(--muted);margin:0 0 20px}p{color:var(--ink-2);margin:0 0 10px}a{color:var(--accent)}</style>`;

fs.rmSync(path.join(__dirname, 'dist'), { recursive: true, force: true });
const out = (f, s) => { const p = path.join(__dirname, 'dist', f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

// 1) Claude 아티팩트용 (문서 골격은 게시 시 자동으로 감싸짐)
out('artifact/index.html', `<title>Retire Lab</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<meta name="description" content="${desc}">\n${fonts}\n${app}`);
for (const [f, t] of [['privacy', '개인정보처리방침'], ['terms', '이용약관']])
  out(`artifact/${f}.html`, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${t} · Retire Lab</title>${fonts}${pageStyle}</head><body><main>${R(`pages/${f}.html`)}</main></body></html>`);

// 2) 정적 호스팅용 완성 사이트
const head = (title, extra = '') => `<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<title>${title}</title>\n<meta name="description" content="${desc}">\n<link rel="icon" href="favicon.svg" type="image/svg+xml">\n<meta name="theme-color" content="#17324d">\n${extra}${fonts}\n<style>[hidden]{display:none!important}body{margin:0}img{max-width:100%}:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>\n</head>\n<body>\n`;
const og = `<link rel="canonical" href="${SITE_URL}/">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="Retire Lab">\n<meta property="og:title" content="Retire Lab · 나의 은퇴 설계 시뮬레이터">\n<meta property="og:description" content="${desc}">\n<meta property="og:url" content="${SITE_URL}/">\n<meta property="og:image" content="${SITE_URL}/og.png">\n<meta name="twitter:card" content="summary_large_image">\n`;
out('site/index.html', head('Retire Lab · 나의 은퇴 설계 시뮬레이터', og) + app + '\n</body>\n</html>\n');
for (const [f, t] of [['privacy', '개인정보처리방침'], ['terms', '이용약관']])
  out(`site/${f}.html`, head(`${t} · Retire Lab`) + pageStyle + `<main>${R(`pages/${f}.html`)}</main>\n</body>\n</html>\n`);
out('site/favicon.svg', favicon);
out('site/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
out('site/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${SITE_URL}/</loc></url>\n<url><loc>${SITE_URL}/terms.html</loc></url>\n<url><loc>${SITE_URL}/privacy.html</loc></url>\n</urlset>\n`);
out('site/404.html', head('페이지를 찾을 수 없습니다 · Retire Lab') + pageStyle + '<main><h1>페이지를 찾을 수 없습니다</h1><p><a href="./">계산기로 가기</a></p></main></body></html>');
console.log('built', SITE_URL);
