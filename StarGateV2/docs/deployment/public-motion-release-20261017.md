# 메인·로그인 문장 모션 운영 배포 · 2026-10-17

## 운영 반영

- 확인 시각: 2026-10-17 19:20 KST.
- 운영 주소: https://www.ordonet.co.kr/ 및 https://www.ordonet.co.kr/login
- 배포 소스: `37f23be7d748fdd43289bf3c8bc9f353ad978737`.
- 배포 ID: `dpl_EqoAEucLTmYfVNZ82EtEcymYJaRJ` (production, READY).
- 배포 URL: https://star-gate-star-gate-v2-2cka7yv7c-dielenols-projects.vercel.app
- `www.ordonet.co.kr`과 `ordonet.co.kr` alias가 새 배포 ID를 가리킴을 확인했다. 루트 도메인의 www 리다이렉트는 유지된다.
- 배포 브랜치: `codex/public-motion-release-20261017`. 이번 배포 브랜치만 원격에 push했다.
- 직전 운영 배포: `dpl_6PFk78mYgBJBrjwtz4KgBeKnopER`, 소스 `092fa182ab8463552a3f00267e47fff5a60a1fa5`.

## 포함 범위

직전 운영 소스를 기준으로 이번 메인·로그인 구현과 페이지 이력 두 커밋만 옮겼다. 로컬 main의 다른 미배포 커밋은 포함하지 않았다.

| 내용 | 원본 커밋 | 배포 브랜치 커밋 |
|---|---|---|
| 공식 문장 모션·메인·로그인 디자인 | `0e5f92f1` | `b04a4a0e` |
| 페이지별 작업 이력 | `eacadc76` | `37f23be7` |

- 운영 기준 변경은 런타임 7개·이력 2개 파일이다. 독립 리뷰에서 원본과 배포 구현의 patch-id 및 7개 파일 blob이 모두 동일함을 확인했다.
- 이력 충돌은 기존 운영 기록 전체를 유지하고 이번 10월 17일 항목만 추가해 해결했다.
- 인증 처리·권한·DB·빌드 설정·의존성은 변경하지 않았다. 리뷰에서 추가 수정 사항은 발견되지 않았다.

## 검증

- 배포 브랜치에서 shared-db·core 패키지 빌드, `pnpm --filter stargatev2 typecheck`, 앱의 `pnpm lint`, `git diff --check` 통과.
- Vercel 운영 빌드에서 컴파일·타입 검사·배포 완료 및 READY 상태를 확인했다.
- 도메인 연결 전 보호된 새 배포에서 `/`와 `/login`이 모두 HTTP 200이며 모션 UI를 포함함을 확인했다. 연결 직전 기존 운영 배포가 준비 시작 때와 같음을 확인한 뒤 promote했다.
- 실제 운영 브라우저에서 메인·로그인의 1440×1000 및 390×844 화면을 직접 확인했다. 모바일 로그인 하단의 Discord·게스트 버튼과 오류 안내까지 확인했으며 가로 넘침은 없었다.
- 메인의 문장→세계 지도 방향키 전환, 모션 재생·정지, 로그인 빈 입력 안내와 아이디 포커스, 비밀번호 표시 전환을 확인했다. 로그인 모션 3개의 CSS 재생 상태가 모두 `paused`로 바뀜을 확인했다. 브라우저 콘솔 경고·오류는 0건이었다.
- 동일한 런타임 파일에 대한 앞선 로컬 검증을 재사용했다: 메인 320·390·700·701·1440px, 로그인 320·390·760·761·768·1440px, 탭 순환·Home·End·Tab, 두 입력의 빈 값 안내 및 모션 제어.
- 해당 운영 배포의 최근 15분 error/fatal 런타임 로그 집계는 0건이었다. 이는 확인 시점의 관측 범위다.

## 검증 경계와 작업 공간

- OS 모션 감소 설정을 전환하는 브라우저 도구가 없어 `prefers-reduced-motion` 분기는 코드 리뷰로 확인했다. 해당 OS 설정에서의 실제 렌더링은 미검증이다.
- 실제 계정·Discord·게스트 인증은 이번 시각 변경 검증 범위에 포함하지 않았다. 라이브 ERP 업무 데이터나 운영 DB는 변경하지 않았다.
- 원본 작업 공간의 `.DS_Store`, `StarGateV2/lib/gallery/__tests__/gallery-safety-contract.test.mjs`, `StarGateV2/next-env.d.ts`, `.agents/`, `StarGateV2/_watch-stm.mjs`를 보존했다.
- 배포 중 별도 작업으로 발생한 `trpg-web/app/(auth)/login/`의 `LoginMotion.tsx`, `LoginMotion.module.css`, `page.tsx`, `page.module.css`, `LoginBackdrop.tsx`, `LoginBackdrop.module.css` 변경도 포함하지 않았다.
- 배포 후 추가한 이 문서와 페이지 이력은 운영 기능 코드를 변경하지 않는다.
