---
title: NOSB-S1E5-EVIL-PART1 session sync coverage
category: session-sync
tags: [NOSB-S1E5-EVIL-PART1, S1E5, 악, sector-c, stargate-lore]
updated: 2026-07-15
source: stargate-lore
---

# NOSB-S1E5-EVIL-PART1 동기화 커버리지

이 문서는 공개 위키가 아니라 `stargate-lore` 동기화 감사를 위한 내부 기록이다. 현재 소스에서 확인된 사실, live ERP 반영 결과, 후보-only 항목과 경제·주식 비변경 경계를 분리한다.

## Source Profile

- 사용자 지정 분류: 정규 세션 5화 1부.
- 원본: `NOSB 5 (1).pdf`, 112쪽, 1,412개 기록(대화 1,362개·이벤트 50개).
- 원본 진행 표기: `2026-06-28 20:40` 시작, 자정 이후 `2026-06-29 00:38` 종료.
- 원본 문서 ID: `MAIN-MR0RBC6U-PHF2`.
- 원본 머리말의 `MAIN · 4부` 표기와 사용자 지정 `5화 1부`가 충돌한다. canon 우선순위에 따라 사용자 지시를 적용하고, 머리말 표기는 source metadata로만 보존한다.
- 로그 첫 기록과 종료 문구가 각각 `"악"`, `"악" 1부 종료`로 일치하므로 정식 화명은 `악`으로 확정한다.
- 대표 렌더 확인: 1·56·112쪽. 텍스트 추출 무결성: 빈 페이지 0, 대체문자 없음.

## Canonical Anchor

- Session ID: `NOSB-S1E5-EVIL-PART1`
- Report number: `05`
- Report title: `작전 보고서 S1E5: 악 1부`
- Wiki slug: `s1e5-evil-part1`
- 진행일: `2026-06-28`
- 작전지: 러시아 시베리아 노릴스크 / 루빈 마을 / 섹터 C
- 지도 좌표: 노릴스크의 실제 지리를 바탕으로 한 ERP 월드맵 추정치. 정밀 좌표가 아닌 `estimated`로 등록한다.

## Lorebook Coverage Matrix

