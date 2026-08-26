---
title: 로어북
updated: 2026-08-25
---

# StarGate 로어북

StarGate 세계관의 **배경 자료집**. Codex의 `stargate-lore` workflow가 NPC / Faction / Institution 문서 작성, 세션 동기화, canon 조회와 연속성 감사에 참조하는 독립 산문 모음이다.

- **`stargate-lore`는 작업 도메인에 필요한 문서만 우선 읽고, 연속성 판단이 필요하면 이 인덱스와 관련 산문을 함께 조회**한다. `/create-lore`는 현행 skill의 legacy 호출 별칭일 뿐 별도 계약이 아니다.
- **Zod 검증 없음 — 자유 산문.** 규격 강제보다 일관성과 가독성이 우선. 규격 문서가 필요하면 `StarGateV2/docs/spec/` 를 사용한다.
- **웹앱/봇은 산문 MD를 직접 렌더링하지 않는다.** ERP에 노출할 내용은 검증된 spec/seed payload/DB record로 별도 동기화한다. `session-sync/`와 `static-target-baseline.json`은 checker가 읽는 내부 감사 자료다.

## 폴더 구조

```
docs/lore/
├── README.md               # 이 문서
├── history/                # 역사적 사건, 시기별 서사
├── ideology/               # 이념, 사조, 세계관 원리
├── concept/                # 개념, 용어, 현상 정의
├── faction/                # 세력 스켈레톤 (세부는 롱폼 추가 예정)
├── place/                  # 장소, 지리 (현재 비어있음)
├── session-sync/           # 세션 동기화 내부 점검/coverage 노트
└── static-target-baseline.json # payload가 없는 read-only 검증 live target inventory
```

## 현재 문서 인덱스

### history/

- [제2차 세계대전과 오컬트](history/ww2-occult.md)
- [노부스 오르도 창설](history/novus-ordo-founding.md)
- [질서의 균열](history/order-cracks.md)
- [오로라 바이러스 (2021)](history/aurora-virus-2021.md)
- [오늘의 기로](history/crossroads.md)

### ideology/

- [변칙적 현실주의](ideology/anomalous-realism.md)

### concept/

- [이상 현상 (Anomaly)](concept/anomaly.md)
- [깨진 음절](concept/broken-syllable.md)
- [광원화 (Light-sourcing)](concept/light-sourcing.md)
- [노부스 오르도 전투 근간 규칙](concept/novus-ordo-combat-foundations.md)
- [궁극기 (R 슬롯)](concept/ultimate-ability.md)
- [산성 상태이상](concept/acid-status-effect.md)
- [박애솔 화염방사기 전투 스킬](concept/park-aesol-flamethrower-abilities.md)

### faction/

- [군부 (Military)](faction/military.md) — 스켈레톤
- [세계 이사회 (World Council)](faction/world-council.md) — 스켈레톤
- [시민사회 (Civil Society)](faction/civil.md) — 스켈레톤

### place/

(비어있음)

### session-sync/

- [2026-08-17 전체 원본 재대조 원장](session-sync/nosb-source-reconciliation-2026-08-17.md)
- [NOSB MINI01 뉴 더블린 coverage](session-sync/nosb-mini-s1e1-new-dublin-coverage.md)
- [NOSB MINI02 미니미니 유산 coverage](session-sync/nosb-mini-mini-legacy-coverage.md)
- [NOSB MINI03 5959 사태 coverage](session-sync/nosb-mini-5959-containment-coverage.md)
- [NOSB MINI04 화양연화 coverage](session-sync/nosb-mini-hwayangyeonhwa-coverage.md)
- [NOSB MINI05 로맨티드 coverage](session-sync/nosb-mini-romantid-coverage.md)
- [NOSB MINI06 전사의 탄생 coverage](session-sync/nosb-mini-neved-coverage.md)
- [NOSB MINI06 전사의 탄생 NPC 적용 명세](session-sync/nosb-mini-neved-npc-apply.md)
- [NOSB S1E1 질서 coverage](session-sync/nosb-s1e1-order-coverage.md)
- [NOSB S1E1 미니 coverage](session-sync/nosb-s1e1-mini-coverage.md)
- [NOSB S1E2 선택 coverage](session-sync/nosb-s1e2-choice-coverage.md)
- [NOSB S1E2 미니 coverage](session-sync/nosb-s1e2-mini-coverage.md)
- [NOSB S1E3 망령 coverage](session-sync/nosb-s1e3-phantom-coverage.md)
- [NOSB S1E4 프라토 coverage](session-sync/nosb-s1e4-prato-coverage.md)
- [NOSB S1E5 악 1부 coverage](session-sync/nosb-s1e5-evil-part1-coverage.md)
- [NOSB S1E5 악 2부 coverage](session-sync/nosb-s1e5-evil-part2-coverage.md)
- [NOSB S1E5 악 2부 NPC 적용 명세](session-sync/nosb-s1e5-evil-part2-npc-apply.md)
- [NOSB S1E6 변곡점 1부 coverage](session-sync/nosb-s1e6-turning-point-part1-coverage.md)
- [NOSB S1E6 변곡점 2부 coverage](session-sync/nosb-s1e6-turning-point-part2-coverage.md)
- [NOSB S1E7 욕구 1부 coverage](session-sync/nosb-s1e7-desire-part1-coverage.md)
- [NOSB S1E7 욕구 1부 성격 관찰 적용 확인표](session-sync/nosb-s1e7-desire-part1-personality-apply-review.md)
- [NOSB S1E7 욕구 1부 리처드 신원 병합 적용 확인표](session-sync/nosb-s1e7-desire-part1-richard-apply-review.md)
- [사망 인원 상태 동기화 검토](session-sync/personnel-deceased-status-2026-08-07-review.md)
- [공개 신원조회 및 미상 초상 적용 원장](session-sync/public-personnel-release-2026-08-12-review.md)
- [신원조회 잔여 초상 3종 연결 원장](session-sync/dossier-portrait-repair-ronnie-noster-zeno-2026-08-16.md)
- [NOSB MINI06 신원조회 초상 교체 원장](session-sync/nosb-mini-neved-dossier-image-repair-2026-08-16.md)
- [NOSB MINI06 GARRETT_CLIMAC 섹터 B 소속 정정 원장](session-sync/nosb-mini-neved-garrett-sector-b-affiliation-repair-2026-08-16.md)

