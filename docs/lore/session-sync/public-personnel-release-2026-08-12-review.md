---
title: Public personnel release and unknown portrait review
category: session-sync
tags: [personnel, dossier, publication, portrait, NOSB-S1E5-EVIL-PART1, NOSB-S1E6-TURNING-POINT-PART1]
updated: 2026-08-12
source: stargate-lore
---

# 공개 신원조회 및 미상 초상 적용 원장

이 문서는 세션에서 신원이 공개된 `IRMA_KOCH`, `DOCTOR_ZENO`의 공개 전환, 신규 `PUTIN` Dossier, 그리고 실초상이 없는 인물에만 적용하는 공용 미상 초상의 범위와 실행 결과를 보존한다. `IRMA_KOCH`의 사용자 승인 실초상은 교체하지 않으며, `WHITE_ROSE_R`과 리처드의 동일인 여부도 이번 작업에서 결정하지 않는다.

## Scope And Live Baseline

- 2026-08-12 live `stargate` 전수 재조회에서 `type: NPC`이며 `previewImage`와 `lore.mainImage`가 모두 비어 있는 기존 인물은 공개 `WHITE_ROSE_R`과 비공개 `DOCTOR_ZENO` 두 명뿐이었다.
- `IRMA_KOCH`는 비공개지만 `/assets/npcs/Irma-Koch-profile.webp` 실초상이 양쪽 이미지 필드에 이미 연결돼 있다.
- `PUTIN`은 live에 없고, `GERASIMOV`는 `MILITARY / RUSSIA`, 외부 무등급, 공개, 사망, 실초상 보유 상태다.
- `NOSB-S1E5-EVIL-PART1`은 legacy `minRole` 미저장 기본값으로, `NOSB-S1E6-TURNING-POINT-PART1`은 명시적 `minRole: U`로 일반 인증 역할 `U`가 열람 가능한 상태다.

## NPC Approval Ledger

