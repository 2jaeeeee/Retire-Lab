// 무작위 입력 생성 → JS 엔진 결과와 Python 참조 구현 결과 비교
const E = require('../src/engine.js'); const { execFileSync } = require('child_process'); const fs = require('fs');
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (a, b) => a + rnd() * (b - a), int = (a, b) => Math.floor(pick(a, b + 1));
const cases = [];
for (let i = 0; i < 300; i++) {
  const curAge = int(22, 60), retAge = int(curAge, Math.min(75, curAge + 35)), endAge = int(retAge + 1, 100);
  const type = ['severance', 'db', 'dc'][int(0, 2)];
  const p = { curAge, retAge, endAge, assets: pick(0, 50000), monthly: pick(0, 500), contribGrowth: pick(0, 6), fee: pick(0, 1),
    expense: pick(50, 800), pension: pick(0, 200), pensionAge: int(60, 70), inflation: pick(0, 4), retPre: pick(-2, 10), retPost: pick(-2, 8),
    divYield: 0, salary: pick(2000, 15000),
    rp: rnd() < 0.7 ? { on: true, type, hireAge: int(18, curAge), wageGrowth: pick(0, 6), dcBalance: rnd() < .5 ? pick(0, 20000) : null, midOn: rnd() < .5, midAge: int(20, 70), midAmount: pick(0, 10000) } : null };
  if (rnd() < 0.3) p.path = Array.from({ length: endAge - curAge }, () => pick(-30, 35));
  cases.push({ p, e: i < 60, taxes: [[pick(0, 100000), pick(0.3, 45)], [pick(0, 5000), pick(0.3, 10)]] });
}
fs.writeFileSync('cases.json', JSON.stringify(cases));
const ref = JSON.parse(execFileSync('python3', ['-I', 'ref.py', 'cases.json']).toString());
let worst = 0, fails = 0;
const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
cases.forEach((c, i) => {
  const p = { ...c.p, rp: c.p.rp ? { ...c.p.rp, dcBalance: c.p.rp.dcBalance == null ? NaN : c.p.rp.dcBalance } : null };
  const s = E.simulateSimple(p, p.retAge), rp = E.retirePay(p, p.retAge, p.fee), r = ref[i];
  const chk = [['end', s.endAssets, r.end], ['atRet', s.assetsAtRet ?? 0, r.atRet ?? 0], ['rpGross', rp ? rp.gross : 0, r.rpGross ?? 0], ['rpTax', rp ? rp.tax : 0, r.rpTax ?? 0],
    ['tax0', E.retirementTax(...c.taxes[0]), r.tax[0]], ['tax1', E.retirementTax(...c.taxes[1]), r.tax[1]]];
  for (const [k, a, b] of chk) { const d = rel(a, b); worst = Math.max(worst, d); if (d > 1e-9) { fails++; if (fails < 6) console.log('MISMATCH', i, k, a, b); } }
  if (s.depletedAge !== r.dep) { fails++; if (fails < 6) console.log('DEP MISMATCH', i, s.depletedAge, r.dep); }
  if (c.e) { const e = E.earliest((R) => E.simulateSimple(p, R), p); if (e !== r.earliest) { fails++; console.log('EARLIEST', i, e, r.earliest); } }
});
console.log(`cases ${cases.length}, mismatches ${fails}, worst relative diff ${worst.toExponential(2)}`);
