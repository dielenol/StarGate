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
| 그리고리 페초린 대령 | p.18-p.22, p.61-p.70 | NPC spec + Dossier | 수호대 통솔, 비밀 유지시설 공개, 블랙 피라미드 보고·아들 구조 요청 기록 | Applied + schema verified |
| 로드리온 로마노비치 라스콜니코프 | p.32-p.60, p.77, p.101-p.109 | NPC spec + Dossier | 섹터 C 감독관, 심부 굴착 생존자, 변이, 숙청·격리 통제, 사보타주 대응 기록 | Applied + schema verified |
| 바자로프 교수 | p.76-p.79, p.101-p.108 | NPC spec + Dossier | 섹터 C 수석 연구원, 발레리아 해방·복귀, 비상 대응 기록 | Applied + schema verified |
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
| 그리고리 페초린 | `PECHORIN` | 신규 NPC Dossier | Applied + schema verified |
| 로드리온 라스콜니코프 | `RODION` | 신규 NPC Dossier | Applied + schema verified |
| 바자로프 교수 | `BAZAROV` | 신규 NPC Dossier | Applied + schema verified |

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

## Asset Disposition

| asset role | source page | action | status |
|---|---|---|---|
| report visual | p.61 섹터 C 지도 | 보고서/위키 mirror에만 사용 | Applied + browser verified |
| report/wiki place visual | p.62 최고 격리구역, p.66 냉동 감염자 | 섹터 C와 보고서에 사용 | Applied + browser verified |
| entity visual | p.74 곰사냥 갑옷 | 정확한 개체 도판으로 wiki asset 등록 | Applied + browser verified |
| entity visual | p.90 발레리나 | 정확한 개체 도판으로 wiki asset 등록 | Applied + browser verified |
| entity visual | p.99 웬디고 | 정확한 개체 도판으로 wiki asset 등록 | Applied + browser verified |
| report cutscene | p.32 로드리온, p.76-p.78 발레리아/바자로프 | 독립 인물 초상이 아니므로 Dossier 이미지로 사용 안 함 | skipped |

## ERP Gap Map

| target | status | issue | action |
|---|---|---|---|
| `/erp/sessions/report` | verified | 05 보고서·추정 지도 포인트·20명 참가자·6개 본문 자산 등록 | 목록, 지도, 상세 렌더와 참가자 링크 확인 |
| `/erp/wiki` | verified | 세션 mirror·섹터 C·3개 개체 문서 등록 | 상호 링크, 본문, 이미지 렌더 확인 |
| `/erp/personnel` | verified | 신규 NPC 3명과 기존 인물 17명의 세션 연결 등록 | schema, DB 재조회, 보고서 역링크 확인 |
| `/erp/wiki/catalog` | verified/partial | 냉기 방사기는 `SPECIAL`·비매품·보관 전용으로 등록, 임시 백신은 정체·장기 효능 미확정 | `cold-emitter`만 등록하고 임시 백신은 후보-only 유지 |
| `/erp/stock` | no-action | 기업 귀속·공시 없는 비공개 연구 성과 | `ART` watchlist만 기록 |
| relation graph | verified/partial | 확인된 인물 간 관계만 구조화 가능 | 신규 NPC 3개 관계와 기존 Dossier 11개 방향성 관계를 재조회; entity 관계는 wiki/report prose 유지 |
| 참가자 링크 resolver | verified | `loreTags`를 신원 별칭으로 사용해 `백진연`이 MARIA로 잘못 연결되고 `닥터 모스`가 미연결됨 | 주제 태그를 신원 키에서 제외하고 `Dr.`/`닥터` 접두 표기를 정규화; 회귀 테스트와 ERP 링크 재확인 |

## Candidate-only / Pre-existing Data Gaps

- `TIGER298`의 기존 `NOSB-MINI-5959-CONTAINMENT` 요약에는 `백진연`, `UNYEON`의 같은 세션 요약에는 `시유`가 들어 있는 상호 오염 후보가 보인다. 이번 원본과 직접 관련 없는 기존 데이터이므로 자동 교정하지 않았다.
- 루빈의 바부슈카와 페초린 가족의 동일인·가족관계, 보랏빛 물질과 기존 행동교정물질의 동일성, 사보타주 배후는 현 소스만으로 확정하지 않았다.
- 바자로프와 운연의 과거 관계는 호칭만 확인되므로 구조화 관계로 넣지 않았다.

## Actual Verification

- NPC spec 3건, catalog spec 1건, MANUS 병합 문서 1건, 세션 등장 17건, 관계 11건의 schema/payload 검증을 통과했다.
- 12개 본 payload dry-run과 critical risk review를 통과한 뒤 live DB에 적용했고, 오류 0건을 확인했다. 이어 기존 Dossier 17건을 별도 적용해 오류 0건을 확인했다.
- DB 재조회에서 보고서 1건, 관련 공개 위키 6건, 신규 NPC 3건, 기존 Dossier의 세션 등장 17건을 확인했다. 31개 고유 link target의 누락은 0건이다.
- `reportNumber=05`, 좌표 `[74.5, 21.3]`, `estimated`, 참가자 20명과 핵심 수치·결과를 재조회했다.
- 기존 광원화 바이러스 태그 `뒤집어진양말`, 기존 연계 `varginha-ordo-relay-base`, MANUS `createdAt`을 보존했음을 재조회했다.
- 공개 본문의 로컬 경로, parser/payload 표현, 대체문자, 원시 `[[...]]` 토큰 검사를 통과했다.
- `node --test lib/__tests__/lore-links.test.mjs` 3건, `pnpm typecheck`, `pnpm lint`를 통과했다.
- 인증된 ERP 브라우저에서 보고서 목록·지도·상세, 위키 3면, 카탈로그, 신규 NPC 3명과 AEGIS를 확인했다. 깨진 이미지와 콘솔 경고·오류는 0건이다.
