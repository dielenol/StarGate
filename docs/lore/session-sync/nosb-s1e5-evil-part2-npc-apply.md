---
title: NOSB-S1E5-EVIL-PART2 NPC apply manifest
category: session-sync
tags: [NOSB-S1E5-EVIL-PART2, npc, dossier, applied]
updated: 2026-08-10
source: stargate-lore
---

# NOSB-S1E5-EVIL-PART2 NPC 적용 원장

이 문서는 이번 실행에 포함된 Dossier 대상과 live 적용 결과를 함께 보존하는 원장이다. R은 전체 신원이 미상인 상태를 보존하면서 사용자 지시에 따라 `WHITE_ROSE_R` 공개·무이미지 Dossier로 포함했다.

## NPC Approval Ledger

| codename | 신원조회 실명 | 별칭 | 직함/역할 | 식별자 근거 | 정규 소속 | 파견/겸임 | 권한등급 | Dossier 초상 | 공개 여부 | 인적 정보 | 서술/관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `PECHORIN` | 그리고리 페초린 | 없음(기록 없음) | 섹터 C 전방 수호대 통솔 대령 | 기존 ERP 내부 식별자와 1부 승인 원장 | `NOVUS_ORDO / MANUS / SECTOR_C` | 없음(정규 배치) | `H`(기존 승인값 유지) | `/assets/npcs/Pechorin-profile.webp`(기존 승인 초상 유지) | `true`(기존값 유지) | 남성; 나이·신장·체중은 원문 미상 | 마가렛에게 데드핸드 실행을 맡기고 자결해 비상 냉각을 가능하게 함; 사망 상태 추가 | applied |
| `RODION` | 로드리온 로마노비치 라스콜니코프 | `грибы(버섯들)` | 전 섹터 C 감독관 / 심부 굴착 생존자 | 기존 ERP 내부 식별자와 1부 승인 원장 | `NOVUS_ORDO / MANUS / SECTOR_C` | 없음(정규 배치) | `M`(기존 승인값 유지) | `/assets/npcs/Rodion-profile.webp`(기존 승인 초상 유지) | `true`(기존값 유지) | 남성; 67세; 190cm; 체중은 원문 미상 | 마리아에게 오브로 투척되어 사망; 게라쉬모프와의 지도부 경쟁 관계 추가 | applied |
| `BAZAROV` | 니콜라이 바자로프 | `богослов(신학자)` | 섹터 C 연구원장 → 섹터 C 감독관 | 기존 ERP 내부 식별자와 1부 승인 원장 | `NOVUS_ORDO / MANUS / SECTOR_C` | 연구원장→감독관 직책 변경 | `H → M`(사용자 승인; 섹터 C 단일 부서 감독관 취임에 따른 부서 관리자 등급) | `/assets/npcs/Bazarov-profile.webp`(기존 승인 초상 유지) | `true`(기존값 유지) | 남성; 나이는 원문 미상; 176cm; 체중은 원문 미상 | 레짐 체인지 프로토콜로 새 감독관이 되었고 섹터 C 사태가 후속 안정화됨 | applied |
| `GERASIMOV` | 미하일 게라쉬모프(2026-08-10 사용자 후속 신원 확인) | 없음(기록 없음) | 러시아 측 파견 장군 / 섹터 C 국영화 추진자 | 로드리온의 호명, 동일 역할의 1·2부 연속 등장, 사용자 제공 초상 매칭과 후속 전체 이름 확인; 기존 기술 식별자 유지 | `MILITARY / RUSSIA` 외부 군부 산하 러시아 정부 | 러시아 정부 / 섹터 C 국영화·지도부 교체 | 없음(외부 인물; `agentLevel` 미저장) | `/assets/npcs/Gerasimov-profile.webp`(기존 공개 초상 보존) | `true`(기존 공개 상태 보존) | 남성; 나이·신장·체중은 원문 미상 | 표시명·영문명·department·외형 도입부·배경·역할 상세·이름 설명·`loreMd`·`러시아정부` 태그를 focused repair하고 사망·초상·공개·관계·사건 링크·성격 관찰은 보존 | ready-for-apply |
| `WHITE_ROSE_R` | R(교신 식별명; 실명·전체 이름은 원문 미상) | 없음(`R`은 현재 확인된 주 식별명) | 화이트로즈 수장(자칭) / 레짐 체인지 제안자 | 통신에서 본인이 조직 수장 R이라고 발화; 조직명과 식별명을 결합한 기술 식별자 | `CIVIL / WHITE_ROSE` 외부 시민사회 | 본부 긴급 통신망 개입 / 섹터 C 후임 파견 제안 | 없음(외부 조직 인물; `agentLevel` 미저장) | 빈 값(사용자 명시적 무이미지 결정; 교신 컷신 재사용 금지) | `true`(앞선 공개 결정 유지) | 성별·나이·신장·체중은 원문 미상 | 지도부 동시 실각과 화이트로즈 인사 파견을 제안; `INDEXER`와 양방향 testimony 관계 | applied |
| `RUBIN_BABUSHKA` | 바부슈카(실명은 원문 미상; speaker label을 표시명으로 보존) | 없음(바부슈카는 기록 표시명) | 루빈 인근 마을 주민 / 실명 미상 | 종료 장면 speaker label과 사용자 제공 초상; 사건 기반 기술 식별자 | `CIVIL` 외부 시민사회 | 루빈 인근 마을 주민 | 없음(외부 인물; `agentLevel` 미저장) | `/assets/npcs/Rubin-Babushka-profile.webp`(사용자 제공 원본 초상) | `true`(사용자 공개 결정) | 여성 노인; 신장·체중은 원문 미상 | 웬디고와 `Мама`·`내 아들` 발화를 교환했다는 증언만 보존하고 실제 가족관계는 확정하지 않음 | applied |

