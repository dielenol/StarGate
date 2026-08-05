---
title: NOSB-MINI-HWAYANGYEONHWA session sync coverage
category: session-sync
tags: [NOSB-MINI-HWAYANGYEONHWA, MINI04, stargate-lore]
updated: 2026-08-05
source: stargate-lore-audit
---

# NOSB-MINI-HWAYANGYEONHWA Sync Coverage

이 문서는 기존 sync payload와 후속 image-sync payload를 기준으로 재구성한 내부 감사다. 원본 세션 로그와 원본 이미지 provenance는 이번 입력에 없으므로 새로운 canon·성격 해석·NPC 승인을 만들지 않는다.

## Session Coverage Identity

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-MINI-HWAYANGYEONHWA` | `scripts/seed-payloads/nosb-mini-hwayangyeonhwa-sync.json` | partial | historical-reconstruction |

## Lorebook Coverage Matrix

| subject | durable evidence | target surface | action | status |
|---|---|---|---|---|
| 화양연화 | operation-report envelope | `session_reports.NOSB-MINI-HWAYANGYEONHWA` | MINI04 보고서 보존 | applied-existing |
| 보고서 미러 | operation-report-wiki envelope | `wiki_pages.mini04-hwayangyeonhwa` | 보고서 미러 보존 | applied-existing |
| 슬피 우는 것 | entity-wiki envelope | `wiki_pages.weeping-smoke-hwayangyeonhwa` | 세션 개체 문서 보존 | applied-existing |
| 참가 인원 | dossier-session-link envelopes | `characters.lore.appearsInEvents` | 정확한 sessionId 역방향 링크 보존 | applied-existing |
| 시각 자료 5건 | image-sync envelopes | report, mirror, entity wiki | report/mirror ordered set과 전용 개체 소비처 추적 | applied-existing |

## NPC Approval Ledger

- not-applicable: the focused durable sync contains no new NPC create or identity/clearance/portrait repair envelope; historical event links do not authorize profile changes.

## Visual Asset Ledger

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `/assets/session-reports/hwayangyeonhwa/beach-police-line.webp` | historical image-sync payload | 1448×1086 | not-applicable — original crop provenance unavailable | report-cutscene | included (durable image sync) | included (durable image sync) | not-applicable | not-applicable | not-applicable | report/mirror tuple is identical |
| `/assets/session-reports/hwayangyeonhwa/busan-fog-city.webp` | historical image-sync payload | 1448×1086 | not-applicable — original crop provenance unavailable | report-cutscene | included (durable image sync) | included (durable image sync) | not-applicable | not-applicable | not-applicable | report/mirror tuple is identical |
| `/assets/session-reports/hwayangyeonhwa/cinema-center-rift.webp` | historical image-sync payload | 1448×1086 | not-applicable — original crop provenance unavailable | report-cutscene | included (durable image sync) | included (durable image sync) | not-applicable | not-applicable | not-applicable | report/mirror tuple is identical |
| `/assets/session-reports/hwayangyeonhwa/beach-rift-core.webp` | historical image-sync payload | 1448×1086 | not-applicable — original crop provenance unavailable | report-cutscene | included (durable image sync) | included (durable image sync) | not-applicable | not-applicable | not-applicable | report/mirror tuple is identical |
| `/assets/wiki/entities/weeping-smoke-hwayangyeonhwa.webp` | historical image-sync payload | 1448×1086 | not-applicable — original crop provenance unavailable | report-cutscene + entity-archive | included (durable image sync) | included (durable image sync) | included (`weeping-smoke-hwayangyeonhwa`) | not-applicable | not-applicable | report/mirror tuple and entity-wiki image sync agree |

## Personality Evidence Ledger

- skipped: source unavailable — no immutable personality observation envelope exists in the focused payload and the original dialogue/action evidence is unavailable.

## Graph And Audit Status

- report, mirror, entity wiki, and participant links use `NOSB-MINI-HWAYANGYEONHWA` or its concrete subject slug.
- The follow-up image-sync payload keeps the five report/mirror image tuples in the same order.
- No live DB or external mutation was performed during this reconstruction.