| codename | 신원조회 실명 | 별칭 | 직함/역할 | 식별자 근거 | 정규 소속 | 파견/겸임 | 권한등급 | Dossier 초상 | 공개 여부 | 인적 정보 | 서술/관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `IRMA_KOCH` | 이르마 코흐 | 없음(별도 통칭·코드네임 미확인) | 1944년 오틸리아의 조수·제자 → 현재 아넨에르베 “광명회” 수장 | 세션 양 시점에서 같은 전체 이름으로 등장하고 현재 직책을 직접 선언 | `HOSTILE / AHNENERBE` 외부 적대 세력 | 수메르 지하 근거지와 광명회 의식 운영 | 없음(외부 인물; `agentLevel` 미저장) | `/assets/npcs/Irma-Koch-profile.webp`(사용자 승인 실초상 보존) | `false → true`(세션 공개 사실에 따른 사용자 지시) | 성별·연령·국적·신체 수치는 소스 미확인으로 빈 값 보존 | 기존 서술·관계·세션 appearance·성격 관찰을 그대로 보존하고 공개 상태만 전환 | applied |
| `DOCTOR_ZENO` | 제노(성명 전체 미확인) | 없음(`닥터`는 직함) | 닥터 모스 사망 뒤 연구 기구 사무차장 / 프로젝트 데드 핸드 직접 지휘자 | 세션의 신임 연구차장·직접 지휘 선언과 사용자 후속 인사 확인 | `NOVUS_ORDO / SECRETARIAT / RESEARCH` | 프로젝트 데드 핸드와 마가렛 직접 관리 | `V` 유지(전임 닥터 모스와 같은 직위·승인 범위 승계) | `/assets/npcs/Unknown-Person-profile.webp`(실초상 미확인 공용 표식) | `false → true`(세션 공개 사실에 따른 사용자 지시) | 성별·연령·국적·신체 수치는 소스 미확인으로 빈 값 보존 | 기존 서술·모스 후임 이력·관계 4건·appearance·성격 관찰을 보존하고 보고서 역링크 추가 | applied |
| `WHITE_ROSE_R` | R(교신 식별명; 실명·전체 이름 미상) | 없음(`R`이 현재 확인된 주 식별명) | 화이트로즈 수장(자칭) / 레짐 체인지 제안자 | 통신에서 본인이 조직 수장 R이라고 발화; 기존 안정 식별자 유지 | `CIVIL / WHITE_ROSE` 외부 시민사회 | 섹터 C 지도부 동시 실각과 후임 파견 제안 | 없음(외부 인물; `agentLevel` 미저장) | `/assets/npcs/Unknown-Person-profile.webp`(사용자가 기존 무이미지 결정을 철회하고 공용 표식 지정) | `true` 유지 | 성별·나이·신장·체중 `미상` 유지 | 기존 서술·`INDEXER` 관계·세션 appearance를 보존하며 리처드 동일인 병합은 보류 | applied |
| `PUTIN` | 블라디미르 푸틴 | 없음(별도 통칭·작전 코드네임 미확인) | 러시아 연방 대통령 / 섹터 C 국영화 지시권자 | 사용자 후속 신원 확인과 S1E5에서 게라쉬모프를 파견한 러시아 정부 지시권자라는 기록 | `MILITARY / RUSSIA` 외부 군부 산하 러시아 정부 | 미하일 게라쉬모프를 섹터 C 국영화·지도부 교체 임무에 파견 | 없음(외부 인물; `agentLevel` 미저장) | `/assets/npcs/Unknown-Person-profile.webp`(실초상 미제공 공용 표식) | `true` 신규 생성 | 성별·연령·국적·신체 수치는 이번 세션 소스에 저장하지 않음 | 현장에 직접 출현하지 않은 후방 지시권자로 제한해 기록하고 `GERASIMOV` 양방향 관계와 S1E5 보고서 역링크 생성 | applied |
| `GERASIMOV` | 미하일 게라쉬모프 | 없음(별도 통칭 미확인) | 러시아 측 파견 장군 / 섹터 C 국영화 추진자 | 기존 ERP 안정 식별자와 후속 전체 이름 확인 | `MILITARY / RUSSIA` 외부 군부 산하 러시아 정부 | 푸틴의 지시에 따른 섹터 C 현장 파견 | 없음(외부 인물; `agentLevel` 미저장) | `/assets/npcs/Gerasimov-profile.webp`(기존 승인 실초상 보존) | `true` 유지 | 남성; 나이·신장·체중은 원문 미상 | 기존 공개·사망·서술·사건·관계를 보존하고 `PUTIN`을 파견 지시자로 가리키는 관계 1건만 add-only 추가 | applied |

## Story-driven Role And Level Review

- 이번 작업은 새 직책 취임을 만들지 않는다. `IRMA_KOCH`와 `WHITE_ROSE_R`은 외부 인물이라 등급을 만들지 않고, `PUTIN`과 `GERASIMOV`도 `MILITARY / RUSSIA` 외부 조직 인물이므로 `agentLevel`을 저장하지 않는다.
- `DOCTOR_ZENO`의 `V`는 닥터 모스 사망 뒤 동일한 사무차장직과 승인 범위를 승계했다는 기존 사용자 결정과 직책 변경 규칙을 그대로 따른다. 이번 공개 전환은 접근권 승강 근거가 아니므로 `V`를 유지한다.

