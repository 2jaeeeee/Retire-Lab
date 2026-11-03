// 화면에 표시된 값 ↔ Node에서 독립적으로 다시 계산한 값 대조
const { chromium } = require('playwright');
const fs = require('fs');
const E = require('../src/engine.js'), PF = require('../src/portfolio.js');
const stub = `<script>window.__charts={};window.Chart=class{constructor(el,cfg){window.__charts[el.id]=JSON.parse(JSON.stringify(cfg.data));}destroy(){}}</script>`;
const fmt = (v, won) => { if (v == null || !isFinite(v)) return '–'; const s = v < -0.5 ? '−' : '', a = Math.abs(v); if (a >= 10000) { const e = a / 10000; return s + (e >= 100 ? e.toFixed(0) : e >= 10 ? e.toFixed(1) : e.toFixed(2)).replace(/\.?0+$/, '') + '억' + (won ? '원' : ''); } return s + Math.round(a).toLocaleString('ko-KR') + '만' + (won ? '원' : ''); };
const pct = (x) => Math.round(x * 100) + '%';

// 앱과 같은 파라미터 구성 (DEFAULTS를 HTML에서 읽어 사용)
const html0 = fs.readFileSync('../dist/site/index.html', 'utf8');
const DEF = eval('(' + html0.match(/const DEFAULTS = (\{[\s\S]*?\});/)[1] + ')');
const stat = Object.fromEntries(PF.PRESETS.map(x => [x.id, PF.stats(x.w)]));
function params(st, pfId) {
  const p = { ...st, mode: st.useAcct ? 'acct' : 'simple' };
  if (p.mode === 'acct') { p.assets = p.bGen + p.bIsa + p.bSav + p.bIrp; p.monthly = p.mGen + p.mIsa + p.mSav + p.mIrp; }
  const postId = p.saferAfter ? PF.safer(pfId) : pfId, a = stat[pfId], b = stat[postId];
  Object.assign(p, { pfId, postId, retPre: a.ret, divYield: a.div, retPost: b.ret, divYieldPost: b.div, divUS: a.divUS, divUSPost: b.divUS });
  p.rp = { on: p.rpOn, type: p.rpType, hireAge: p.hireAge, wageGrowth: p.wageGrowth, dcBalance: p.dcBalance == null ? NaN : p.dcBalance, midOn: p.midOn && p.rpType !== 'db', midAge: p.midAge, midAmount: p.midAmount };
  return p;
}
const al = (p) => ({ gen: p.mGen, isa: p.mIsa, sav: p.mSav, irp: p.mIrp });
const sim = (p, R, extra = {}, a) => p.mode === 'simple' ? E.simulateSimple({ ...p, ...extra }, R) : E.simulateAccounts({ ...p, ...extra }, R, a || al(p));
const defl = (p, y) => Math.pow(1 + p.inflation / 100, y);
function expected(st) {
  const p = params(st, st.pf), years = p.endAge - p.curAge, paths = PF.assetPaths(400, years);
  const prob = (q, R, wPre, wPost) => paths.filter(pa => sim(q, R, { path: PF.portfolioPath(pa, wPre, wPost, R - q.curAge) }).ok).length / 400;
  const W = (id) => PF.byId(id).w;
  const t = sim(p, p.retAge); let earliest = null; for (let R = p.curAge; R < p.endAge; R++) if (sim(p, R).ok) { earliest = R; break; }
  const sA = (a, x) => { const s = a.gen + a.isa + a.sav + a.irp; return s > 0 ? { gen: a.gen / s * x, isa: a.isa / s * x, sav: a.sav / s * x, irp: a.irp / s * x } : { gen: x, isa: 0, sav: 0, irp: 0 }; };
  const req = p.mode === 'simple' ? E.solveUp((c) => sim(p, p.retAge, { monthly: c }).ok, Math.max(100, p.monthly), 1e6) : E.solveUp((c) => sim(p, p.retAge, {}, sA(al(p), c)).ok, Math.max(100, p.monthly), 1e6);
  const mainProb = prob(p, p.retAge, W(p.pfId), W(p.postId));
  let age80 = null;
  for (let R = p.curAge; R < p.endAge; R++) if (prob(p, R, W(p.pfId), W(p.postId)) >= .8) { age80 = R; break; }   // 이분탐색 대신 전수 탐색으로 독립 확인
  const cards = Object.fromEntries(PF.PRESETS.map(x => { const q = params(st, x.id); return [x.id, prob(q, p.retAge, x.w, W(q.postId))]; }));
  const atRet = p.mode === 'simple' ? t.assetsAtRet : t.atRet.afterTax;
  const rpNone = p.rpOn ? prob({ ...p, rp: { ...p.rp, on: false } }, p.retAge, W(p.pfId), W(p.postId)) : null;
  // 그래프: 중앙값 밴드
  const totals = paths.map(pa => sim(p, p.retAge, { path: PF.portfolioPath(pa, W(p.pfId), W(p.postId), p.retAge - p.curAge) }).rows.map(r => p.mode === 'simple' ? r.end : r.total));
  const p50 = totals[0].map((_, y) => totals.map(t => t[y]).sort((a, b) => a - b)[200]);
  return { p, t, earliest, req, mainProb, age80, cards, atRet: atRet / defl(p, p.retAge - p.curAge), rpNone, p50Real: p50.map((v, i) => v / defl(p, i + 1)) };
}

