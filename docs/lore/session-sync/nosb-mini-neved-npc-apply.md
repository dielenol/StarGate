---
title: NOSB-MINI-NEVED NPC apply manifest
category: session-sync
tags: [NOSB-MINI-NEVED, npc, dossier, publication]
updated: 2026-08-13
source: stargate-lore
---

# NOSB-MINI-NEVED NPC 적용 원장

이 문서는 `nosb-mini-neved-new-npcs.json`이 생성하는 공개 Dossier 11건과 `nosb-mini-neved-publication.json`이 수정하는 기존 공개 Dossier 11건을 분리 검증하는 focused 원장이다. 저장소 payload readiness를 기록할 뿐 live 적용을 자동 승인하지 않는다.

## NPC Approval Ledger

| codename | 신원조회 실명 | 별칭 | 직함/역할 | 식별자 근거 | 정규 소속 | 파견/겸임 | 권한등급 | Dossier 초상 | 공개 여부 | 인적 정보 | 서술/관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `네베드` | 키아나 오 캘러핸(기존 ERP 신원) | 네베드(기존 ERP) | 요원 / 기억 치료 대상 / 갈로글라 전사 선택 | 세션 화자와 기존 실명·가족 관계 일치 | 기존 `NOVUS_ORDO` 소속 보존 | 기억 다이브와 갈로글라 과거 회상; 정규 보직 불변 | `G` 유지(개인 서사와 전사 선택은 오르도 직책·접근 권한 변경이 아님) | 기존 Dossier 초상 보존; 컷신 재사용 없음 | 기존 공개 보존 | 기존 신상 보존 | 세션 출현과 자기결정 성격 관찰만 additive 반영 | ready-for-apply |
| `SANDMAN` | 데이비드 오 캘러핸(기존 ERP 신원) | 샌드맨(기존 ERP) | 뉴 더블린 감독관 유지 / 기억 다이브 지원자 | 세션 실명·누나 관계와 기존 Dossier 일치 | 기존 `NOVUS_ORDO` 소속 보존 | 누나 구조와 코너 저지는 임시 행동 | `G` 유지(감독관 직책은 기존 반영 상태이며 이번 가족 구조는 추가 지휘권 변동이 아님) | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 출현과 보호적 위험 감수 관찰만 additive 반영 | ready-for-apply |
| `OTILIA` | 오틸리아 발트만(기존 ERP 신원) | 기존 ERP 별칭 보존 | 과학자 / 기억 조사 참여 | 세션 화자와 기존 Dossier 일치 | 기존 소속 보존 | ALPANO 기억 다이브 일시 참가 | `G` 유지(일시 치료 참여는 정규 직책·접근 권한 변경이 아님) | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 appearance만 additive 반영 | ready-for-apply |
| `LEE DONGSIK` | 이동식(기존 ERP 신원) | 기존 ERP 별칭 보존 | 현장 요원 / 기억 조사 참여 | 세션 화자와 기존 Dossier 일치 | 기존 소속 보존 | 기억 다이브 일시 참가 | `U` 유지(현장 참가가 정규 직책·접근 권한을 바꾸지 않음) | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 appearance만 additive 반영 | ready-for-apply |
| `MARIA` | 마리아(기존 ERP 신원) | 기존 ERP 별칭 보존 | 현장 요원 / 기억 조사·파편 회수 | 세션 화자와 기존 Dossier 일치 | 기존 소속 보존 | 기억 다이브와 사후 회수 일시 참가 | `H` 유지(회수 행동은 정규 직책·접근 권한 변경이 아님) | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 appearance만 additive 반영 | ready-for-apply |
| `TIME` | 크로노스(기존 ERP 신원) | 기존 ERP 별칭 보존 | 현장 요원 / 기억 조사 참여 | 세션 화자와 기존 Dossier 일치 | 기존 소속 보존 | 기억 다이브 일시 참가 | `G` 유지(현장 참가와 소다 사용은 직책·접근 권한 변경이 아님) | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 appearance만 additive 반영; 인벤토리 별도 승인 | ready-for-apply |
| `TIGER298` | 시유(기존 ERP 신원) | 타이거(기존 ERP) | 현장 요원 / 기억 조사 참여 | 세션 화자와 기존 Dossier 일치 | 기존 소속 보존 | 기억 다이브 일시 참가 | `J` 유지(현장 참가가 정규 직책·접근 권한을 바꾸지 않음) | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 appearance만 additive 반영 | ready-for-apply |
| `AEGIS` | 발레리아 아젠트(기존 ERP 신원) | 아젠트(기존 ERP) | 현장 요원 / 기억 조사·전투 참여 | 세션 화자와 기존 Dossier 일치 | 기존 소속 보존 | 기억 다이브 일시 참가 | `J` 유지(현장 전투는 정규 직책·접근 권한을 바꾸지 않음) | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 appearance만 additive 반영 | ready-for-apply |
| `PIPETTE` | 휘트모어 핀치(기존 ERP 신원) | 피펫(기존 ERP) | 과학자 / 기억 다이브·파편 봉인 지원 | 세션 화자와 기존 Dossier 일치 | 기존 소속 보존 | ALPANO 보조와 사후 봉인 | `J` 유지(실험 지원은 정규 보직·접근 권한 변경이 아님) | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 appearance만 additive 반영 | ready-for-apply |
| `MR_ODD` | Mr. 오드(기존 ERP 신원) | 기존 ERP 별칭 보존 | 임무 통제 / 보상 지급 | 세션 화자와 기존 Dossier 일치 | 기존 소속 보존 | 세션 사후 통제 | `M` 유지(보상 지급은 기존 통제 역할이며 보직·권한 변동이 아님) | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 appearance만 additive 반영; credit ledger 후속 작업 제외 | ready-for-apply |
| `CASEY_RACER` | Casey Racer(기존 ERP 신원) | 기존 ERP 별칭 보존 | 욤스비킹 연락망 / 과거 쿠키 회수자 | 세션 실명과 기존 David 협력 관계 일치 | 기존 외부 소속 보존 | 과거 욤스 회수 연락 | 외부 인원이라 agentLevel 미저장 | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 appearance만 additive 반영 | ready-for-apply |
| `GARRETT_CLIMAC` | 개럿 클라이맥 (`Garrett Climac`) | 별칭 없음 | 갈로글라 청년 전사대장 / 현 섹터 B 경호원 | 기억 로그·현재 쿠키·공개 기획 노트 | `MILITARY / GALLOGLA` | 현 섹터 B 경호, 고용 주체 미확인 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 남성, 얼굴 흉터, 현재 생존 확인 | 키아나·사이먼 관계와 appearance | ready-for-apply |
| `SIMON_OCALLAHAN` | 사이먼 오 캘러핸 (`Simon O'Callahan`) | 별칭 없음 | 갈로글라 전사 / 키아나의 선대·교사 | 기억 로그·공개 기획 노트 | `MILITARY / GALLOGLA` | 사망자 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 당시 20세·188cm, `DECEASED` 완전 증거 묶음 | 키아나·개럿 관계와 appearance | ready-for-apply |
| `CONNOR_OCALLAHAN` | 코너 오 캘러핸 (`Connor O'Callahan`) | 별칭 없음 | 갈로글라 지도자 / 오 캘러핸 가주 | 가족 호칭·현재 쿠키 | `MILITARY / GALLOGLA` | 욤스비킹과 오르도 산하 동맹 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 현재 쿠키 등장; 생사 필드 미저장 | 키아나·데이비드·스벤 관계와 appearance | ready-for-apply |
| `NERIN_OCALLAHAN` | 네린 오 캘러핸 (`Nerin O'Callahan`) | 별칭 없음 | 오 캘러핸 가문 구성원 | 기억 로그 가족 호칭 | `MILITARY / GALLOGLA` | 기억 속 주민 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 현재 상태 미확인 | 자녀 관계와 appearance | ready-for-apply |
| `ENDA_CLIMAC` | 엔다 클라이맥 (`Enda Climac`) | 별칭 없음 | 은퇴한 전설적 전사 / 클라이맥 원로 | 기억 로그·공개 기획 노트 | `MILITARY / GALLOGLA` | 은퇴 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 당시 89세, 현재 상태 미확인 | 개럿·키아나 관계와 appearance | ready-for-apply |
| `EVA_HANNER` | 에바 한너 (`Eva Hanner`) | 별칭 없음 | 한너 클랜 지도자 | 성인식 회의·로그 호칭 | `MILITARY / GALLOGLA` | 클랜 지도부 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 현재 상태 미확인 | appearance만 반영 | ready-for-apply |
| `RONNIE_KEANE` | 로니 킨 (`Ronnie Keane`) | 별칭 없음 | 사냥꾼 / 사이먼 사망 증언자 | 로그 실명·직업·증언 | `MILITARY / GALLOGLA` | 기억 속 조사 협조 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 현재 상태 미확인 | 사이먼 관계와 appearance | ready-for-apply |
| `NOSTER` | 노스터 (기록명; 전체 법적 이름 미확인) | 별칭 없음 | 양조업자 / 야수화 주사 절도 증언자 | 로그 화자명·직업·증언·피살 | `MILITARY / GALLOGLA` | 기억 속 피살 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 전체 법적 이름 미확인, `DECEASED` 완전 증거 묶음 | 개럿 관계와 appearance | ready-for-apply |
| `GAL_MUJIK` | 갈 무직 (기록명; 실명 미확인) | 별칭 없음 | 갈로글라 경비 / 욤스 회수 협력자 | 로그 화자명·우회로·과거 쿠키 | `MILITARY / GALLOGLA` | 비밀 회수 지원 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 실명·현재 상태 미확인 | 데이비드·욤스 관계와 appearance | ready-for-apply |
| `YOMS` | 욤스 (기록명; 실명 미확인) | 별칭 없음 | 욤스비킹 포로·정보원 / 회수 생존자 | 포로 장면 화자명·과거 쿠키 | `MILITARY / JOMSVIKING` | 갈로글라 포로 뒤 회수 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 실명·직위·현재 상태 미확인 | 키아나·갈 무직 관계와 appearance | ready-for-apply |
| `SVEN_TROELBEIN` | 스벤 트로엘베인 (`Sven Troelbein`) | 별칭 없음 | 욤스비킹 지도자 | 현재 쿠키 동맹 선언 | `MILITARY / JOMSVIKING` | 갈로글라와 오르도 산하 동맹 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 현재 쿠키 등장; 생사 필드 미저장 | 코너 관계와 appearance | ready-for-apply |