## Visual Asset Ledger

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `/assets/npcs/Unknown-Person-profile.webp` | 2026-08-12 고정 마리아 화풍 레퍼런스 + 사용자 제공 “신원 미상 인물·물음표” 분위기 레퍼런스; 사용자 이미지는 변환 대상이 아니며 원본 픽셀·워터마크 미사용 | 1084×1451 | no — 새 세로형 전체 캔버스 | personnel-image | excluded: personnel-only asset | excluded: personnel-only asset | excluded: personnel-only asset | excluded: personnel-only asset | included for `WHITE_ROSE_R`, `DOCTOR_ZENO`, `PUTIN` only | 164,904 bytes·SHA-256 `4a6a926cb1dbeaccc7815709a09a23bafd65842782012434391c0cf2b97cd033`. 마리아 레퍼런스의 연필선·먹 번짐·회백색 수채 질감으로 얼굴 정보가 지워진 중성적 인물을 새 구도로 창작했고, 흰 물음표 하나만 얼굴에 통합했다. 실초상이 확인된 인물에는 적용하지 않는다. `/assets` 정적 URL 자체는 미인증으로 공개됨을 사용자 승인 범위에 포함한다. |
| `/assets/npcs/Irma-Koch-profile.webp` | 기존 사용자 승인 이르마 현재 초상 | 1086×1448 | no — full portrait | personnel-image | excluded: personnel-only asset | excluded: personnel-only asset | excluded: personnel-only asset | excluded: personnel-only asset | included for `IRMA_KOCH` | 실초상이 있으므로 공용 미상 초상으로 교체하지 않는다. |
| `/assets/npcs/Gerasimov-profile.webp` | 기존 사용자 승인 게라쉬모프 초상 | 876×1280 | no — full portrait | personnel-image | excluded: personnel-only asset | excluded: personnel-only asset | excluded: personnel-only asset | excluded: personnel-only asset | included for `GERASIMOV` | 이번 관계 보강에서 이미지 필드를 건드리지 않는다. |

## Personality Evidence Ledger

- not-applicable: 공개 여부·초상·신원·관계·보고서 역링크만 변경한다. 기존 성격 서술과 불변 관찰 ID는 모두 보존하며 `PUTIN`은 직접 발언·행동 근거가 없어 최초 관찰 배열을 빈 값으로 생성한다.

## Atomic Apply Scope

- `StarGateV2/scripts/seed-payloads/public-personnel-release-2026-08-12.json` 1개 파일의 7개 envelope를 한 transaction으로 실행한다.
- 순서는 `PUTIN` 생성 → `IRMA_KOCH` 공개 → `DOCTOR_ZENO` 공개·미상 초상 → `WHITE_ROSE_R` 미상 초상 → `GERASIMOV` 역관계 → S1E5 `PUTIN` 보고서 링크 → S1E6 `IRMA_KOCH`·`DOCTOR_ZENO` 보고서 링크다.
- `PUTIN`은 최초 `personalityObservations: []`를 포함하는 create-only 경로라 live에 같은 codename이 생기면 덮어쓰지 않고 전체 transaction을 중단한다.
- 기존 네 Dossier update는 소속·등급·공개·현재 초상 조건을 CAS filter로 확인한다. `GERASIMOV` 관계는 기존 `PUTIN` target 관계가 하나라도 있으면 fail-closed하며, 정확한 새 관계와 보고서 배열은 postcondition으로 재실행 멱등성을 검증한다. 두 보고서는 각각 legacy `minRole` 미저장과 명시적 `U`를 filter·postcondition에 고정해 공개 경계의 동시 변경도 차단한다.

## Explicit Non-mutations

- `IRMA_KOCH`, `DOCTOR_ZENO`, `WHITE_ROSE_R`, `GERASIMOV`의 기존 역할·소속·등급·성격·배경·세션 appearance·성격 관찰은 변경하지 않는다.
- `WHITE_ROSE_R`과 리처드의 동일인 여부는 미확정으로 유지한다.
- credits, inventory, shop stock, stocks, SAN, HP, 상태효과, notifications, factions, institutions, wiki 본문과 보고서 본문은 변경하지 않는다.

## Live Operation Gate

