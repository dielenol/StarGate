---
title: NOSB-MINI-HWAYANGYEONHWA session sync coverage
category: session-sync
tags: [NOSB-MINI-HWAYANGYEONHWA, MINI04, stargate-lore]
updated: 2026-08-17
source: stargate-lore-audit
---

# NOSB-MINI-HWAYANGYEONHWA Sync Coverage

이 문서는 기존 sync payload·후속 image-sync payload와 2026-08-17에 다시 제공된 원본 세션 로그를 함께 대조한 내부 감사다. 당시 승인 이력에 없는 canon·성격 해석·NPC 승인은 새로 만들지 않는다.

## Session Coverage Identity

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-MINI-HWAYANGYEONHWA` | `scripts/seed-payloads/nosb-mini-hwayangyeonhwa-sync.json` | available | partial |

## 2026-08-17 원본 대조

- 전체 교차 세션 결과는 [2026-08-17 원본 재대조 원장](nosb-source-reconciliation-2026-08-17.md)에 연결한다.
- 보존본은 111쪽, SHA-256 `584e057f3eb4673b627912318e72c644909714b6404db853ec2a5753a3de8418`로 끝까지 추출·대표 렌더 대조했다.
- source는 `available`이다. 원본과 durable 링크의 대상 type 불일치를 바로잡는 typed-link correction은 aggregate 원장에서 `prepared`로 추적하며, 적용·재조회 전까지 audit은 `partial`이다.
- 이 문서는 기존 report/mirror/entity 이미지와 참가자 링크의 승인 상태를 바꾸지 않으며, prepared correction 자체를 새 apply 승인으로 간주하지 않는다.

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

- not-applicable: 원본 대사·행동은 이용 가능하지만 focused payload에 immutable personality observation envelope가 없고, 이번 패스에서 신규 관찰을 승인하지 않았다.

## Graph And Audit Status

- report, mirror, entity wiki, and participant links use `NOSB-MINI-HWAYANGYEONHWA` or its concrete subject slug.
- The follow-up image-sync payload keeps the five report/mirror image tuples in the same order.
- No live DB or external mutation was performed during this reconstruction.