(async () => {
  const b = await chromium.launch();
  const html = html0.replace(/<script src="https:[^"]+"><\/script>/, stub).replace(/<link[^>]+fonts[^>]+>/g, '');
  const scenarios = [
    ['기본값 (간편, 배당형, DB 퇴직금)', {}],
    ['공격형, 은퇴 후 그대로, 퇴직금 끔', { pf: 'aggressive', saferAfter: false, rpOn: false }],
    ['DC형 + 40세 중도인출, 균형형', { pf: 'balanced', rpType: 'dc', midOn: true }],
    ['절세 계좌 모드, 안정형, 퇴직금 중간정산', { useAcct: true, pf: 'stable', rpType: 'severance', midOn: true, midAge: 38 }],
    ['조기 은퇴 45세, 연금 없음, 공격형', { retAge: 45, pension: 0, pf: 'aggressive', useAcct: true }],
  ];
  let total = 0, bad = 0;
  for (const [name, over] of scenarios) {
    const st = { ...DEF, ...over };
    const pg = await b.newPage({ viewport: { width: 1200, height: 900 } });
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.route('http://retire.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await pg.addInitScript((s) => { try { localStorage.setItem('retirelab.v3', JSON.stringify(s)); } catch (e) {} }, st);
    await pg.goto('http://retire.test/', { waitUntil: 'load' });
    await pg.waitForFunction(() => [...document.querySelectorAll('.pfc .pv, #rpCmp .v')].every(e => !e.textContent.includes('…')) && !document.getElementById('facts').innerText.includes('계산 중'), null, { timeout: 120000 });
    const ui = await pg.evaluate(() => ({
      big: document.getElementById('bigNum').innerText.replace(/\s/g, ''),
      facts: [...document.querySelectorAll('#facts .v')].map(e => e.innerText),
      cards: Object.fromEntries([...document.querySelectorAll('.pfc')].map(c => [c.dataset.pf, c.querySelector('.pv').innerText])),
      rpCmp: [...document.querySelectorAll('#rpCmp li')].map(li => [li.querySelector('.k').childNodes[0].textContent.trim(), li.querySelector('.v').innerText]),
      fan: window.__charts.chartFan,
    }));
    const x = expected(st);
    const checks = [
      ['성공 확률', ui.big, pct(x.mainProb)],
      ['80% 은퇴 나이', ui.facts[0], x.age80 == null ? '어려워요' : `${x.age80}세`],
      ['평균 수익 은퇴 나이', ui.facts[1], x.earliest == null ? '어려워요' : `${x.earliest}세 은퇴`],
      ['필요 월 투자', ui.facts[2], x.req === Infinity ? '불가' : fmt(x.req, true)],
      ['은퇴 시점 자산', ui.facts[3], fmt(x.atRet, true)],
      ...PF.PRESETS.map(pr => [`카드 ${pr.name}`, ui.cards[pr.id], pct(x.cards[pr.id])]),
      ['그래프 중앙값(은퇴 시점)', fmt(ui.fan.datasets.find(d => d.label.startsWith('보통')).data[x.p.retAge - x.p.curAge - 1]), fmt(x.p50Real[x.p.retAge - x.p.curAge - 1])],
      ['그래프 중앙값(마지막 해)', fmt(ui.fan.datasets.find(d => d.label.startsWith('보통')).data.at(-1)), fmt(x.p50Real.at(-1))],
    ];
    if (x.p.rpOn) checks.push(['퇴직금 없이 확률', ui.rpCmp[0][1], pct(x.rpNone)]);
    console.log(`\n▶ ${name}${errs.length ? ' ERR ' + errs : ''}`);
    for (const [k, a, e] of checks) { total++; const ok = a === e; if (!ok) bad++; console.log(`  ${ok ? '✓' : '✗'} ${k}: 화면 ${a} / 재계산 ${e}`); }
    await pg.close();
  }
  console.log(`\n총 ${total}개 항목, 불일치 ${bad}개`);
  await b.close();
})();
