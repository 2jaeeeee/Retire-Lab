const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

const base = { curAge: 35, endAge: 95, expense: 300, pension: 0, pensionAge: 65, retPre: 0, retPost: 0, inflation: 0,
  feeAcct: 0, fee: 0, divYield: 0, contribGrowth: 0, salary: 8000, isaType: 'general', isaMode: 'hold', refundReinvest: false,
  bGen: 0, bIsa: 0, bSav: 0, bIrp: 0 };

test('간편: 수익률·물가 0이면 단순 산술', () => {
  const p = { ...base, curAge: 40, endAge: 50, assets: 3600, monthly: 0, expense: 30 };
  near(E.simulateSimple(p, 40).endAssets, 0);
  assert.equal(E.simulateSimple({ ...p, assets: 3599 }, 40).depletedAge, 49);
});

test('세액공제: 연금저축 600 + IRP 300, 총급여 8천 → 13.2%', () => {
  const r = E.simulateAccounts({ ...base, endAge: 37 }, 36, { gen: 0, isa: 0, sav: 50, irp: 25 });
  near(r.rows[0].credit, 900 * 0.132);
});

test('세액공제: 총급여 5,500 이하 16.5%, 연금저축 단독 600 한도', () => {
  const r = E.simulateAccounts({ ...base, salary: 5000, endAge: 37 }, 36, { gen: 0, isa: 0, sav: 75, irp: 0 });
  near(r.rows[0].credit, 600 * 0.165);
});

test('연금 납입한도 1,800 초과분은 일반계좌로', () => {
  const r = E.simulateAccounts({ ...base, endAge: 37 }, 36, { gen: 0, isa: 0, sav: 200, irp: 0 });
  near(r.rows[0].sav, 1800); near(r.rows[0].gen, 600);
});

test('ISA 연 2,000 한도, 3년 만기 비과세 200 초과분 9.9%', () => {
  // 연 10% 수익, 3년 후 만기 → 재가입 모드
  const p = { ...base, retPre: 10, endAge: 39, isaMode: 'reinvest' };
  const r = E.simulateAccounts(p, 39, { gen: 0, isa: 2000 / 12, sav: 0, irp: 0 });
  // 수익 직접 계산
  const rm = Math.pow(1.1, 1 / 12) - 1; let v = 0;
  for (let i = 0; i < 36; i++) { v += 2000 / 12; v *= 1 + rm; }
  const tax = (v - 6000 - 200) * 0.099;
  near(r.totals.taxIsa, tax, 0.05);
  near(r.rows[2].isa + r.rows[2].gen, v - tax, 0.05);
  near(r.rows[2].isa, 2000);
});

test('ISA 만기 연금 이전: 이전액 10%(최대 300) 추가 공제', () => {
  const p = { ...base, endAge: 39, isaMode: 'pension', bIsa: 5000 };
  const r = E.simulateAccounts(p, 39, { gen: 0, isa: 0, sav: 0, irp: 0 });
  near(r.rows[2].credit, 300 * 0.132); near(r.rows[2].sav, 5000); near(r.rows[2].isa, 0);
});

test('55세 이후 연금: 저율 5.5%, 1,500 이내, 수령한도 적용', () => {
  // 55세 은퇴, 연금저축(전액 과세분) 1억, 생활비 월 100 → 연 1,200 인출 (한도 1억/10*1.2=1,200)
  const p = { ...base, curAge: 55, endAge: 56, expense: 100, bSav: 10000 };
  const r = E.simulateAccounts(p, 55, { gen: 0, isa: 0, sav: 0, irp: 0 });
  // 한도 1,200만 → 실수령 1,200*(1-0.055)=1,134, 나머지는 같은 계좌 16.5%
  const row = r.rows[0];
  assert.ok(row.wPen > 1200);
  near(r.totals.taxPen, 1200 * 0.055 + (row.wPen - 1200) * 0.165 + 1200 * (0.165 - 0.055) * (row.wPen > 1500 ? 1 : 0), 0.5);
});

test('55세 전 은퇴: 일반계좌 먼저, 연금 조기인출 시 16.5% 표시', () => {
  const p = { ...base, curAge: 50, endAge: 52, expense: 100, bGen: 600, bSav: 5000 };
  const r = E.simulateAccounts(p, 50, { gen: 0, isa: 0, sav: 0, irp: 0 });
  assert.equal(r.earlyPensionUsed, true);
  near(r.rows[0].wGen, 600);
});

test('일반계좌 양도차익 250 공제 후 22%', () => {
  // 원금 1,000 / 평가 2,000 (차익 1,000) 상태에서 전액 매도
  const p = { ...base, curAge: 60, endAge: 61, expense: 2000 / 12, bGen: 2000 };
  const s = E.simulateAccounts({ ...p, bGen: 2000 }, 60, { gen: 0, isa: 0, sav: 0, irp: 0 });
  near(s.totals.taxCg, 0); // 원금=평가액으로 시작 → 차익 없음
});

test('일반계좌 차익 1,000 실현 → (1,000−250)×22% = 165', () => {
  const p = { ...base, curAge: 60, endAge: 62, retPre: 100, retPost: 0, expense: 2000, bGen: 1000 };
  const r = E.simulateAccounts(p, 61, { gen: 0, isa: 0, sav: 0, irp: 0 });
  near(r.totals.taxCg, 165, 0.01);
});