## Apply Scope

- 신규 대상 payload: `StarGateV2/scripts/seed-payloads/nosb-mini-neved-new-npcs.json`의 create-only 공개 Dossier 11건.
- 기존 대상 payload: `StarGateV2/scripts/seed-payloads/nosb-mini-neved-publication.json`의 `dossier-session-sync` 11건.
- 신규 11건은 `MILITARY / GALLOGLA|JOMSVIKING` 외부 인물로 agentLevel을 저장하지 않는다. 공용 미상 인물 초상을 연결하고 `SIMON_OCALLAHAN`·`NOSTER`에만 `DECEASED` 증거 3필드를 함께 저장한다.
- 신규 payload의 최초 `personalityObservations: []`가 create-only gate다. live count 0을 전제로 한 번만 실행하고, 성공 뒤 재실행하지 않는다.
- 각 대상은 `NOSB-MINI-NEVED` appearance logical key가 없는 공개 Dossier를 전제로 하고, exact appearance·event id·tag 전체를 postcondition으로 확인한다.
- `네베드`와 `SANDMAN`의 성격 관찰 2건은 전체 coverage의 Personality Evidence Ledger와 동일한 stable id로 별도 envelope에서 검증한다.
- 크레딧·인벤토리·주식·알림 mutation은 이 focused 원장과 세 payload의 대상이 아니다. 200,000 크레딧 후속 원장 보정은 사용자 지시에 따라 완전히 제외한다.
- live 실행은 staging 적용·독립 재조회와 별도 exact 승인을 받은 뒤에만 진행한다.
