# Discord 로그인 발급자 검증 수정 배포 · 2026-11-09

사용자의 명시적 승인에 따라 Discord OAuth 수정만 운영에 배포했다. Discord 승인 뒤 Ordonet 콜백에서 발생한 `CallbackRouteError` / `unexpected "iss" (issuer) response parameter value`가 대상이다.

## 소스와 배포

- 직전 운영 소스: `8b8f2b6721cf433e6e0680f1f634e35a15b881d3`.
- 직전 운영 배포: `dpl_3zN5t4s51HqwPBBscCxQ1RC3zcWg`.
- 원본 구현: `d7633c2b`. 별도 worktree에서 운영 소스 위에 이 커밋만 적용했다.
- 릴리스 소스: `2f09749d8b05b5a7dee642c63f790bd739a1c182`, 로컬 브랜치 `codex/discord-login-fix-20261109`.
- 새 운영 배포: `dpl_CZyYxgzeGrJzKiUwBakeKyzNXdmW` (`READY`).
- 배포 URL: `https://star-gate-star-gate-v2-dwe8ihkxs-dielenols-projects.vercel.app`.
- `www.ordonet.co.kr`와 `ordonet.co.kr`가 새 배포를 가리키고, 배포 API의 `gitCommitSha`와 `releaseCommit`이 릴리스 소스와 일치함을 확인했다.

기준 대비 변경은 `lib/auth/config.ts`의 Discord issuer 지정과 `lib/auth/__tests__/discord-oauth.test.mjs` 회귀 테스트 두 파일이다. 원본 작업 공간의 다른 미배포 변경과 환경 파일은 포함하지 않았다. 운영 환경변수·DB·계정·권한 설정과 Git 원격 브랜치는 변경하지 않았다.

## 검증과 전환

- 독립 릴리스 검토에서 원본 구현과 릴리스 두 파일이 동일하고, 인증 코드 기준·lockfile·실제 Auth.js 버전이 동일함을 확인했다.
- 분리된 배포본에서 회귀 테스트 4/4, 타입 검사, lint, diff 검사를 통과했다. Vercel 운영 빌드도 통과했다.
- `--prod --skip-domain`으로 빌드한 뒤, 보호된 배포 URL에서 로그인 200, CSRF 200, signin 302, 숫자 앱 ID, 정확한 운영 callback URL, PKCE `S256`을 확인했다.
- 올바른 issuer와 가짜 인증 코드의 콜백은 발급자 검증을 통과해 토큰 교환의 `invalid_grant`까지 도달했다. 다른 issuer는 `unexpected "iss"`로 거부했다. 두 경우 모두 사용자 세션은 생성되지 않았다.
- 승격 직전 운영 배포가 직전 기준과 같음을 재확인하고 `vercel promote`를 실행했다. 두 운영 도메인의 배포·소스 일치를 재조회했다.
- 승격 후 실제 `https://www.ordonet.co.kr`에서 로그인 시작과 정상 issuer의 가짜 코드 콜백 한 건을 다시 확인했다. 요청 `cs8qn-1794229518211-65531f171853`의 로그는 `invalid_grant`로, 정상 issuer가 토큰 교환 전에 잘못 거부되던 현상이 해소됐음을 확인했다. 세션 응답은 빈 세션이었다.
- 운영 브라우저에서 로그인 화면의 Discord 버튼을 눌러 정상 Discord 로그인 화면으로 이동함을 관찰했다.

합성 콜백의 오류 응답은 Auth.js가 `Configuration`으로 감쌌으므로 HTTP 상태만으로 판정하지 않고 요청별 로그의 원인을 구분했다. 이 의도적인 실패 요청을 실제 사용자 로그인 실패로 집계하지 않는다. 실제 개인 Discord 계정의 로그인 완료는 수행하지 않았다. 토큰·쿠키·CSRF·인증 코드가 담긴 임시 파일은 제거했다.

## 실행 중 정리한 항목

첫 후보 `dpl_5YKsve7iMnEiiwr4riATFMNkcBKd`는 추적용 사용자 정의 커밋 메타데이터의 입력 오류를 발견해 빌드 중 취소했고 `CANCELED`를 확인했다. 운영 도메인에 승격하지 않았다. 이후 Git에서 읽은 정확한 해시로 위의 최종 후보를 새로 만들었다.

로컬 `localhost:43849`의 별도 임시 미리보기 서버와 `fixture-nosb91` 설정은 이번 상용 배포 범위가 아니다.
