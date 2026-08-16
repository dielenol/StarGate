---
title: NOSB-MINI-NEVED Dossier image repair 2026-08-16
category: session-sync
tags: [NOSB-MINI-NEVED, npc, dossier, image-repair]
updated: 2026-08-16
source: user-provided
---

# NOSB-MINI-NEVED Dossier 초상 교체 원장

사용자가 2026-08-16에 인물 순서와 Dossier 초상을 1:1로 직접 지정했다. 기존 신원·소속·권한·공개 여부·인적 정보·서술·관계는 보존하고 `previewImage`와 `lore.mainImage`만 교체한다.

## NPC Approval Ledger

| codename | 신원조회 실명 | 별칭 | 직함/역할 | 식별자 근거 | 정규 소속 | 파견/겸임 | 권한등급 | Dossier 초상 | 공개 여부 | 인적 정보 | 서술/관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `SIMON_OCALLAHAN` | 사이먼 오 캘러핸 (`Simon O'Callahan`) | 별칭 없음 | 갈로글라 전사 / 키아나의 선대·교사 보존 | 기존 ERP codename 보존 | 기존 `MILITARY / GALLOGLA` 보존 | 사망자; 현재 파견 없음 | 외부 인원이라 agentLevel 미저장 보존 | 사용자 지정 `/assets/npcs/Simon-O-Callahan-profile.webp` | 기존 공개 보존 | 기존 신상·사망 상태 보존 | 기존 서술·관계 보존 | ready-for-apply |
| `CONNOR_OCALLAHAN` | 코너 오 캘러핸 (`Connor O'Callahan`) | 별칭 없음 | 갈로글라 지도자 / 오 캘러핸 가주 보존 | 기존 ERP codename 보존 | 기존 `MILITARY / GALLOGLA` 보존 | 기존 욤스비킹 동맹 기록 보존 | 외부 인원이라 agentLevel 미저장 보존 | 사용자 지정 `/assets/npcs/Connor-O-Callahan-profile.webp` | 기존 공개 보존 | 기존 신상 보존 | 기존 서술·관계 보존 | ready-for-apply |
| `NERIN_OCALLAHAN` | 네린 오 캘러핸 (`Nerin O'Callahan`) | 별칭 없음 | 갈로글라 공동체 주민 / 오 캘러핸 가문 보존 | 기존 ERP codename 보존 | 기존 `MILITARY / GALLOGLA` 보존 | 기존 기억 속 주민 기록 보존 | 외부 인원이라 agentLevel 미저장 보존 | 사용자 지정 `/assets/npcs/Nerin-O-Callahan-profile.webp` | 기존 공개 보존 | 기존 신상 보존 | 기존 서술·관계 보존 | ready-for-apply |
| `GARRETT_CLIMAC` | 개럿 클라이맥 (`Garrett Climac`) | 별칭 없음 | 갈로글라 청년 전사대장 / 현 섹터 B 경호원 보존 | 기존 ERP codename 보존 | 이번 이미지 payload에서는 기존 `MILITARY / GALLOGLA` 보존 | 기존 섹터 B 경호 기록 보존; 소속 정정은 별도 live 확인 대상 | 외부 분류 상태의 agentLevel 미저장 보존 | 사용자 지정 `/assets/npcs/Garrett-Climac-profile.webp` | 기존 공개 보존 | 기존 신상 보존 | 기존 서술·관계 보존 | ready-for-apply |
| `ENDA_CLIMAC` | 엔다 클라이맥 (`Enda Climac`) | 별칭 없음 | 은퇴한 갈로글라 전사 / 클라이맥 원로 보존 | 기존 ERP codename 보존 | 기존 `MILITARY / GALLOGLA` 보존 | 기존 은퇴 기록 보존 | 외부 인원이라 agentLevel 미저장 보존 | 사용자 지정 `/assets/npcs/Enda-Climac-profile.webp` | 기존 공개 보존 | 기존 신상 보존 | 기존 서술·관계 보존 | ready-for-apply |
| `EVA_HANNER` | 에바 한너 (`Eva Hanner`) | 별칭 없음 | 갈로글라 한너 클랜 지도자 보존 | 기존 ERP codename 보존 | 기존 `MILITARY / GALLOGLA` 보존 | 기존 클랜 지도 기록 보존 | 외부 인원이라 agentLevel 미저장 보존 | 사용자 지정 `/assets/npcs/Eva-Hanner-profile.webp` | 기존 공개 보존 | 기존 신상 보존 | 기존 서술·관계 보존 | ready-for-apply |
| `SVEN_TROELBEIN` | 스벤 트로엘베인 (`Sven Troelbein`) | 별칭 없음 | 욤스비킹 지도자 보존 | 기존 ERP codename 보존 | 기존 `MILITARY / JOMSVIKING` 보존 | 기존 갈로글라·오르도 동맹 기록 보존 | 외부 인원이라 agentLevel 미저장 보존 | 사용자 지정 `/assets/npcs/Sven-Troelbein-profile.webp` | 기존 공개 보존 | 기존 신상 보존 | 기존 서술·관계 보존 | ready-for-apply |
| `YOMS` | 욤스 (기록명; 실명 미확인) | 별칭 없음 | 욤스비킹 포로·정보원 / 회수 생존자 보존 | 기존 ERP codename 보존 | 기존 `MILITARY / JOMSVIKING` 보존 | 기존 포로·회수 기록 보존 | 외부 인원이라 agentLevel 미저장 보존 | 사용자 지정 `/assets/npcs/Yoms-profile.webp` | 기존 공개 보존 | 기존 신상 보존 | 기존 서술·관계 보존 | ready-for-apply |
| `GAL_MUJIK` | 갈 무직 (기록명; 실명 미확인) | 별칭 없음 | 갈로글라 경비 / 욤스 회수 협력자 보존 | 기존 ERP codename 보존 | 기존 `MILITARY / GALLOGLA` 보존 | 기존 비밀 회수 지원 기록 보존 | 외부 인원이라 agentLevel 미저장 보존 | 사용자 지정 `/assets/npcs/Gal-Mujik-profile.webp` | 기존 공개 보존 | 기존 신상 보존 | 기존 서술·관계 보존 | ready-for-apply |

