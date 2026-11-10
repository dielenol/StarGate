# 사이트 전체 보안 봉쇄 · 2026-10-25

대상은 `www.ordonet.co.kr` 전체이며 구현 커밋은 `6ae095d9`다. 사용자의 명시적 상용 배포 승인에 따라 2026-10-25 20:14 KST 운영 도메인 반영과 실제 차단을 확인했다.

- 기존 운영 main `b6e477c12cf1a823cf45308c112b4d77a4dd3fde`에서 분리한 checkout에 구현 커밋만 적용했다. 원본 feature 브랜치의 무관한 봇 변경은 포함하지 않았다.
- 릴리스 소스: `e0c9b6d37a9a76c00a80ba61a9e1dbb208726447`.
- 운영 배포: `dpl_8keBs8AVMinb7sczVika2ZbWDM7Z` (`READY`). CLI로 production 배포를 만들고 `--skip-domain` 상태에서 검증한 뒤 Vercel MCP로 승격했다. `www.ordonet.co.kr` 조회가 이 배포를 가리킴을 확인했다.
- 배포 URL: `https://star-gate-star-gate-v2-ed9tfnzp4-dielenols-projects.vercel.app`. 소스는 분리 checkout의 로컬 커밋으로 보존했다. 원격 main 변경이나 다른 feature 변경의 배포는 하지 않았다. 이후 배포에도 이번 봉쇄 변경을 포함해야 유지 정책이 보존된다.

화면의 침해 탐지·관리자 계정 탈취·복구 로그는 사용자 요청으로 구현한 임시 봉쇄 화면의 연출이다. 이 구현과 화면 자체는 실제 침해 사고가 확인됐다는 증거가 아니다.

## 유지 정책

- KST 2026-10-25 20:00부터 별도 사용자 재개 지시까지 봉쇄한다. 1~2개월이 지나더라도 자동 해제하지 않으며 고정 종료일을 두지 않는다.
- `endsAt`의 2026-10-26 12:00은 다음 상황 안내 기준 시각이다. 이후에도 `active`를 유지하고 “보안 점검이 계속되고 있습니다. 서비스 재개 일정은 추후 별도 공지하겠습니다.”를 표시한다.
- 운영에서는 `ERP_MAINTENANCE_START_AT`·`ERP_MAINTENANCE_END_AT` override를 무시한다. `ERP_MAINTENANCE_DISABLED=1`만 명시적 `off`이며, 다른 값이나 날짜 경과로 해제하지 않는다.
- 공개 홈페이지·로그인·ERP·일반 API·인증 API·cron/worker HTTP 요청을 모두 차단한다. 페이지 GET/HEAD는 307로 `/maintenance`에 이동하고 API·쓰기 요청은 `503 SITE_MAINTENANCE`를 반환한다. 응답은 `no-store`이며 `Retry-After: 3600`은 재확인 간격이다.
- GET/HEAD의 `/maintenance`, `/api/maintenance`, `/_next/static/` 및 명시된 공지 로고·favicon만 허용한다. 개발 미리보기는 운영에서 허용하지 않는다. 확장자가 있는 파일이나 이미지 최적화 경로를 일반 우회로 열지 않는다.
- 외부 봇 프로세스, 직접 DB 연결, 이미 실행 중인 요청은 중단하지 않는다. 배포 전에 열린 구버전 화면의 표시를 소급해서 회수할 수는 없으나 이후 서버 요청은 차단한다. 이 문서는 해당 서비스의 중단·DB 변경·업무 처리·메시지 발송 권한을 부여하지 않는다.

## 배포 전 확보한 증거

- 집중 테스트 39/39, gate lifecycle 28/28, `pnpm typecheck`, `pnpm lint`, `pnpm build` 통과.
- 로컬 production HTTP 50건 통과. 서버 시각을 2026-12-27로 둬도 `active`를 유지하고 페이지·API 차단이 지속됨을 확인했다.
- 다음 안내 시각 이후 1440px 데스크톱·390px 모바일에서 계속 점검 문구와 94% 검증 대기 상태를 확인했다. 공개 아카이브·ERP 우회 링크를 제거했다.

## 운영 검증 결과

