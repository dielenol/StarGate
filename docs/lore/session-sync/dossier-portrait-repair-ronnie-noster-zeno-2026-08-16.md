---
title: Dossier portrait repair — Ronnie Keane, Noster, Doctor Zeno
category: session-sync
tags: [npc, dossier, image-repair, user-provided]
updated: 2026-08-16
source: user-provided
---

# 신원조회 잔여 초상 3종 연결 원장

사용자가 2026-08-16에 이미지 순서를 `로니 킨`, `노스터`, `제노`로 직접 지정했다. 두 번째와 세 번째 원본 PNG는 SHA-256이 같은 동일 파일이지만, 사용자 지정 순서를 그대로 승인 근거로 삼아 각 인물의 독립된 의미 경로에 발행한다. 푸틴과 WHITE_ROSE_R은 같은 요청에서 당분간 초상 미지정 상태를 유지하기로 확정했다.

## NPC Approval Ledger

| codename | 신원조회 실명 | 별칭 | 직함/역할 | 식별자 근거 | 정규 소속 | 파견/겸임 | 권한등급 | Dossier 초상 | 공개 여부 | 인적 정보 | 서술/관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `RONNIE_KEANE` | 로니 킨 (`Ronnie Keane`) | 별칭 없음 | 갈로글라 공동체 사냥꾼 / 사이먼 사망 증언자 보존 | 기존 ERP codename과 durable spec 보존 | `MILITARY / GALLOGLA` 보존 | 없음; 공동체 정규 역할 보존 | 외부 인원이라 agentLevel 미저장 보존 | 사용자 지정 `/assets/npcs/Ronnie-Keane-profile.webp` | `true` 보존 | 기존 성별·나이·신장·체중 미상 보존 | 기존 서술·관계·사건 링크 보존 | applied |
| `NOSTER` | 노스터 (`Noster`; 성명 전체 미확인) | 별칭 없음 | 갈로글라 공동체 양조업자 / 야수화 주사 절도 증언자 보존 | 기존 ERP codename과 durable spec 보존 | `MILITARY / GALLOGLA` 보존 | 없음; 공동체 정규 역할 보존 | 외부 인원이라 agentLevel 미저장 보존 | 사용자 지정 `/assets/npcs/Noster-profile.webp` | `true` 보존 | 기존 성별·나이·신장·체중 미상 및 `DECEASED` 상태 보존 | 기존 서술·관계·사건 링크 보존 | applied |
| `DOCTOR_ZENO` | 제노 (`Zeno`; 닥터는 직함) | 별칭 없음 | 연구 기구 사무차장 / 프로젝트 데드 핸드 직접 지휘자 보존 | 기존 ERP codename과 durable spec 보존 | `NOVUS_ORDO / SECRETARIAT / RESEARCH` 보존 | 없음; 사무차장 정규 직무 보존 | `V` 보존 | 사용자 지정 `/assets/npcs/Doctor-Zeno-profile.webp` | `true` 보존 | 기존 성별·나이·신장·체중 미기록 보존 | 기존 서술·관계·성격 관찰·사건 링크 보존 | applied |
| `PUTIN` | 블라디미르 푸틴 (`Vladimir Putin`) | 별칭 없음 | 러시아 연방 대통령 / 섹터 C 국영화 지시권자 보존 | 기존 ERP codename과 durable spec 보존 | `MILITARY / RUSSIA` 보존 | 섹터 C에는 후방 지시권자로만 기록 | 외부 인원이라 agentLevel 미저장 보존 | `/assets/npcs/Unknown-Person-profile.webp` 유지 | `true` 보존 | 기존 신상 미기록 보존 | 사용자가 당분간 초상 미지정을 명시; 기존 서술·관계 보존 | applied |
| `WHITE_ROSE_R` | R (실명 미확인) | 별칭 없음 | 화이트로즈 수장(자칭) / 레짐 체인지 제안자 보존 | 기존 교신 식별명과 ERP codename 보존 | `CIVIL / WHITE_ROSE` 보존 | 섹터 C 긴급 교신 개입 기록 보존 | 외부 인원이라 agentLevel 미저장 보존 | `/assets/npcs/Unknown-Person-profile.webp` 유지 | `true` 보존 | 기존 성별·나이·신장·체중 미상 보존 | 사용자가 당분간 초상 미지정을 명시; 기존 서술·관계 보존 | applied |

