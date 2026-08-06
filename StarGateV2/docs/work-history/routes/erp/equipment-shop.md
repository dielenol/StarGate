# `/erp/equipment-shop` 작업 이력

## 2026-07-30 · 버그 수정 · NPC 대사 HUD 상시 표시

- 병기부 허브와 연구소·토와스키·아케론·전략 보급소·공방에서 대사 완료 후 HUD가 자동 축소되던 동작을 제거했다.
- 데스크톱·모바일의 운영 잠금 컨트롤을 HUD 위로 이동하고, 기존 하단 안전 여백으로 가려진 조작 UI를 끝까지 스크롤해 접근할 수 있음을 확인했다.
- 검증: `pnpm lint`, focused ESLint, `git diff --check`, 인증 브라우저 1280×720·390×844 전 구역 확인(가로 넘침·고정 UI 충돌·콘솔 오류 없음)
- 관련 커밋: `7ea4903`
- 후속 작업: 전체 `pnpm typecheck`는 별도 작업 중인 `equipment-shop/simulator/EquipmentSimulatorClient.tsx`의 null 가능성 오류로 차단됨

## 2026-07-30 · 기능 변경 · 공방·연구 실시간 갱신

- 공방 요청과 연구 상태의 30초·60초 polling을 실시간 연결 상태 기반 fallback으로 전환했다.
- `master_items`, 인벤토리, 라이선스·공방·연구 컬렉션 변경이 병기부 카탈로그와 관련 Query를 함께 갱신한다.
- 시간 경과와 라이선스 복구에 필요한 기존 timer/polling은 유지했다.
- 검증: `pnpm test:worker`, realtime 계약 테스트, `pnpm lint`, `pnpm typecheck`, `pnpm build:web`
- 관련 커밋: `bba8924`

## 2026-08-06 · 기능 확장 · 공방 요청 장비 계약

- 공방 요청과 인벤토리 응답에서 재료 범위, 복수 장비 액션, 충전, 탄약, 거치 규격을 구조화해 보존한다.
- 요청·결과 이미지의 역할을 분리하고 정확한 사거리나 기계 판정이 없는 공격 액션은 Nochichim에서 실행 가능 상태로 추정하지 않는다.
- 검증: 집중 테스트 74건 중 68건 통과·Mongo 통합 6건 환경 부재로 skip, `pnpm typecheck`, `pnpm lint`, `pnpm build`
- 관련 커밋: `30ffe959`

## 2026-08-06 · 기능 확장 · 피안의 보루 전투 연동

- 네베드 전용 공방 프리셋에 1,200 CR·180분·TOWASKI 주담당·VERNIER 검수와 확정된 재료·이미지를 등록했다.
- W1은 돌격소총 사거리별 고유 피해와 일반 탄약 1발만 사용하고 캐릭터 기본 ATK를 더하지 않으며, U1 거치·해제와 U2 CENSOR-3 승인탄 사격을 구조화했다.
- CENSOR-3 한 발 사용은 Registra 유효표 과반 승인 원장과 실제 소모품 차감을 같은 멱등 트랜잭션으로 묶었다.
- 검증: 집중 테스트 60건 중 58건 통과·Mongo 통합 2건 환경 부재로 skip, Registra 28건, `pnpm typecheck`, `pnpm lint`, `pnpm build`, Nochichim 장비 판정 테스트, critical risk review
- 관련 커밋: `44b83580`, `0ca9972c`, `cfb2df1`
- 후속 작업: 라이브 seed·깨진 음절 3개 전환·공방 견적 및 Discord 투표 생성은 별도 운영 승인 뒤 실행한다.
