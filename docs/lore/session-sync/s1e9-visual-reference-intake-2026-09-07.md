# 9화 이미지 제작 자료 접수 — 2026-09-07

## 범위와 출처

- 작업 모드: `worldbuilding-library` / 이미지 제작 근거 데이터화.
- 현재 사용자의 7개 확정·지시와 첨부 이미지 5장을 우선 근거로 삼는다.
- 9화 시나리오는 제작용 미래 서사다. 완료 작전보고서, 사망 상태, 공적, 경제 변화로 적재하지 않는다.
- 이번 쓰기 범위: 저장소 이미지 원본·자료 목록·설계 후보·신원조회 명세·등록용 JSON. 운영 DB는 제한 조회와 dry-run만 수행한다.
- 신원조회 조회 대상: 웩슬러 부자, 송사리호 관련 인물, 백진연 가족. 자격증명과 DB 접속 주소는 보존하지 않는다.
- 공개 상태: 새 인물은 비공개 초안, 기존 인물의 공개 여부는 유지. 미공개 보스·원로·생물 레퍼런스는 `public/` 밖에 보존한다.

## Coverage Matrix

| 대상 | 확정 근거 | 저장할 곳 | 처리 상태 |
|---|---|---|---|
| 웩슬러 주니어 | 사용자: 현 미국 대통령이자 웩슬러의 아들; 첨부 1 | NPC spec·등록용 JSON·검수된 초상 | 신규 키 0건 확인, 투명 초상 검수 및 준비 완료 |
| 웩슬러의 부자 관계 | 사용자 확정이 과거 전 참모 표기보다 우선 | 기존 spec 정정·제작 데이터 양방향 관계 | spec의 참모 문구 정정. live 본문에는 해당 문구 없음. 운영 역관계는 공개 노출 때문에 등록 준비 JSON에서 제외 |
| 원로 한 명 | 사용자: 세션에 나온 원로; 첨부 2 | 원본·시각 특징·변형 기준 | 익명 집단 구성원으로 보존; 임의 개별 NPC 생성 안 함 |
| 마가렛 접속 장치 | 시나리오 기능 구분과 사용자 레퍼런스 조사 지시 | 공식 출처 링크·장치별 시각 설계 후보 | 조사 중; 신규 설계는 `design-proposal` |
| 마가렛 보스 | 사용자: 첨부 3이 보스 외형 | 전투 상태 전용 참조 | 기본 신원조회 초상과 구분 |
| 몬탁 개조 생물 2형 | 사용자: 첨부 4·5가 몬탁 개조 생물 | 형태별 독립 참조·프로젝트 연결 | 개체 번호와 종명은 발명하지 않음 |
| 백진연 가족 | 사용자: 화양연화에 나온 인물들이 맞음 | 기존 가족·그림 연결표 | 백진욱·최선영·백민희 이름 확인, 개별 얼굴 대응 후보 보존 |
| 송사리호 인물 | 사용자: 2화 인물, 신원조회 확인 지시 | 기존 신원조회 연결표 | JANE_FISH·JOHN_OPUS·WATER_FIST_RACKY 기존 3명·초상 연결 |

## Session Coverage Identity

- not-applicable: 미진행 9화의 이미지 제작 자료 접수이며 새 session_reports 레코드를 만들지 않는다.

## NPC Approval Ledger

| codename | 신원조회 실명 | 별칭 | 직함/역할 | 식별자 근거 | 정규 소속 | 파견/겸임 | 권한등급 | Dossier 초상 | 공개 여부 | 인적 정보 | 서술/관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WEXLER_JUNIOR | 웩슬러 주니어 — 사용자 확정, 전체 개인명 미상 | 별도 별칭 없음 — 제공 이름을 그대로 사용 | 미합중국 대통령 — 사용자 확정 | 이름을 정규화한 기술 식별자; live exact 0건 확인 | MILITARY / USA — 외부 미국 정치인 분류 | 없음 — 근거 없음으로 생략 | 없음(외부 인물; agentLevel 미저장) | 첨부 1 → Wexler-Junior-profile.webp; 실제 투명 픽셀·4배경 검수 통과 | false — 비공개 초안. 초상은 public 밖에 준비; 공개 경로 발행 전 운영 적용하지 않음 | 남성 — 아들 관계 근거. 나이·키·체중 미상 — 사용자 미제공 | WEXLER의 아들; 장래 작전 결과는 적재하지 않음 | ready-for-apply |
| WEXLER | 캘빈 R. 웩슬러 — 기존 spec·live 일치 | 기존 별칭 유지 — 신원 변경 없음 | 미국 부통령 유지 — 아들의 대통령 신원 확정은 본인의 직책을 바꾸지 않음 | 기존 canonical key 보존; live exact 1건 | MILITARY / USA — 기존 값 유지 | 기존 값 보존 | 없음(외부 인물; agentLevel 미저장) — 직책·내부 권한 범위 변화 없음 | 기존 Calvin-R-Wexler-profile.webp 유지 | true — 기존 공개 여부 유지. 주니어 이름 노출을 막기 위해 운영 역관계는 수정 대상에서 제외 | 기존 남성·76세·188cm·체중 미상 유지 | spec·제작 데이터에 아들 웩슬러 주니어 연결; live 역관계는 비공개 대상 원문 노출로 제외 | ready-for-apply |