## Visual Asset Ledger

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `/assets/npcs/Ronnie-Keane-profile.webp` | 사용자 지정 이미지 1; source SHA-256 `f4ec300dbe570b643c4b223f2184e7d243e97b961ad5723c9a0b562a39e29f89` | 1024×1365 | no | personnel-image | excluded: 보고서용 아님 | excluded: 보고서 mirror용 아님 | excluded: 전용 wiki 요청 없음 | excluded: catalog 대상 아님 | included: `RONNIE_KEANE` preview/main | 사용자가 로니 킨의 Dossier 초상으로 직접 지정 |
| `/assets/npcs/Noster-profile.webp` | 사용자 지정 이미지 2; source SHA-256 `fbba648bf24a0cf77c0b03ac142c94e8655fddb8c58aa24a735585177986675e` | 1024×1365 | no | personnel-image | excluded: 보고서용 아님 | excluded: 보고서 mirror용 아님 | excluded: 전용 wiki 요청 없음 | excluded: catalog 대상 아님 | included: `NOSTER` preview/main | 사용자가 노스터의 Dossier 초상으로 직접 지정 |
| `/assets/npcs/Doctor-Zeno-profile.webp` | 사용자 지정 이미지 3; source SHA-256 `fbba648bf24a0cf77c0b03ac142c94e8655fddb8c58aa24a735585177986675e` | 1024×1365 | no | personnel-image | excluded: 보고서용 아님 | excluded: 보고서 mirror용 아님 | excluded: 전용 wiki 요청 없음 | excluded: catalog 대상 아님 | included: `DOCTOR_ZENO` preview/main | 사용자가 제노의 Dossier 초상으로 직접 지정; 이미지 2와 동일 원본임을 기록 |

## Explicit No-image Decisions

- `PUTIN`: 사용자가 당분간 이미지 미지정으로 확정했다. `previewImage`와 `lore.mainImage`의 `/assets/npcs/Unknown-Person-profile.webp`를 유지한다.
- `WHITE_ROSE_R`: 사용자가 당분간 이미지 미지정으로 확정했다. `previewImage`와 `lore.mainImage`의 `/assets/npcs/Unknown-Person-profile.webp`를 유지한다.

## Apply Scope

- durable payload: `StarGateV2/scripts/seed-payloads/dossier-portrait-repair-ronnie-noster-zeno-2026-08-16.json`
- DB target: `stargate.characters`의 `RONNIE_KEANE`, `NOSTER`, `DOCTOR_ZENO` 3건
- fields: `previewImage`, `lore.mainImage`, `updatedAt`
- CAS baseline: 기존 신원·조직·공개·등급·사망 상태와 두 이미지 필드의 placeholder 값을 모두 만족하는 NPC만 수정
- not touched: `PUTIN`, `WHITE_ROSE_R`, 다른 NPC, 신원·조직·권한·인적 정보·생사·서술·관계·세션 출현·보고서·wiki·catalog·credits·inventory·stocks
- live status: 사용자 승인 후 2026-08-16 적용 및 DB 재조회·Dossier 카드/상세 렌더 검증 완료

## Live Execution Record

- DB: `stargate`
- run id: `seed-payload:89fea895-fe19-4ea0-99a1-03a33f967807`
- atomic result: `RONNIE_KEANE`, `NOSTER`, `DOCTOR_ZENO` 3건 모두 `previewImage`와 `lore.mainImage` 갱신, 3/3 commit
- DB postcondition: 동일 payload 재실행 dry-run에서 3건 모두 `unchanged`; 독립 재조회에서 소속·권한·공개·생사·관계·세션 출현·성격 관찰 보존 확인
- explicit no-image postcondition: `PUTIN`, `WHITE_ROSE_R`의 두 이미지 필드는 모두 `/assets/npcs/Unknown-Person-profile.webp` 유지
- Dossier card: 3/3 지정 asset 로드, natural 51×69, rendered 50×50, `object-fit: cover`, backdrop `rgb(21, 21, 26)`
- Dossier detail: 3/3 지정 asset 로드, natural 320×426, rendered 238×317, `object-fit: cover`, transparent frame backdrop
- browser health: 갈로글라 카드, 연구 기구 카드, 세 상세 Dossier 총 5개 라우트의 깨진 이미지 0건; 애플리케이션 출처 콘솔 오류 0건
- browser exclusion: Chrome 확장 프로그램의 Vue Devtools 중복 설치 경고 7건은 애플리케이션 오류에서 제외