| subject | source evidence | target surface | action | status |
|---|---|---|---|---|
| 5화 1부 전체 기록 | p.2-p.111, 사용자 분류 | `session_reports`, 작전 보고서 wiki mirror | 사건·결과·미해결 훅을 독립 보고서로 등록 | Applied + Verified |
| 루빈 마을 교수형 | p.3-p.5 | report/wiki | 민간인 교수형, 발바닥의 미네르바의 눈, 섹터 C의 경고 방식 기록 | Applied + Verified |
| 섹터 C | p.18-p.22, p.32-p.69, p.101-p.111 | `wiki_pages.sector-c` | 조직·시설·냉동 격리·사보타주 현황을 장소/시설 문서로 등록 | Applied + Verified |
| MANUS 찰리 섹터 역할 | p.63-p.68, p.107 + 기존 MANUS spec/DB | institution spec + `institutions.MANUS.subUnits` | 기존 잠입 임무 설명을 보존하면서 광원화 감염자 수용·극저온 격리 임무를 source-backed로 보강 | Applied + DB re-read |
| 그리고리 페초린 대령 | p.18-p.22, p.61-p.70 + 사용자 등급·초상 지정 | NPC spec + Dossier | 수호대 통솔 기록에 H등급과 제공 초상 반영 | durable updated · live apply pending |
| 로드리온 로마노비치 라스콜니코프 | p.32-p.60, p.77, p.101-p.109 + 사용자 등급·초상 지정 | NPC spec + Dossier | 감독관 기록에 M등급과 제공 초상 반영 | durable updated · live apply pending |
| 바자로프 교수 | p.76-p.79, p.101-p.108 + 사용자 등급·소속·초상 지정 | NPC spec + Dossier | 연구 기구 정규 소속·섹터 C 파견, H등급과 제공 초상 반영 | durable updated · live apply pending |
| 발레리아 아젠트 / AEGIS | p.76-p.79, p.101-p.108 | existing Dossier | 로드리온의 강압적 격리, 바자로프의 해방, 유지시설 대응 합류 기록 | Applied + DB re-read |
| 광원화 임시 백신 | p.57-p.60, p.111 | `wiki_pages.aurora-virus`, report | 보랏빛 물질 투여 후 상처 회복, 감염력 `0.000000392`, 상태 해제, 5인분 예방제 확보 기록 | Applied + Verified |
| 광원화 냉동 감염자 | p.66-p.69, p.109-p.111 | `wiki_pages.aurora-virus`, `wiki_pages.sector-c` | 최소 수십만 명 생존 냉동, 냉기 적응, 무기 감염·전략적 사고 증언, 해동 개시 기록 | Applied + Verified |
| 냉기 방사기 | p.51-p.52 | catalog spec + `master_items.cold-emitter` | 명칭·개조 원형·출력 전환이 확인된 비판매 `SPECIAL` 카탈로그로 등록 | Applied + Verified |
| 곰사냥 갑옷 | p.73-p.79 | `wiki_pages.bear-hunting-armor` | 암흑에서 이동·살상하고 광원 아래 정지하는 개체 등록 | Applied + Verified |
| 발레리나 | p.89-p.96 | `wiki_pages.sector-c-ballerina` | 소리에 반응해 음원으로 이동·절단 공격하고 무음 상태에서 정지하는 개체 등록 | Applied + Verified |
| Зулу 103 웬디고 | p.97-p.111 | `wiki_pages.zulu-0103-wendigo` | 원문 번호를 보존하고 ERP 표기는 `ZULU-0103`으로 정규화; 포효의 실어증·화염 반응·냉동동굴 도주 기록 | Applied + Verified |
| 닥터 모스의 사후 경고 | p.70 | `DOCTOR_MOSS`, `MARGARET` Dossier | 마가렛의 관측 기록으로 분류해 `testimony` 관계와 세션 등장을 기록 | Applied + DB re-read |
| 확인된 참가자 | 전체 speaker set + live codename reconciliation | 17 existing Dossiers | `appearsInEvents`와 `sessionAppearances`를 멱등 반영 | Applied + DB re-read |
| 러시아 장군 | p.55-p.60 | report only | 푸틴이 파견한 국영화 압박 인물로 기록하되 이름 부재로 Dossier 생성 안 함 | Applied (report-only) |
| 루빈의 바부슈카와 페초린 가족 | p.4-p.16, p.62-p.69 | report hook | 동일인·가족관계는 확정하지 않고 구조 훅만 보존 | candidate-only |
| 보랏빛 물질의 정체 | p.57-p.60 | coverage + report/wiki | 임시 백신 효과는 확정, 기존 행동교정물질과의 동일성은 미확정 | 검토필요 |
| 사보타주 배후 | p.70-p.111 | report hook | 전력·보안 격리 파괴 사실만 확정, 범인·목적은 미확정 | 검토필요 |

## Dossier Event Link Pass

| source name | canonical target | action | status |
|---|---|---|---|
| 해쉬 테거 | `INDEXER` | 백신 시험·5인분 예방제 확보 | Applied + DB re-read |
| 스타크 일로니손 | `CLOWN` | 실어증 회복·비상 대응 선택 | Applied + DB re-read |
| 박애솔 / 빅보이 | `BIG BOY` | 즉결처형권 회수 저지·웬디고 화염 대응 | Applied + DB re-read |
| 츠키시로 쿠즈하 / 유회 | `YUHOE` | 섹터 간 권한 협상·유지시설 선택 | Applied + DB re-read |
| 휘트모어 핀치 | `PIPETTE` | 백신 시험 보조·발레리나 구역 탈출 | Applied + DB re-read |
| 키아나 오 캘러핸 / 네베드 | `네베드` | 광원화 상태 해제·발레리나 회피 지원 | Applied + DB re-read |
| 시유 / 타이거 | `TIGER298` | 광원화 상태 해제·발레리나 회피 지원 | Applied + DB re-read |
| 크로노스 | `TIME` | 곰사냥 갑옷의 공격 피해·회복 | Applied + DB re-read |
| 마가렛 | `MARGARET` | 모스의 사후 경고 관측·유지시설 진입 | Applied + DB re-read |
| 마리아 | `MARIA` | 백신 시험 확인·격리 인원 보호 | Applied + DB re-read |
| 이동식 | `LEE DONGSIK` | 유지시설 증거 저장·웬디고 추적 | Applied + DB re-read |
| 킴라박 리 | `KIMLEE` | 유지시설 기밀 확인·현장 대응 | Applied + DB re-read |
| 수잔 델라웨어 | `CLAIRVOYANCE` | 섹터 C 현장 등장 | Applied + DB re-read |
| 운연 | `UNYEON` | 스타크 실어증 해제·비상 대응 합류 | Applied + DB re-read |
| 우디 | `WD-(𝓃)` | 로드리온 음주 승부·냉기 방사기 획득 장면 | Applied + DB re-read |
| 발레리아 아젠트 | `AEGIS` | 격리 해제·유지시설 대응 합류 | Applied + DB re-read |
| 닥터 모스 | `DOCTOR_MOSS` | 마가렛의 관측 속 사후 경고 | Applied + DB re-read |
| 그리고리 페초린 | `PECHORIN` | H등급·초상 durable 반영 | live apply pending |
| 로드리온 라스콜니코프 | `RODION` | M등급·초상 durable 반영 | live apply pending |
| 바자로프 교수 | `BAZAROV` | H등급·연구 기구 소속·섹터 C 파견·초상 durable 반영 | live apply pending |

