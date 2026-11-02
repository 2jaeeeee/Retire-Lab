# Retire Lab

한국형 절세 계좌(ISA·연금저축·IRP)를 반영한 은퇴 시뮬레이터. 서버 없는 정적 사이트로, 모든 계산은 브라우저에서 실행됩니다.

## 구조
- `src/engine.js` — 계산 엔진 (세법 상수는 맨 위 `TAX`, 기준일 `baseDate`)
- `src/app.html` — 화면 (빌드 때 엔진이 들어감)
- `pages/` — 개인정보처리방침, 이용약관
- `test/engine.test.js` — 세금·한도 계산 테스트
- `build.js` — `dist/site`(배포용)와 `dist/artifact` 생성

## 빌드와 테스트 (Node 18 이상)
```
node --test test/engine.test.js
SITE_URL=https://내도메인 node build.js
```
`SITE_URL`은 canonical, OG, sitemap 주소에 들어갑니다.

## 배포 (택 1, 모두 무료 플랜 가능)
- **Netlify Drop**: app.netlify.com/drop 에 `dist/site` 폴더를 끌어다 놓기 → 즉시 URL 발급
- **Cloudflare Pages**: Workers & Pages → Create → Pages → Upload assets → `dist/site` 업로드
- **Vercel**: GitHub 저장소 연결 후 Build Command `node build.js`, Output Directory `dist/site`
- **GitHub Pages**: 저장소에 올리고 Actions로 `dist/site` 배포

배포 후 도메인을 연결하고 `SITE_URL`을 바꿔 다시 빌드하세요. `og.png`(1200×630 공유 썸네일)는 아직 없으니 추가하면 카카오톡·SNS 공유 미리보기가 나옵니다.

## 세법 갱신
세법이 바뀌면 `src/engine.js`의 `TAX` 값과 `baseDate`를 고치고, 테스트 기대값을 맞춘 뒤 다시 빌드합니다.
현재 미반영: 국회 계류 중인 ISA 한도 확대안, 금융소득종합과세, 건강보험료, 퇴직연금.

## 유료화(3단계) 전 필요한 것
사업자등록, 통신판매업 신고, PG 계약(토스페이먼츠 등), 개인정보처리방침 개정(결제·회원 정보 처리 시).
유료로 개인별 투자 판단을 제공하면 유사투자자문업 신고 대상인지 먼저 확인하세요.
