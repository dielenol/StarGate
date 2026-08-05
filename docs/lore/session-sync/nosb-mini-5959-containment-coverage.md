---
title: NOSB-MINI-5959-CONTAINMENT session sync coverage
category: session-sync
tags: [NOSB-MINI-5959-CONTAINMENT, MINI03, stargate-lore]
updated: 2026-08-05
source: stargate-lore-audit
---

# NOSB-MINI-5959-CONTAINMENT Sync Coverage

이 문서는 공개 로어가 아니라 기존 durable payload를 기준으로 재구성한 내부 동기화 감사다. 원본 세션 로그는 이번 재감사 입력에 포함되지 않았으므로, payload에 없는 사실이나 승인 이력을 새로 확정하지 않는다.

## Session Coverage Identity

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-MINI-5959-CONTAINMENT` | `scripts/seed-payloads/nosb-mini-5959-containment-sync.json` | partial | historical-reconstruction |

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

- skipped: source unavailable — historical ERIAN creation and participant-link decisions predate the current approval ledger; no new NPC apply is authorized by this reconstruction.

## Visual Asset Ledger

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `/assets/wiki/entities/zulu-5959-rose-synapse.webp` | historical sync payload | 1086×1448 | not-applicable — original crop provenance unavailable | report-cutscene + entity-archive + catalog-sample | included (durable payload) | included (durable payload) | included (`zulu-5959-rose-synapse`) | included (`zulu-5959-rose-synapse-specimen`) | not-applicable | identical report/mirror tuple and exact entity/sample subject |
| `/assets/npcs/Erian-profile.webp` | historical sync payload | 1085×1450 | not-applicable — original crop provenance unavailable | report-cutscene + personnel-image | included (durable payload) | included (durable payload) | not-applicable | not-applicable | included (`ERIAN`) | identical report/mirror tuple and existing Dossier field |

## Personality Evidence Ledger

- skipped: source unavailable — the durable payload contains no immutable personality observation envelope and the original session evidence is unavailable for safe reconstruction.

## Graph And Audit Status

- report, mirror, entity wiki, catalog item, ERIAN, and participant event links share the exact session id or concrete subject key.
- Report and mirror carry the same two ordered image path/alt/caption tuples in the focused sync payload.
- No live DB, economy, inventory, stock, or external mutation was performed during this reconstruction.