## NPC Approval Ledger

신규 NPC가 schema를 통과했다는 사실은 Dossier 필드가 승인됐다는 뜻이 아니다. 아래 원장은 실명·별칭·직함·조직·등급·초상·공개 상태와 서술을 NPC별로 모두 분리해 기록한다. `ready-for-apply`는 필드 결정이 끝났다는 뜻이며, live ERP mutation 승인이나 정적 자산 배포까지 끝났다는 뜻은 아니다.

| codename | 신원조회 실명 | 별칭 | 직함/역할 | 식별자 근거 | 정규 소속 | 파견/겸임 | 권한등급 | Dossier 초상 | 공개 여부 | 인적 정보 | 서술/관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `PECHORIN` | 그리고리 페초린 (PDF 자칭) | 없음 (`페초린 대령`은 직함으로 분리) | 섹터 C 전방 수호대 통솔 대령 | 기존 ERP 내부 키; 원문 코드네임 아님 | `NOVUS_ORDO / MANUS / SECTOR_C` | 없음 (정규 배치) | `H` (사용자 지정) | `/assets/npcs/Pechorin-profile.webp` (사용자 제공 exact portrait) | `true` (기존 live 상태 유지; 이번 교정 미변경) | 남성; 나이·신장·체중 미상 (로그에 수치 없음) | 세션 행동 기반 성격·배경; `RODION` 불신 관계 | ready-for-apply |
| `RODION` | 로드리온 로마노비치 라스콜니코프 (PDF 자기소개) | 로쟈 (본인이 제안한 명시적 별칭) | 섹터 C 감독관 / 심부 굴착 생존자 | 기존 ERP 내부 키; 원문 코드네임 아님 | `NOVUS_ORDO / MANUS / SECTOR_C` | 없음 (정규 배치) | `M` (사용자 지정) | `/assets/npcs/Rodion-profile.webp` (사용자 제공 exact portrait) | `true` (기존 live 상태 유지; 이번 교정 미변경) | 남성; 나이·신장·체중 미상 (로그에 수치 없음) | 세션 행동 기반 성격·배경; `AEGIS` 강압적 격리 관계 | ready-for-apply |
| `BAZAROV` | 바자로프 (PDF에서 확인된 범위; 풀네임 미상) | 없음 (`바자로프 교수`는 직함으로 분리) | 연구 기구 소속 / 섹터 C 파견 교수·수석 연구원 | 기존 ERP 내부 키; 원문 코드네임 아님 | `NOVUS_ORDO / SECRETARIAT / RESEARCH` | 섹터 C 파견 (사용자 지정) | `H` (사용자 지정) | `/assets/npcs/Bazarov-profile.webp` (사용자 제공 exact portrait) | `true` (기존 live 상태 유지; 이번 교정 미변경) | 남성; 나이·신장·체중 미상 (로그에 수치 없음) | 세션 행동 기반 성격·배경; `AEGIS` 격리 해제 관계 | ready-for-apply |

### NPC Decision Register

- `PECHORIN`과 `BAZAROV`의 `lore.nickname`은 비운다. `대령`과 `교수`는 `role`에만 보존한다.
- `RODION`의 신원조회 기본 이름은 전체 이름을 사용하고, `로쟈`는 `lore.nickname`에만 둔다.
- `PECHORIN`, `RODION`, `BAZAROV`는 이미 생성된 ERP 내부 식별자로 보존하며, 세계관상 코드네임이라고 서술하지 않는다.
- 세 NPC의 `isPublic: true`는 이미 공개된 live 상태를 보존하는 불변값이다. 이번 보정에서 새 공개 결정을 추정하거나 변경하지 않는다.
- 성격·배경·관계 요약은 확인된 세션 행동만 압축하며, 바자로프와 `UNYEON`의 불명확한 과거 관계처럼 근거가 부족한 내용은 계속 후보-only로 둔다.
- 필드 원장은 적용 준비 상태지만, live ERP 쓰기는 별도 실행 승인과 프로덕션 정적 자산 제공 시점 확인 전까지 보류한다.