## Visual Asset Ledger

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `/assets/npcs/Simon-O-Callahan-profile.webp` | 사용자 지정 이미지 1 | 1024×1365 | no | personnel-image | excluded: 보고서용 아님 | excluded: 보고서 mirror용 아님 | excluded: 전용 wiki 요청 없음 | excluded: catalog 대상 아님 | included: `SIMON_OCALLAHAN` preview/main | 사용자가 사이먼 오 캘러핸의 Dossier 초상으로 직접 지정 |
| `/assets/npcs/Connor-O-Callahan-profile.webp` | 사용자 지정 이미지 2 | 1024×1365 | no | personnel-image | excluded: 보고서용 아님 | excluded: 보고서 mirror용 아님 | excluded: 전용 wiki 요청 없음 | excluded: catalog 대상 아님 | included: `CONNOR_OCALLAHAN` preview/main | 사용자가 코너 오 캘러핸의 Dossier 초상으로 직접 지정 |
| `/assets/npcs/Nerin-O-Callahan-profile.webp` | 사용자 지정 이미지 3 | 1024×1365 | no | personnel-image | excluded: 보고서용 아님 | excluded: 보고서 mirror용 아님 | excluded: 전용 wiki 요청 없음 | excluded: catalog 대상 아님 | included: `NERIN_OCALLAHAN` preview/main | 사용자가 네린 오 캘러핸의 Dossier 초상으로 직접 지정 |
| `/assets/npcs/Garrett-Climac-profile.webp` | 사용자 지정 이미지 4 | 1024×1365 | no | personnel-image | excluded: 보고서용 아님 | excluded: 보고서 mirror용 아님 | excluded: 전용 wiki 요청 없음 | excluded: catalog 대상 아님 | included: `GARRETT_CLIMAC` preview/main | 사용자가 개럿 클라이맥의 Dossier 초상으로 직접 지정 |
| `/assets/npcs/Enda-Climac-profile.webp` | 사용자 지정 이미지 5 | 1024×1365 | no | personnel-image | excluded: 보고서용 아님 | excluded: 보고서 mirror용 아님 | excluded: 전용 wiki 요청 없음 | excluded: catalog 대상 아님 | included: `ENDA_CLIMAC` preview/main | 사용자가 엔다 클라이맥의 Dossier 초상으로 직접 지정 |
| `/assets/npcs/Eva-Hanner-profile.webp` | 사용자 지정 이미지 6 | 1024×1365 | no | personnel-image | excluded: 보고서용 아님 | excluded: 보고서 mirror용 아님 | excluded: 전용 wiki 요청 없음 | excluded: catalog 대상 아님 | included: `EVA_HANNER` preview/main | 사용자가 에바 한너의 Dossier 초상으로 직접 지정 |
| `/assets/npcs/Sven-Troelbein-profile.webp` | 사용자 지정 이미지 7 | 1024×1365 | no | personnel-image | excluded: 보고서용 아님 | excluded: 보고서 mirror용 아님 | excluded: 전용 wiki 요청 없음 | excluded: catalog 대상 아님 | included: `SVEN_TROELBEIN` preview/main | 사용자가 스벤 트로엘베인의 Dossier 초상으로 직접 지정 |
| `/assets/npcs/Yoms-profile.webp` | 사용자 지정 이미지 8 | 1024×1365 | no | personnel-image | excluded: 보고서용 아님 | excluded: 보고서 mirror용 아님 | excluded: 전용 wiki 요청 없음 | excluded: catalog 대상 아님 | included: `YOMS` preview/main | 사용자가 욤스의 Dossier 초상으로 직접 지정 |
| `/assets/npcs/Gal-Mujik-profile.webp` | 사용자 지정 이미지 9 | 1024×1365 | no | personnel-image | excluded: 보고서용 아님 | excluded: 보고서 mirror용 아님 | excluded: 전용 wiki 요청 없음 | excluded: catalog 대상 아님 | included: `GAL_MUJIK` preview/main | 사용자가 갈 무직의 Dossier 초상으로 직접 지정 |

## Apply Scope

- durable payload: `StarGateV2/scripts/seed-payloads/nosb-mini-neved-dossier-image-repair-2026-08-16.json`
- DB target: `characters`의 위 9개 codename
- fields: `previewImage`, `lore.mainImage`, `updatedAt`
- CAS baseline: 두 이미지 필드가 모두 `/assets/npcs/Unknown-Person-profile.webp`인 기존 NPC만 수정
- not touched: 조직·권한·인적 정보·관계·세션 출현·보고서·wiki·catalog·credits·inventory·stocks
- live status: 사용자에게 전후 값과 부작용을 제시한 뒤 최종 확인 대기
