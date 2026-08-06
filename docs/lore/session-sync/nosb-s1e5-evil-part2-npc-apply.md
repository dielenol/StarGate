---
title: NOSB-S1E5-EVIL-PART2 NPC apply manifest
category: session-sync
tags: [NOSB-S1E5-EVIL-PART2, npc, dossier, apply-ready]
updated: 2026-08-06
source: stargate-lore
---

# NOSB-S1E5-EVIL-PART2 NPC 적용 명세

이 문서는 본 coverage의 후보 전체 기록을 바꾸지 않으면서, 이번 실행에 포함되는 Dossier 대상만 결정론적 apply-ready 검사에 전달하는 범위 명세다. 신원이 미정인 `WHITE_ROSE_R_CANDIDATE`는 본 coverage에 blocked 상태로 남고 이 명세와 NPC payload에는 포함하지 않는다.

## NPC Approval Ledger

| codename | 신원조회 실명 | 별칭 | 직함/역할 | 식별자 근거 | 정규 소속 | 파견/겸임 | 권한등급 | Dossier 초상 | 공개 여부 | 인적 정보 | 서술/관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `PECHORIN` | 그리고리 페초린 | 없음(기록 없음) | 섹터 C 전방 수호대 통솔 대령 | 기존 ERP 내부 식별자와 1부 승인 원장 | `NOVUS_ORDO / MANUS / SECTOR_C` | 없음(정규 배치) | `H`(기존 승인값 유지) | `/assets/npcs/Pechorin-profile.webp`(기존 승인 초상 유지) | `true`(기존값 유지) | 남성; 나이·신장·체중은 원문 미상 | 마가렛에게 데드핸드 실행을 맡기고 자결해 비상 냉각을 가능하게 함; 사망 상태 추가 | ready-for-apply |
| `RODION` | 로드리온 로마노비치 라스콜니코프 | `грибы(버섯들)` | 전 섹터 C 감독관 / 심부 굴착 생존자 | 기존 ERP 내부 식별자와 1부 승인 원장 | `NOVUS_ORDO / MANUS / SECTOR_C` | 없음(정규 배치) | `M`(기존 승인값 유지) | `/assets/npcs/Rodion-profile.webp`(기존 승인 초상 유지) | `true`(기존값 유지) | 남성; 67세; 190cm; 체중은 원문 미상 | 마리아에게 오브로 투척되어 사망; 게라쉬모프와의 지도부 경쟁 관계 추가 | ready-for-apply |
| `BAZAROV` | 니콜라이 바자로프 | `богослов(신학자)` | 섹터 C 연구원장 → 섹터 C 감독관 | 기존 ERP 내부 식별자와 1부 승인 원장 | `NOVUS_ORDO / MANUS / SECTOR_C` | 연구원장→감독관 직책 변경 | `H`(기존 승인값 유지) | `/assets/npcs/Bazarov-profile.webp`(기존 승인 초상 유지) | `true`(기존값 유지) | 남성; 나이는 원문 미상; 176cm; 체중은 원문 미상 | 레짐 체인지 프로토콜로 새 감독관이 되었고 섹터 C 사태가 후속 안정화됨 | ready-for-apply |
| `GERASIMOV` | 게라쉬모프(보존 기록상 성만 확인; 이름·부칭은 원문 미상) | 없음(기록 없음) | 러시아 측 파견 장군 / 섹터 C 국영화 추진자 | 로드리온의 호명, 동일 역할의 1·2부 연속 등장, 사용자 제공 초상 매칭; 성 기반 기술 식별자 | `MILITARY` 외부 군부 | 러시아 측 / 섹터 C 국영화·지도부 교체 | 없음(외부 인물; `agentLevel` 미저장) | `/assets/npcs/Gerasimov-profile.webp`(사용자 제공 원본 초상) | `true`(사용자 공개 결정) | 남성; 나이·신장·체중은 원문 미상 | 로드리온과 지휘권을 두고 대립; 지도부 투표 뒤 오틸리아의 공격으로 사망; 양방향 Dossier 관계 | ready-for-apply |
| `RUBIN_BABUSHKA` | 바부슈카(실명은 원문 미상; speaker label을 표시명으로 보존) | 없음(바부슈카는 기록 표시명) | 루빈 인근 마을 주민 / 실명 미상 | 종료 장면 speaker label과 사용자 제공 초상; 사건 기반 기술 식별자 | `CIVIL` 외부 시민사회 | 루빈 인근 마을 주민 | 없음(외부 인물; `agentLevel` 미저장) | `/assets/npcs/Rubin-Babushka-profile.webp`(사용자 제공 원본 초상) | `true`(사용자 공개 결정) | 여성 노인; 신장·체중은 원문 미상 | 웬디고와 `Мама`·`내 아들` 발화를 교환했다는 증언만 보존하고 실제 가족관계는 확정하지 않음 | ready-for-apply |

## Apply Scope

- 신규 Dossier 생성 전용 payload: `scripts/seed-payloads/nosb-s1e5-evil-part2-new-npcs.json` — 검증된 최초 `personalityObservations` 배열을 포함해 runner가 기존 Dossier 발견 시 쓰기를 거부하므로 재실행이 기존 필드를 덮어쓰지 않는다.
- 신규·기존 Dossier 관계 원자적 payload: `scripts/seed-payloads/nosb-s1e5-evil-part2-dossier-relations.json` — `GERASIMOV`↔`RODION`, `GERASIMOV`↔`OTILIA` 네 관계를 한 파일의 트랜잭션으로 추가한다.
- 기존 Dossier 갱신 payload: `scripts/seed-payloads/nosb-s1e5-evil-part2-dossiers.json`
- 제외 대상: `WHITE_ROSE_R_CANDIDATE` — 신원과 Dossier 여부가 미정이므로 prose/wiki 증언만 유지
- 외부 인물 `GERASIMOV`, `RUBIN_BABUSHKA`에는 내부 권한등급을 저장하지 않는다.
