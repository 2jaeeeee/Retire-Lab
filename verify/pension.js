const E = require('../src/engine.js'), PF = require('../src/portfolio.js');
const S = [
  ['A 일반계좌만', { gen: 200, isa: 0, sav: 0, irp: 0 }],
  ['B 연금저축 600만(공제 한도)', { gen: 150, isa: 0, sav: 50, irp: 0 }],
  ['C 연금 900만(공제 최대)', { gen: 125, isa: 0, sav: 50, irp: 25 }],
  ['D 연금 1,800만(납입 최대)', { gen: 50, isa: 0, sav: 125, irp: 25 }],
  ['E 연금 1,800만 + ISA', { gen: 0, isa: 50, sav: 125, irp: 25 }],
];
function run(pfId, retAge, salary) {
  const st = PF.stats(PF.byId(pfId).w), post = PF.byId(PF.safer(pfId)), sp = PF.stats(post.w);
  const p = { curAge: 35, endAge: 95, expense: 300, pension: 100, pensionAge: 65, inflation: 2.5, contribGrowth: 0, feeAcct: 0.2, salary,
    retPre: st.ret, divYield: st.div, retPost: sp.ret, divYieldPost: sp.div, isaType: 'general', isaMode: 'pension', refundReinvest: true,
    bGen: 0, bIsa: 0, bSav: 0, bIrp: 0, rp: null };
  const paths = PF.assetPaths(400, 60), d = Math.pow(1.025, retAge - 35);
  console.log(`\n■ ${PF.byId(pfId).name} → 은퇴 후 ${post.name} · ${retAge}세 은퇴 · 총급여 ${salary}만원 · 월 200만원 (35세부터, 잔액 0에서 시작)`);
  console.log('시나리오'.padEnd(22), '세후자산(오늘물가)', '은퇴가능', '성공확률', '세액공제합', '평생세금', '55세전 연금인출세');
  const base = {};
  for (const [name, a] of S) {
    const t = E.simulateAccounts(p, retAge, a), tx = t.totals;
    const e = E.earliest((R) => E.simulateAccounts(p, R, a), p);
    const pr = paths.filter(pa => E.simulateAccounts({ ...p, path: PF.portfolioPath(pa, PF.byId(pfId).w, post.w, retAge - 35) }, retAge, a).ok).length / 400;
    const after = t.atRet.afterTax / d, taxes = tx.taxDiv + tx.taxCg + tx.taxIsa + tx.taxPen + tx.taxEarly;
    if (!base.after) Object.assign(base, { after });
    console.log(name.padEnd(22), (Math.round(after) + '').padStart(8), `(${after - base.after >= 0 ? '+' : ''}${Math.round(after - base.after)})`.padStart(9), String(e).padStart(6), (Math.round(pr * 100) + '%').padStart(7), String(Math.round(tx.credit)).padStart(9), String(Math.round(taxes)).padStart(9), String(Math.round(tx.taxEarly)).padStart(9));
  }
}
run('dividend', 50, 7000); run('dividend', 60, 7000); run('aggressive', 60, 7000); run('dividend', 60, 5000);
