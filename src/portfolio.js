/* Retire Lab 포트폴리오 모델 — 자산별 장기 기대수익률·변동성·상관관계, 추천 포트폴리오, 몬테카를로 수익률 경로. */
(function (root) {
  'use strict';

  // 기대수익률(compound, 연 %): J.P. Morgan 2027 LTCMA(2026-10-19 발표) USD 기준.
  // 변동성·상관관계: J.P. Morgan 2026 LTCMA 매트릭스. 기관 전망에 없는 자산은 근거를 note에 적음.
  const SOURCE = { name: 'J.P. Morgan Long-Term Capital Market Assumptions', returns: '2027년판 (2026-10 발표)', risk: '2026년판 매트릭스', horizon: '향후 10~15년' };
  const ASSETS = [
    { id: 'SPY',  name: 'S&P 500',        kind: '미국 대형주',       ret: 7.5, vol: 16.5, div: 1.2, note: 'JPM 2027 미국 대형주 7.5%' },
    { id: 'QQQ',  name: '나스닥 100',      kind: '미국 기술·성장주',  ret: 7.5, vol: 22.0, div: 0.6, note: '기관 전망에 별도 수치 없음. 기술주 밸류에이션 부담(JPM)을 감안해 대형주와 같은 수익률, 과거 수준의 높은 변동성 적용' },
    { id: 'SCHD', name: '미국 배당성장주',  kind: '배당주',           ret: 7.5, vol: 15.0, div: 3.8, note: '기관 전망에 별도 수치 없음. 대형주와 같은 수익률, 과거 실적 수준의 변동성 적용' },
    { id: 'IEF',  name: '미국 중기국채',    kind: '7~10년 국채',       ret: 4.6, vol: 6.5,  div: 3.8, note: 'JPM 2027 미국 중기국채 4.6%. 변동성은 7~10년 만기 수준' },
    { id: 'TLT',  name: '미국 장기국채',    kind: '20년+ 국채',        ret: 4.3, vol: 13.0, div: 4.4, note: 'JPM 2026 미국 장기국채 4.3% (2027년판 수치 미확인)' },
    { id: 'SGOV', name: '미국 초단기국채',  kind: '0~3개월 국채(현금성)', ret: 3.2, vol: 0.7, div: 3.2, note: 'JPM 2027 미국 현금 3.2%' },
    { id: 'GLD',  name: '금',              kind: '금 현물',           ret: 5.5, vol: 16.7, div: 0,   note: 'JPM 2027 금 5.5%' },
  ];
  const IDX = Object.fromEntries(ASSETS.map((a, i) => [a.id, i]));
  // 상관관계: SPY·IEF·TLT·SGOV·GLD 간은 JPM 2026 (대형주·중기국채·장기국채·현금·금). QQQ·SCHD는 과거 관계를 근거로 한 가정.
  const C = [
    //  SPY   QQQ   SCHD  IEF    TLT   SGOV  GLD
    [1.00, 0.92, 0.88, -0.01, 0.02, 0.01, 0.03], // SPY
    [0.92, 1.00, 0.75, -0.02, 0.02, 0.01, 0.03], // QQQ
    [0.88, 0.75, 1.00, -0.01, 0.00, 0.01, 0.05], // SCHD
    [-0.01, -0.02, -0.01, 1.00, 0.84, 0.20, 0.36], // IEF
    [0.02, 0.02, 0.00, 0.84, 1.00, 0.05, 0.30], // TLT
    [0.01, 0.01, 0.01, 0.20, 0.05, 1.00, 0.13], // SGOV
    [0.03, 0.03, 0.05, 0.36, 0.30, 0.13, 1.00], // GLD
  ];

  const PRESETS = [
    { id: 'aggressive', name: '공격형', level: 4, next: 'dividend', tag: '주식 100% · S&P 500 + 나스닥', w: { SPY: 50, QQQ: 50 } },
    { id: 'dividend',   name: '배당형', level: 3, next: 'balanced', tag: '주식 80% · 배당주 중심, 분배금으로 생활비', w: { SCHD: 80, IEF: 20 } },
    { id: 'balanced',   name: '균형형', level: 2, next: 'stable',   tag: '주식 50% · 국채와 금으로 분산', w: { SPY: 35, SCHD: 15, IEF: 35, GLD: 15 } },
    { id: 'stable',     name: '안정형', level: 1, next: 'stable',   tag: '주식 30% · 국채·현금 중심', w: { SPY: 20, SCHD: 10, IEF: 40, SGOV: 20, GLD: 10 } },
  ];

  const n = ASSETS.length;
  // 산술평균 기대수익률 (compound + σ²/2 근사, 소수)
  const arith = ASSETS.map(a => a.ret / 100 + Math.pow(a.vol / 100, 2) / 2);
  const vols = ASSETS.map(a => a.vol / 100);

  function weightsVec(w) { const v = new Array(n).fill(0); let s = 0; for (const k in w) { v[IDX[k]] = w[k]; s += w[k]; } return v.map(x => x / s); }

  // 포트폴리오 기대값 (연 1회 리밸런싱 가정)
  function stats(w) {
    const x = weightsVec(w);
    let m = 0, varp = 0, div = 0;
    for (let i = 0; i < n; i++) { m += x[i] * arith[i]; div += x[i] * ASSETS[i].div; for (let j = 0; j < n; j++) varp += x[i] * x[j] * vols[i] * vols[j] * C[i][j]; }
    const vol = Math.sqrt(varp);
    const compound = m - varp / 2;
    // 로그정규 근사로 '20년에 한 번 꼴의 나쁜 해'(하위 5%) 수익률
    const s2 = Math.log(1 + varp / Math.pow(1 + m, 2)), mu = Math.log(1 + m) - s2 / 2;
    const bad = Math.exp(mu - 1.645 * Math.sqrt(s2)) - 1;
    return { ret: compound * 100, arith: m * 100, vol: vol * 100, div, bad: bad * 100 };
  }

  // 촐레스키 분해
  function cholesky(A) {
    const L = A.map(() => new Array(A.length).fill(0));
    for (let i = 0; i < A.length; i++) for (let j = 0; j <= i; j++) {
      let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) { if (s <= 0) throw new Error('상관행렬이 양의 정부호가 아닙니다'); L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
    }
    return L;
  }
  const L = cholesky(C);
  // 로그수익률 파라미터
  const logS = ASSETS.map((a, i) => Math.sqrt(Math.log(1 + Math.pow(vols[i], 2) / Math.pow(1 + arith[i], 2))));
  const logM = ASSETS.map((a, i) => Math.log(1 + arith[i]) - logS[i] * logS[i] / 2);

  function rng(seed) { // mulberry32
    let t = seed >>> 0;
    return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  }
  function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  // 자산별 연간 수익률 경로 생성: paths[k][y][i] (소수). 같은 seed면 같은 결과.
  function assetPaths(count, years, seed = 20261102) {
    const r = rng(seed), out = [];
    for (let k = 0; k < count; k++) {
      const path = [];
      for (let y = 0; y < years; y++) {
        const z = Array.from({ length: n }, () => gauss(r));
        const row = new Array(n);
        for (let i = 0; i < n; i++) { let e = 0; for (let j = 0; j <= i; j++) e += L[i][j] * z[j]; row[i] = Math.exp(logM[i] + logS[i] * e) - 1; }
        path.push(row);
      }
      out.push(path);
    }
    return out;
  }
  // 자산 경로 + 은퇴 전/후 비중 → 포트폴리오 연수익률(%) 배열
  function portfolioPath(path, wPre, wPost, retIndex) {
    const a = weightsVec(wPre), b = weightsVec(wPost);
    return path.map((row, y) => { const x = y >= retIndex ? b : a; let s = 0; for (let i = 0; i < n; i++) s += x[i] * row[i]; return s * 100; });
  }

  const api = { SOURCE, ASSETS, PRESETS, C, stats, assetPaths, portfolioPath, weightsVec, byId: (id) => PRESETS.find(p => p.id === id),
    safer: (id) => (PRESETS.find(p => p.id === id) || {}).next || id };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RetirePortfolio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
