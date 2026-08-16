---
title: NOSB-MINI-NEVED Garrett Sector B affiliation repair 2026-08-16
category: session-sync
tags: [NOSB-MINI-NEVED, npc, dossier, affiliation-repair]
updated: 2026-08-16
source: user-directed
---

# GARRETT_CLIMAC 섹터 B 소속 정정 원장

MINI06 현재 시점 기록에서 개럿 클라이맥은 섹터 B 경호원으로 확인됐다. 사용자가 2026-08-16에 현재 정규 소속을 노부스 오르도 MANUS 섹터 B로 이동하고 내부 권한등급은 미등록 상태로 유지하도록 확정했다. 갈로글라 소속은 과거 이력과 관계 서사에만 보존한다.

## NPC Approval Ledger

| codename | 신원조회 실명 | 별칭 | 직함/역할 | 식별자 근거 | 정규 소속 | 파견/겸임 | 권한등급 | Dossier 초상 | 공개 여부 | 인적 정보 | 서술/관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `GARRETT_CLIMAC` | 개럿 클라이맥 (`Garrett Climac`) | 별칭 없음 | 표시 역할 유지: 갈로글라 청년 전사대장(과거) / 섹터 B 경호원(현재); MINI06 현재 기록과 사용자 확정 | 기존 ERP codename와 MINI06 인물 식별 보존 | `MILITARY / GALLOGLA` → `NOVUS_ORDO / MANUS / SECTOR_B`; 사용자 이동 지시 | 섹터 B 경호를 현재 정규 배치로 반영; 별도 파견 없음 | agentLevel 미등록 유지(소속 필드 정정 영향 검토: 사용자가 미설정 유지를 확정했고 경호 보직만으로 내부 접근 권한을 추론하지 않음) | 사용자 지정 `/assets/npcs/Garrett-Climac-profile.webp` | 기존 공개 유지 | 남성·연령/신장/체중 미상·얼굴 흉터·생존 상태 보존 | 현재 소속 문장과 역할 상세만 정정; 키아나·사이먼 관계와 세션 출현 보존 | ready-for-apply |

## Apply Scope

- durable payload: `StarGateV2/scripts/seed-payloads/nosb-mini-neved-garrett-sector-b-affiliation-repair-2026-08-16.json`
- DB target: `characters.codename = GARRETT_CLIMAC`
- before: `MILITARY / institution 없음 / GALLOGLA`, `agentLevel` 없음
- after: `NOVUS_ORDO / MANUS / SECTOR_B`, `agentLevel` 없음
- additive context: 갈로글라는 과거 소속·역할과 검색 태그에 보존
- synchronized prose: `lore.background`, `lore.roleDetail`, `lore.loreTags`, `loreMd`
- not touched: 역할 표시문·신원·공개 여부·인적 정보·관계·세션 출현·성격 관찰·credits·inventory·shop·stocks
- live status: 사용자 exact 승인 확보; 검증 및 committed-source gate 통과 후 실행