- live 실행 전 정적 자산과 payload를 동일 커밋으로 보존하고, 공용 초상 URL을 확인한 뒤 fresh DB dry-run으로 `PUTIN` insert 1건과 기존 대상 update 6건을 다시 확인한다.
- 실행 시 domain write 7건은 하나의 transaction으로 원자 적용되지만, runner의 `lore_sources` upsert와 `lore_ingestion_runs` 실행 감사 레코드는 domain transaction 바깥에서 생성·갱신된다. 보고서 update는 같은 provenance source ID를 두 report의 `provenanceSourceIds`에 add-only로 기록하며, 참조 무결성 잠금이 두 보고서가 가리키는 기존 공개 wiki·personnel·catalog target의 `__sessionReportReferenceLockAt`을 갱신한다.
- exact 승인 범위: `IRMA_KOCH isPublic false→true`, `DOCTOR_ZENO isPublic false→true + 이미지 2필드`, `WHITE_ROSE_R 이미지 2필드`, 공개 `PUTIN` 신규 1건, `GERASIMOV→PUTIN` 관계 1건, 두 보고서의 related personnel 3개 링크, 그리고 위 provenance/audit 부수 효과다.

## Verification Status

- spec adapter: 4개 대상 spec의 `parseFrontmatter → npcFrontmatterSchema → toDbNpc → npcDocSchema` 통과.
- live dry-run: 7 plans, blocked 0, failed 0; `PUTIN` 예상 insert, 나머지 6개 예상 update.
- critical risk review: GERASIMOV 관계의 전 필드 exact postcondition과 두 report의 공개 `minRole` CAS를 보강한 최신본이 `PASS` 판정을 받았다.
- production asset: commit `95846de7` 배포 뒤 `https://www.ordonet.co.kr/assets/npcs/Unknown-Person-profile.webp?rev=95846de7`가 `200`, `image/webp`, 164,904 bytes, 1084×1451, SHA-256 `4a6a926cb1dbeaccc7815709a09a23bafd65842782012434391c0cf2b97cd033`으로 저장소 원본과 exact 일치했다.
- live execute: run `seed-payload:bd020f27-cdb1-41e5-bb5a-b9d1c55dfbc9`가 `succeeded`, `discovered/processed/written=7/7/7`, `blocked/failed=0/0`으로 완료됐다. provenance source는 `seed-payload:fc44731092ee24601e63db360219a4ff`, payload locator는 commit `570afa2f`다.
- independent DB re-read: `PUTIN`, `IRMA_KOCH`, `DOCTOR_ZENO`, `WHITE_ROSE_R`, `GERASIMOV` 모두 공개 상태와 소속·등급·초상이 목표값에 일치했다. 이르마·제노·R·게라쉬모프의 기존 관계·appearance·성격 관찰 수는 보존됐고, 게라쉬모프의 `PUTIN` 관계 1건은 전 필드 exact 일치했다. S1E5의 legacy U 기본값과 S1E6의 명시적 `U`를 보존하면서 세 인물 링크와 provenance source ID가 추가됐으며, 참조 target lock도 확인했다.
- authenticated ERP browser: 러시아 정부 조직도에서 생존 `PUTIN` 1명과 사망 기록 `GERASIMOV` 1명을 확인했다. `PUTIN`, `DOCTOR_ZENO`, `WHITE_ROSE_R`은 새 공용 미상 초상을, `IRMA_KOCH`는 기존 실초상을 정상 렌더했고 broken image는 0이었다. PUTIN↔GERASIMOV 관계와 S1E5의 PUTIN 링크, S1E6의 IRMA_KOCH·DOCTOR_ZENO 링크가 정규 Dossier href로 노출됐다. 앱 자체 warning/error는 없었고 브라우저의 Immersive Translate 확장 오류만 관찰됐다.

## Remaining Decisions

- `WHITE_ROSE_R`과 S1E6의 `“총장 보좌관” 리처드` 동일인 여부는 직접 근거 또는 사용자 결정 전까지 별도 후보로 유지한다.
- 세 인물의 실제 초상이 후속 제공되면 공용 미상 초상을 개별 초상으로 교체한다.