## Relationship Narrative Candidates

| from | to | beat | confidence | persistence target | status |
|---|---|---|---|---|---|
| `RODION` | `AEGIS` | 명령 거부를 배신으로 규정하고 생존 선택을 강요한 뒤 격리 | confirmed | 양측 Dossier relation | Applied + DB re-read |
| `BAZAROV` | `AEGIS` | 정전 중 격리를 해제하고 갑주를 돌려주며 민간인 보호 임무에 복귀시킴 | confirmed | 양측 Dossier relation | Applied + DB re-read |
| `MARGARET` | `DOCTOR_MOSS` | 마가렛의 관측 속 모스가 유지시설에서 위험을 경고 | testimony | 양측 Dossier relation | Applied + DB re-read |
| `PECHORIN` | `RODION` | 냉동 감염자와 냉각 부하 증가를 숨긴다고 판단하고 외부 보고를 요청 | confirmed | `PECHORIN` Dossier relation | Applied + DB re-read |
| `CLOWN` | `UNYEON` | 운연의 접백연으로 스타크의 실어증을 해제 | confirmed | 양측 Dossier relation | Applied + DB re-read |
| `MARIA` | `네베드`, `TIGER298` | 임시 백신 시험과 격리에서 돌아온 두 사람을 보호하며 재회 | confirmed | 양방향 Dossier relation | Applied + DB re-read |
| `WD-(𝓃)` | `RODION` | 반복 음주 승부와 냉기 방사기 발견의 계기 | confirmed | `WD-(𝓃)` Dossier relation | Applied + DB re-read |
| `BAZAROV` | `UNYEON` | 서로를 아는 듯한 호칭이 있으나 관계의 시기·성격은 불명 | testimony | coverage only | candidate-only |

## Economy / Inventory / Stock Audit

| axis | sourced observation | current ERP evidence | mutation decision |
|---|---|---|---|
| 개인 인벤토리 | 우디가 화염방사기 개조품 `냉기 방사기`를 획득하고 냉기/화염 출력 전환 가능 | 기존 `basic-flamethrower`와 별개로 명칭·형태·효과가 확인되며, 정식 소유권·회수 여부는 미확정 | `cold-emitter` 비판매 카탈로그만 등록. inventory grant·shop stock 변경 안 함 |
| credits/rewards | 음주 승부의 보상으로 장비 장면이 있으나 크레딧 수치 없음 | 별도 세션 보상 승인 없음 | credit ledger 변경 안 함 |
| catalog sample | 임시 백신 5인분을 해쉬가 보유 | 정식 명칭·가격·판매/지급 조건·장기 효능 없음 | `master_items` 등록 안 함; source hook으로만 보존 |
| stock candidate | 광원화 임시 백신 성공은 `ART`(오로라텍) 업종과 관련 가능 | `ART` 현재 운영 가격은 137.73, 이벤트는 비공개 섹터 C 내부 기록 | watchlist/no-action. 가격·시계열·market-wire 변경 안 함 |

### ART Direction Judgment

- Ticker match: 업종 연관 후보는 `ART`가 가장 가깝다.
- Materiality: 백신 효과 자체는 중대하지만 기업 귀속, 계약, 특허, 생산·유통 권리와 공개 발표가 확인되지 않았다.
- Market visibility: 섹터 C 내부 비상 기록이며 공개 시장 사건이 아니다.
- Decision: `stock_prices`, `stock_price_history`, market-wire 모두 미변경. 후속 소스에서 오로라텍의 권리 또는 공개 발표가 확정될 때만 `gm-event-candidate`로 재검토한다.

### Post-write No-mutation Evidence

- 쓰기 전후 해시가 동일한 컬렉션: `credit_transactions`(631), `credit_balances`(19), `character_inventory`(42), `character_inventory_locks`(44), `shop_inventory`(0), `shop_daily_stock`(16), `stock_prices`(9), `stock_holdings`(10), `stock_price_history`(275).
- `ART` 운영 가격은 쓰기 전후 모두 `137.73`이다.
- 따라서 이번 패스는 보고서·위키·Dossier·기관 설명·비판매 카탈로그만 변경했고, 경제·인벤토리·상점 재고·주식에는 영속 변경을 만들지 않았다.

