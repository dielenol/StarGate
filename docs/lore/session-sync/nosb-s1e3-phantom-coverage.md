---
title: NOSB-S1E3-PHANTOM session sync coverage
category: session-sync
tags: [NOSB-S1E3-PHANTOM, S1E3, stargate-lore]
updated: 2026-08-06
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
| WEXLER storage parity | `docs/spec/npc/wexler.md` + live read-only Dossier + `lore-storage-required-field-parity-2026-08-06.json` | `characters.WEXLER` | 누락된 `lore.weight`만 `미상`으로 보정하고 나머지 Dossier 필드는 보존 | candidate-only; `agentLevel` GM 결정 필요 |

## NPC Approval Ledger

| codename | 신원조회 실명 | 별칭 | 직함/역할 | 식별자 근거 | 정규 소속 | 파견/겸임 | 권한등급 | Dossier 초상 | 공개 여부 | 인적 정보 | 서술/관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `WEXLER` | `캘빈 R. 웩슬러` — spec과 live 일치 | spec/live에 별칭 없음; 직함을 별칭으로 전용하지 않고 의도적으로 미설정 | `미국 부통령·노부스 오르도 군부 핵심 지도자` — spec과 live 일치 | 기존 live `codename`과 spec의 `codename: WEXLER` 일치 | `MILITARY` / `USA` — spec과 live 일치 | 별도 파견·겸임 근거 없음; 기존 상태 보존 | spec/live 모두 `agentLevel` 누락 — GM이 정확한 등급 또는 의도적 무등급을 결정해야 함 | `/assets/npcs/Calvin-R-Wexler-profile.webp` — live와 repo 일치, 1058×1487 exact Dossier portrait | `true` — spec과 live 일치, 변경하지 않음 | `male`, `76`, `188cm`는 spec/live 일치; `weight: 미상`은 spec에 있고 live만 누락되어 parity 보정 대상 | 기존 Dossier 서술·세션 링크를 보존하며 이번 payload는 prose·관계를 변경하지 않음 | blocked |

그 외 historical gate NPC/faction은 원 승인 기록이 없어 기존 상태 추적만 유지한다. 위 WEXLER 행은 새 신원·서술을 승인하는 행이 아니라, 확인된 단일 누락 필드와 live apply 차단 사유를 명시하는 storage parity 원장이다.

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
- `lore-storage-required-field-parity-2026-08-06.json`은 WEXLER `lore.weight`와 Punk Cat 작성자 필드만 담은 durable 후보이며, WEXLER `agentLevel` 결정 전에는 live-ready가 아니다.
- No live DB or external mutation was performed during this reconstruction.
