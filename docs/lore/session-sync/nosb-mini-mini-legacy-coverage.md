---
title: NOSB-MINI-MINI-LEGACY session sync coverage
category: session-sync
tags: [NOSB-MINI-MINI-LEGACY, MINI02, stargate-lore]
updated: 2026-08-17
source: stargate-lore-audit
---

# NOSB-MINI-MINI-LEGACY Sync Coverage

이 문서는 기존 durable sync payload와 2026-08-17에 다시 제공된 원본 세션 로그를 함께 대조한 내부 감사다. 당시 승인 대화에 없는 인물 승인·성격 판단·관계는 새로 확정하지 않는다.

## Session Coverage Identity

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-MINI-MINI-LEGACY` | `scripts/seed-payloads/nosb-mini-mini-legacy-sync.json` | available | partial |

## 2026-08-17 원본 대조

- 전체 교차 세션 결과는 [2026-08-17 원본 재대조 원장](nosb-source-reconciliation-2026-08-17.md)에 연결한다.
- 전편 보존본은 88쪽, SHA-256 `be1ac81fd3738cc9c2c81e769beb740d71d4ed33b6e9a218092e763f7cfd37c9`, 후편 보존본은 56쪽, SHA-256 `32e354947092d5f183b10020bd789b0874233192336777bada9d1d203b88e50a`로 두 파일 모두 끝까지 추출·대표 렌더 대조했다.
- source는 `available`이다. 다만 Antonio의 `V` 권한 근거와 `SPACE33` 개체 동일성 조정이 끝나지 않아 audit은 `partial`을 유지한다.
- Antonio·Nathan·Sergio·Donatello의 인물 원장 후보는 aggregate 원장에서 `candidate-only / blocked`로 추적한다. 이 문서는 그 후보를 신규 Dossier 승인으로 바꾸지 않는다.

## Lorebook Coverage Matrix

| subject | durable evidence | target surface | action | status |
|---|---|---|---|---|
| 미니미니세션 1화 유산 | operation-report envelope | `session_reports.NOSB-MINI-MINI-LEGACY` | MINI02 보고서 보존 | applied-existing |
| 보고서 미러 | operation-report-wiki envelope | `wiki_pages.mini-mini-legacy` | 동일 보고서 미러 보존 | applied-existing |
| 샤또 브리엥 | place-wiki envelope | `wiki_pages.chateau-brien` | 장소 문서와 보고서 연결 | applied-existing |
| 참가 인원 | dossier-session-link envelopes | `characters.lore.appearsInEvents` | 정확한 sessionId 역방향 링크 보존 | applied-existing |
| 세르히오·네이선 | dossier-relation-link envelopes + 재제공 원본 | `characters.lore.relations` | historical relation payload와 원본 구간 대조 | applied-existing; identity fields remain candidate-only |

## NPC Approval Ledger

- not-applicable: 원본은 재대조했지만 historical character/relation payload가 현재 approval ledger보다 앞선다. Antonio·Nathan·Sergio·Donatello 후보와 Antonio의 `V` 권한은 aggregate 원장에만 남기며, 이 문서가 신원·권한·초상·공개·서술 변경을 승인하지 않는다.

## Visual Asset Ledger

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `/assets/wiki/places/chateau-brien.webp` | historical sync payload | 1448×1086 | not-applicable — original crop provenance unavailable | report-cutscene + place-archive | included (durable payload) | included (durable payload) | included (`chateau-brien`) | not-applicable | not-applicable | exact place subject and identical report/mirror tuple |
| `/assets/session-reports/mini-mini-legacy/maria-bear-woods.webp` | historical sync payload | 1448×1086 | not-applicable — original crop provenance unavailable | report-cutscene | included (durable payload) | included (durable payload) | not-applicable | not-applicable | not-applicable | identical report/mirror tuple |
| `/assets/session-reports/mini-mini-legacy/ending-parlor.webp` | historical sync payload | 1672×941 | not-applicable — original crop provenance unavailable | report-cutscene | included (durable payload) | included (durable payload) | not-applicable | not-applicable | not-applicable | identical report/mirror tuple |

## Personality Evidence Ledger

- not-applicable: 원본 대사·행동은 이용 가능하지만 이번 대조에서 기존 durable prose를 넘어 승인 가능한 신규 immutable personality observation은 확정하지 않았다.

## Graph And Audit Status

- report, mirror, place wiki, participant events, and relation updates preserve the exact session id or concrete place key.
- Report and mirror contain the same three ordered image path/alt/caption tuples.
- No live DB or external mutation was performed during this reconstruction.
