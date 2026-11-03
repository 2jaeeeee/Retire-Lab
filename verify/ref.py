# 독립 참조 구현 (JS 엔진 코드를 보지 않고 명세대로 다시 작성): 간편 시뮬레이션, 퇴직소득세, 퇴직급여, 포트폴리오 통계
import math, json, sys

def mrate(a, fee): return (1 + (a - fee) / 100) ** (1/12) - 1

def ret_tax(amount, years):
    if amount <= 0 or years <= 0: return 0.0
    Y = max(1, math.ceil(years - 1e-9))
    if Y <= 5: sd = 100*Y
    elif Y <= 10: sd = 500 + 200*(Y-5)
    elif Y <= 20: sd = 1500 + 250*(Y-10)
    else: sd = 4000 + 300*(Y-20)
    conv = max(0, amount - sd) * 12 / Y
    if conv <= 800: cd = conv
    elif conv <= 7000: cd = 800 + (conv-800)*0.6
    elif conv <= 10000: cd = 4520 + (conv-7000)*0.55
    elif conv <= 30000: cd = 6170 + (conv-10000)*0.45
    else: cd = 15170 + (conv-30000)*0.35
    base = max(0, conv - cd)
    # 누진공제 대신 구간별 직접 누적 계산 (독립 검산)
    brackets = [(1400,.06),(5000,.15),(8800,.24),(15000,.35),(30000,.38),(50000,.40),(100000,.42),(float('inf'),.45)]
    t, lo = 0.0, 0.0
    for hi, r in brackets:
        if base > lo: t += (min(base, hi) - lo) * r
        lo = hi
    return t * Y / 12 * 1.1

def retire_pay(p, R, fee):
    rp = p.get('rp')
    if not rp or not rp['on'] or R < p['curAge']: return None
    wg = rp['wageGrowth']/100
    wage = lambda age: p['salary'] * (1+wg) ** (age - p['curAge'])
    hire = min(rp['hireAge'], p['curAge'])
    mid = rp['midAge'] if rp.get('midOn') and rp['type'] != 'db' and hire < rp['midAge'] < R else None
    midPay = 0
    if rp['type'] == 'dc':
        bal = rp['dcBalance'] if rp.get('dcBalance') is not None else wage(p['curAge'])/12*(p['curAge']-hire)
        for age in range(p['curAge'], R):
            y = age - p['curAge']
            if mid == age: midPay = min(rp['midAmount'], bal); bal -= midPay
            r = ((p['path'][y] if p.get('path') else p['retPre']) - fee)/100
            bal = bal*(1+r) + wage(age)/12
        gross, years = bal, R - hire
    else:
        start = hire
        if mid is not None:
            if mid > p['curAge']: midPay = wage(mid-1)/12*(mid-hire)
            start = mid
        gross, years = wage(max(R-1, p['curAge']))/12*(R-start), R-start
    tax = ret_tax(gross, years)
    return dict(gross=gross, tax=tax, years=years, midPay=midPay)

def sim_simple(p, R):
    years = p['endAge'] - p['curAge']
    A = p['assets']; dep = None; atR = A if R <= p['curAge'] else None
    rp = retire_pay(p, R, p['fee'])
    for y in range(years):
        age = p['curAge'] + y; retired = age >= R
        if age == R and rp: A += rp['gross'] - rp['tax']*0.7
        if age == R: atR = A
        if p.get('path'): r = mrate(p['path'][y], p['fee'])
        else: r = mrate(p['retPost'] if retired else p['retPre'], p['fee'])
        for m in range(12):
            infl = (1 + p['inflation']/100) ** (y + m/12)
            if not retired:
                A += p['monthly'] * (1 + p['contribGrowth']/100) ** y
            else:
                E = p['expense']*infl
                P = p['pension']*infl if age >= p['pensionAge'] else 0
                need = E - P   # 음수면 남는 연금 재투자
                if A >= need: A -= need
                else:
                    A = 0
                    if dep is None: dep = age
            A *= 1 + r
    return dict(end=A, dep=dep, atRet=atR, ok=dep is None)

def earliest(p):
    for R in range(p['curAge'], p['endAge']):
        if sim_simple(p, R)['ok']: return R
    return None

if __name__ == '__main__':
    cases = json.load(open(sys.argv[1]))
    out = []
    for c in cases:
        p = c['p']
        s = sim_simple(p, p['retAge'])
        rp = retire_pay(p, p['retAge'], p['fee'])
        out.append(dict(end=s['end'], dep=s['dep'], atRet=s['atRet'], earliest=earliest(p) if c.get('e') else None,
                        rpGross=rp['gross'] if rp else None, rpTax=rp['tax'] if rp else None,
                        tax=[ret_tax(a, y) for a, y in c['taxes']]))
    json.dump(out, sys.stdout)
