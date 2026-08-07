---
title: NOSB-MINI-S1E1-NEW-DUBLIN session sync coverage
category: session-sync
tags: [NOSB-MINI-S1E1-NEW-DUBLIN, MINI01, stargate-lore]
updated: 2026-08-07
source: stargate-lore-audit
---

# NOSB-MINI-S1E1-NEW-DUBLIN Sync Coverage

이 문서는 기존 durable payload 묶음을 기준으로 재구성한 내부 감사다. 원본 세션 로그와 당시 승인 대화는 이번 입력에 없으므로, payload/spec에 없는 신원·관계·성격 판단을 새로 확정하지 않는다.

## Session Coverage Identity

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-MINI-S1E1-NEW-DUBLIN` | `scripts/seed-payloads/nosb-mini-s1e1-new-dublin-sync.json` | partial | historical-reconstruction |

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

- skipped: source unavailable — existing prose cannot be converted into immutable observations without the original dialogue/description/action evidence and approval history.

## Graph And Audit Status

- report, mirror, three durable wiki subjects, catalog item, NPC records, and participant event links share the exact session id or concrete key.
- `check_lore_output.py --report-wiki-visuals <report-payload> <mirror-payload>` passed for the split repair bundle: report and mirror image path/alt/caption tuples match in street → bar → NOGA encounter order.
- No live DB or external mutation was performed by this coverage reconstruction.