`ready-for-apply`는 저장소 명세·근거·초상 준비 상태이며 운영 저장 승인이나 저장 완료를 뜻하지 않는다. 웩슬러 주니어의 `agentLevel`은 외부 인물이므로 생략한다. 기존 웩슬러의 직책·등급은 바뀌지 않는다. 전체 개인명·나이·키·체중의 미상 값은 이미지 제작을 막는 필수 입력이 아니다.

## Visual Asset Ledger

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `docs/lore/visual-reference/s1e9/wexler-junior-portrait.png` | 사용자 첨부 1 | 832×1216 | no — 제공된 초상 프레임 전체 보존 | personnel-image | excluded: 제작 자료 접수이며 보고서 변경 없음 | excluded: 보고서 위키 변경 없음 | excluded: 전용 위키 없음 | not-applicable | included: 정확한 초상의 투명 WebP를 로컬 준비, 운영 연결 미실행 | 사용자 확정 대통령 초상; 원본 보존 |
| `docs/lore/visual-reference/s1e9/black-pyramid-elder-portrait.png` | 사용자 첨부 2 | 550×804 | no — 제공된 프레임 전체 보존 | entity-archive | candidate-only: 미래 컷신 identity 근거 | excluded: 보고서 위키 변경 없음 | candidate-only: 개체 신원 미상 | not-applicable | excluded: 개인 식별과 내부 권한 미정, 독립 NPC 생성 안 함 | 원로 한 명; 집단 변형의 시각 기준 |
| `docs/lore/visual-reference/s1e9/margaret-boss-appearance.png` | 사용자 첨부 3 | 1672×941 | no — 제공된 프레임 전체 보존 | report-cutscene | candidate-only: 미래 보스 컷의 상태 기준 | excluded: 보고서 위키 변경 없음 | excluded: 일반 마가렛 이미지 교체 아님 | not-applicable | excluded: 기본 초상 대신 보스 상태를 넣지 않음 | 사용자 확정 보스 외형 |
| `docs/lore/visual-reference/s1e9/montauk-crustacean-appearance.png` | 사용자 첨부 4 | 832×1216 | no — 제공된 프레임 전체 보존 | entity-archive | candidate-only: 미래 몬탁 전력 컷 | excluded: 보고서 위키 변경 없음 | candidate-only: 형태만 확정, 번호 미확정 | excluded: 개체 도판을 판매 물품으로 등록하지 않음 | not-applicable | 몬탁 개조 생물의 갑각류형; 기술 번호를 발명하지 않음 |
| `docs/lore/visual-reference/s1e9/montauk-quadruped-appearance.png` | 사용자 첨부 5 | 832×1216 | no — 제공된 프레임 전체 보존 | entity-archive | candidate-only: 미래 몬탁 전력 컷 | excluded: 보고서 위키 변경 없음 | candidate-only: 형태만 확정, 번호 미확정 | excluded: 개체 도판을 판매 물품으로 등록하지 않음 | not-applicable | 몬탁 개조 생물의 사족수형; 다른 도살견 이미지와 동일 개체로 단정하지 않음 |

