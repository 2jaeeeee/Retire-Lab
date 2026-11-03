// 세율·공제·한도를 모두 없애면 계좌별 엔진 = 간편 엔진 이어야 함 (돈이 새거나 생기지 않는지 확인)
const E = require('../src/engine.js'), T = E.TAX;
Object.assign(T, { creditRateLow: 0, creditRateHigh: 0, isaRate: 0, isaTransferCreditRate: 0, pensionHighRate: 0, otherIncomeRate: 0, foreignCgRate: 0, usDivWithholding: 0,
  pensionAnnualLimit: 1e12, isaAnnualLimit: 1e12, pensionTaxRate: () => 0 });
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pick = (a, b) => a + rnd() * (b - a), int = (a, b) => Math.floor(pick(a, b + 1));
let fails = 0, worst = 0;
for (let i = 0; i < 400; i++) {
  const curAge = int(22, 62), retAge = int(curAge, Math.min(75, curAge + 35)), endAge = int(retAge + 1, 100);
  const b = [pick(0, 20000), pick(0, 5000), pick(0, 8000), pick(0, 3000)], m = [pick(0, 200), pick(0, 100), pick(0, 100), pick(0, 50)];
  const common = { curAge, endAge, expense: pick(50, 700), pension: pick(0, 200), pensionAge: int(60, 70), inflation: pick(0, 4), retPre: pick(-2, 10), retPost: pick(-2, 8), contribGrowth: pick(0, 5), divYield: pick(0, 3), salary: 7000 };
  if (rnd() < .3) common.path = Array.from({ length: endAge - curAge }, () => pick(-30, 35));
  const fee = pick(0, 1);
  const s = E.simulateSimple({ ...common, fee, assets: b.reduce((x, y) => x + y), monthly: m.reduce((x, y) => x + y) }, retAge);
  const a = E.simulateAccounts({ ...common, feeAcct: fee, bGen: b[0], bIsa: b[1], bSav: b[2], bIrp: b[3], isaType: 'general', isaMode: ['pension', 'reinvest', 'hold'][i % 3], refundReinvest: true }, retAge, { gen: m[0], isa: m[1], sav: m[2], irp: m[3] });
  const d = Math.abs(a.end.total - s.endAssets) / Math.max(1, s.endAssets); worst = Math.max(worst, d);
  if (d > 1e-9 || a.depletedAge !== s.depletedAge) { fails++; if (fails < 8) console.log('DIFF', i, retAge, a.end.total.toFixed(2), s.endAssets.toFixed(2), a.depletedAge, s.depletedAge); }
  // 행별 합계 일관성: 계좌 합 = 총자산
  for (const r of a.rows) if (Math.abs(r.gen + r.isa + r.sav + r.irp - r.total) > 1e-6) { fails++; console.log('ROW SUM', i); break; }
}
console.log(`zero-tax equivalence: 400 cases, failures ${fails}, worst relative diff ${worst.toExponential(2)}`);
