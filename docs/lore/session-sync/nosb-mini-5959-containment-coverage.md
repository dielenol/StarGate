---
title: NOSB-MINI-5959-CONTAINMENT session sync coverage
category: session-sync
tags: [NOSB-MINI-5959-CONTAINMENT, MINI03, stargate-lore]
updated: 2026-08-17
source: stargate-lore-audit
---

# NOSB-MINI-5959-CONTAINMENT Sync Coverage

이 문서는 공개 로어가 아니라 기존 durable payload와 2026-08-17에 다시 제공된 원본 세션 로그를 함께 대조한 내부 동기화 감사다. 당시 승인 이력에 없는 사실은 새로 확정하지 않는다.

## Session Coverage Identity

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-MINI-5959-CONTAINMENT` | `scripts/seed-payloads/nosb-mini-5959-containment-sync.json` | available | partial |

## 2026-08-17 원본 대조

- 전체 교차 세션 결과는 [2026-08-17 원본 재대조 원장](nosb-source-reconciliation-2026-08-17.md)에 연결한다.
- 보존본은 73쪽, SHA-256 `8a7c235612a35b439650245433d7b5d7d48f3abbf129c195f4e8d35a295bc69a`로 끝까지 추출·대표 렌더 대조했다.
- source는 `available`이다. 역사적 base payload의 `reportNumber: "07"`은 잘못된 원시 값이며, 후속 durable cleanup과 현재 registry/live 표시는 `MINI03`이다. replay에서는 base 뒤의 번호 정규화 수리를 반드시 보존한다.
- ERP의 `장밋빛 시냅스 격리 표본`은 승인된 정식 표본 설계다. 로그에서 현장팀이 사용한 PET병은 즉석 임시 격리 수단이므로 같은 물품·용기로 단정하거나 정식 표본의 provenance로 소급하지 않는다. 이 구분의 durable 대조가 남아 audit은 `partial`이다.

## Lorebook Coverage Matrix

| subject | durable evidence | target surface | action | status |
|---|---|---|---|---|
| 5959 사태 | operation-report envelope | `session_reports.NOSB-MINI-5959-CONTAINMENT` | 독립 작전 보고서 보존 | applied-existing |
| 보고서 미러 | operation-report-wiki envelope | `wiki_pages.5959-containment-incident` | 보고서 본문·시각 자료 미러 보존 | applied-existing |
| ZULU-5959 장밋빛 시냅스 | entity-wiki envelope | `wiki_pages.zulu-5959-rose-synapse` | 개체 문서와 보고서 연결 | applied-existing |
| 장밋빛 시냅스 격리 표본 | catalog envelope | `master_items.zulu-5959-rose-synapse-specimen` | 비판매 연구 표본으로 보존 | applied-existing |
| 에리안 | historical NPC envelope | `characters.ERIAN` | 세션 등장·시각 자료·Dossier 연결의 기존 상태 추적 | applied-existing; approval history unavailable |
| 참가 인원 | dossier-session-link envelopes | `characters.lore.appearsInEvents` | 정확한 sessionId 역방향 링크 보존 | applied-existing |

`applied-existing`은 기존 durable payload/record를 발견했다는 감사 설명이며, 이번 문서 작업이 새로운 apply 승인이나 라이브 mutation을 수행했다는 뜻이 아니다.

## NPC Approval Ledger

- not-applicable: 원본은 재대조했지만 historical ERIAN creation과 참가자 링크 결정은 현재 approval ledger보다 앞선다. 이번 문서는 신규 NPC apply를 승인하지 않는다.

## Visual Asset Ledger

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `/assets/wiki/entities/zulu-5959-rose-synapse.webp` | historical sync payload | 1086×1448 | not-applicable — original crop provenance unavailable | report-cutscene + entity-archive + catalog-sample | included (durable payload) | included (durable payload) | included (`zulu-5959-rose-synapse`) | included (`zulu-5959-rose-synapse-specimen`) | not-applicable | identical report/mirror tuple and exact entity/sample subject |
| `/assets/npcs/Erian-profile.webp` | historical sync payload | 1085×1450 | not-applicable — original crop provenance unavailable | report-cutscene + personnel-image | included (durable payload) | included (durable payload) | not-applicable | not-applicable | included (`ERIAN`) | identical report/mirror tuple and existing Dossier field |

## Personality Evidence Ledger

- not-applicable: 원본은 이용 가능하지만 durable payload에 immutable personality observation envelope가 없으며, 이번 패스에서 신규 관찰을 승인하지 않았다.

## Graph And Audit Status

- report, mirror, entity wiki, catalog item, ERIAN, and participant event links share the exact session id or concrete subject key.
- Report and mirror carry the same two ordered image path/alt/caption tuples in the focused sync payload.
- No live DB, economy, inventory, stock, or external mutation was performed during this reconstruction.