## Visual Asset Ledger

각 자산의 역할 판정은 소비처별로 독립적이다. `Dossier/personnel`에서 부적합한 컷신도 `report`와 `report wiki mirror`에서는 세션 장면으로 유효할 수 있다. `source-frame crop`은 PDF에 들어가기 전 VTT 프레임 자체가 이미 가로로 구성됐는지를 뜻하며, ERP가 추가로 잘랐다는 뜻이 아니다.

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `rodion-supervisor-welcome.webp` | p.32 감독관실 소개 장면 | 1035×503 | yes — PDF embedded VTT frame | report-cutscene | included (durable; live pending) | included (durable; live pending) | not-applicable | not-applicable | excluded: report cutscene, not portrait | Dossier 부적합 판정을 보고서 제외 사유로 잘못 확장했던 누락을 교정 |
| `sector-c-layout.webp` | p.61 섹터 C 구역 지도 | 1035×503 | yes — PDF embedded VTT frame | report-cutscene + place-archive | included (live; order repair pending) | included (live; order repair pending) | included (`sector-c`) | not-applicable | not-applicable | 장소 개요와 보고서 양쪽의 정확한 시설 도판 |
| `sector-c-high-containment.webp` | p.62 최고 격리구역 | 1035×503 | yes — PDF embedded VTT frame | report-cutscene + place-archive | included (live; order repair pending) | included (live; order repair pending) | included (`sector-c`) | not-applicable | not-applicable | 장소 개요와 보고서 양쪽의 정확한 시설 도판 |
| `sector-c-frozen-infected.webp` | p.66 냉동 광원화 감염자 | 1035×503 | yes — PDF embedded VTT frame | report-cutscene + place-archive | included (live; order repair pending) | included (live; order repair pending) | included (`sector-c`) | not-applicable | not-applicable | 장소 상태와 보고서 양쪽의 정확한 현장 도판 |
| `bear-hunting-armor.webp` | p.74 곰사냥 갑옷 | 1035×503 | yes — PDF embedded VTT frame | report-cutscene + entity-archive | included (live; order repair pending) | included (live; order repair pending) | included (`bear-hunting-armor`) | not-applicable | not-applicable | 해당 개체가 직접 보이는 세션 도판 |
| `valeria-isolation.webp` | p.76 발레리아 격리 장면 | 1035×503 | yes — PDF embedded VTT frame | report-cutscene | included (durable; live pending) | included (durable; live pending) | not-applicable | not-applicable | excluded: report cutscene, not portrait | 발레리아 격리 사건을 보여 주는 보고서 전용 컷신 |
| `bazarov-valeria-armor-restoration.webp` | p.78 바자로프의 갑주 반환 장면 | 1035×503 | yes — PDF embedded VTT frame | report-cutscene | included (durable; live pending) | included (durable; live pending) | not-applicable | not-applicable | excluded: report cutscene, not portrait | 바자로프의 격리 해제·복귀 조치를 보여 주는 보고서 전용 컷신 |
| `sector-c-ballerina.webp` | p.90 발레리나 | 1035×503 | yes — PDF embedded VTT frame | report-cutscene + entity-archive | included (live; order repair pending) | included (live; order repair pending) | included (`sector-c-ballerina`) | not-applicable | not-applicable | 해당 개체가 직접 보이는 세션 도판 |
| `zulu-0103-wendigo.webp` | p.99 웬디고 | 1035×503 | yes — PDF embedded VTT frame | report-cutscene + entity-archive | included (live; order repair pending) | included (live; order repair pending) | included (`zulu-0103-wendigo`) | not-applicable | not-applicable | 해당 개체가 직접 보이는 세션 도판 |
| `Pechorin-profile.webp` | 사용자 제공 페초린 초상 | 1086×1448 | no — user-provided full portrait | personnel-image | not-applicable | not-applicable | not-applicable | not-applicable | included (durable; live pending) | exact Dossier portrait; 보고서 컷신 역할과 분리 |
| `Rodion-profile.webp` | 사용자 제공 로드리온 초상 | 832×1216 | no — user-provided full portrait | personnel-image | not-applicable | not-applicable | not-applicable | not-applicable | included (durable; live pending) | exact Dossier portrait; `로쟈` 별칭과 실명 필드는 별도 |
| `Bazarov-profile.webp` | 사용자 제공 바자로프 초상 | 832×1216 | no — user-provided full portrait | personnel-image | not-applicable | not-applicable | not-applicable | not-applicable | included (durable; live pending) | exact Dossier portrait; 연구 기구 소속·섹터 C 파견 필드와 별도 |

