const { chromium } = require('playwright'); const fs = require('fs');
const html = fs.readFileSync('../dist/site/index.html', 'utf8').replace(/<script src="https:[^"]+"><\/script>/, `<script>window.Chart=class{constructor(e,c){for(const d of c.data.datasets)if(d.data.some(v=>v!=null&&!isFinite(v)))throw new Error('NaN '+d.label)}destroy(){}}</script>`).replace(/<link[^>]+fonts[^>]+>/g, '');
const DEF = eval('(' + html.match(/const DEFAULTS = (\{[\s\S]*?\});/)[1] + ')');
const cases = [
  ['지금 바로 은퇴 (은퇴=현재 나이)', { retAge: 35 }],
  ['대비 나이 = 은퇴+1', { retAge: 60, endAge: 61 }],
  ['생활비 아주 적음', { expense: 1 }],
  ['자산·투자 0', { assets: 0, monthly: 0, rpOn: false, pension: 0 }],
  ['아주 큰 자산', { assets: 5000000 }],
  ['물가 0, 증액 0', { inflation: 0, contribGrowth: 0 }],
  ['잘못된 입력: 은퇴 < 현재', { retAge: 30 }, true],
  ['잘못된 입력: 중도인출 나이가 은퇴 후', { rpType: 'dc', midOn: true, midAge: 55 }, true],
  ['DC 적립금 비움 + 절세모드', { rpType: 'dc', dcBalance: null, useAcct: true }],
  ['입사 = 현재 나이', { hireAge: 35 }],
  ['90세 현재', { curAge: 90, retAge: 90, endAge: 100, hireAge: 30 }],
];
(async () => {
  const b = await chromium.launch(); let bad = 0;
  for (const [name, over, expectErr] of cases) {
    const pg = await b.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.route('http://retire.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await pg.addInitScript((s) => localStorage.setItem('retirelab.v3', JSON.stringify(s)), { ...DEF, ...over });
    await pg.goto('http://retire.test/');
    await pg.waitForTimeout(expectErr ? 600 : 0);
    if (!expectErr) await pg.waitForFunction(() => [...document.querySelectorAll('.pfc .pv')].every(e => !e.textContent.includes('…')), null, { timeout: 60000 }).catch(() => errs.push('timeout'));
    const r = await pg.evaluate(() => ({ err: document.getElementById('errors').hidden ? '' : document.getElementById('errors').innerText, big: document.getElementById('bigNum')?.innerText, facts: [...document.querySelectorAll('#facts .v')].map(e => e.innerText).join(' / '), nan: /NaN|undefined|Infinity/.test(document.body.innerText) }));
    const ok = !errs.length && !r.nan && (expectErr ? !!r.err : !r.err);
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${name}: ${expectErr ? '오류 안내 → ' + r.err.replace(/\n/g, ' ') : `확률 ${r.big} | ${r.facts}`}${errs.length ? ' ERR ' + errs : ''}${r.nan ? ' [NaN 표시]' : ''}`);
    await pg.close();
  }
  console.log(`불합격 ${bad}건`); await b.close();
})();
