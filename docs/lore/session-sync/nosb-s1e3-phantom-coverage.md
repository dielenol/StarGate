---
title: NOSB-S1E3-PHANTOM session sync coverage
category: session-sync
tags: [NOSB-S1E3-PHANTOM, S1E3, stargate-lore]
updated: 2026-08-05
source: stargate-lore-audit
---

# NOSB-S1E3-PHANTOM Sync Coverage

이 문서는 기존 durable sync와 관련 NPC/faction payload를 기준으로 재구성한 내부 감사다. 원본 세션 로그와 당시 승인 기록은 이번 입력에 없으므로, payload에 없는 신원·canon·성격 증거를 새로 만들지 않는다.

## Session Coverage Identity

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-S1E3-PHANTOM` | `scripts/seed-payloads/nosb-s1e3-phantom-sync.json` | partial | historical-reconstruction |

## Lorebook Coverage Matrix

| subject | durable evidence | target surface | action | status |
|---|---|---|---|---|
| S1E3 망령 | operation-report envelope | `session_reports.NOSB-S1E3-PHANTOM` | 독립 보고서 보존 | applied-existing |
| 보고서 미러 | operation-report-wiki envelope | `wiki_pages.s1e3-phantom` | 동일 보고서 미러 보존 | applied-existing |
| 황금여명회 | faction-wiki envelope | `wiki_pages.golden-dawn` | 세력 문서와 지휘자 시각 자료 연결 | applied-existing |
| 몬탁 프로젝트 도살견 | entity-wiki envelope | `wiki_pages.montauk-project-slaughter-hound` | 개체 문서와 두 관측 도판 보존 | applied-existing |
| 참가 인원 | dossier-event-link envelopes | `characters.lore.appearsInEvents` | 정확한 sessionId 역방향 링크 보존 | applied-existing |
| 관련 gate NPC/faction | historical related payloads | characters/factions | 기존 Dossier·세력 상태만 추적 | applied-existing; approval history unavailable |

## NPC Approval Ledger

- skipped: source unavailable — historical NPC/faction payloads predate the current approval ledger and cannot prove the original identity, clearance, portrait, visibility, or prose decisions.

## Visual Asset Ledger

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `/assets/wiki/entities/conductor.webp` | historical sync payload | 1216×832 | not-applicable — original crop provenance unavailable | report-cutscene + entity-archive | included (durable payload) | included (durable payload) | included (`golden-dawn`) | not-applicable | not-applicable | report/mirror tuple and faction-wiki image agree |
| `/assets/wiki/entities/montauk-slaughter-hound-attack.webp` | historical sync payload | 1672×941 | not-applicable — original crop provenance unavailable | report-cutscene + entity-archive | included (durable payload) | included (durable payload) | included (`montauk-project-slaughter-hound`) | not-applicable | not-applicable | report/mirror tuple and entity-wiki image agree |
| `/assets/wiki/entities/montauk-slaughter-hound-observation.webp` | historical entity-wiki payload | 1672×941 | not-applicable — original crop provenance unavailable | entity-archive | excluded: not present in report ordered set | excluded: not present in mirror ordered set | included (`montauk-project-slaughter-hound`) | not-applicable | not-applicable | dedicated observation image is kept separate from report parity |

## Personality Evidence Ledger

- skipped: source unavailable — historical prose and relation fields are not sufficient to reconstruct typed immutable observations without the original evidence.

## Graph And Audit Status

- report, mirror, faction wiki, entity wiki, participant events, and related Dossier records preserve the exact session id or concrete stable target.
- Report and mirror contain the same two ordered visual tuples; the third Montauk observation remains a dedicated-wiki-only asset.
- No live DB or external mutation was performed during this reconstruction.
