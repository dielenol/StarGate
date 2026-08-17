---
title: NOSB-S1E1-ORDER session sync coverage
category: session-sync
tags: [NOSB-S1E1-ORDER, S1E1, stargate-lore]
updated: 2026-08-17
source: stargate-lore-audit
---

# NOSB-S1E1-ORDER Sync Coverage

이 문서는 기존 report/wiki cleanup·related-link payload와 연결된 durable records를 기준으로 복원한 내부 감사다. 2026-08-17 원본 세션 로그를 다시 확보해 사건 축을 대조했지만 최초 생성 payload와 당시 승인 기록은 남아 있지 않으므로, 과거 적용 필드를 새 승인으로 재분류하지 않는다.

## Session Coverage Identity

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-S1E1-ORDER` | `scripts/seed-payloads/zzzzzz-lore-audit-related-followup-2026-07-02.json` | available | partial |

## 2026-08-17 원본 대조

- 원본 108/108쪽을 재추출했으며 SHA-256은 `edd06296d90d5b11fa045365af75154d75918aa7d4916837dd120a5bfc69df35`다.
- 기존의 `source unavailable` 전제는 폐기했다. 다만 최초 생성 payload와 당시 NPC·시각 자료·성격 적용 승인은 복원되지 않았으므로 이번 대조를 새 승인으로 간주하지 않는다.
- 사실별 후보와 차단 항목은 [2026-08-17 통합 원본 대조](./nosb-source-reconciliation-2026-08-17.md)에서 관리하며, 이 문서에서는 자동 적용하거나 기존 데이터를 삭제하지 않는다.

## Lorebook Coverage Matrix

| subject | durable evidence | target surface | action | status |
|---|---|---|---|---|
| S1E1 질서 보고서 | explicit-link cleanup envelope | `session_reports.NOSB-S1E1-ORDER` | 기존 보고서의 renderer link 정리 상태 추적 | applied-existing |
| S1E1 질서 위키 | related-link payloads | `wiki_pages.s1e1-order` | 관련 문서 링크 정리 상태 추적 | applied-existing |
| 검열된 비명·깨진 음절·특수 격리 상자 | existing wiki/catalog payload references | wiki/catalog | 구체 subject anchor 존재를 정적 검사 | applied-existing |
| 블랙 피라미드 | read-only DB baseline | `wiki_pages.black-pyramid` | legacy live target을 명시적 static baseline으로 등록 | verified-existing baseline |
| 완전한 세션 추출 대상 | original source/bundle unavailable | all lore surfaces | 신규 canon·누락 엔티티 판정 보류 | blocked by source |

## NPC Approval Ledger

- not-applicable: 원본은 확보했지만 권위 있는 historical NPC intake/approval 기록은 없고, 이번 coverage pass에서 신규 Dossier 필드를 적용하지 않았다. 후보와 차단 항목은 통합 원본 대조에서 관리한다.

## Visual Asset Ledger

- not-applicable: 이번 coverage pass에서 report/mirror 시각 자료를 새로 적용하지 않았다. 원본 프레임 후보와 소비처 판정은 통합 원본 대조에서 관리한다.

## Personality Evidence Ledger

- not-applicable: 원본 대화는 확보했지만 이번 pass에서 immutable personality observation을 적용하지 않았다. 후보는 통합 원본 대조에서만 추적한다.

## Graph And Audit Status

- Static renderer links are checked against durable payload targets plus `docs/lore/static-target-baseline.json`.
- `black-pyramid` is admitted only by the read-only DB inventory evidence dated 2026-08-05; the baseline contains no credential or connection material.
- This note closes session-id enumeration, not the unavailable original source analysis. No live mutation was performed.
