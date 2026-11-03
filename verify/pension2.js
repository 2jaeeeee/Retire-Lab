const E = require('../src/engine.js'), PF = require('../src/portfolio.js');
const S = [['A 일반계좌만', { gen: 200, isa: 0, sav: 0, irp: 0 }], ['C 연금 900만', { gen: 125, isa: 0, sav: 50, irp: 25 }], ['D 연금 1,800만', { gen: 50, isa: 0, sav: 125, irp: 25 }], ['E 연금 1,800만+ISA', { gen: 0, isa: 50, sav: 125, irp: 25 }]];
function run(pfId, retAge, label) {
  const st = PF.stats(PF.byId(pfId).w), post = PF.byId(PF.safer(pfId)), sp = PF.stats(post.w);
  const p = { curAge: 35, endAge: 95, expense: 300, pension: 100, pensionAge: 65, inflation: 2.5, contribGrowth: 0, feeAcct: 0.2, salary: 7000,
    retPre: st.ret, divYield: st.div, divUS: st.divUS, retPost: sp.ret, divYieldPost: sp.div, divUSPost: sp.divUS, isaType: 'general', isaMode: 'pension', refundReinvest: true, bGen: 0, bIsa: 0, bSav: 0, bIrp: 0 };
  const paths = PF.assetPaths(1000, 60, 777);
  console.log(`\n■ ${label}`);
  for (const [name, a] of S) {
    const maxE = E.solveUp((e) => !E.simulateAccounts({ ...p, expense: e }, retAge, a).ok, 300, 1e7);
    // 성공 확률 90%를 유지하는 최대 생활비 (1,000개 경로)
    const ok90 = (e) => paths.filter(pa => E.simulateAccounts({ ...p, expense: e, path: PF.portfolioPath(pa, PF.byId(pfId).w, post.w, retAge - 35) }, retAge, a).ok).length / paths.length >= .9;
    let lo = 50, hi = maxE; for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (ok90(m)) lo = m; else hi = m; }
    const t = E.simulateAccounts(p, retAge, a), tx = t.totals;
    console.log(name.padEnd(16), '평균일 때 지속 가능 생활비', Math.round(maxE), '| 90% 확률 생활비', Math.round(lo), '| 연금 16.5% 분리과세로 낸 세금', Math.round(tx.taxPen), '| 해외원천징수', Math.round(tx.taxForeign), '| 양도세', Math.round(tx.taxCg));
  }
}
run('dividend', 60, '배당형→균형형, 60세 은퇴'); run('aggressive', 60, '공격형→배당형, 60세 은퇴'); run('dividend', 50, '배당형→균형형, 50세 은퇴');
