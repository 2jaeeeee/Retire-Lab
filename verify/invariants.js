const E = require('../src/engine.js'), PF = require('../src/portfolio.js');
let seed = 23; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pick = (a, b) => a + rnd() * (b - a), int = (a, b) => Math.floor(pick(a, b + 1));
const issues = {}; const bad = (k, msg) => { issues[k] = (issues[k] || 0) + 1; if (issues[k] <= 2) console.log(k, msg); };
const mk = () => {
  const curAge = int(25, 55), retAge = int(curAge + 1, Math.min(70, curAge + 30)), endAge = int(retAge + 5, 100);
  return { curAge, retAge, endAge, expense: pick(100, 600), pension: pick(0, 150), pensionAge: 65, inflation: pick(1, 3.5), retPre: pick(3, 9), retPost: pick(2, 7),
    contribGrowth: pick(0, 4), divYield: pick(0, 3), divYieldPost: pick(0, 3), salary: pick(3000, 12000), fee: .3, feeAcct: .2, isaType: 'general', isaMode: ['pension', 'reinvest', 'hold'][int(0, 2)], refundReinvest: rnd() < .5,
    bGen: pick(0, 20000), bIsa: pick(0, 5000), bSav: pick(0, 5000), bIrp: pick(0, 3000), assets: 0, monthly: 0,
    rp: rnd() < .6 ? { on: true, type: ['severance', 'db', 'dc'][int(0, 2)], hireAge: curAge - int(0, 8), wageGrowth: 3, dcBalance: NaN, midOn: rnd() < .4, midAge: curAge + 2, midAmount: 3000 } : null };
};
const al = () => ({ gen: pick(0, 200), isa: pick(0, 100), sav: pick(0, 150), irp: pick(0, 50) });
for (let i = 0; i < 300; i++) {
  const p = mk(), a = al();
  if (rnd() < .4) p.path = Array.from({ length: p.endAge - p.curAge }, () => pick(-35, 40));
  const r = E.simulateAccounts(p, p.retAge, a);
  for (const row of r.rows) {
    for (const k of ['gen', 'isa', 'sav', 'irp']) if (row[k] < -1e-6) bad('NEGATIVE_BALANCE', `${i} ${k} ${row[k]}`);
    if (row.tax < -1e-9) bad('NEGATIVE_TAX', i);
    if (row.afterTax > row.total + 1e-6) bad('AFTERTAX>TOTAL', `${i} ${row.afterTax} ${row.total}`);
    if (row.shortfall > 0.5 && row.total > 1) bad('SHORTFALL_WITH_MONEY', `${i} age ${row.age} total ${row.total}`);
  }
  // 단조성: 월 투자금↑ → 은퇴 가능 나이 늦어지지 않음 / 생활비↑ → 빨라지지 않음
  const e0 = E.earliest((R) => E.simulateAccounts(p, R, a).ok, p);
  const e1 = E.earliest((R) => E.simulateAccounts(p, R, { ...a, gen: a.gen + 100 }).ok, p);
  const e2 = E.earliest((R) => E.simulateAccounts({ ...p, expense: p.expense + 100 }, R, a).ok, p);
  if (e0 != null && (e1 == null || e1 > e0)) bad('MONO_MONTHLY', `${i} ${e0} -> ${e1}`);
  if (e2 != null && e0 != null && e2 < e0) bad('MONO_EXPENSE', `${i} ${e0} -> ${e2}`);
  if (e2 != null && e0 == null) bad('MONO_EXPENSE', `${i} null -> ${e2}`);
  // 은퇴 나이에 대한 단조성 (earliest 이후로는 모두 ok여야 '가장 이른 나이' 탐색이 의미 있음)
  if (e0 != null) for (let R = e0; R < p.endAge; R++) if (!E.simulateAccounts(p, R, a).ok) { bad('NONMONO_RETAGE', `${i} ok at ${e0} but fail at ${R}`); break; }
  const s = E.simulateSimple({ ...p, assets: p.bGen + p.bIsa + p.bSav + p.bIrp, monthly: a.gen + a.isa + a.sav + a.irp }, p.retAge);
  for (const row of s.rows) if (row.end < -1e-6) bad('SIMPLE_NEGATIVE', i);
}
console.log('issues:', JSON.stringify(issues));