## Apply Scope

- 신규 Dossier 생성 전용 payload: `scripts/seed-payloads/nosb-s1e5-evil-part2-new-npcs.json` — 검증된 최초 `personalityObservations` 배열을 포함해 runner가 기존 Dossier 발견 시 쓰기를 거부하므로 재실행이 기존 필드를 덮어쓰지 않는다.
- 신규·기존 Dossier 관계 원자적 payload: `scripts/seed-payloads/nosb-s1e5-evil-part2-dossier-relations.json` — `GERASIMOV`↔`RODION`, `GERASIMOV`↔`OTILIA`, `WHITE_ROSE_R`↔`INDEXER` 여섯 관계를 한 파일의 트랜잭션으로 추가한다.
- 기존 Dossier 갱신 payload: `scripts/seed-payloads/nosb-s1e5-evil-part2-dossiers.json`
- 바자로프 등급 단독 교정 payload: `scripts/seed-payloads/nosb-s1e5-evil-part2-bazarov-level-repair.json` — 현재 role이 `섹터 C 연구원장 → 섹터 C 감독관`이고 등급이 `H`인 상태를 전제해 도메인 필드는 `agentLevel: M`만 쓰며, 같은 role에서 이미 `M`이면 postcondition으로 멱등 종료한다. 다른 Dossier 도메인 필드나 캐릭터 대상은 건드리지 않지만, 실제 변경 시 runner가 `BAZAROV.updatedAt`을 갱신하고 실행 시도별 `lore_ingestion_runs` 감사 레코드를 생성·완료 또는 실패 상태로 갱신한다.
- 바자로프 등급 단독 교정은 2026-08-07 live 적용·DB 재조회까지 완료했다. 저장 결과는 `agentLevel: M`, 감사 실행은 `succeeded`(`written=1`, `failed=0`)이며 사후 dry-run은 `예상 unchanged`다.
- 게라쉬모프 후속 신원·소속 교정 payload: `scripts/seed-payloads/russia-government-personnel-sync.json` — 표시명·영문명·department·관련 공개 서술·`loreMd`·`러시아정부` 태그를 새 전체 이름과 러시아 정부 분류에 맞추고 runner가 `updatedAt`을 갱신한다. 기존 공개·사망·초상·무등급·관계·사건 링크·성격 관찰은 보존한다.
- 외부 인물 `GERASIMOV`, `WHITE_ROSE_R`, `RUBIN_BABUSHKA`에는 내부 권한등급을 저장하지 않는다.
- `WHITE_ROSE_R`의 `previewImage`와 `lore.mainImage`는 사용자 지시에 따라 빈 값으로 저장한다.

## Live Apply Result

- production revision: `bac615e0b16bc1b8b59cda6f221b17f0bb9517a9`; 신규 초상 2개는 production 원본에서 각각 876×1280·956×1280으로 확인했다.
- 신규 Dossier 3건, 관계 대상 5건/관계 6개, 기존 Dossier 21건과 personality observation 6건의 live 적용·독립 DB 재조회가 통과했다.
- `GERASIMOV`, `RUBIN_BABUSHKA`, `WHITE_ROSE_R`은 모두 공개 외부 NPC이고 `agentLevel` 필드가 없다. R은 `previewImage`와 `lore.mainImage`가 빈 값이다.
- 인증 ERP에서 신규 세 Dossier, 바자로프 `M · 부서 관리자`, R의 무이미지와 개인 `U` 배지 비노출, 관계 카드의 정·역방향 앵커를 확인했다.
