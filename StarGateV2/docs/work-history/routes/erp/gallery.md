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