## ERP Gap Map

| target | status | issue | action |
|---|---|---|---|
| `/erp/sessions/report` | partial | live 보고서는 6개 시각 자료만 포함하고 p.32·p.76·p.78 컷신이 빠져 있음; 9개 ordered set 교정 payload는 durable 준비 상태 | 전용 1건 payload를 live 적용한 뒤 9개 이미지의 natural/rendered 치수, `object-fit: contain`, blurred backdrop, 캡션을 재검증 |
| `/erp/wiki` | partial | 보고서 wiki mirror도 같은 3개 컷신이 빠져 있음; `sector-c` 3장과 개체 wiki 3장의 전용 소비처는 각각 유지 | mirror 전용 1건 payload를 live 적용해 보고서와 9개 경로·순서·캡션을 1:1 대조하고, 장소/개체 wiki는 별도 렌더 재검증 |
| `/erp/personnel` | partial | 세 NPC의 등급·초상·조직·실명/별칭 분리는 durable 반영됐지만 live DB 적용 전 | NPC 승인 원장 strict 검사, 교정 payload dry-run, risk review 뒤 별도 live 실행 승인 필요 |
| `/erp/wiki/catalog` | verified/partial | 냉기 방사기는 `SPECIAL`·비매품·보관 전용으로 등록, 임시 백신은 정체·장기 효능 미확정 | `cold-emitter`만 등록하고 임시 백신은 후보-only 유지 |
| `/erp/stock` | no-action | 기업 귀속·공시 없는 비공개 연구 성과 | `ART` watchlist만 기록 |
| relation graph | verified/partial | 확인된 인물 간 관계만 구조화 가능 | 신규 NPC 3개 관계와 기존 Dossier 11개 방향성 관계를 재조회; entity 관계는 wiki/report prose 유지 |
| 참가자 링크 resolver | verified | `loreTags`를 신원 별칭으로 사용해 `백진연`이 MARIA로 잘못 연결되고 `닥터 모스`가 미연결됨 | 주제 태그를 신원 키에서 제외하고 `Dr.`/`닥터` 접두 표기를 정규화; 회귀 테스트와 ERP 링크 재확인 |

## Candidate-only / Pre-existing Data Gaps

- `TIGER298`의 기존 `NOSB-MINI-5959-CONTAINMENT` 요약에는 `백진연`, `UNYEON`의 같은 세션 요약에는 `시유`가 들어 있는 상호 오염 후보가 보인다. 이번 원본과 직접 관련 없는 기존 데이터이므로 자동 교정하지 않았다.
- 루빈의 바부슈카와 페초린 가족의 동일인·가족관계, 보랏빛 물질과 기존 행동교정물질의 동일성, 사보타주 배후는 현 소스만으로 확정하지 않았다.
- 바자로프와 운연의 과거 관계는 호칭만 확인되므로 구조화 관계로 넣지 않았다.
- `PECHORIN`, `RODION`, `BAZAROV`는 ERP 내부 식별자일 뿐 원문 코드네임이 아니다. 기존 레코드 키를 바꾸면 링크가 깨질 수 있어 보존했다.
- 공개 여부는 이번 교정 대상이 아니며 기존 live 값 `true`를 그대로 보존한다. 이후 비공개 전환은 별도 명시적 변경으로만 처리한다.

## Actual Verification

