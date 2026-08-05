---
title: NOSB-S1E1-ORDER session sync coverage
category: session-sync
tags: [NOSB-S1E1-ORDER, S1E1, stargate-lore]
updated: 2026-08-05
source: stargate-lore-audit
---

# NOSB-S1E1-ORDER Sync Coverage

이 문서는 원본 sync bundle이 아니라 기존 report/wiki cleanup·related-link payload와 연결된 durable records를 기준으로 복원한 내부 감사다. 원본 세션 로그와 최초 생성 payload가 이번 입력에 없어 완전한 추출 coverage를 주장하지 않는다.

## Session Coverage Identity

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-S1E1-ORDER` | `scripts/seed-payloads/zzzzzz-lore-audit-related-followup-2026-07-02.json` | unavailable | partial |

## Lorebook Coverage Matrix

| subject | durable evidence | target surface | action | status |
|---|---|---|---|---|
| S1E1 질서 보고서 | explicit-link cleanup envelope | `session_reports.NOSB-S1E1-ORDER` | 기존 보고서의 renderer link 정리 상태 추적 | applied-existing |
| S1E1 질서 위키 | related-link payloads | `wiki_pages.s1e1-order` | 관련 문서 링크 정리 상태 추적 | applied-existing |
| 검열된 비명·깨진 음절·특수 격리 상자 | existing wiki/catalog payload references | wiki/catalog | 구체 subject anchor 존재를 정적 검사 | applied-existing |
| 블랙 피라미드 | read-only DB baseline | `wiki_pages.black-pyramid` | legacy live target을 명시적 static baseline으로 등록 | verified-existing baseline |
| 완전한 세션 추출 대상 | original source/bundle unavailable | all lore surfaces | 신규 canon·누락 엔티티 판정 보류 | blocked by source |

## NPC Approval Ledger

- skipped: source unavailable — the available cleanup payload has no authoritative NPC intake record and cannot prove historical identity/clearance/portrait approvals.

## Visual Asset Ledger

- skipped: source unavailable — no authoritative report/mirror visual inventory can be reconstructed from the available cleanup payloads.

## Personality Evidence Ledger

- skipped: source unavailable — the available cleanup payload contains no typed immutable observation evidence and the original session source is absent.

## Graph And Audit Status

- Static renderer links are checked against durable payload targets plus `docs/lore/static-target-baseline.json`.
- `black-pyramid` is admitted only by the read-only DB inventory evidence dated 2026-08-05; the baseline contains no credential or connection material.
- This note closes session-id enumeration, not the unavailable original source analysis. No live mutation was performed.
