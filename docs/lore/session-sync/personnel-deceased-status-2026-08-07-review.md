---
title: Personnel deceased status structured sync coverage
category: session-sync
tags: [personnel, deceased, dossier, stargate-lore]
updated: 2026-08-07
source: stargate-lore
---

# Personnel Deceased Status Structured Sync Coverage

이 문서는 기존 세션 coverage와 durable Dossier 기록에 이미 확정된 사망을 `characters.lifeStatus` 구조로 승격하는 교차 세션 보강 패스다. 신원·소속·권한·초상·공개 여부·인적 정보와 기존 관계는 보존하며, 라이브 DB 실행 권한을 포함하지 않는다.

## Session Coverage Identity

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-MINI-S1E1-NEW-DUBLIN` | `scripts/seed-payloads/nosb-mini-s1e1-new-dublin-sync.json` | partial | status-augmentation |
| `NOSB-S1E4-PRATO-PART2` | `scripts/seed-payloads/nosb-s1e4-prato-sync.json` | partial | status-augmentation |
| `NOSB-S1E5-EVIL-PART2` | `scripts/seed-payloads/nosb-s1e5-evil-part2-sync.json` | available | status-augmentation |

## Source And Status Matrix

| codename | source event | source coverage | confirmed status | durable action | live comparison |
|---|---|---|---|---|---|
| `RODION` | `NOSB-S1E5-EVIL-PART2` | `nosb-s1e5-evil-part2-coverage.md` | 2026-07-12 사망 | spec + status payload | existing record; status field absent |
| `PECHORIN` | `NOSB-S1E5-EVIL-PART2` | `nosb-s1e5-evil-part2-coverage.md` | 2026-07-12 사망 | spec + status payload | existing record; status field absent |
| `GERASIMOV` | `NOSB-S1E5-EVIL-PART2` | `nosb-s1e5-evil-part2-coverage.md` | 2026-07-12 사망 | spec + base-on-insert status upsert | base Dossier absent |
| `PERK_ESHHALL` | `NOSB-MINI-S1E1-NEW-DUBLIN` | `nosb-mini-s1e1-new-dublin-coverage.md` | 2026-06-11 사망 | spec + status payload | existing record; prose-only death |
| `DOCTOR_MOSS` | `NOSB-S1E4-PRATO-PART2` | `nosb-s1e4-prato-coverage.md` | 2026-06-15 사망 | spec + status payload | existing record; session-appearance-only death |

## NPC Approval Ledger

| codename | 신원조회 실명 | 별칭 | 직함/역할 | 식별자 근거 | 정규 소속 | 파견/겸임 | 권한등급 | Dossier 초상 | 공개 여부 | 인적 정보 | 서술/관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `RODION` | 로드리온 로마노비치 라스콜니코프(기존 승인값 유지) | `грибы(버섯들)`(기존 승인값 유지) | 전 섹터 C 감독관 / 심부 굴착 생존자(기존값 유지) | 기존 ERP 내부 식별자와 S1E5 승인 원장 | `NOVUS_ORDO / MANUS / SECTOR_C`(기존값 유지) | 없음(정규 배치 유지) | `M`(기존 승인값 유지) | `/assets/npcs/Rodion-profile.webp`(기존 승인 초상 유지) | `true`(기존값 유지) | 남성; 67세; 190cm; 체중 미상(기존값 유지) | 기존 서술·관계는 보존; 실각 뒤 전기 오브 투척으로 확정된 사망을 `DECEASED`로 구조화 | ready-for-apply |
| `PECHORIN` | 그리고리 페초린(기존 승인값 유지) | 없음(기록 없음) | 섹터 C 전방 수호대 통솔 대령(기존값 유지) | 기존 ERP 내부 식별자와 S1E5 승인 원장 | `NOVUS_ORDO / MANUS / SECTOR_C`(기존값 유지) | 없음(정규 배치 유지) | `H`(기존 승인값 유지) | `/assets/npcs/Pechorin-profile.webp`(기존 승인 초상 유지) | `true`(기존값 유지) | 남성; 나이·신장·체중 미상(기존값 유지) | 기존 서술·관계는 보존; 데드핸드 임무를 위한 자결로 확정된 사망을 `DECEASED`로 구조화 | ready-for-apply |
| `GERASIMOV` | 게라쉬모프(성만 확인; 이름·부칭은 원문 미상) | 없음(기록 없음) | 러시아 측 파견 장군 / 섹터 C 국영화 추진자 | 로드리온의 호명, 1·2부 역할 연속성, 기존 승인 spec의 성 기반 기술 식별자 | `MILITARY` 외부 군부 | 러시아 측 / 섹터 C 국영화·지도부 교체 | 없음(외부 인물; `agentLevel` 미저장) | `/assets/npcs/Gerasimov-profile.webp`(기존 승인 초상 유지) | `true`(기존 승인값 유지) | 남성; 나이·신장·체중은 원문 미상 | 기존 승인 spec으로 base-on-insert만 허용; 오틸리아의 공격으로 확정된 사망을 `DECEASED`로 구조화 | ready-for-apply |
| `PERK_ESHHALL` | 퍼크슈타인 에스홀(기존 승인값 유지) | 없음(기록 없음) | NOGA 더블린 지부 지부장(기존값 유지) | 기존 ERP 내부 식별자와 New Dublin durable spec | `MILITARY / NOGA`(기존값 유지) | 없음(정규 소속 유지) | 없음(외부 인물; `agentLevel` 미저장 유지) | `/assets/npcs/Puck-Asshole-profile.webp`(기존 승인 초상 유지) | `true`(기존값 유지) | 남성; 41세; 189cm; 체중 미상(기존값 유지) | 기존 서술·관계는 보존; NOGA 거점 진압 중 확정된 사망을 `DECEASED`로 구조화 | ready-for-apply |
| `DOCTOR_MOSS` | 모이세이 알렉산드로비치 코헨(기존 승인값 유지) | `Dr.모스`(기존 명시적 통칭 유지) | 노부스 오르도 연구 기구 사무차장(기존값 유지) | 기존 ERP 내부 식별자와 Prato durable spec | `NOVUS_ORDO / SECRETARIAT / RESEARCH`(기존값 유지) | 없음(정규 배치 유지) | `V`(기존 승인값 유지) | `/assets/npcs/Doctor-Moss-profile.webp`(기존 승인 초상 유지) | `true`(기존값 유지) | 남성; 61세; 158cm; 체중 미상(기존값 유지) | 기존 관계는 보존; 상부 보고 시도 직후 확정된 사망과 사건 링크를 `DECEASED`로 구조화 | ready-for-apply |

## Visual Asset Ledger

- skipped: source unavailable — 상태 전용 보강 패스이므로 새 자산을 추가·교체·크롭·재사용하지 않으며, 기존 승인 Dossier 초상 경로만 그대로 보존한다.

## Personality Evidence Ledger

- skipped: source unavailable — 사망 상태 전용 보강 패스이며 기존 성격 서술·관찰 근거를 추가·교체하지 않는다.

## Candidate-only / Excluded

- `EXPERIMENT_88`: 사망 요청은 확인되지만 결과 생존 여부가 확정되지 않아 상태를 저장하지 않는다.
- 이름이 확인되지 않은 사망 기술자: stable identity가 없어 Dossier 상태 대상으로 승격하지 않는다.
- 매장된 발레리나: 매장 기록만으로 사망을 단정하지 않는다.

## Live Operation Gate

- `scripts/seed-payloads/personnel-deceased-status-2026-08-07.json`은 durable apply 후보이며 이번 패스에서는 dry-run만 수행한다.
- 라이브 적용은 5개 target의 변경 전→후 상태와 `GERASIMOV` 신규 base-on-insert 부수 효과를 다시 제시하고 별도 승인을 받은 뒤에만 실행한다.