- NPC spec 3건, catalog spec 1건, MANUS 병합 문서 1건, 세션 등장 17건, 관계 11건의 schema/payload 검증을 통과했다.
- 12개 본 payload dry-run과 critical risk review를 통과한 뒤 live DB에 적용했고, 오류 0건을 확인했다. 이어 기존 Dossier 17건을 별도 적용해 오류 0건을 확인했다.
- DB 재조회에서 보고서 1건, 관련 공개 위키 6건, 신규 NPC 3건, 기존 Dossier의 세션 등장 17건을 확인했다. 31개 고유 link target의 누락은 0건이다.
- `reportNumber=05`, 좌표 `[74.5, 21.3]`, `estimated`, 참가자 20명과 핵심 수치·결과를 재조회했다.
- 기존 광원화 바이러스 태그 `뒤집어진양말`, 기존 연계 `varginha-ordo-relay-base`, MANUS `createdAt`을 보존했음을 재조회했다.
- 공개 본문의 로컬 경로, parser/payload 표현, 대체문자, 원시 `[[...]]` 토큰 검사를 통과했다.
- `node --test lib/__tests__/lore-links.test.mjs` 3건, `pnpm typecheck`, `pnpm lint`를 통과했다.
- 기존 인증 브라우저 검사는 보고서·위키에서 깨진 이미지와 콘솔 오류가 0건인지만 기록했고, natural/rendered 치수·원본 비율·`object-fit`·blurred backdrop·캡션을 남기지 않았다. 따라서 이번 시각 자료 감사에서는 그 기록만으로 `browser verified`를 인정하지 않는다.
- NPC 승인 누락 교정 감사에서 live DB의 `PECHORIN`, `RODION`, `BAZAROV` 모두 `agentLevel` 필드가 없고 `previewImage`·`lore.mainImage`가 빈 값임을 재확인했다. 기존 화면의 `J`는 DB 값이 아니라 UI fallback이었다.
- PDF p.18의 `그리고리 페초린 대령`·`감독관 로드리온 로마노비치`, p.33의 전체 이름·`로쟈` 별칭 제안, p.82의 `바자로프, 수석 연구원`을 다시 대조했다.
- 교정 코드에 대해 `node --experimental-strip-types --test lib/__tests__/personnel-identity-display.test.mjs` 3건과 `node --test lib/__tests__/personnel-redaction.test.mjs` 20건, `pnpm typecheck`, `pnpm lint`를 통과했다.
- 인증된 ERP 브라우저에서 세 NPC 카드가 실명을 기본 이름으로, 기존 `nickname`을 별도 `ALIAS` 줄로 표시하고 `권한등급 : 미지정`을 유지함을 확인했다. 로드리온 Dossier 제목·실명 필드는 전체 이름, `ALIAS`·별칭 필드는 `로쟈`로 분리됐으며, 편집 폼의 누락 등급 기본값도 `미지정 · GM 확인 필요`였다. Dossier 초상 `<img>`는 생성되지 않았고 콘솔 경고·오류는 0건이다.
- 후속 사용자 제공 PNG 3장을 내용 변경 없이 WebP로 최적화했다. `Rodion-profile.webp`와 `Bazarov-profile.webp`는 832×1216, `Pechorin-profile.webp`는 1086×1448이며 세 파일 모두 alpha 범위 0–1을 유지한다.
- `@stargate/shared-db` 빌드 후 세 NPC spec을 `parseFrontmatter` → `parseMdBody` → `toDbNpc`로 검증했다. 등급, `institutionCode`/`department`, `previewImage`가 사용자 지정값과 일치하고 `PECHORIN`·`BAZAROV` 별칭은 unset, `RODION` 별칭은 `로쟈`, `lore.mainImage`는 빈 값으로 보존됐다. 바자로프 역할에는 `교수·수석 연구원` 직함을 분리 표기했다.
- 전용 교정 payload dry-run에서 `RODION`, `BAZAROV`, `PECHORIN` 기존 문서 3건만 `예상 update`로 확인됐다. live 재조회 기준 세 문서 모두 `agentLevel` 미지정·`previewImage` 빈 값이며, 바자로프는 아직 `MANUS / SECTOR_C`, 페초린·바자로프의 기존 `nickname`은 직함 호칭이다.
- NPC 승인 원장 구조·ready 검사와 전용 payload 대상 대조를 통과해 세 update 대상 모두 원장에 포함됐음을 확인했다. `stargate-lore` 회귀 테스트 19건과 `skill-creator` quick validation도 통과했다.
- 최신 critical risk review에서 payload 범위 자체의 blocker는 없었다. 다만 세 WebP가 아직 `origin/main` 배포본에 없으므로 프로덕션 자산 URL 3개의 `200 image/webp` 확인 전에는 live `previewImage` 적용을 차단한다. 이후에도 반드시 3건 전용 `nosb-s1e5-evil-part1-npc-approval.json`만 사용하고, 12건·5개 컬렉션 전체 sync payload는 이번 교정에 사용하지 않는다.
- 후속 변경에 대해 신원조회 테스트 23건, `pnpm typecheck`, `pnpm lint`, `git diff --check`를 통과했다.
- 로컬 서버에서 세 WebP URL이 모두 `200 image/webp`로 응답했다. 인증된 로드리온 Dossier 상세에서 풀네임과 `로쟈` 별칭이 분리되고 별칭 계산 글꼴 크기가 14px이며, live 적용 전이라 인물 초상은 아직 렌더되지 않음을 확인했다. 콘솔 경고·오류는 0건이다.
- 새 WebP를 포함한 로컬 브랜치는 `origin/main`보다 앞서 있어 배포본의 정적 자산 제공 여부는 아직 검증되지 않았다. asset 배포 전에 live DB의 `previewImage`부터 바꾸면 프로덕션 초상이 일시적으로 깨질 수 있으므로 실행 승인 시 이 부작용을 함께 확인한다.
- 이번 후속 교정에서도 live DB 값을 쓰지 않았다. 등급·초상·바자로프 소속/파견과 함께 `PECHORIN`·`BAZAROV` 직함을 `nickname`에서 제거하는 durable 결정을 마쳤고, `RODION`만 전체 실명과 `로쟈` 별칭을 분리 유지한다. 공개 여부는 기존 live 값 보존, 정규화 식별자는 기존 ERP 내부 키 보존으로 결정했으며 별도 live 실행 승인과 자산 배포를 기다린다.
- S1E4 프라토 1·2부의 현재 보고서 렌더를 비교 기준으로 재확인했다. 1035×503 가로 원본은 662×322, 사용자 제공 1024×1536 세로 원본은 298×446으로 원본 비율을 보존했고, 모두 `object-fit: contain`, `--wiki-render-image` blurred backdrop과 캡션이 적용됐다.
- S1E5의 9개 보고서 시각 자료는 PDF 내부의 실제 1035×503 JPEG+soft-mask 원본이다. 화면 캡처나 사후 임의 크롭이 아니지만, VTT 원본 프레임 자체가 1035×503 가로 구도라는 사실을 ledger에 분리 기록했다.
- p.32 로드리온, p.76 발레리아 격리, p.78 바자로프 갑주 반환 프레임을 alpha 보존 WebP 3장으로 추가했다. 세 파일은 모두 1035×503, alpha 범위 0–1이며 Dossier·catalog·전용 entity wiki에는 재사용하지 않는다.
- 전용 `zz-s1e5-evil-part1-report-wiki-visual-repair.json`은 `session_reports` 1건과 보고서 wiki mirror 1건만 대상으로 하며, 양쪽 모두 같은 9개 이미지 경로·순서·캡션을 가진다. live DB 적용과 S1E5 실제 렌더 치수 검증은 사용자에게 정확한 2건 mutation을 확인받기 전까지 보류한다.
- 시각 자료 원장, report/wiki parity, 타 소비처 판정 전파 차단까지 포함한 `stargate-lore` 회귀 테스트 25건과 `skill-creator` quick validation을 통과했다. 전용 payload는 upsert 없는 `filter + $set` 2건으로 제한했고, dry-run은 기존 `session_reports` `_id=6a57248f3f2831d09ed5ebf6`와 `wiki_pages` `_id=6a57248f3f2831d09ed5ebf7` 두 문서만 `예상 update`로 확인했다.
- clean worktree의 인증된 현재 live 보고서 렌더에서 기존 6장은 모두 원본 1035×503, 렌더 662×322, `object-fit: contain`, 동일 자산 blurred backdrop, 캡션 일치, broken 0으로 확인됐다. 즉 S1E4의 전역 렌더 보정은 S1E5에도 작동하며, 이번 결함은 CSS 크롭이 아니라 3개 컷신의 소스 판정 누락이다.
- 보고서 wiki mirror는 첫 시각 자료를 infobox로 승격하고 나머지를 본문에 렌더한다. 현재 6개 ordered set 가운데 지도는 Next Image infobox에서 `object-fit: contain`, 나머지 5장은 본문에서 1035×503 → 732×356, blurred backdrop·캡션·broken 0으로 확인됐다.
- 전용 위키 소비처도 별도 확인했다. `sector-c`는 지도 infobox와 최고 격리구역·냉동 감염자 본문 도판, `bear-hunting-armor`, `sector-c-ballerina`, `zulu-0103-wendigo`는 각각 전용 infobox 한 장을 사용하며 모두 `object-fit: contain`·broken 0이었다. 로컬 서버 재시작 이후 새 console warning/error는 0건이다.
