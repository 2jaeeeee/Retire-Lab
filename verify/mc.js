const P = require('../src/portfolio.js');
const n = P.ASSETS.length, paths = P.assetPaths(4000, 30, 99);
const flat = []; paths.forEach(pa => pa.forEach(r => flat.push(r)));
const N = flat.length;
const mean = P.ASSETS.map((_, i) => flat.reduce((s, r) => s + r[i], 0) / N);
const sd = P.ASSETS.map((_, i) => Math.sqrt(flat.reduce((s, r) => s + (r[i] - mean[i]) ** 2, 0) / N));
let worstC = 0;
for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) {
  const c = flat.reduce((s, r) => s + (r[i] - mean[i]) * (r[j] - mean[j]), 0) / N / sd[i] / sd[j];
  worstC = Math.max(worstC, Math.abs(c - P.C[i][j]));
}
console.log('asset   targetCAGR  simMedianCAGR  targetVol  simVol');
P.ASSETS.forEach((a, i) => {
  const g = paths.map(pa => Math.pow(pa.reduce((v, r) => v * (1 + r[i]), 1), 1 / 30) - 1).sort((x, y) => x - y);
  console.log(a.id.padEnd(6), a.ret.toFixed(2).padStart(9), (g[2000] * 100).toFixed(2).padStart(13), a.vol.toFixed(1).padStart(10), (sd[i] * 100).toFixed(1).padStart(7));
});
console.log('max |corr error|', worstC.toFixed(3));
// 포트폴리오: 몬테카를로 중앙값 연복리 vs 표시하는 '평균 연 수익'
for (const x of P.PRESETS) {
  const st = P.stats(x.w);
  const g = paths.map(pa => { const pp = P.portfolioPath(pa, x.w, x.w, 99); return Math.pow(pp.reduce((v, r) => v * (1 + r / 100), 1), 1 / 30) - 1; }).sort((a, b) => a - b);
  const yr = []; paths.forEach(pa => P.portfolioPath(pa, x.w, x.w, 99).forEach(r => yr.push(r))); yr.sort((a, b) => a - b);
  console.log(x.name, '표시 평균', st.ret.toFixed(2), '| MC 중앙값', (g[2000] * 100).toFixed(2), '| 표시 변동성', st.vol.toFixed(1), '| 표시 나쁜해', st.bad.toFixed(1), '| MC 하위5% 연수익', yr[Math.floor(yr.length * .05)].toFixed(1));
}