| `StarGateV2/public/assets/npcs/Calvin-R-Wexler-profile.webp` | 기존 저장소: 캘빈 R. 웩슬러 초상 | 1058×1487 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | personnel-image | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | not-applicable: 기존 연결 유지; 이번에는 제작 참조만 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/peoples/Pinch-main-image.webp` | 기존 저장소: 피펫 / 휘트모어 핀치 | 896×1200 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | personnel-image | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | not-applicable: 기존 연결 유지; 이번에는 제작 참조만 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/peoples/InDexer-main-image.webp` | 기존 저장소: 해쉬 / 해쉬테거 | 876×1274 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | personnel-image | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | not-applicable: 기존 연결 유지; 이번에는 제작 참조만 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/peoples/Margaret-main-image.webp` | 기존 저장소: 마가렛 기본 외형 | 875×1257 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | personnel-image | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | not-applicable: 기존 연결 유지; 이번에는 제작 참조만 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/peoples/Unyeon-main-image.webp` | 기존 저장소: 운연 현재 외형 | 868×1266 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | personnel-image | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | not-applicable: 기존 연결 유지; 이번에는 제작 참조만 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/peoples/Maria-main-image.webp` | 기존 저장소: 마리아 기본 외형 | 955×1280 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | personnel-image | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | not-applicable: 기존 연결 유지; 이번에는 제작 참조만 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/npcs/Jane-Fish-profile.webp` | 기존 저장소: 제인 피쉬 | 870×1252 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | personnel-image | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | not-applicable: 기존 연결 유지; 이번에는 제작 참조만 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/npcs/John-Opus-profile.webp` | 기존 저장소: 존 오푸스 | 1400×781 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | personnel-image | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | not-applicable: 기존 연결 유지; 이번에는 제작 참조만 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/npcs/Water-Fist-Racky-profile.webp` | 기존 저장소: “물주먹” 래키 | 394×572 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | personnel-image | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | not-applicable: 기존 연결 유지; 이번에는 제작 참조만 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/npcs/Connor-O-Callahan-profile.webp` | 기존 저장소: 코너 오 캘러핸 | 1024×1365 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | personnel-image | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | not-applicable: 기존 연결 유지; 이번에는 제작 참조만 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/npcs/Sven-Troelbein-profile.webp` | 기존 저장소: 스벤 트로엘베인 | 1024×1365 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | personnel-image | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | not-applicable: 기존 연결 유지; 이번에는 제작 참조만 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/npcs/Casey-Racer-Valkyrie-profile.webp` | 기존 저장소: 케이시 레이서 | 832×1216 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | personnel-image | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | not-applicable: 기존 연결 유지; 이번에는 제작 참조만 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/npcs/ORSIS-201-DonaDona-profile.webp` | 기존 저장소: 도나다나 | 832×1216 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | personnel-image | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | not-applicable: 기존 연결 유지; 이번에는 제작 참조만 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/npcs/David-O-Callahan-Sandman-profile.webp` | 기존 저장소: 데이빗 / 샌드맨 | 832×1216 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | personnel-image | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | not-applicable: 기존 연결 유지; 이번에는 제작 참조만 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/session-reports/s1e7-desire-part1/black-pyramid-present-day.webp` | 기존 저장소: 블랙 피라미드 기존 회랑 | 1035×503 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | report-cutscene | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | excluded: 장면 그림을 개인 초상으로 승격하지 않음 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/session-reports/s1e6-turning-point-part2/hyperborean-14-chamber.webp` | 기존 저장소: 하이퍼보리아인 14 챔버 | 1035×503 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | report-cutscene | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | excluded: 장면 그림을 개인 초상으로 승격하지 않음 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/session-reports/romantid/hash-margaret-memory.webp` | 기존 저장소: 해쉬와 마가렛의 붉은 실 기억 | 974×544 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | report-cutscene | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | excluded: 장면 그림을 개인 초상으로 승격하지 않음 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/session-reports/s1e6-turning-point-part2/margaret-white-isolation-visit.webp` | 기존 저장소: 기존 유리창 면회 장면 | 1035×503 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | report-cutscene | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | excluded: 장면 그림을 개인 초상으로 승격하지 않음 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/session-reports/s1e6-turning-point-part2/montag-98-attacks-kimlee.webp` | 기존 저장소: 기존 몬탁 98 공격 장면 | 1035×503 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | report-cutscene | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | excluded: 장면 그림을 개인 초상으로 승격하지 않음 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/wiki/places/song-sari-ho.webp` | 기존 저장소: 송사리호 과거 선체 | 1266×857 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | report-cutscene | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | excluded: 장면 그림을 개인 초상으로 승격하지 않음 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/session-reports/new-dublin/neon-valkyrie-bar.webp` | 기존 저장소: 뉴 더블린 네온 발키리 바 | 1216×832 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | report-cutscene | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | excluded: 장면 그림을 개인 초상으로 승격하지 않음 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/session-reports/hwayangyeonhwa/cut-020.webp` | 기존 저장소: 화양연화 기존 컷 20 | 1400×788 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | report-cutscene | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | excluded: 장면 그림을 개인 초상으로 승격하지 않음 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/session-reports/hwayangyeonhwa/cut-032.webp` | 기존 저장소: 화양연화 기존 컷 32 | 1400×1050 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | report-cutscene | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | excluded: 장면 그림을 개인 초상으로 승격하지 않음 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/session-reports/hwayangyeonhwa/cut-033.webp` | 기존 저장소: 화양연화 기존 컷 33 | 1400×1050 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | report-cutscene | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | excluded: 장면 그림을 개인 초상으로 승격하지 않음 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/session-reports/hwayangyeonhwa/cut-056.webp` | 기존 저장소: 화양연화 기존 컷 56 | 961×1400 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | report-cutscene | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | excluded: 장면 그림을 개인 초상으로 승격하지 않음 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/session-reports/hwayangyeonhwa/cut-069.webp` | 기존 저장소: 화양연화 기존 컷 69 | 1400×1050 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | report-cutscene | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | excluded: 장면 그림을 개인 초상으로 승격하지 않음 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/session-reports/hwayangyeonhwa/cut-070.webp` | 기존 저장소: 화양연화 기존 컷 70 | 1400×788 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | report-cutscene | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | excluded: 장면 그림을 개인 초상으로 승격하지 않음 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/session-reports/hwayangyeonhwa/cut-071.webp` | 기존 저장소: 화양연화 기존 컷 71 | 1346×941 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | report-cutscene | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | excluded: 장면 그림을 개인 초상으로 승격하지 않음 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/session-reports/hwayangyeonhwa/cut-072.webp` | 기존 저장소: 화양연화 기존 컷 72 | 1400×788 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | report-cutscene | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | excluded: 장면 그림을 개인 초상으로 승격하지 않음 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `StarGateV2/public/assets/session-reports/hwayangyeonhwa/cut-073.webp` | 기존 저장소: 화양연화 기존 컷 73 | 1234×941 | not-applicable — 새 추출 없음; 저장소 그림 전체 참조, 원 VTT 크롭 미확인 | report-cutscene | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | excluded: 장면 그림을 개인 초상으로 승격하지 않음 | 기존 정체·장소 참조; 현재 생존·새 개체 정체 추론 금지 |
| `docs/lore/visual-reference/s1e9/prepared-public/assets/npcs/Wexler-Junior-profile.webp` | 사용자 첨부 1의 검수된 파생본 | 832×1216 | no — 제공 초상의 전체 프레임·alpha 보존 | personnel-image | excluded: 기존 보고서 변경 없음 | excluded: 기존 보고서 위키 변경 없음 | excluded: 전용 위키 변경 없음 | not-applicable | included: 로컬 초상 준비; 운영 연결·배포 미실행 | 4배경 QA·실제 투명 픽셀 확인 |

