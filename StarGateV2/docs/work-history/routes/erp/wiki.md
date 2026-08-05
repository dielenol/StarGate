# /erp/wiki

## 2026-08-05 · 기능 추가 · 통합 Lore Explorer

- 위키, 작전 보고서, 인물, 카탈로그, 세력, 기관을 한 검색창에서 조회하는 통합 Lore Explorer와 종류·분류 facet을 추가했다.
- 목록 API를 서버 cursor pagination으로 전환하고 초기 데이터와 infinite query를 연결해 재진입·추가 로드 시 캐시를 재사용한다.
- auxiliary 검색 projection이 없거나 부분 장애인 경우 권한 검사를 유지한 domain fallback과 경고·재시도 UI를 제공한다.
- 위키·보고서·인물·카탈로그·세력 변경은 lore search Query를 함께 무효화하며 비공개 문서는 V 미만에 fail-closed한다.
- 검증: 검색·권한·pagination 계약 테스트, `pnpm typecheck`, `pnpm lint`, `pnpm build` 86페이지, 인증된 데스크톱·390px 브라우저에서 가로 overflow 0 및 콘솔 오류 0건
- 관련 커밋: `a57ecd94`
- 후속 작업: live lore index 생성과 projection rebuild는 별도 운영 승인 후 적용·재검증한다.
