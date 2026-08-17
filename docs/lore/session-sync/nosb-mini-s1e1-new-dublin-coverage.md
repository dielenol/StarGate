---
title: NOSB-MINI-S1E1-NEW-DUBLIN session sync coverage
category: session-sync
tags: [NOSB-MINI-S1E1-NEW-DUBLIN, MINI01, stargate-lore]
updated: 2026-08-17
source: stargate-lore-audit
---

# NOSB-MINI-S1E1-NEW-DUBLIN Sync Coverage

이 문서는 기존 durable payload 묶음과 2026-08-17에 다시 제공된 원본 세션 로그를 함께 대조한 내부 감사다. 당시 승인 대화에 없는 신원·관계·성격 판단은 새로 확정하지 않는다.

## Session Coverage Identity

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-MINI-S1E1-NEW-DUBLIN` | `scripts/seed-payloads/nosb-mini-s1e1-new-dublin-sync.json` | partial | partial |

## 2026-08-17 원본 대조

- 전체 교차 세션 결과는 [2026-08-17 원본 재대조 원장](nosb-source-reconciliation-2026-08-17.md)에 연결한다.
- 전편 보존본은 100쪽, SHA-256 `d00a1eac20c0ebafebc1e7bd7ee40cbb525d37b240b2d6a2495689071ffaf335`이며 원래 쪽수 기준 앞 `1–7`쪽과 뒤 `108–114`쪽이 빠져 있다. 후편 보존본은 44쪽, SHA-256 `27d3a885076634922bd0cb64d96fa488d13fed6adc5544d447a4fc03ef4615fd`로 끝 표제까지 확인했다.
- 따라서 source와 audit 모두 `partial`을 유지한다. 현재 보존 구간에서 기존 보고서·wiki·catalog·인물 연결의 명백한 반증은 확인하지 않았지만, 누락 구간의 사건·참가자·대사는 완전 대조할 수 없다.
- `ZULU_269`의 세션 참석은 제공 원본 구간에서 확인되지 않는다. 다만 사용자 제공 관련 로어에 기반한 후보이므로 자동 삭제하지 않고 `candidate-only / blocked`로 유지하며, 누락 원본 또는 사용자 확정 전에는 출현 링크를 새로 승인하지 않는다.

## Lorebook Coverage Matrix

| subject | durable evidence | target surface | action | status |
|---|---|---|---|---|
| 뉴 더블린 작전 | operation-report envelope | `session_reports.NOSB-MINI-S1E1-NEW-DUBLIN` | MINI01 보고서 보존 | applied-existing |
| 보고서 미러 | operation-report-wiki envelope | `wiki_pages.mini-s1e1-new-dublin` | 보고서 미러 보존 | applied-existing |
| 뉴 더블린·네온 발키리·NOGA | wiki envelopes | `wiki_pages.new-dublin`, `neon-valkyrie`, `noga` | 장소/세력 문서 연결 | applied-existing |
| 키미테 | catalog-item envelope | `master_items.kimite` | 세션 물품 문맥 보존 | applied-existing |
| 샌드맨·케이시 레이서·ORSIS-201·퍼크슈타인 에스홀·이그리트 | historical NPC envelopes | `characters` | 기존 Dossier 생성/연결 상태 추적 | applied-existing; approval history unavailable |
| 참가 인원 | dossier-session-link envelopes | `characters.lore.appearsInEvents` | 정확한 sessionId 역방향 링크 보존 | applied-existing |
| 보고서 컷신 3건 | `zz-mini-b1-new-dublin-report-illustrations.json` + `zz-mini-b2-new-dublin-wiki-illustrations.json` | report and mirror repair | ordered visual set 보존 | durable parity repair verified |

## NPC Approval Ledger

이번 패스는 기존 `PERK_ESHHALL` 레코드의 신원·소속·권한·초상·공개 여부·인적 정보·서술·관계를 그대로 보존하고, 기존 session appearance가 확정한 사망만 구조화 상태로 승격한다. 다른 역사적 NPC 필드는 변경하지 않는다.

| codename | 신원조회 실명 | 별칭 | 직함/역할 | 식별자 근거 | 정규 소속 | 파견/겸임 | 권한등급 | Dossier 초상 | 공개 여부 | 인적 정보 | 서술/관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `PERK_ESHHALL` | 퍼크슈타인 에스홀(기존 spec/ERP 값 유지) | 없음(기록 없음) | NOGA 더블린 지부 지부장(기존값 유지) | 기존 ERP 내부 식별자와 durable spec | `MILITARY / NOGA`(기존값 유지) | 없음(정규 소속 유지) | 없음(외부 인물; `agentLevel` 미저장 유지) | `/assets/npcs/Puck-Asshole-profile.webp`(기존 승인 초상 유지) | `true`(기존값 유지) | 남성; 41세; 189cm; 체중 미상(기존값 유지) | 기존 서술·관계는 보존; `NOSB-MINI-S1E1-NEW-DUBLIN` session appearance의 현장 사망을 `DECEASED` 상태로 구조화 | ready-for-apply |

## Visual Asset Ledger

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `/assets/session-reports/new-dublin/new-dublin-street.webp` | historical report illustration payload | 1216×832 | not-applicable — original crop provenance unavailable | report-cutscene | included (durable report payload) | included (durable parity repair) | not-applicable | not-applicable | not-applicable | exact ordered report/mirror tuple |
| `/assets/session-reports/new-dublin/neon-valkyrie-bar.webp` | historical report illustration payload | 1216×832 | not-applicable — original crop provenance unavailable | report-cutscene | included (durable report payload) | included (durable parity repair) | not-applicable | not-applicable | not-applicable | exact ordered report/mirror tuple |
| `/assets/session-reports/new-dublin/puck-asshole-encounter.webp` | historical report illustration payload | 1600×893 | not-applicable — original crop provenance unavailable | report-cutscene | included (durable report payload) | included (durable parity repair) | not-applicable | not-applicable | excluded: report cutscene is not a Dossier portrait | exact ordered report/mirror tuple; personnel role remains separate |

## Personality Evidence Ledger

- not-applicable: 제공 원본 구간은 재대조했지만 이번 패스에서 기존 승인 이력을 대체할 신규 immutable personality observation을 확정하지 않는다. 누락된 전편 앞·뒤 구간 때문에 완전성도 주장하지 않는다.

## Graph And Audit Status

- report, mirror, three durable wiki subjects, catalog item, NPC records, and participant event links share the exact session id or concrete key.
- `check_lore_output.py --report-wiki-visuals <report-payload> <mirror-payload>` passed for the split repair bundle: report and mirror image path/alt/caption tuples match in street → bar → NOGA encounter order.
- No live DB or external mutation was performed by this coverage reconstruction.
