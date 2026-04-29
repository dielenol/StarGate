# 캐릭터 통짜 데이터 업데이트 규약

`/erp/admin/characters/import` 처리, 시트 일괄 백필, Claude/스크립트로 캐릭터 lore·play 를 덮어쓰는 경우의 운영 규약.

## bulkUpdatedAt 필드 갱신

- shared-db `Character` 인터페이스에 `bulkUpdatedAt?: Date` 필드가 있다 (StarGateV2/types 에서 re-export).
- **통짜 데이터 업데이트 시 반드시 `bulkUpdatedAt: new Date()` 함께 `$set`** — UI(GM 전용 SYNC 표시)가 이 값으로 시점을 노출한다.
- 사용자 폼 편집(`/erp/characters/[id]` 편집, change-logs revert) 은 별개. API PATCH 화이트리스트(`ROOT_ALLOWED_FIELDS_ADMIN` / `ALLOWED_LORE_FIELDS_*` / `ALLOWED_PLAY_FIELDS_*`) 에 `bulkUpdatedAt` 이 없어 폼으로는 갱신되지 않는다 — 의도된 동작이므로 화이트리스트에 추가하지 말 것.
- `updatedAt: new Date()` 도 함께 갱신 (모든 mutation 의 공통 필드).

## 일회성 마이그레이션 스크립트 패턴

```js
const update = {
  $set: {
    // ... 시트 본문 / 능력치 / 어빌리티 등 ...
    updatedAt: new Date(),
    bulkUpdatedAt: new Date(),
  },
};
```

스크립트 위치: `StarGateV2/scripts/_oneoff-update-<codename>.mjs` 로 작성 → 실행 → 결과 확인 → 즉시 삭제 (`rm`). 영구 보관 X.

## UI 노출 위치

- `/erp/personnel/[id]` (DossierClient) — `clearance === "GM"` 일 때 read-only notice 영역에 `SYNC · YYYY.MM.DD.` 노출
- `/erp/characters/[id]` (CharacterDetailClient) — `isGM` prop 이 true 일 때 PageHead 아래 dashed-border admin meta 라인으로 노출

## 백필 정책

기존 데이터에 `bulkUpdatedAt` 이 없으면 `getDate()` 기반 폴백 표시는 하지 **않는다** (필드 부재 = "통짜 동기화 이력 없음" 시그널). UI 도 `character.bulkUpdatedAt` 이 truthy 일 때만 라인을 렌더한다.
