# 공용 인벤토리 미지급 전리품 백필 — 2026-07-28

## 작업 범위

- 대상: `shared_inventory`, scope `GLOBAL`
- 출처 등급: 사용자 제공 보상표(`canon-from-source`) + 기존 DB/세션 기록 식별자 대조
- 목적: 이미 별도 지급된 포인트·크레딧·호의도·해금 보상을 제외하고, 미지급 전리품만 공용 인벤토리에 등록
- 현재 상태: live apply 전 dry-run 및 사용자 실행 확인 대기

## 커버리지

| 보상 묶음 | 원문 전리품 | 정규화된 카탈로그 slug | 수량 | master 상태 | 적용 상태 |
|---|---|---|---:|---|---|
| S1E1 질서 | Zulu 028 개체(생포) | `zulu-0028-contained-entity` | 1 | 신규 | 대기 |
| S1E1 질서 | 깨진 음절 샘플 | `broken-syllable` | 3 | 기존 재사용 | 대기 |
| S1E2 선택 | Zulu 040 "왕관" 본체 생포 | `zulu-0040-crown-specimen` | 1 | 기존 재사용 | 대기 |
| S1E2 선택 | Zulu 872-3 "이동식의 날개" | `zulu-0872-3-dongsik-wings` | 1 | 기존 재사용 | 대기 |
| S1E2 선택 | Zulu 1004 "커룹의 불칼" | `kerub-fireblade` | 1 | 기존 재사용 | 대기 |
| S1E3 망령 | 도살견 외관 도본 | `montauk-slaughter-hound-appearance-plate` | 1 | 신규 | 대기 |
| S1E3 망령 | 지휘자 시신 | `conductor-corpse` | 1 | 신규 | 대기 |
| S1E3 망령 | 음반축 | `conductor-record-spindle` | 3 | 신규 | 대기 |
| S1E3 망령 | 황금여명회 컬티스트의 가면 | `golden-dawn-cultist-mask` | 5 | 신규 | 대기 |
| S1E4 프라토 | 뒤집어진 양말 생포 | `inverted-sock-contained-entity` | 1 | 신규 | 대기 |
| 세션 ID 미확정 보상표 | 작전 중 화이트 로즈 조력자 호출 가능 | `white-rose-assistant-call` | 1 | 신규 | 대기 |

- 합계: 11종, 19개
- `지휘자 시신과 음반축 3개`는 시신 1개와 음반축 3개로 분리한다.
- 화이트 로즈 조력자 호출권은 수량 1의 소모품으로 등록한다. 사용자는 사용 사실을 선언해야 하며, 승인된 사용 시 1개가 소모된다.
- 호출권 효과는 기자회견 없이 현재 작전 지역 안정도를 즉시 1로 조정하고 시민 협조를 발생시키는 것으로 확정한다.

## 제외 및 미변경

- 호의도, 포인트, 크레딧, 클래스 해금, 작전 참여 상태는 사용자가 이미 지급했다고 명시했으므로 변경하지 않는다.
- shop stock, character inventory, credits, stock price/history, holdings, 알림·메시지·웹훅은 변경하지 않는다.
- 신규 카탈로그 7건은 모두 `isAvailable: false`로 유지한다. 호출권은 `CONSUMABLE`이지만 상점 판매나 일반 지급 대상으로 개방하지 않고 보상 전용 공용 인벤토리 항목으로 표시한다.

## Visual Asset Ledger

| 대상 | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel |
|---|---|---|---|---|---|
| 신규 SPECIAL 6건 | 미변경 | 미변경 | 미변경 | 전용 픽셀아트 아이콘 생성 및 `previewImage` 연결 | 해당 없음 |
| 화이트 로즈 조력자 호출권 | 미변경 | 관련 로어 태그 연결 | 미변경 | 소모품 전용 픽셀아트 아이콘 및 `previewImage` 연결 | 해당 없음 |
| 기존 카탈로그 4건 | 미변경 | 미변경 | 미변경 | 기존 preview 유지 | 해당 없음 |

- 기존 위키 도판은 카탈로그 미리보기와 자산 역할이 다르므로 자동 재사용하지 않는다.

## 실행 게이트

- dry-run 기준 신규 `master_items` 7건, 기존 4건 재사용.
- dry-run 기준 대상 11종의 현재 공용 수량은 모두 0.
- 실제 실행은 대상 행이 하나라도 선행 생성되면 트랜잭션을 중단한다.
- 실제 실행은 사용자에게 변경 전→후와 부수 효과를 제시하고 즉시 실행 확인을 받은 뒤에만 수행한다.
- 실행 후 `economic_operations`, `master_items`, `shared_inventory`를 독립 재조회한다.