## Personality Evidence Ledger

- not-applicable: 이번 입력은 신원·관계·시각 확정이다. 인물의 성격을 이미지 표정이나 새 대사로 만들어 넣지 않는다.

## 검증 기록

- NPC spec 2건: shared-db의 parseFrontmatter → toDbNpc → npcDocSchema 검증 통과.
- 등록 준비 JSON: seed runner 초기 기본 dry-run 2건 통과 뒤 공개 범위 리뷰에 따라 WEXLER 역관계를 제외했다. 최종 대상은 WEXLER_JUNIOR 1건 예상 insert이며 재검증 결과를 아래 기록한다. 운영 쓰기 0건.
- 초상: Toolbox review-only의 structural 검증 통과, warnings 0, 4배경 시각 QA 통과. 모델 추론·재누끼 없이 기존 alpha 보존. 발행 WebP 832×1216, 177550 bytes, 실제 투명 픽셀 확인.
- 자산 계약: node --test lib/assets/__tests__/asset-system.test.mjs — 18 tests passed.
- 최종 원장·연결 무결성·독립 리뷰는 아래 완료 기록에 이어 기록한다.
- 운영 DB 쓰기·배포·새 ERP 화면 표시 검증은 이번 저장소 준비와 구분한다.

## 운영 반영 준비와 제한

