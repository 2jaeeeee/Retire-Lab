const { chromium } = require('playwright'); const fs = require('fs');
const html = fs.readFileSync('../dist/site/index.html', 'utf8').replace(/<script src="https:[^"]+"><\/script>/, `<script>window.Chart=class{constructor(){}destroy(){}}</script>`).replace(/<link[^>]+fonts[^>]+>/g, '');
const DEF = eval('(' + html.match(/const DEFAULTS = (\{[\s\S]*?\});/)[1] + ')');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1200, height: 1000 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('http://retire.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await pg.addInitScript((s) => localStorage.setItem('retirelab.v3', JSON.stringify(s)), { ...DEF, useAcct: true, mSav: 125, mIrp: 25, mGen: 50, mIsa: 0 });
  await pg.goto('http://retire.test/'); await pg.click('[data-tab="acct"]'); await pg.waitForTimeout(800);
  console.log(errs, await pg.evaluate(() => [document.getElementById('limitHint').innerText, document.getElementById('cmpSummary').innerText, document.getElementById('cmpBody').innerText]));
  const el = await pg.$('[data-panel="acct"]'); await el.screenshot({ path: 'acct.png' }); await b.close();
})();
