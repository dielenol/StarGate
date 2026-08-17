# /erp/gallery

## 2026-08-17 · 기능 추가 · 세션 앨범과 회원 팬아트

- 접근 가능한 세션 보고서의 도판을 앨범으로 자동 구성하고 회원 팬아트를 검색·종류·앨범 필터와 반응형 4/2/1열 그리드로 함께 탐색할 수 있게 했다.
- 키보드 이동·focus 복원·scroll lock을 갖춘 lightbox와 업로드·메타데이터 수정·소유자 삭제·V 이상 운영 숨김 UI를 추가했다.
- 팬아트 원본과 thumbnail을 private Blob으로 분리하고, MIME·decode·6MP·4MB 검증, 사용자별 직렬 lease, 일일 원자적 quota, idempotency·CAS, durable cleanup과 보고서 연결 race 방어를 적용했다.
- 보고서와 팬아트 realtime resource를 갤러리 Query에 연결하고, 연결 장애일 때만 60초 polling으로 복구하도록 했다.
- 운영 기본 잠금은 유지했으며 라이브 Blob·DB index·페이지 잠금 상태는 변경하지 않았다.
- 검증: 갤러리 행동·계약 테스트 37/37, web realtime 10/10, core 계약 2/2, worker realtime 6/6, `pnpm typecheck`, 전체 `pnpm lint`, 102 route production build, 인증 로컬 1440/900/600px의 4/2/1열·검색·필터·lightbox 키보드/focus·가로 overflow·console 오류 0건, critical risk review
- 관련 커밋: `11fc6e98`
- 후속 작업: 운영 활성화 전 승인된 환경에서 private Blob 토큰과 갤러리 index를 적용하고 core/worker를 web보다 먼저 배포한다. 기존 `/assets/session-reports/**` 도판의 byte-level 비공개화는 자산 이전 정책과 함께 별도 진행한다.

## 2026-08-17 · UI 개편 · 시네마틱 전시와 상세 보기

- 검색·필터 결과의 첫 작품을 `CURRENT EXHIBIT`로 크게 배치하고 다음 두 작품을 보조 전시, 나머지를 4/2/1열 아카이브로 구성해 갤러리의 시각적 위계를 강화했다.
- 카드의 흰 문서 패널을 없애고 이미지 위에 다크 HUD, 그라데이션, 미세한 스캔라인과 메타데이터를 겹쳐 NOVUS ERP의 기록 보관소 분위기로 통일했다.
- 상세 보기를 대형 다크 이미지 스테이지와 메타 레일로 재설계하고, 모바일에서는 이미지와 정보가 자연스럽게 이어지는 전체 화면 구조로 전환했다.
- 검색 결과가 한 작품일 때 탐색 버튼을 숨기고, 기존 화살표 키·Escape·focus trap·focus 복원·scroll lock과 팬아트 편집·관리·삭제 동작을 유지했다.
- 검증: `pnpm typecheck`, 전체 `pnpm lint`, `git diff --check`, 인증 로컬 1440/900/600px의 전시·4/2/1열·단일/2개 검색 결과·상세 화면·키보드 탐색·focus 복원·가로 overflow·깨진 이미지·console 오류 0건, 읽기 전용 UI 리뷰
- 관련 커밋: `19905785`

## 2026-08-17 · 버그 수정 · 세션 도판 태그 규격화

- 보고서 전체 참가자 목록을 모든 세션 도판의 이미지 태그로 복사하던 동작을 제거했다. 참가자는 이미지의 피사체나 작가를 뜻하지 않으므로 카드·상세·검색 메타데이터로 사용하지 않는다.
- 세션 도판의 자동 태그는 `세션 / 메인·미니 / 보고서 번호` 세 항목으로 고정하고, 메인·미니 구분은 기존 작전 보고서 번호 계산 결과의 `series` 값을 그대로 사용한다.
- 갤러리 전용 보고서 타입과 MongoDB projection에서도 `participants`를 제외해 불필요한 참가자 데이터가 피드 생성 경계로 들어오지 않게 했다. 팬아트의 사용자가 입력한 자유 태그 규칙은 변경하지 않았다.
- 검증: 갤러리 테스트 38/38, `pnpm typecheck`, 전체 `pnpm lint`, scoped ESLint, `git diff --check`, 인증 로컬에서 MINI06 카드·상세 `세션 / 미니 / MINI06`, 참가자 전체 문자열 검색 0건, MINI06 검색 12건, 메인 검색 42건, 가로 overflow·console 오류 0건, 읽기 전용 코드 리뷰
- 관련 커밋: `3486a8c5`

## 2026-08-17 · UI 개편 · 편집형 작품 상세 뷰어

- MoMA·Artsy·Magnum·Gagosian의 작품 상세 화면에서 공통으로 보이는 작품 우선 배치, 절제된 편집형 캡션, 최소한의 화면 chrome을 참고해 상세 보기를 다시 구성했다.
- 이미지 스테이지와 메타데이터 패널 사이의 경계, 사각형 이전·다음 버튼, 하단 중복 내비게이션, 태그 칩을 제거하고 하나의 다크 캔버스와 반투명 원형 컨트롤로 통합했다.
- 제목과 설명이 같은 세션 도판은 설명을 반복하지 않고, 세션 번호·작가·작전 보고서 링크·태그를 본문 타이포 위계로 정리해 ERP 관리 패널 인상을 줄였다.
- 920px 이하에서는 이미지 무대 아래 정보 시트가 겹쳐지는 단일열 레이아웃으로, 760px 이하에서는 safe area를 고려한 전체 화면 감상 구조로 전환했다.
- 기존 화살표 키·Escape·focus trap·focus 복원·overlay 닫기·scroll lock과 단일 검색 결과의 탐색 버튼 숨김 동작을 유지했다.
- 검증: 갤러리 테스트 38/38, `pnpm typecheck`, 전체 `pnpm lint`, `git diff --check`, 인증 로컬 1440/900/600px의 상세 화면·키보드 탐색·focus 복원·가로 overflow·깨진 이미지·console 오류 0건, 읽기 전용 UI 리뷰
- 관련 커밋: `b673150c`
