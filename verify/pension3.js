const E = require('../src/engine.js'), PF = require('../src/portfolio.js');
const S = { A: { gen: 200, isa: 0, sav: 0, irp: 0 }, C: { gen: 125, isa: 0, sav: 50, irp: 25 }, D: { gen: 50, isa: 0, sav: 125, irp: 25 } };
function line(label, pfId, retAge, over = {}, wht = 0.15, monthly = 1) {
  E.TAX.fundForeignWHT = wht;
  const st = PF.stats(PF.byId(pfId).w), post = PF.byId(PF.safer(pfId)), sp = PF.stats(post.w);
  const p = { curAge: 35, endAge: 95, pension: 100, pensionAge: 65, inflation: 2.5, contribGrowth: 0, feeAcct: 0.2, salary: 7000, expense: 300,
    retPre: st.ret, divYield: st.div, divUS: st.divUS, retPost: sp.ret, divYieldPost: sp.div, divUSPost: sp.divUS, isaType: 'general', isaMode: 'pension', refundReinvest: true, bGen: 0, bIsa: 0, bSav: 0, bIrp: 0, ...over };
  const sc = (a) => ({ gen: a.gen * monthly, isa: a.isa * monthly, sav: a.sav, irp: a.irp });
  const m = Object.fromEntries(Object.entries(S).map(([k, a]) => [k, E.solveUp((e) => !E.simulateAccounts({ ...p, expense: e }, retAge, sc(a)).ok, 300, 1e7)]));
  console.log(label.padEnd(44), `A ${m.A.toFixed(0)} | C ${m.C.toFixed(0)} | D ${m.D.toFixed(0)} | D−C ${(m.D - m.C).toFixed(1)}만원/월 (${((m.D / m.C - 1) * 100).toFixed(1)}%)`);
}
console.log('평균 수익일 때 대비 나이(95세)까지 지속 가능한 월 생활비 (오늘 물가 기준, 만원)');
line('배당형, 60세 은퇴 (기본)', 'dividend', 60);
line('배당형, 60세 은퇴, 해외원천징수 전액 환급 가정', 'dividend', 60, {}, 0);
line('공격형, 60세 은퇴 (기본)', 'aggressive', 60);
line('공격형, 60세 은퇴, 해외원천징수 전액 환급 가정', 'aggressive', 60, {}, 0);
line('공격형, 65세 은퇴', 'aggressive', 65);
line('공격형, 60세 은퇴, 국민연금 0', 'aggressive', 60, { pension: 0 });
line('공격형, 55세 은퇴', 'aggressive', 55);
