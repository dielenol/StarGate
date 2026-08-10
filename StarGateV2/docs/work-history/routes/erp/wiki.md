# /erp/wiki

## 2026-08-05 · 기능 추가 · 통합 Lore Explorer

- 위키, 작전 보고서, 인물, 카탈로그, 세력, 기관을 한 검색창에서 조회하는 통합 Lore Explorer와 종류·분류 facet을 추가했다.
- 목록 API를 서버 cursor pagination으로 전환하고 초기 데이터와 infinite query를 연결해 재진입·추가 로드 시 캐시를 재사용한다.
- auxiliary 검색 projection이 없거나 부분 장애인 경우 권한 검사를 유지한 domain fallback과 경고·재시도 UI를 제공한다.
- 위키·보고서·인물·카탈로그·세력 변경은 lore search Query를 함께 무효화하며 비공개 문서는 V 미만에 fail-closed한다.
- 검증: 검색·권한·pagination 계약 테스트, `pnpm typecheck`, `pnpm lint`, `pnpm build` 86페이지, 인증된 데스크톱·390px 브라우저에서 가로 overflow 0 및 콘솔 오류 0건
- 관련 커밋: `a57ecd94`
- 후속 작업: live lore index 생성과 projection rebuild는 별도 운영 승인 후 적용·재검증한다.

## 2026-08-07 · 기능 변경 · 보고서 검색·카탈로그 열람 등급

- 통합 Lore Explorer의 live index와 fallback 검색 모두 보고서 `minRole`을 적용해 권한 미달 결과의 제목·존재 여부를 숨긴다.
- 카탈로그 상세의 관련 보고서 카드도 같은 서버 필터를 사용하며, 비공개 카탈로그를 참조하는 보고서는 V 이상으로 제한한다.
- 검증: app 19건, projection 11건, `pnpm typecheck`, `pnpm lint`, `pnpm build`, critical risk review
- 관련 커밋: `1949c42d`

## 2026-08-10 · 보안 개선 · 게스트 공개 검색

- 게스트 Lore Explorer를 비회원 공개 검색으로 분리해 `authenticated` 작전 보고서가 live index와 fallback 어느 쪽에서도 결과에 나타나지 않게 했다.
- 개인 소유 검색 조건에는 합성 게스트 ID 대신 nullable viewer를 사용해 private workshop 문서와 충돌하지 않도록 유지했다.
- 검증: 검색·호출처 계약 테스트, 실제 게스트 보고서 검색 결과 0건, 데스크톱 위키 목록 가로 넘침·콘솔 오류 0건, `pnpm typecheck`, `pnpm lint`, `pnpm build`, critical risk review
- 관련 커밋: `2df03010`

## 2026-08-10 · 라이브 적용 · S1E6 공개 로어 그래프

- `s1e6-turning-point-part1` mirror와 `last-battalion`을 공개하고 광명회·광원화 바이러스·프로젝트 데드 핸드·스페이스 제로·화이트로즈 본문과 태그를 갱신했다.
- Lore Explorer에서 `NOSB-S1E6-TURNING-POINT-PART1` 쿼리가 보고서·mirror·마지막 대대·관련 Dossier의 정규 링크를 `sourceMode: hybrid`, `degradedSources: []`로 반환한다.
- 검증: 기존 위키 5건의 세션 표식·보고서 링크·공개 상태, 원시 `[[...]]` token 0, revision snapshot 5건, 미인증 검색 API `401`
- 관련 적용 소스 커밋: `1acea89c`