### static target baseline

- [`static-target-baseline.json`](static-target-baseline.json) — durable payload가 아직 없는 live renderer target을 read-only 근거와 함께 제한적으로 등록한다. 관측 시각·만료일(최대 31일)·DB명·renderer payload hash를 포함하며, 자격증명·URI·비밀 값은 기록하지 않는다.

## 구조화 로어 연결

이 산문 인덱스에 항목이 없다고 해서 구조화 로어가 없는 것은 아니다. 이름·코드·소속·공개 여부·아이템 category처럼 DB 계약이 있는 정보는 [세계관 문서 규격](../../StarGateV2/docs/spec/README.md)과 아래 domain 디렉토리가 SSOT다. 같은 내용을 `docs/lore/`에 얇게 복제하지 않고 필요할 때 함께 조회한다.

- [NPC specs](../../StarGateV2/docs/spec/npc/)
- [Faction specs](../../StarGateV2/docs/spec/faction/)
- [Institution specs](../../StarGateV2/docs/spec/institution/)
- [Equipment specs](../../StarGateV2/docs/spec/equipment/)
- [Consumable specs](../../StarGateV2/docs/spec/consumable/)
- [Catalog specs](../../StarGateV2/docs/spec/catalog/)

## 문서 추가 방법

두 가지 경로 중 편한 쪽을 사용한다.

### 1. `stargate-lore` skill 호출

Codex에서 `$stargate-lore`를 지정하거나 세계관 문서 작성·세션 동기화를 요청한다. `/create-lore lore`는 legacy alias로 같은 workflow에 라우팅된다. 산문은 frontmatter 포함 MD로 저장하며, 구조화 자산은 `StarGateV2/docs/spec/`의 schema/adapter 계약을 별도로 따른다.

### 2. 직접 편집

에디터로 해당 카테고리 폴더에 kebab-case 파일명의 MD 파일을 직접 추가한다. 기존 파일들의 frontmatter / 섹션 구조를 참고해 일관성을 유지한다.

## 파일명 규칙

- **kebab-case.md** (예: `aurora-virus-2021.md`, `anomalous-realism.md`)
- 한국어 제목이라도 파일명은 영문 / 숫자 / 하이픈으로 표기
- 연도가 의미 있으면 파일명에 포함 가능 (`aurora-virus-2021.md`)

## Frontmatter 권장 필드

YAML 블록에 다음 필드를 기본으로 둔다 (일관성용 권장이며 하드 제약은 아님):

| 필드 | 설명 |
|------|------|
| `title` | 한국어 제목 (+필요 시 영문 병기) |
| `category` | `history` / `ideology` / `concept` / `faction` / `place` 중 하나 |
| `tags` | 자유 문자열 배열 (optional) |
| `updated` | 마지막 수정일 (ISO, `YYYY-MM-DD`) |
| `source` | 출처 표기 (예: `world-page-timeline`, `stargate-lore`, `manual`) |

세력 문서(`faction/`)는 `code` 필드(`MILITARY` / `COUNCIL` / `CIVIL` 등) 를 추가로 둔다.

## 문서 구성 관례

각 MD는 아래 뼈대를 따르되, 내용 특성에 맞게 조정한다:

1. `## 요약` 또는 `## 정의` — 1~3문장
2. `## 본문` — 실제 서술
3. `## 관련 항목` — 이 문서에서 언급한 다른 로어 문서로의 상대경로 링크

## 제약

- 이 폴더의 산문은 lore 도메인에, 구조화 NPC / Faction / Institution / Equipment / Consumable / Catalog 문서는 `StarGateV2/docs/spec/`에 저장한다.
- 세션 sync coverage는 `Session Coverage Identity`, `NPC Approval Ledger`, `Visual Asset Ledger`, `Personality Evidence Ledger`를 유지한다. 원본이 없으면 checker가 허용하는 정확한 `not-applicable:` 또는 `skipped: source unavailable — ...` 사유를 남기며 apply 승인으로 취급하지 않는다.
- 새 문서나 coverage note를 추가한 변경은 이 README 인덱스를 같은 패스에서 갱신한다.

## 결정적 감사 명령

```bash
cd StarGateV2
pnpm lore:baseline
pnpm lore:baseline -- --verify-live # MONGODB_URI가 있는 read-only parity 확인
cd ..

python3 "$CODEX_HOME/skills/stargate-lore/scripts/check_lore_output.py" \
  --coverage-audit docs/lore/session-sync \
  --payload-root StarGateV2/scripts/seed-payloads \
  --static-payload-audit \
  --static-baseline docs/lore/static-target-baseline.json \
  --asset-root StarGateV2/public
```

첫 검사는 baseline 만료·중복·durable payload 승격 여부를 차단하고, `--verify-live`는 레코드 존재·updatedAt·content hash·alias를 재확인한다. 이어지는 검사는 session report ID의 coverage 누락·중복, 원장 구조/예외, wiki category taxonomy, payload renderer link target을 함께 확인한다. baseline은 seed/live parity를 대신하지 않는다.
