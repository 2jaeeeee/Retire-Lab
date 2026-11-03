/* Retire Lab 계산 엔진 — 단위: 만원, 명목 금액. 브라우저(전역 RetireEngine)와 Node(module.exports) 공용. */
(function (root) {
  'use strict';

  // 세법 기준: 2026-11-02 현재 시행 중인 규정. 국회 계류 중인 개정안(ISA 한도 확대 등)은 반영하지 않음.
  const TAX = {
    baseDate: '2026-11-02',
    pensionAnnualLimit: 1800,      // 연금저축+IRP 합산 연 납입한도
    pensionCreditCap: 900,         // 세액공제 대상 합산 한도
    savingsCreditCap: 600,         // 연금저축 단독 세액공제 대상 한도
    creditRateLow: 0.165,          // 총급여 5,500만원 이하
    creditRateHigh: 0.132,
    creditSalaryThreshold: 5500,
    isaAnnualLimit: 2000,
    isaExempt: { general: 200, low: 400 },  // 일반형 / 서민형
    isaRate: 0.099,
    isaMinYears: 3,
    isaTransferCreditRate: 0.10,   // 만기 자금 연금계좌 이전 시 이전액의 10%
    isaTransferCreditCap: 300,     // 최대 300만원 추가 공제 대상
    pensionAgeMin: 55,
    pensionTaxRate(age) { return age >= 80 ? 0.033 : age >= 70 ? 0.044 : 0.055; },
    pensionSeparateThreshold: 1500, // 사적연금 연 1,500만원 초과 시 16.5% 분리과세(선택) 적용 가정
    pensionHighRate: 0.165,
    otherIncomeRate: 0.165,        // 연금외수령(한도 초과·55세 전) 기타소득세
    foreignCgRate: 0.22,
    foreignCgDeduction: 250,
    usDivWithholding: 0.15,
    financialIncomeThreshold: 2000,
  };

  const mrate = (annualPct, feePct) => Math.pow(1 + (annualPct - feePct) / 100, 1 / 12) - 1;

  // ---------- 퇴직금 ----------
  // 퇴직소득세 (지방소득세 포함). 근속연수공제는 2023년 개정 기준, 1년 미만 끝수는 1년으로 봄.
  const RET = { pensionCut10: 0.7, pensionCutAfter: 0.6 };   // IRP에서 연금으로 받으면 10년차까지 70%, 이후 60%만 과세
  function retirementTax(amount, years) {
    if (!(amount > 0) || !(years > 0)) return 0;
    const Y = Math.max(1, Math.ceil(years - 1e-9));
    const sd = Y <= 5 ? 100 * Y : Y <= 10 ? 500 + 200 * (Y - 5) : Y <= 20 ? 1500 + 250 * (Y - 10) : 4000 + 300 * (Y - 20);
    const conv = Math.max(0, amount - sd) * 12 / Y;
    const cd = conv <= 800 ? conv : conv <= 7000 ? 800 + (conv - 800) * 0.6 : conv <= 10000 ? 4520 + (conv - 7000) * 0.55 : conv <= 30000 ? 6170 + (conv - 10000) * 0.45 : 15170 + (conv - 30000) * 0.35;
    const base = Math.max(0, conv - cd);
    const B = [[1400, .06, 0], [5000, .15, 126], [8800, .24, 576], [15000, .35, 1544], [30000, .38, 1994], [50000, .40, 2594], [100000, .42, 3594], [Infinity, .45, 6594]];
    const [, r, d] = B.find(b => base <= b[0]);
    return Math.max(0, base * r - d) * Y / 12 * 1.1;
  }
  // 퇴직할 때 받는 퇴직급여 (만원, 명목). rp.type: 'severance'(퇴직금) | 'db' | 'dc'
  // 평균임금 ≈ 연봉/12. 연봉은 매년 wageGrowth만큼 오름. DC는 매년 연봉/12를 연말에 적립하고 같은 포트폴리오로 운용.
  function retirePay(p, retAge, feePct) {
    const rp = p.rp;
    if (!rp || !rp.on || retAge < p.curAge) return null;   // 지금 퇴직(retAge = curAge)해도 퇴직금은 받음
    const wg = (rp.wageGrowth || 0) / 100, wage = (age) => p.salary * Math.pow(1 + wg, age - p.curAge);
    const hire = Math.min(rp.hireAge, p.curAge);
    const mid = rp.midOn && rp.type !== 'db' && rp.midAge > hire && rp.midAge < retAge ? rp.midAge : null;
    let gross, years, midPay = 0, midTax = 0, past = mid != null && mid <= p.curAge;
    if (rp.type === 'dc') {
      let bal = isFinite(rp.dcBalance) && rp.dcBalance >= 0 ? rp.dcBalance : wage(p.curAge) / 12 * (p.curAge - hire);
      for (let age = p.curAge; age < retAge; age++) {
        const y = age - p.curAge;
        if (mid === age) { midPay = Math.min(rp.midAmount, bal); bal -= midPay; midTax = retirementTax(midPay, age - hire); }
        const r = ((p.path ? p.path[y] : p.retPre) - feePct) / 100;
        bal = bal * (1 + r) + wage(age) / 12;
      }
      gross = bal; years = retAge - hire;
    } else {
      let start = hire;
      if (mid != null) { if (!past) { midPay = wage(mid - 1) / 12 * (mid - hire); midTax = retirementTax(midPay, mid - hire); } start = mid; }
      gross = wage(Math.max(retAge - 1, p.curAge)) / 12 * (retAge - start); years = retAge - start;
    }
    const tax = retirementTax(gross, years);
    return { gross, tax, taxPension: tax * RET.pensionCut10, years, midPay, midTax, midAge: mid, midPast: past, type: rp.type };
  }

  // ---------- 1단계: 간편 계산 (단일 자산, 세금은 비용률에 포함) ----------
  function simulateSimple(p, retAge) {
    const years = p.endAge - p.curAge;
    const rPre = mrate(p.retPre, p.fee), rPost = mrate(p.retPost, p.fee);
    const inf = p.inflation / 100, g = p.contribGrowth / 100;
    const dyPre = p.divYield / 100, dyPost = (p.divYieldPost ?? p.divYield) / 100;
    let A = p.assets, principal = p.assets, depletedAge = null, assetsAtRet = retAge <= p.curAge ? A : null;
    const rp = retirePay(p, retAge, p.fee);
    const rows = [];
    for (let y = 0; y < years; y++) {
      const age = p.curAge + y, retired = age >= retAge;
      if (age === retAge && rp) { const net = rp.gross - rp.taxPension; A += net; principal += net; }
      if (age === retAge) assetsAtRet = A;
      const row = { age, retired, contrib: 0, growth: 0, div: 0, expense: 0, pension: 0, sell: 0, shortfall: 0, divUsed: 0, pensionUsed: 0 };
      const rM = p.path ? mrate(p.path[y], p.fee) : retired ? rPost : rPre, dy = retired ? dyPost : dyPre;
      for (let m = 0; m < 12; m++) {
        const infl = Math.pow(1 + inf, y + m / 12);
        const div = A * dy / 12;
        if (!retired) {
          const c = p.monthly * Math.pow(1 + g, y);
          A += c; principal += c; row.contrib += c;
        } else {
          const E = p.expense * infl, P = age >= p.pensionAge ? p.pension * infl : 0;
          const pUsed = Math.min(P, E), need = E - pUsed;
          row.expense += E; row.pension += P; row.pensionUsed += pUsed;
          A += P - pUsed;
          if (need > 0) {
            if (A >= need) { const d = Math.min(div, need); row.divUsed += d; row.sell += need - d; A -= need; }
            else { const d = Math.min(div, A); row.divUsed += d; row.sell += A - d; row.shortfall += need - A; A = 0; if (depletedAge == null) depletedAge = age; }
          }
        }
        const gr = A * rM;
        A += gr; row.growth += gr; row.div += div;
      }
      row.end = A; row.principal = principal;
      rows.push(row);
    }
    return { rows, depletedAge, assetsAtRet, ok: depletedAge == null, endAssets: A, rp };
  }

  // ---------- 2단계: 계좌별 절세 시뮬레이션 ----------
  // alloc: 월 납입액 { gen, isa, sav, irp } (첫해 기준, 매년 contribGrowth만큼 증액)
  // 연금계좌는 N(세액공제 안 받은 원금, 비과세 인출)과 T(공제받은 원금+운용수익, 인출 시 과세)로 나눠 추적.
  function simulateAccounts(p, retAge, alloc, opts = {}) {
    const isaMode = opts.isaMode || p.isaMode;            // 'pension' | 'reinvest' | 'hold'
    const years = p.endAge - p.curAge;
    const rPre = mrate(p.retPre, p.feeAcct), rPost = mrate(p.retPost, p.feeAcct);
    const inf = p.inflation / 100, g = p.contribGrowth / 100;
    const dyPre = p.divYield / 100, dyPost = (p.divYieldPost ?? p.divYield) / 100;
    const creditRate = p.salary <= TAX.creditSalaryThreshold ? TAX.creditRateLow : TAX.creditRateHigh;
    const isaExempt = TAX.isaExempt[p.isaType] || TAX.isaExempt.general;
    const cycle = isaMode === 'hold' ? Infinity : TAX.isaMinYears;

    const s = {
      gen: { v: p.bGen, basis: p.bGen },
      isa: { v: p.bIsa, basis: p.bIsa, start: 0, exUsed: 0 },
      sav: { N: 0, D: 0, tD: 0, T: p.bSav, lim: Infinity, used: 0 },
      irp: { N: 0, D: 0, tD: 0, dAge: 0, T: p.bIrp, lim: Infinity, used: 0 },
    };
    let principal = p.bGen + p.bIsa + p.bSav + p.bIrp;
    const tot = { credit: 0, taxDiv: 0, taxCg: 0, taxIsa: 0, taxPen: 0, taxEarly: 0, taxRet: 0 };
    const rp = retirePay(p, retAge, p.feeAcct);
    let depletedAge = null, atRet = null, earlyPensionUsed = false, finIncomeWarn = false;
    const rows = [];

    const pv = (a) => a.N + a.D + a.T;
    const total = () => s.gen.v + s.isa.v + pv(s.sav) + pv(s.irp);
    const afterTax = () => {
      const gGain = Math.max(0, s.gen.v - s.gen.basis - TAX.foreignCgDeduction);
      const iGain = Math.max(0, s.isa.v - s.isa.basis - Math.max(0, isaExempt - s.isa.exUsed));
      return s.gen.v - gGain * TAX.foreignCgRate + s.isa.v - iGain * TAX.isaRate
        + s.sav.N + s.irp.N + s.irp.D * (1 - s.irp.tD * RET.pensionCut10) + (s.sav.T + s.irp.T) * (1 - TAX.pensionTaxRate(55));
    };
    const snap = () => ({ gen: s.gen.v, isa: s.isa.v, sav: pv(s.sav), irp: pv(s.irp), total: total(), afterTax: afterTax() });

    for (let y = 0; y < years; y++) {
      const age = p.curAge + y, retired = age >= retAge;
      if (age === retAge && rp && rp.gross > 0) { s.irp.D += rp.gross; s.irp.tD = rp.tax / rp.gross; s.irp.dAge = age; principal += rp.gross; }
      if (age === retAge || (y === 0 && retAge <= p.curAge)) atRet = snap();
      const row = { age, retired, contrib: 0, credit: 0, tax: 0, expense: 0, nps: 0, npsUsed: 0, wGen: 0, wIsa: 0, wPen: 0, shortfall: 0, growth: 0, genDiv: 0 };
      const rM = p.path ? mrate(p.path[y], p.feeAcct) : retired ? rPost : rPre, dy = retired ? dyPost : dyPre;
      const yr = { pen: 0, sav: 0, irp: 0, isa: 0, realized: 0, penIncT: 0, lowT: 0, lowRate: TAX.pensionTaxRate(age), credit: 0 };
      if (age >= TAX.pensionAgeMin) {
        const k = age - TAX.pensionAgeMin + 1;
        for (const a of [s.sav, s.irp]) { a.lim = k <= 10 ? pv(a) / (11 - k) * 1.2 : Infinity; a.used = 0; }
      }

      // --- 인출 함수들: net(실수령) 기준 요청, 실제로 확보한 net 반환 ---
      const fromGen = (net) => {
        const take = Math.min(net, s.gen.v);
        if (take <= 0) return 0;
        const bShare = s.gen.basis * take / s.gen.v;
        yr.realized += take - bShare; s.gen.basis -= bShare; s.gen.v -= take;
        row.wGen += take;
        return take;                       // 양도세는 연말 정산
      };
      const fromIsa = (net) => {
        if (s.isa.v <= 0 || net <= 0) return 0;
        const gf = Math.max(0, 1 - s.isa.basis / s.isa.v);
        const exLeft = () => Math.max(0, isaExempt - s.isa.exUsed);
        let gross = net;
        for (let i = 0; i < 4; i++) gross = net + Math.max(0, gross * gf - exLeft()) * TAX.isaRate;
        gross = Math.min(gross, s.isa.v);
        const gain = gross * gf, tax = Math.max(0, gain - exLeft()) * TAX.isaRate;
        s.isa.exUsed += gain; s.isa.basis -= s.isa.basis * gross / s.isa.v; s.isa.v -= gross;
        tot.taxIsa += tax; row.tax += tax; row.wIsa += gross;
        return gross - tax;
      };
      // low=true: 55세 이상, 연금수령한도·1,500만원 이내 저율과세 구간만 사용
      const fromPension = (a, net, low) => {
        let got = 0;
        if (net <= 0) return 0;
        const early = age < TAX.pensionAgeMin;
        if (low) {
          if (early) return 0;
          const nTake = Math.min(a.N, net, Math.max(0, a.lim - a.used));
          a.N -= nTake; a.used += nTake; got += nTake; row.wPen += nTake;
          if (a.D > 0 && net - got > 1e-9) {   // 이연퇴직소득: 연금수령 시 퇴직소득세의 70%(11년차부터 60%)
            const tr = a.tD * (age - a.dAge < 10 ? RET.pensionCut10 : RET.pensionCutAfter);
            const g2 = Math.min(a.D, Math.max(0, a.lim - a.used), (net - got) / (1 - tr));
            if (g2 > 0) { const tx = g2 * tr; a.D -= g2; a.used += g2; got += g2 - tx; tot.taxRet += tx; row.tax += tx; row.wPen += g2; }
          }
          const r = yr.lowRate;
          const room = Math.min(Math.max(0, a.lim - a.used), Math.max(0, TAX.pensionSeparateThreshold - yr.penIncT));
          const gross = Math.min(a.T, room, (net - got) / (1 - r));
          if (gross > 0) {
            const tax = gross * r;
            a.T -= gross; a.used += gross; yr.penIncT += gross; yr.lowT += gross;
            got += gross - tax; tot.taxPen += tax; row.tax += tax; row.wPen += gross;
          }
          return got;
        }
        const nTake = Math.min(a.N, net);
        a.N -= nTake; got += nTake; row.wPen += nTake;
        if (!early) a.used += nTake;
        if (a.D > 0 && net - got > 1e-9) {     // 연금외수령(55세 전·한도 초과): 퇴직소득세 전액
          const g2 = Math.min(a.D, (net - got) / (1 - a.tD));
          if (g2 > 0) { const tx = g2 * a.tD; a.D -= g2; got += g2 - tx; tot.taxRet += tx; row.tax += tx; row.wPen += g2; if (!early) a.used += g2; }
        }
        const gross = Math.min(a.T, (net - got) / (1 - TAX.pensionHighRate));
        if (gross > 0) {
          const tax = gross * TAX.pensionHighRate;
          if (early) { tot.taxEarly += tax; earlyPensionUsed = true; }
          else {
            const within = Math.min(gross, Math.max(0, a.lim - a.used));
            yr.penIncT += within; a.used += gross;
            tot.taxPen += tax;
          }
          a.T -= gross; got += gross - tax; row.tax += tax; row.wPen += gross;
        }
        return got;
      };
      const withdraw = (need) => {
        let got = 0;
        const steps = age >= TAX.pensionAgeMin
          ? [(n) => fromPension(s.sav, n, true), (n) => fromPension(s.irp, n, true), fromGen, fromIsa, (n) => fromPension(s.sav, n, false), (n) => fromPension(s.irp, n, false)]
          : [fromGen, fromIsa, (n) => fromPension(s.sav, n, false), (n) => fromPension(s.irp, n, false)];
        for (const f of steps) { if (need - got <= 1e-9) break; got += f(need - got); }
        return got;
      };

      for (let m = 0; m < 12; m++) {
        const infl = Math.pow(1 + inf, y + m / 12);
        if (!retired) {
          const f = Math.pow(1 + g, y);
          const cs = alloc.sav * f, ci = alloc.irp * f, cI = alloc.isa * f, cg = alloc.gen * f;
          let spill = 0;
          const sTake = Math.min(cs, Math.max(0, TAX.pensionAnnualLimit - yr.pen)); yr.pen += sTake; yr.sav += sTake; s.sav.N += sTake; spill += cs - sTake;
          const iTake = Math.min(ci, Math.max(0, TAX.pensionAnnualLimit - yr.pen)); yr.pen += iTake; yr.irp += iTake; s.irp.N += iTake; spill += ci - iTake;
          const isaTake = Math.min(cI, Math.max(0, TAX.isaAnnualLimit - yr.isa)); yr.isa += isaTake; s.isa.v += isaTake; s.isa.basis += isaTake; spill += cI - isaTake;
          s.gen.v += cg + spill; s.gen.basis += cg + spill;
          const c = cs + ci + cI + cg; principal += c; row.contrib += c;
        } else {
          const E = p.expense * infl, P = age >= p.pensionAge ? p.pension * infl : 0;
          const pUsed = Math.min(P, E), need = E - pUsed;
          row.expense += E; row.nps += P; row.npsUsed += pUsed;
          s.gen.v += P - pUsed; s.gen.basis += P - pUsed;
          if (need > 0) {
            const got = withdraw(need);
            if (got < need - 1e-6) { row.shortfall += need - got; if (depletedAge == null) depletedAge = age; }
          }
        }
        // 운용: 일반계좌 배당은 미국 원천징수 15% 후 재투자(취득가 증가)
        const r = rM;
        const before = total();
        const div = s.gen.v * dy / 12, wh = div * TAX.usDivWithholding;
        s.gen.v = s.gen.v * (1 + r) - wh; s.gen.basis += div - wh; tot.taxDiv += wh; row.tax += wh; row.genDiv += div;
        s.isa.v *= 1 + r;
        for (const a of [s.sav, s.irp]) {
          a.T += pv(a) * r;
          // 평가손실이 운용수익(T)보다 크면 비공제 원금(N) → 이연퇴직소득(D) 순으로 줄인다 (잔액이 음수가 되지 않게)
          if (a.T < 0) { a.N += a.T; a.T = 0; if (a.N < 0) { a.D += a.N; a.N = 0; if (a.D < 0) { a.T += a.D; a.D = 0; } } }
        }
        row.growth += total() - before + wh;
      }

      // --- 연말 정산 ---
      if (!retired) {
        const elig = Math.min(Math.min(yr.sav, TAX.savingsCreditCap) + yr.irp, TAX.pensionCreditCap);
        const mvS = Math.min(yr.sav, TAX.savingsCreditCap, elig, s.sav.N); s.sav.N -= mvS; s.sav.T += mvS;
        const mvI = Math.min(elig - mvS, yr.irp, s.irp.N); s.irp.N -= mvI; s.irp.T += mvI;
        yr.credit += elig * creditRate;
      }
      if (y + 1 - s.isa.start >= cycle) {
        const exLeft = Math.max(0, isaExempt - s.isa.exUsed);
        const tax = Math.max(0, s.isa.v - s.isa.basis - exLeft) * TAX.isaRate;
        s.isa.v -= tax; tot.taxIsa += tax; row.tax += tax;
        const v = s.isa.v;
        if (isaMode === 'pension' && v > 0) {
          const b = Math.min(v * TAX.isaTransferCreditRate, TAX.isaTransferCreditCap);
          s.sav.T += b; s.sav.N += v - b;
          if (!retired) yr.credit += b * creditRate;   // 은퇴 후엔 근로소득 세액이 없다고 보고 공제 미반영
          s.isa.v = 0; s.isa.basis = 0;
        } else {
          const keep = Math.min(v, TAX.isaAnnualLimit);
          s.gen.v += v - keep; s.gen.basis += v - keep;
          s.isa.v = keep; s.isa.basis = keep;
        }
        s.isa.start = y + 1; s.isa.exUsed = 0;
      }
      if (yr.credit > 0) {
        tot.credit += yr.credit; row.credit = yr.credit;
        if (p.refundReinvest) { s.gen.v += yr.credit; s.gen.basis += yr.credit; }
      }
      const cgt = Math.max(0, yr.realized - TAX.foreignCgDeduction) * TAX.foreignCgRate;
      let extraTax = cgt;
      if (yr.penIncT > TAX.pensionSeparateThreshold) extraTax += yr.lowT * (TAX.pensionHighRate - yr.lowRate);
      if (extraTax > 0) {
        tot.taxCg += cgt; tot.taxPen += extraTax - cgt; row.tax += extraTax;
        const got = withdraw(extraTax);
        if (got < extraTax - 1e-6) { row.shortfall += extraTax - got; if (depletedAge == null) depletedAge = age; }
      }
      if (row.genDiv > TAX.financialIncomeThreshold) finIncomeWarn = true;

      Object.assign(row, snap(), { principal });
      rows.push(row);
    }
    const end = snap();
    return { rows, depletedAge, ok: depletedAge == null, atRet: atRet || end, end, totals: tot, earlyPensionUsed, finIncomeWarn, creditRate, rp };
  }

  // ---------- 공통 탐색 ----------
  function earliest(simFn, p) {
    for (let R = p.curAge; R < p.endAge; R++) if (simFn(R).ok) return R;
    return null;
  }
  function bisect(okFn, lo, hi, iters = 44) {
    for (let i = 0; i < iters; i++) { const mid = (lo + hi) / 2; if (okFn(mid)) hi = mid; else lo = mid; }
    return hi;
  }
  // okAt(x)가 x에 대해 단조(작을 때 false → 클 때 true)일 때 경계값
  function solveUp(okAt, start, cap) {
    if (okAt(0)) return 0;
    let hi = Math.max(start, 1);
    while (!okAt(hi)) { hi *= 2; if (hi > cap) return Infinity; }
    return bisect(okAt, 0, hi);
  }

  // 계좌 배분 시나리오 (총 월 투자금 M 동일)
  function scenarioAlloc(kind, M, user) {
    const sav = Math.min(M, TAX.savingsCreditCap / 12), irp = Math.min(M - sav, (TAX.pensionCreditCap - TAX.savingsCreditCap) / 12);
    switch (kind) {
      case 'A': return { gen: M, isa: 0, sav: 0, irp: 0 };
      case 'B': return { gen: M - sav - irp, isa: 0, sav, irp };
      case 'C': { const isa = Math.min(M - sav - irp, TAX.isaAnnualLimit / 12); return { gen: M - sav - irp - isa, isa, sav, irp }; }
      case 'D': { // 연금 납입 한도(1,800만)까지: IRP는 공제 채우는 300만, 나머지는 중도인출이 자유로운 연금저축
        const irpD = Math.min(M, (TAX.pensionCreditCap - TAX.savingsCreditCap) / 12), savD = Math.min(M - irpD, (TAX.pensionAnnualLimit - (TAX.pensionCreditCap - TAX.savingsCreditCap)) / 12);
        return { gen: M - savD - irpD, isa: 0, sav: savD, irp: irpD }; }
      default: return { ...user };
    }
  }

  const api = { TAX, RET, retirementTax, retirePay, simulateSimple, simulateAccounts, earliest, solveUp, bisect, scenarioAlloc };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RetireEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
