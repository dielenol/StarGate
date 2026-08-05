---
title: NOSB-S1E2-MINI session sync coverage
category: session-sync
tags: [NOSB-S1E2-MINI, S1E2-MINI, stargate-lore]
updated: 2026-08-05
source: stargate-lore-audit
---

# NOSB-S1E2-MINI Sync Coverage

이 문서는 기존 durable sync·refresh·NPC payload를 기준으로 재구성한 내부 감사다. 원본 세션 로그와 당시 승인 기록은 이번 입력에 없으므로, 기록에 없는 NPC 필드·관계·성격을 추론하지 않는다.

## Session Coverage Identity

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-S1E2-MINI` | `scripts/seed-payloads/nosb-s1e2-mini-sync.json` | partial | historical-reconstruction |

## Lorebook Coverage Matrix

| subject | durable evidence | target surface | action | status |
|---|---|---|---|---|
| S1E2 미니 세션 | operation-report envelope | `session_reports.NOSB-S1E2-MINI` | 독립 보고서 보존 | applied-existing |
| 보고서 미러 | operation-report-wiki envelope | `wiki_pages.s1e2-mini` | 동일 보고서 미러 보존 | applied-existing |
| 아포칼립스 호 | location-wiki envelope | `wiki_pages.apocalypse-ho` | 송사리 호 시각 자료와 장소 문맥 연결 | applied-existing |
| 프로젝트 데드 핸드 | concept-wiki envelope | `wiki_pages.project-dead-hand` | 세션 연구 개념 보존 | applied-existing |
| 하켄크로이츠 캐비넷 | catalog envelope | `master_items.hakenkreuz-cabinet` | 비판매 물증으로 보존 | applied-existing |
| 참가 인원 | dossier-event-link envelopes | `characters.lore.appearsInEvents` | 정확한 sessionId 역방향 링크 보존 | applied-existing |
| 제인 피쉬·물주먹 래키·존 오푸스 | related historical NPC payload | `characters` | 기존 Dossier 상태만 추적 | applied-existing; approval history unavailable |

## NPC Approval Ledger

- skipped: source unavailable — historical civil-NPC payloads predate the current approval ledger; no profile creation or repair is authorized by this audit note.

## Visual Asset Ledger

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `/assets/wiki/places/song-sari-ho.webp` | historical sync payload | 1266×857 | not-applicable — original crop provenance unavailable | report-cutscene + place-archive | included (durable payload) | included (durable payload) | included (`apocalypse-ho`) | not-applicable | not-applicable | report/mirror tuple and location-wiki content agree |
| `/assets/wiki/places/apocalypse-ho.webp` | historical sync payload | 1920×1072 | not-applicable — original crop provenance unavailable | report-cutscene + place-archive | included (durable payload) | included (durable payload) | included (`apocalypse-ho`) | not-applicable | not-applicable | report/mirror tuple and location-wiki content agree |

## Personality Evidence Ledger

- skipped: source unavailable — no immutable personality observation envelope exists and the original dialogue/action evidence is unavailable for safe reconstruction.

## Graph And Audit Status

- report, mirror, location, concept, catalog, NPC, and participant event links preserve `NOSB-S1E2-MINI` or a concrete stable key.
- Report and mirror contain the same two ordered image path/alt/caption tuples in both primary and refresh payloads.
- No live DB or external mutation was performed during this reconstruction.