- 승격 직전 운영 배포가 기존 `dpl_9WdtnV2V9f2TLqg1eYanpPBriu1A`임을 확인했다. 새 배포의 보호된 URL에서 홈·로그인 공지 전환과 인증·cron API 503을 확인한 뒤 승격했다.
- 실제 `https://www.ordonet.co.kr`에서 50개 HTTP 검사를 통과했다. 페이지 GET/HEAD 307, 인증·없는 ERP/cron/worker 검사 경로의 7개 HTTP 메서드 503, 공지·상태·로고에 대한 쓰기 503, RSC·우회 헤더 차단, 공지·상태·로고 정상 로딩을 확인했다. 기존 업무 레코드의 mutation은 실행하지 않았다.
- 상태 응답은 `phase=active`, `scope=site`, `resumePolicy=manual`이며 차단·상태 응답에 `no-store`가 적용된다. 운영 점검 환경변수는 별도로 추가·변경하지 않았다.
- 운영 브라우저에서 실제 1280×720·390×844 viewport의 화면을 확인했다. 모바일 가로 넘침은 없었고 새 운영 탭의 console warning/error는 0건이었다. 20:14 KST에 새 배포의 최근 5분 error/fatal 로그 조회 결과는 0건이었다.
- 화면 증거: `/Users/flitto/Documents/ChatGPT/StarGate/site-lockdown-20261025/live-desktop.jpg`, `live-mobile.jpg`, `after-deadline-mobile.jpg`(마지막 파일은 로컬 미래 시각 검증).

## 후속 배포 시 확인

- production 대상과 실제 소스 커밋을 확인하고 `ERP_MAINTENANCE_DISABLED=1`이 남아 있지 않은지 값 노출 없이 점검한다.
- `/api/maintenance`의 `phase=active`, `scope=site`, `resumePolicy=manual`을 확인한다.
- 운영 도메인의 홈·공개 문서·로그인·ERP 이동과 인증·일반·cron/worker API의 503, 공지 정적 자산 로딩을 확인한다. 라이브 업무 mutation으로 시험하지 않는다.
- 이번 봉쇄 구현을 포함한 소스를 사용하고 실제 배포 소스·배포 식별자·운영 HTTP 및 화면 확인 결과를 기록한다. 봉쇄 이전 main을 그대로 재배포하지 않는다.

## 재개 체크리스트

1. **별도 사용자 재개 지시를 먼저 받는다.** 날짜 경과, 복구율 또는 점검용 테스트 통과를 재개 승인으로 해석하지 않는다.
2. 재개 변경을 준비하고 정상 인증·권한·캐시 흐름을 로컬에서 검증한다. 긴급 해제가 필요하면 승인된 범위에서 `ERP_MAINTENANCE_DISABLED=1`을 사용할 수 있다.
3. **root의 `SiteMaintenanceGate` 통합, 15초 전역 polling, 봉쇄를 위해 추가한 `force-dynamic`을 제거한다. 환경변수만 `off`로 둔 채 이 임시 구조를 영구 유지하지 않는다.** 정상 페이지 캐시와 기존 provider·권한 경계를 복원하고 관련 테스트를 갱신한다.
4. 사용자 승인 범위에서 재개 코드를 배포한 뒤 홈·공개 문서·로그인·ERP, 인증 콜백·게스트·역할별 권한 및 API 흐름을 확인한다. 더 이상 전역 상태 요청이나 강제 동적 렌더링 부담이 남지 않았는지 확인한다.
5. 별도로 멈춘 외부 서비스가 있다면 해당 서비스의 권한과 절차에 따라 복원한다. 재개 시각·실제 소스·검증 결과를 기록하고 임시 해제 설정을 정리한다.

## 2026-11-10 재개 · 봉쇄 코드 main 병합과 기본 꺼짐

- 재개 지시: 2026-11-10 사용자가 봉쇄 작업을 main에 병합하고, 지금은 봉쇄가 뜨지 않도록 조건을 바꾸라고 지시했다. 이를 별도 재개 지시로 본다.
- 이전 상태: 운영은 10/28 PR #4의 main 배포(`84040b49`) 이후 봉쇄 코드 없이 열려 있었다. 11/10 main 정리 병합(`4ba7898f`)도 봉쇄 코드를 포함하지 않았다.
- 변경: 봉쇄 코드를 main에 병합하고(`57d84f94`), 운영 일정을 `null`로 두어 꺼진 상태로 유지한다(`9ed7e878`). 운영 Vercel env에는 `ERP_MAINTENANCE_*` 키가 없어 정리할 임시 해제 설정이 없다.
- 재개 체크리스트 3번 처리: 게이트 코드는 다시 켤 때를 위해 남기되 `off`에서는 렌더하지 않는다. 15초 전역 polling, 루트 `force-dynamic`, 사이트 전체 proxy matcher는 꺼진 상태에서 제거했다.
- 다시 켜는 절차:
  1. `lib/maintenance/schedule.ts`의 `ERP_MAINTENANCE_WINDOW`에 KST 일정을 넣는다.
  2. `proxy.ts` matcher를 `["/:path*"]`로 바꾼다. 일관성 테스트가 이 짝을 강제한다.
  3. 루트 layout에 `force-dynamic`을 복원한다.
  4. 위 "후속 배포 시 확인"을 따른다.
- 검증: 집중 테스트 41/41, 타입 검사·lint·build 통과(정적 11·동적 202). 로컬 production HTTP와 headless 관찰로 차단·503·상태 조회가 없음을 확인했다. 운영 배포 결과는 배포 뒤 이 항목 아래에 추가한다.
