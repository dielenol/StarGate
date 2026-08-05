---
title: NOSB-MINI-MINI-LEGACY session sync coverage
category: session-sync
tags: [NOSB-MINI-MINI-LEGACY, MINI02, stargate-lore]
updated: 2026-08-05
source: stargate-lore-audit
---

# NOSB-MINI-MINI-LEGACY Sync Coverage

이 문서는 기존 durable sync payload에서 재구성한 내부 감사다. 원본 세션 로그는 이번 재감사에 제공되지 않았으므로 payload 밖의 인물 승인·성격 판단·관계를 새로 확정하지 않는다.

## Session Coverage Identity

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-MINI-MINI-LEGACY` | `scripts/seed-payloads/nosb-mini-mini-legacy-sync.json` | partial | historical-reconstruction |

## Lorebook Coverage Matrix

| subject | durable evidence | target surface | action | status |
|---|---|---|---|---|
| 미니미니세션 1화 유산 | operation-report envelope | `session_reports.NOSB-MINI-MINI-LEGACY` | MINI02 보고서 보존 | applied-existing |
| 보고서 미러 | operation-report-wiki envelope | `wiki_pages.mini-mini-legacy` | 동일 보고서 미러 보존 | applied-existing |
| 샤또 브리엥 | place-wiki envelope | `wiki_pages.chateau-brien` | 장소 문서와 보고서 연결 | applied-existing |
| 참가 인원 | dossier-session-link envelopes | `characters.lore.appearsInEvents` | 정확한 sessionId 역방향 링크 보존 | applied-existing |
| 세르히오·네이선 | dossier-relation-link envelopes | `characters.lore.relations` | historical relation payload 존재만 추적 | applied-existing; source excerpt unavailable |

## NPC Approval Ledger

- skipped: source unavailable — historical character and relation payloads predate the current approval ledger; this reconstruction does not authorize identity, clearance, portrait, visibility, or prose changes.

## Visual Asset Ledger

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `/assets/wiki/places/chateau-brien.webp` | historical sync payload | 1448×1086 | not-applicable — original crop provenance unavailable | report-cutscene + place-archive | included (durable payload) | included (durable payload) | included (`chateau-brien`) | not-applicable | not-applicable | exact place subject and identical report/mirror tuple |
| `/assets/session-reports/mini-mini-legacy/maria-bear-woods.webp` | historical sync payload | 1448×1086 | not-applicable — original crop provenance unavailable | report-cutscene | included (durable payload) | included (durable payload) | not-applicable | not-applicable | not-applicable | identical report/mirror tuple |
| `/assets/session-reports/mini-mini-legacy/ending-parlor.webp` | historical sync payload | 1672×941 | not-applicable — original crop provenance unavailable | report-cutscene | included (durable payload) | included (durable payload) | not-applicable | not-applicable | not-applicable | identical report/mirror tuple |

## Personality Evidence Ledger

- skipped: source unavailable — historical prose and relation summaries are not sufficient to reconstruct immutable dialogue/description/action evidence safely.

## Graph And Audit Status

- report, mirror, place wiki, participant events, and relation updates preserve the exact session id or concrete place key.
- Report and mirror contain the same three ordered image path/alt/caption tuples.
- No live DB or external mutation was performed during this reconstruction.