- 신규 주니어 등록은 `$setOnInsert`만 사용한다. 같은 키가 이미 생긴 경우 기존 값을 덮어쓰지 않고 후조건으로 확인한다.
- 웩슬러의 부자 관계는 spec·제작 데이터에만 보존한다. 공개 WEXLER의 역관계는 비공개 대상의 이름도 fallback으로 표시되는 현행 신원조회 때문에 실행 JSON에서 제외했다. 기존 live 관계·본문·공개 여부·등급·초상은 모두 쓰기 대상에서 제외한다.
- 최종 등록 준비 파일은 신규 비공개 WEXLER_JUNIOR 1건만 담는다. 초상은 public 밖의 prepared-public에 보관하고, 예상 publicPath만 명세에 남긴다. 실제 적용 전에는 정확한 운영 추가 승인과 초상 공개 범위·배포 또는 명시적 무이미지 선택을 해결해야 한다. 현재 이미지가 운영에 배포됐다고 주장하지 않는다. 적용 후 비공개 인물 접근 권한과 주니어→아버지 관계 표시를 실제 신원조회에서 확인한다.
- 보고서·위키·카탈로그를 변경하지 않았으므로 report/wiki visual parity·지도 배치·공적 검사는 not-applicable이다. 이를 통과 또는 운영 화면 확인 완료로 표시하지 않는다.
- 신규 이미지 경로의 인증된 ERP 렌더 검증은 아직 하지 않았다. 기존 운연은 .png → .webp 소비자 정규화와 최종 파일 존재를 확인했으며 잘못된 경로로 분류하지 않는다.
- 독립 읽기 조사: 웩슬러 중복, 송사리 3명, 가족 이름·얼굴 후보, 운연 이미지 소비자를 확인했다. 가족 신규 NPC 0건은 이름·시각 근거가 없다는 뜻이 아니다.

## 남은 자료

[제작 자료 README](../visual-reference/s1e9/README.md)의 남은 내용 표와 [구조화 데이터](../visual-reference/s1e9/reference-data.json)의 `remainingGaps`를 따른다. 고유 신원 미확정과 제작상 디자인 선택을 구분했다. 대통령 신상, 원로 개인명, 몬탁 개체 번호는 필수 자료가 아니다.

- 독립 리뷰 대응: 공개 폴더에 준비한 초상을 public 밖으로 이동, 공개 WEXLER 역관계를 실행 JSON에서 제거, 주니어 insert-only 후조건에 직함·소속·초상·신상 및 agentLevel/institution/lifeStatus 부재를 추가했다.

## 최종 완료 증거 — 저장소 자료화

- 최종 seed dry-run: `node --experimental-strip-types scripts/upsert-seed-payload.ts scripts/seed-payloads/s1e9-wexler-family-reference-intake.json` — exit 0, files=1 / payloads=1 / WEXLER_JUNIOR 예상 insert. 운영 쓰기 0.
- 최종 NPC 명세·등록값 일치: runner의 `normalizeSeedPayloadDates`를 적용한 후보에 `npcDocSchema` 통과. `toDbNpc` 결과와 핵심 필드·lore 일치, 부자 관계는 사용자 근거를 별도 추가.
- `check_lore_output.py`: NPC review/ready + 실제 등록 준비 JSON, visual ledger, personality 예외, 두 NPC public-text 검사 통과.
- 자료 무결성: 36개 이미지 해시·파일, 63개 컷 연속 번호 및 참조 ID, 15개 인물 연결, 5개 가족 얼굴 대응 행, 문서 내부 링크 모두 통과. 5개 가족 행의 개별 얼굴 후보 상태는 확정으로 승격하지 않음.
- 초상 QA: 기존 alpha를 유지한 832×1216 WebP. 실제 투명 픽셀·4배경 QA 통과. `node --test lib/assets/__tests__/asset-system.test.mjs`의 18개 검사 통과. 최종 파일은 웹 public 밖에 보관.
- `stargate_risk_reviewer` 재검토: 공개 초상·공개 역관계·부분적인 충돌 후조건의 3개 지적 수정 확인, 추가 actionable finding 없음.
- `git diff --check` 통과. 앱 코드·schema를 변경하지 않아 전체 앱 build/typecheck/lint는 실행하지 않았다.
- 미실행: 운영 DB 적용·자산 배포·신규 NPC의 인증된 브라우저 확인. 수동 확인 경로는 `/erp/personnel`에서 웩슬러 주니어 검색 → 인물 상세의 초상·아버지 관계와 비공개 접근 확인이다. 현재 목록에는 신규 인물이 아직 없어야 한다.
