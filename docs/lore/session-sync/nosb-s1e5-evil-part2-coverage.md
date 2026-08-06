---
title: NOSB-S1E5-EVIL-PART2 session sync coverage
category: session-sync
tags: [NOSB-S1E5-EVIL-PART2, S1E5, 악, sector-c, stargate-lore]
updated: 2026-08-06
source: stargate-lore
---

# NOSB-S1E5-EVIL-PART2 동기화 커버리지

이 문서는 공개 위키가 아니라 `stargate-lore` 동기화 감사를 위한 내부 기록이다. 사용자 제공 보존본에서 확인한 사실, durable payload에 포함한 범위, live ERP 적용 전 검토 항목과 경제·인벤토리·주식 비변경 경계를 분리한다.

## Session Coverage Identity

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-S1E5-EVIL-PART2` | `scripts/seed-payloads/nosb-s1e5-evil-part2-sync.json` | available | partial |

## Source Profile

- 사용자 지정 분류: 정규 세션 5화 2부.
- 원본: `NOSB 5 part 2.pdf`, 113쪽, 1,485개 기록(대화 1,448개·장면 31개·시스템 6개).
- 진행 시각: `2026-07-12 20:34` 시작, 자정 이후 `2026-07-13 00:21` 종료.
- 원본 문서 ID: `MAIN-MRHYKZNG-78Y0`.
- SHA-256: `b9de10f69d8be778796b046278042f2351cb3b89ac4f0209af683fbcc1fe33f0`.
- 첫 기록의 `5부 "악" part 2`, 종료 문구의 `5부 "악" 종료`, 사용자 지정 `5화 2부`가 서로 일치한다.
- 텍스트 추출 무결성: 빈 페이지 0, 대체문자 0. 1035×503 장면 프레임 31개를 전수 판독했다.

## Canonical Anchor

- Session ID: `NOSB-S1E5-EVIL-PART2`
- Report number: `05.5`
- Report title: `작전 보고서 S1E5: 악 2부`
- Wiki slug: `s1e5-evil-part2`
- 진행일: `2026-07-12`
- 작전지: 러시아 시베리아 노릴스크 인근 섹터 C와 주변 마을
- 지도 좌표: 1부와 동일한 섹터 C 추정 좌표 `[74.5, 21.3]`, `estimated`
- 보고서 기록자: 1부의 L. Moreau와 구분해 기존 기록자 정체성인 `NOVUS ORDO 사무국 기록통제실 연구원 N. Voss`를 사용한다.
- 공개 기준: 신규 report mirror와 entity wiki 3건은 명시적 사용자·소스 공개 결정이 없어 `isPublic: false`인 비공개 초안으로만 준비한다. 공개 여부가 결정되기 전에는 네 wiki envelope 전체를 candidate-only로 취급하고 live apply하지 않는다. 기존 NPC의 공개 여부는 그대로 보존하며 신규 NPC에는 추정하지 않는다.

## Lorebook Coverage Matrix

| subject | source evidence | target surface | action | status |
|---|---|---|---|---|
| 5화 2부 전체 기록 | p.2-p.112 | `session_reports`, 작전 보고서 wiki mirror | 사건·결과·후속 훅과 동일 순서의 시각 자료 15장을 독립 보고서로 등록 | report durable-ready · wiki mirror visibility-blocked |
| 섹터 C 전면전과 냉각 복구 | p.2-p.30, p.76-p.83 | report, `wiki_pages.sector-c` | 해동 감염자 방어, 수동 냉각 장치, 페초린의 데드핸드 실행과 시설 안정화 기록 | durable-ready · live pending |
| 그리고리 페초린 | p.21-p.29, p.74-p.83 | NPC spec + existing Dossier | 동료 보호, 자결, 마가렛의 망자 조종을 통한 냉각 활성화, 사망 상태 반영 | durable-ready · live pending |
| 로드리온 라스콜니코프 | p.58-p.70, p.88-p.99 | NPC spec + existing Dossier | 게라쉬모프와의 충돌, 포로의 광원화 샘플화, 실각 투표와 오브에 의한 사망 반영 | durable-ready · live pending |
| 니콜라이 바자로프 | p.100, p.112 | NPC spec + existing Dossier | 레짐 체인지 프로토콜에 따른 섹터 C 감독관 취임과 후속 안정화 기록 | durable-ready · live pending |
| 러시아 장군 게라쉬모프 | p.58-p.60, p.92-p.97 | report only | 성과 역할·사망만 기록하고 전체 신원·등급 부재로 Dossier 생성 보류 | candidate-only |
| 화이트로즈 수장 R | p.61-p.65 | report, `wiki_pages.white-rose` | 자칭 수장, 로드리온·장군 동시 실각 제안과 인질 증언, 후속 레짐 체인지 연결을 증언/확인 사실로 분리 | durable-ready · Dossier candidate-only |
| 섹터 C 전기 오브 | p.14-p.19, p.71-p.99 | 신규 `wiki_pages.sector-c-electrical-orb` | 전자기기 추적, 전자 장비 무력화, 고열·전기 피해와 맘모스·로드리온 사망 연계 기록 | candidate-only · visibility-blocked |
| 스트리고이와 노스페라투 | p.34-p.56 | 신규 `wiki_pages.sector-c-strigoi` | 빛·은 반응, 노스페라투의 포커 통행 거래, 섹터 C 이탈 기록 | candidate-only · visibility-blocked |
| 맘모스 | p.70-p.88 | 신규 `wiki_pages.sector-c-mammoth` | 연구동 파괴, 오브 충돌과 사망을 정식 번호 미확정 개체 사건으로 등록 | candidate-only · visibility-blocked |
| 발레리나 | p.74-p.75 | `wiki_pages.sector-c-ballerina` | 맘모스가 무너뜨린 연구동 잔해에 매몰된 마지막 관측을 추가하되 사망은 단정하지 않음 | durable-ready · live pending |
| ZULU-0103 웬디고 | p.20-p.21, p.30-p.31, p.74-p.80, p.101-p.112 | `wiki_pages.zulu-0103-wendigo` | 절망 유발 괴성, 냉기, 화염 반응, 마을 도주와 `Мама` 발화를 추가 | durable-ready · live pending |
| 루빈 인근 마을 | p.101-p.112 | report, `wiki_pages.sector-c` | 현장팀의 동료 구조 우선 결정과 마을 한 곳 초토화 결과 기록 | durable-ready · live pending |
| 바부슈카와 웬디고의 관계 | p.111-p.112 | report hook | `Мама`, `내 아들` 발화는 보존하되 생물학적 가족관계는 확정하지 않음 | candidate-only |
| 광명회 사보타주 | p.68-p.69, p.112 | `wiki_pages.illuminati`, report | 나치 문양 금괴와 종료 시점 GM 확정을 근거로 섹터 C 사보타주 귀속을 확정 기록 | durable-ready · live pending |
| 데드핸드 프로젝트 | p.81-p.83 | report, PECHORIN·MARGARET Dossier | 명칭과 이번 실행만 보존하고 조직 전체 프로젝트 규격은 별도 문서로 확장하지 않음 | durable-ready · broader concept candidate-only |
| 확인된 Dossier 참가자 | 전체 speaker set + 기존 codename 대조 | existing Dossiers 21건 | `appearsInEvents`, `sessionAppearances`와 확인된 관계를 멱등 추가 | dry-run-ready · NPC apply gate blocked |

## Dossier Event Link Pass

| source name | canonical target | action | status |
|---|---|---|---|
| 해쉬 테거 | `INDEXER` | R 교신, 후계 대안 검증, 로드리온 인계 제안과 레짐 체인지 단말 연결 | durable-ready |
| 스타크 일로니손 | `CLOWN` | 스트리고이 조우와 마을 추격·동료 구조 논쟁 참여 | durable-ready |
| 박애솔 / 빅보이 | `BIG BOY` | 절망 상태의 킴라박 보호, 웬디고 냉기에 동결, 회복 | durable-ready |
| 츠키시로 쿠즈하 / 유회 | `YUHOE` | 노스페라투 포커와 철수 결정 논의 | durable-ready |
| 휘트모어 핀치 | `PIPETTE` | 붕괴 프로토콜 확인, 오브·맘모스 회피, 지도부 투표 | durable-ready |
| 키아나 오 캘러핸 / 네베드 | `네베드` | 연구동 탈출, 해쉬 구조, 지도부 투표 | durable-ready |
| 시유 / 타이거 | `TIGER298` | 연구동 그룹과 붕괴 대응 | durable-ready |
| 크로노스 | `TIME` | 은 도금으로 스트리고이 피해, 노스페라투 포커, 민간인 구조 주장 | durable-ready |
| 마가렛 | `MARGARET` | 모든 정신력을 소모해 페초린의 시체를 조종하고 비상 냉각 활성화 | durable-ready |
| 마리아 | `MARIA` | 사망자 기억 확인, 지도부 투표, 로드리온을 오브에 투척 | durable-ready |
| 이동식 | `LEE DONGSIK` | 킴라박 구조와 방패 엄호, 동료 회수 대상 | durable-ready |
| 킴라박 리 | `KIMLEE` | 병사 즉결처형 저지, 웬디고 절망 피해와 구조 | durable-ready |
| 수잔 델라웨어 | `CLAIRVOYANCE` | 대립 중재 후 킴라박·박애솔·마가렛 구조와 이동식 회수안 제시 | durable-ready |
| 백진연 / 운연 | `UNYEON` | 스트리고이 조우, 광역 회복, 철수 결정 수용 | durable-ready |
| 우디 | `WD-(𝓃)` | 스트리고이 조우와 동료 구조 철수 참여 | durable-ready |
| 발레리아 아젠트 | `AEGIS` | 빛으로 스트리고이 억제, 민간인 구조 주장, 철수 참여 | durable-ready |
| 오틸리아 발트만 | `OTILIA` | 오브 대응 제안, 맘모스 돌진에서 해쉬 구조, 게라쉬모프 처단 | durable-ready |
| 닥터 모스 | `DOCTOR_MOSS` | 마가렛 관측에서 데드핸드 프로젝트 명칭과 망자 조종 가능성 제시 | durable-ready |
| 그리고리 페초린 | `PECHORIN` | 유지시설 방어와 동료 보호, 자결로 냉각 복구 수단 제공, 사망 | durable-ready |
| 로드리온 라스콜니코프 | `RODION` | 사보타주 대응 실패, 포로 샘플화, 실각과 오브에 의한 사망 | durable-ready |
| 니콜라이 바자로프 | `BAZAROV` | 레짐 체인지 프로토콜로 섹터 C 감독관 취임 | durable-ready |

## NPC Approval Ledger

신규 NPC가 schema를 통과했다는 사실은 Dossier 필드가 승인됐다는 뜻이 아니다. 기존 세 NPC는 현재 spec의 승인값을 보존하면서 2부 상태만 갱신한다. 세 후보는 신원·등급·초상·공개 여부를 추정하지 않는다.

| codename | 신원조회 실명 | 별칭 | 직함/역할 | 식별자 근거 | 정규 소속 | 파견/겸임 | 권한등급 | Dossier 초상 | 공개 여부 | 인적 정보 | 서술/관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `PECHORIN` | 그리고리 페초린 | 없음(기록 없음) | 섹터 C 전방 수호대 통솔 대령 | 기존 ERP 내부 식별자와 1부 승인 원장 | `NOVUS_ORDO / MANUS / SECTOR_C` | 없음(정규 배치) | `H`(기존 승인값 유지) | `/assets/npcs/Pechorin-profile.webp`(기존 승인 초상 유지) | `true`(기존값 유지) | 남성; 나이·신장·체중 미상 | 마가렛에게 데드핸드 실행을 맡기고 자결해 비상 냉각을 가능하게 함; 사망 상태 추가 | ready-for-apply |
| `RODION` | 로드리온 로마노비치 라스콜니코프 | `грибы(버섯들)` | 전 섹터 C 감독관 / 심부 굴착 생존자 | 기존 ERP 내부 식별자와 1부 승인 원장 | `NOVUS_ORDO / MANUS / SECTOR_C` | 없음(정규 배치) | `M`(기존 승인값 유지) | `/assets/npcs/Rodion-profile.webp`(기존 승인 초상 유지) | `true`(기존값 유지) | 남성; 67세; 190cm; 체중 미상 | 실각 투표 뒤 마리아가 오브에 투척했고 화염·전기 피해로 사망 | ready-for-apply |
| `BAZAROV` | 니콜라이 바자로프 | `богослов(신학자)` | 섹터 C 연구원장 → 섹터 C 감독관 | 기존 ERP 내부 식별자와 1부 승인 원장 | `NOVUS_ORDO / MANUS / SECTOR_C` | 연구원장→감독관 직책 변경 | `H`(기존 승인값 유지) | `/assets/npcs/Bazarov-profile.webp`(기존 승인 초상 유지) | `true`(기존값 유지) | 남성; 나이 미상; 176cm; 체중 미상 | 레짐 체인지 프로토콜로 새 감독관이 되었고 섹터 C 사태가 후속 안정화됨 | ready-for-apply |
| `GERASIMOV_CANDIDATE` | 게라쉬모프(성만 확인; 전체 이름 미확인) | 없음(기록 없음) | 러시아 측 파견 장군 | 로드리온이 `게라쉬모프`로 호명 | 러시아 측 군부(세부 조직 미확인) | 섹터 C 국영화·지도부 교체 임무 | 미확인(ERP 등급 변환 근거 없음) | 없음(공식 초상 미제공) | 결정 보류(신원 미완) | 남성 표현; 기타 신상 미확인 | 오틸리아의 공격으로 사망; 보고서만 기록하고 Dossier 생성 보류 | blocked |
| `WHITE_ROSE_R_CANDIDATE` | R(실명 미확인) | 없음(기록 없음) | 화이트로즈 수장(자칭) | 통신에서 본인이 조직 수장 R이라고 발화 | `WHITE_ROSE` | 본부 긴급 통신망 개입 | 미확인(ERP 등급 변환 근거 없음) | 없음(공식 초상 미제공) | 결정 보류(신원 미완) | 성별·나이·신장·체중 미확인 | 지도부 동시 실각과 화이트로즈 인사 파견을 제안; 기관 문서만 갱신 | blocked |
| `RUBIN_BABUSHKA_CANDIDATE` | 미상(루빈 인근 마을의 바부슈카) | 없음(기록 없음) | 마을 주민 | 종료 장면의 `바부슈카` speaker label | 소속 없음(마을 주민) | 없음 | 미확인(비요원) | 없음(공식 초상 미제공) | 결정 보류(신원 미완) | 여성 노인으로 묘사; 기타 신상 미확인 | 웬디고에게 `내 아들`이라고 발화했으나 실제 가족관계는 미확정 | blocked |

### NPC Decision Register

- 기존 `PECHORIN`, `RODION`, `BAZAROV`의 등급·초상·공개 여부·소속은 1부 승인값을 그대로 보존한다.
- `PECHORIN`과 `RODION`의 사망은 GM 서술로 확정됐으므로 spec 및 기존 Dossier 상태 서술에 반영한다.
- `BAZAROV`의 감독관 취임은 레짐 체인지 방송과 종료 시점 GM 서술이 함께 뒷받침한다.
- `GERASIMOV_CANDIDATE`, `WHITE_ROSE_R_CANDIDATE`, `RUBIN_BABUSHKA_CANDIDATE`는 정식 신원·등급·초상·공개 여부가 없어 Dossier payload를 만들지 않는다.
- `R`의 2028년 전쟁 기획, 병력·주민의 우크라이나 파견과 가족 인질 주장은 발화자의 증언으로만 보존한다.

## Relationship Narrative Candidates

| from | to | beat | confidence | persistence target | status |
|---|---|---|---|---|---|
| `PECHORIN` | `MARGARET` | 자신의 사망 뒤 시체를 조종해 수동 냉각을 활성화하도록 임무를 맡김 | confirmed | 양측 Dossier relation | durable-ready |
| `MARGARET` | `PECHORIN` | 모든 정신력을 소모해 페초린의 시체를 조종하고 비상 냉각 장치를 활성화 | confirmed | 양측 Dossier relation | durable-ready |
| `MARIA` | `RODION` | 지도부 투표 뒤 제압된 로드리온을 오브에 던져 사망하게 함 | confirmed | `MARIA` Dossier relation | durable-ready |
| `INDEXER` | `WHITE_ROSE_R_CANDIDATE` | R의 지도부 교체안을 검토했으나 후계 적임자와 절차적 위험을 반복 질의 | testimony | coverage/report only | candidate-only |
| `OTILIA` | `GERASIMOV_CANDIDATE` | 지도부 투표 결과에 따라 게라쉬모프 장군을 처단 | confirmed | coverage/report only | candidate-only — target Dossier absent |
| `WENDIGO` | `RUBIN_BABUSHKA_CANDIDATE` | `Мама`와 `내 아들` 발화가 교환됨 | testimony | coverage/report only | candidate-only — 가족관계 미확정 |

## Personality Evidence Ledger

| observation id | codename | sessionId | trait | evidence kind | evidence | source label | confidence | persistence |
|---|---|---|---|---|---|---|---|---|
| `NOSB-S1E5-EVIL-PART2:PECHORIN:self-sacrifice` | `PECHORIN` | `NOSB-S1E5-EVIL-PART2` | 자기희생적 책임감 | action + dialogue | 웬디고에게서 마가렛과 킴라박을 보호했고, 죽은 몸으로 냉각 장치에 접근할 수 있도록 자결하며 `내가 도와주지`라고 말함 | 작전 보고서 S1E5: 악 2부 | confirmed | ready-for-apply |
| `NOSB-S1E5-EVIL-PART2:KIMLEE:anti-expendability` | `KIMLEE` | `NOSB-S1E5-EVIL-PART2` | 소모품화 거부 | action + dialogue | 자폭 임무를 맡은 병사를 유인해 구하고 페초린의 권총을 쏘아 즉결처형을 막은 뒤 `우리 식으로 처리하겠습니다`라고 말함 | 작전 보고서 S1E5: 악 2부 | confirmed | ready-for-apply |
| `NOSB-S1E5-EVIL-PART2:MARGARET:total-commitment` | `MARGARET` | `NOSB-S1E5-EVIL-PART2` | 극단적 임무 헌신 | action | 모든 정신력을 사용해 페초린의 시체를 조종하고 수동 냉각 장치를 활성화함 | 작전 보고서 S1E5: 악 2부 | confirmed | ready-for-apply |
| `NOSB-S1E5-EVIL-PART2:INDEXER:procedural-skepticism` | `INDEXER` | `NOSB-S1E5-EVIL-PART2` | 절차적 회의와 견제 | dialogue | R에게 교체 적임자와 실각의 선례를 반복 질의했고 제압된 로드리온은 본부 인계를 주장함 | 작전 보고서 S1E5: 악 2부 | confirmed | ready-for-apply |
| `NOSB-S1E5-EVIL-PART2:TIME:civilian-life-priority` | `TIME` | `NOSB-S1E5-EVIL-PART2` | 민간인 생명 우선 | dialogue | `누구도 죽어 마땅한 사람은 없습니다`, `한 사람이라도 더 희생을 막아야` 한다며 마을 추격을 주장함 | 작전 보고서 S1E5: 악 2부 | confirmed | ready-for-apply |
| `NOSB-S1E5-EVIL-PART2:CLAIRVOYANCE:pragmatic-mediation` | `CLAIRVOYANCE` | `NOSB-S1E5-EVIL-PART2` | 실용적 중재 | action + dialogue | 대립 중인 일행 사이에 개입해 철수, 세 동료 구조와 이동식 회수·상황 보고를 하나의 실행안으로 제시함 | 작전 보고서 S1E5: 악 2부 | confirmed | ready-for-apply |

## Worldbuilding and ERP Surface Decisions

| surface | decision | rationale | status |
|---|---|---|---|
| operation report | `05.5` 신규 보고서와 world-map pin 등록 | 독립 정규 세션이며 1부와 같은 좌표를 공유하므로 카드 오프셋을 분리해야 함 | durable-ready |
| report wiki mirror | 보고서와 동일한 15개 시각 자료 tuple을 비공개 초안에 사용 | report/wiki 시각 자료 순서·경로·alt·caption parity 계약; 공개 결정 전 live apply 금지 | candidate-only |
| `sector-c` | 기존 도판은 보존하고 텍스트만 2부 결과로 갱신 | 기존 concept/place page에 현재 컷신을 임의 삽입하지 않음 | durable-ready |
| `zulu-0103-wendigo` | 기존 도판 보존, 2부 행동·상태 텍스트 추가 | 기존 entity page의 시각 자산 확대는 별도 승인 필요 | durable-ready |
| `sector-c-ballerina` | 기존 도판 보존, 매몰 마지막 관측만 추가 | 사망 확정 근거 없음 | durable-ready |
| `white-rose` | 기존 페이지에 R 교신과 레짐 체인지 관여 기록 추가 | R의 조직 내 정체성은 자칭 증언으로 표시 | durable-ready |
| `illuminati` | 섹터 C 사보타주 귀속을 확정 사건으로 추가 | 종료 시점 GM 확정과 나치 문양 금괴가 동시 근거 | durable-ready |
| 신규 오브·스트리고이·맘모스 wiki | 각 개체의 관측과 최종 상태를 `isPublic: false` 초안으로 독립 문서화 | 반복 등장·고유 행동·결과는 충분하지만 공개 여부는 미승인; 맘모스 category는 번호 미확정이므로 `개체` | candidate-only |
| Dossier portrait | 모든 세션 컷신 재사용 금지 | 1035×503 report-cutscene은 인물 초상이 아님 | unchanged |

## Economy / Inventory / Stock Audit

| axis | sourced observation | ownership/market evidence | mutation decision |
|---|---|---|---|
| 나치 문양 금괴 | 전방 수호대가 포로에게서 금괴를 회수했고 광명회 식별 단서로 사용 | 플레이어 획득·보상·소유권·가격 없음 | report/wiki evidence only; catalog·inventory grant 없음 |
| credits/rewards | 작전 종료와 승리 선언 | 수치·지급 대상·승인 없음 | credit ledger 변경 없음 |
| equipment | 오틸리아 화보집, 현장 무기와 냉각 장비가 사용됨 | 신규 지급·영구 소유권 이전 없음 | master item·inventory·shop stock 변경 없음 |
| stocks | 섹터 C 지도부 교체와 내부 사보타주 | 상장사 귀속·공개 발표·가격 영향 근거 없음 | stock price·history·market-wire 변경 없음 |

### No-mutation Boundary

- 세 payload는 `session_reports`, `wiki_pages`, `characters`만 대상으로 준비한다.
- `credit_transactions`, `credit_balances`, `character_inventory`, `shop_inventory`, `shop_daily_stock`, `stock_prices`, `stock_holdings`, `stock_price_history`, `master_items`에는 envelope를 만들지 않는다.
- 나치 문양 금괴는 수사 증거이지 플레이어 보상이나 판매 카탈로그가 아니다.
- live DB에는 이번 패스에서 어떤 mutation도 실행하지 않는다. 실제 적용은 별도 승인 뒤 payload별 정확한 대상과 부수효과를 다시 제시해야 한다.

### Ordered Live Runbook (approval required)

1. 네 신규 wiki의 공개/비공개 결정과 `public/assets/session-reports/s1e5-sector-c-part2/`의 직접 URL 공개 결정을 payload·배포 범위에 반영한다. blocked NPC 후보를 해소하거나 payload target만 판정하는 공식 NPC apply-ready 계약을 마련한 뒤 모든 dry-run과 apply gate를 다시 실행한다.
2. `nosb-s1e5-evil-part2-sync.json`을 먼저 실행하고 report 1건, 기존 wiki 5건, 승인된 신규 wiki 4건을 DB에서 재조회한다. 하나라도 불일치하면 이후 파일을 실행하지 않는다.
3. `nosb-s1e5-evil-part2-dossiers.json`을 실행하고 21개 대상의 event/session appearance 및 확인된 relation을 재조회한다. 실패하면 personality 단계로 넘어가지 않는다.
4. `nosb-s1e5-evil-part2-personality.json`을 실행하고 immutable observation ID 6개를 재조회한다.
5. 신규 entity wiki 3건이 공개 승인되어 `isPublic: true`로 생성된 경우에만 `session_reports.relatedWikiSlugs`에 세 slug를 추가하는 별도 follow-up payload를 dry-run·실행한다. wiki mirror에는 해당 구조화 필드가 없으므로 typed body link와 신규 wiki의 report backlink만 검증한다.
6. direct seed는 열린 클라이언트 Query cache를 무효화하지 않으므로 새 브라우저 세션 또는 강제 새로고침으로 personnel/report/wiki를 확인한다. `05`/`05.5` 카드 분리, 이미지 15개 geometry, 상세 링크·역링크·통합 검색을 검증한다.

각 파일은 파일 내부에서만 원자적이며 파일 사이 자동 rollback은 없다. 중간 실패 시 이미 반영된 단계를 임의 보상 mutation으로 되돌리지 말고, DB 재조회로 마지막 성공 단계를 확정한 뒤 멱등 dry-run부터 재개한다.

## Visual Asset Ledger

각 자산은 report, mirror, 전용 wiki, catalog, Dossier 소비처를 독립 판정한다. `source-frame crop: yes`는 PDF에 들어가기 전 VTT 장면 프레임 자체가 1035×503 가로 구도라는 뜻이다.

15개 파일은 로컬 렌더·payload parity 검증을 위해 `public/assets/session-reports/s1e5-sector-c-part2/`에 준비했지만, 이 경로는 인증 없이 직접 조회될 수 있다. 로컬 커밋은 배포가 아니며, 이미지 공개 승인이 있기 전에는 이 커밋을 push/deploy하지 않는다. 비공개 유지 결정 시에는 인증된 asset delivery 경로를 먼저 구현하거나 배포 대상에서 제외해야 한다.

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `/assets/session-reports/s1e5-sector-c-part2/sector-c-front-guard-counterattack.webp` | p.2 섹터 C 전방 방어 | 1035×503 | yes — embedded VTT frame | report-cutscene | included (durable-ready) | included (durable-ready) | not-applicable | not-applicable | excluded: report cutscene, not portrait | 해동 감염자 전면전의 첫 장면 |
| `p006-front-guard-standard` | p.6 자폭 돌격 장면 | 1035×503 | yes — embedded VTT frame | report-cutscene | excluded: p.76 유사 수호대 도판과 중복 | excluded: report와 동일 제외 | not-applicable | not-applicable | excluded: report cutscene, not portrait | 반복 구도 축소 |
| `/assets/session-reports/s1e5-sector-c-part2/research-building-casualties.webp` | p.7 피와 시체로 가득한 연구동 | 1035×503 | yes — embedded VTT frame | report-cutscene | included (durable-ready) | included (durable-ready) | not-applicable | not-applicable | excluded: report cutscene, not portrait | 연구동 붕괴 프로토콜의 배경 |
| `p009-sector-c-layout-repeat` | p.9 시설 지도 | 1035×503 | yes — embedded VTT frame | report-cutscene + place-archive | excluded: 1부의 정식 섹터 C 지도와 중복 | excluded: report와 동일 제외 | excluded: existing-page image insertion not authorized | not-applicable | not-applicable | 기존 `sector-c-layout.webp`를 유지 |
| `/assets/session-reports/s1e5-sector-c-part2/electrical-orb-first-contact.webp` | p.14 전기 오브 첫 관측 | 1035×503 | yes — embedded VTT frame | report-cutscene + entity-archive | included (durable-ready) | included (durable-ready) | included (`sector-c-electrical-orb`) | not-applicable | excluded: entity scene, not portrait | 신규 개체의 대표 도판 |
| `/assets/session-reports/s1e5-sector-c-part2/wendigo-among-infected.webp` | p.20 감염자 사이 웬디고 | 1035×503 | yes — embedded VTT frame | report-cutscene | included (durable-ready) | included (durable-ready) | excluded: existing-page image insertion not authorized | not-applicable | excluded: entity scene, not portrait | 웬디고와 감염자 상호작용 장면 |
| `p028-research-corridor` | p.28 연구동 복도 | 1035×503 | yes — embedded VTT frame | report-cutscene | excluded: 사건 식별력이 낮은 전환 컷 | excluded: report와 동일 제외 | not-applicable | not-applicable | excluded: report cutscene, not portrait | 저정보 전환 프레임 |
| `p028-purple-laboratory` | p.28 보라색 연구실 | 1035×503 | yes — embedded VTT frame | report-cutscene | excluded: 인접 전환 컷과 중복 | excluded: report와 동일 제외 | not-applicable | not-applicable | excluded: report cutscene, not portrait | 페이지 경계 장면 |
| `p029-purple-laboratory-repeat` | p.29 보라색 연구실 반복 | 1035×503 | yes — embedded VTT frame | report-cutscene | excluded: p.28 페이지 경계 중복 | excluded: report와 동일 제외 | not-applicable | not-applicable | excluded: report cutscene, not portrait | 동일 장면의 페이지 분할 |
| `p030-manual-cooling-control` | p.30 수동 냉각 장치 소개 | 1035×503 | yes — embedded VTT frame | report-cutscene | excluded: p.83 실제 활성화 도판 우선 | excluded: report와 동일 제외 | not-applicable | not-applicable | excluded: report cutscene, not portrait | 같은 장치의 서사적 중복 |
| `p032-sector-c-exterior` | p.32 최고 격리구역 외부 | 1035×503 | yes — embedded VTT frame | report-cutscene + place-archive | excluded: 1부 최고 격리구역 도판과 중복 | excluded: report와 동일 제외 | excluded: existing-page image insertion not authorized | not-applicable | not-applicable | 기존 장소 도판 보존 |
| `/assets/session-reports/s1e5-sector-c-part2/aegis-strigoi-light.webp` | p.39 아젠트의 빛과 스트리고이 | 1035×503 | yes — embedded VTT frame | report-cutscene | included (durable-ready) | included (durable-ready) | excluded: group action, not neutral entity plate | not-applicable | excluded: report cutscene, not portrait | 빛 취약성의 직접 장면 |
| `/assets/session-reports/s1e5-sector-c-part2/nosferatu-poker.webp` | p.47 노스페라투 포커 제안 | 1035×503 | yes — embedded VTT frame | report-cutscene + entity-archive | included (durable-ready) | included (durable-ready) | included (`sector-c-strigoi`) | not-applicable | excluded: report cutscene, not portrait | 노스페라투와 포커 사건 대표 도판 |
| `p056-research-building-casualties-repeat` | p.56 피로 물든 연구동 반복 | 1035×503 | yes — embedded VTT frame | report-cutscene | excluded: p.7 도판과 중복 | excluded: report와 동일 제외 | not-applicable | not-applicable | excluded: report cutscene, not portrait | 반복 배경 제거 |
| `/assets/session-reports/s1e5-sector-c-part2/rodion-gerasimov-confrontation.webp` | p.58 로드리온과 게라쉬모프 대치 | 1035×503 | yes — embedded VTT frame | report-cutscene | included (durable-ready) | included (durable-ready) | not-applicable | not-applicable | excluded: multi-person scene, not portrait | 지도부 충돌의 직접 장면 |
| `/assets/session-reports/s1e5-sector-c-part2/white-rose-r-transmission.webp` | p.61 화이트로즈 R 교신 | 1035×503 | yes — embedded VTT frame | report-cutscene | included (durable-ready) | included (durable-ready) | excluded: existing-page image insertion not authorized | not-applicable | excluded: unapproved identity image, not portrait | R의 정식 초상으로 재사용 금지 |
| `p063-hostage-village-testimony` | p.63 마을 인질 증언 장면 | 1035×503 | yes — embedded VTT frame | report-cutscene | excluded: 증언 장면의 자극적 반복을 줄임 | excluded: report와 동일 제외 | excluded: existing-page image insertion not authorized | not-applicable | excluded: report cutscene, not portrait | R의 증언을 객관 사실처럼 보이게 할 위험 |
| `p065-research-group-transition` | p.65 연구 그룹 전환 | 1035×503 | yes — embedded VTT frame | report-cutscene | excluded: 사건 식별력이 낮은 전환 컷 | excluded: report와 동일 제외 | not-applicable | not-applicable | excluded: group scene, not portrait | 저정보 전환 프레임 |
| `/assets/session-reports/s1e5-sector-c-part2/mammoth-breakout.webp` | p.71 맘모스 연구동 돌파 | 1035×503 | yes — embedded VTT frame | report-cutscene + entity-archive | included (durable-ready) | included (durable-ready) | included (`sector-c-mammoth`) | not-applicable | excluded: entity scene, not portrait | 맘모스의 대표 전투 도판 |
| `p072-mammoth-closeup` | p.72 맘모스 근접 | 1035×503 | yes — embedded VTT frame | report-cutscene | excluded: p.71 대표 도판과 중복 | excluded: report와 동일 제외 | excluded: p.71 대표 도판 사용 | not-applicable | excluded: entity scene, not portrait | 반복 근접 컷 |
| `p073-mammoth-roar` | p.73 맘모스 포효 | 1035×503 | yes — embedded VTT frame | report-cutscene | excluded: p.71 대표 도판과 중복 | excluded: report와 동일 제외 | excluded: p.71 대표 도판 사용 | not-applicable | excluded: entity scene, not portrait | 반복 전투 컷 |
| `/assets/session-reports/s1e5-sector-c-part2/sector-c-last-stand.webp` | p.76 섹터 C 수호대 최후 방어 | 1035×503 | yes — embedded VTT frame | report-cutscene | included (durable-ready) | included (durable-ready) | not-applicable | not-applicable | excluded: report cutscene, not portrait | 페초린 개인 초상이 아닌 전투 상징 장면 |
| `/assets/session-reports/s1e5-sector-c-part2/big-boy-rescue.webp` | p.78 박애솔의 킴라박 보호 | 1035×503 | yes — embedded VTT frame | report-cutscene | included (durable-ready) | included (durable-ready) | not-applicable | not-applicable | excluded: report cutscene, not portrait | 동료 구조와 동결 사건 대표 장면 |
| `p080-wendigo-combat` | p.80 웬디고 전투 | 1035×503 | yes — embedded VTT frame | report-cutscene | excluded: 장면 내 비정식 표식으로 오인 위험 | excluded: report와 동일 제외 | excluded: existing-page image insertion not authorized | not-applicable | excluded: report cutscene, not portrait | 이미지의 외부 표식을 캐논 인물명으로 해석하지 않음 |
| `/assets/session-reports/s1e5-sector-c-part2/emergency-cooling-activation.webp` | p.83 비상 냉각 버튼 활성화 | 1035×503 | yes — embedded VTT frame | report-cutscene | included (durable-ready) | included (durable-ready) | not-applicable | not-applicable | excluded: object scene, not portrait | 데드핸드 결과의 직접 도판 |
| `/assets/session-reports/s1e5-sector-c-part2/pechorin-dead-hand.webp` | p.83 감염자 사이의 페초린 시체 | 1035×503 | yes — embedded VTT frame | report-cutscene | included (durable-ready) | included (durable-ready) | not-applicable | not-applicable | excluded: corpse cutscene, not approved portrait | 사망·망자 조종 상태를 보고서에서만 사용 |
| `p084-mammoth-repeat` | p.84 맘모스 근접 반복 | 1035×503 | yes — embedded VTT frame | report-cutscene | excluded: p.71 대표 도판과 중복 | excluded: report와 동일 제외 | excluded: p.71 대표 도판 사용 | not-applicable | excluded: entity scene, not portrait | 반복 장면 축소 |
| `p087-electrical-orb-repeat` | p.87 오브 재등장 | 1035×503 | yes — embedded VTT frame | report-cutscene | excluded: p.14 첫 관측 도판과 중복 | excluded: report와 동일 제외 | excluded: p.14 대표 도판 사용 | not-applicable | excluded: entity scene, not portrait | 반복 오브 컷 |
| `/assets/session-reports/s1e5-sector-c-part2/wendigo-to-village.webp` | p.101 웬디고의 마을 도주 | 1035×503 | yes — embedded VTT frame | report-cutscene | included (durable-ready) | included (durable-ready) | not-applicable | not-applicable | excluded: report cutscene, not portrait | 최종 선택의 위험 배경 |
| `/assets/session-reports/s1e5-sector-c-part2/village-aftermath.webp` | p.111 눈 덮인 마을 | 1035×503 | yes — embedded VTT frame | report-cutscene | included (durable-ready) | included (durable-ready) | excluded: existing-place identity not confirmed | not-applicable | excluded: report cutscene, not portrait | 바부슈카·웬디고 종료 장면의 장소 도판 |
| `p113-authorized-personnel-logo` | p.113 종료 로고 | 1035×503 | yes — embedded VTT frame | candidate-only | excluded: decorative end card | excluded: report와 동일 제외 | not-applicable | not-applicable | not-applicable | 서사 정보 없는 장식 로고 |

## Source Conflict / Open Questions

| issue | source state | durable decision | remaining need |
|---|---|---|---|
| 신규 wiki 공개 여부 | 원문과 사용자 요청에 공개/비공개 분류 없음 | report mirror·오브·스트리고이·맘모스를 `isPublic: false` candidate-only 초안으로 보존 | 네 문서를 공개할지 비공개로 둘지 사용자 결정 |
| 시각 자산 직접 URL 공개 | 15개 검증 자산이 Next.js `public/` 경로에 있음 | 로컬 커밋까지만 허용하고 push/deploy 차단 | 이미지 공개 승인 또는 인증된 asset delivery/비배포 결정 |
| 게라쉬모프 신원 | 성과 장군 직함만 확인 | report-only | 전체 이름·조직·등급·초상·공개 여부 |
| R 신원 | 화이트로즈 수장이라고 자칭 | 기관 사건 기록만 반영 | 실명·Dossier 여부·등급·초상·공개 여부 |
| 바부슈카와 웬디고 | 상호 `Mama`·`내 아들` 발화 | testimony로 보존 | 실제 가족관계 확인 |
| 오브 식별자 | 현장 임시 명칭 `오브`만 확인 | wiki title에 `섹터 C 전기 오브` 사용, 비공식 명칭 명시 | 정식 ZULU 번호·분류 |
| 스트리고이·노스페라투 | 자칭·speaker label과 행동 확인 | 하나의 집단 사건 문서로 등록 | 정식 ZULU 번호·개체 수·현 위치 |
| 광원화와 뇌 파괴 | 페초린 발화와 사망체 비표적화 관측 | 이번 사건의 관측으로만 기록 | 일반 법칙화 가능한 추가 실험·문서 |
| 데드핸드 프로젝트 | 모스가 명칭만 발화 | 사건명과 실행만 기록 | 프로젝트 기원·권한·전체 범위 |
| NPC apply-ready 계약 | coverage에는 ready 기존 NPC 3건과 payload에서 제외된 blocked 후보 3건이 함께 존재 | 구조 검사는 통과했고 Dossier payload는 live 미적용 | checker가 payload target만 판정하도록 정합화하거나 후보 3건의 모든 승인값 확정 |
| 신규 위키의 보고서 구조화 참조 | 신규 오브·스트리고이·맘모스 페이지는 아직 live에 없음 | report/wiki 본문의 typed link와 각 신규 위키의 report backlink를 초안에 등록; `relatedWikiSlugs`에는 현재 존재하는 기존 target만 포함 | 신규 위키 visibility 결정·live 생성 뒤 명시 배열에 3개 slug를 추가하는 후속 pass |

## Verification Contract

- 보고서 ID·번호: formatter preset과 title fallback 모두 `NOSB-S1E5-EVIL-PART2 → 05.5`를 반환해야 한다.
- 지도 카드: 동일 좌표의 `05`와 `05.5`가 겹치지 않는 명시 레이아웃을 가져야 한다.
- 보고서·wiki mirror: 15개 이미지 경로·순서·alt·caption이 완전히 같아야 한다.
- 보고서 구조화 링크: 현재 live에서 검증 가능한 기존 target 6개를 저장하고, 신규 wiki 3개의 forward typed link는 비공개 초안 본문에 보존한다.
- 정적 자산: 15개 WebP가 모두 1035×503이며 payload·ledger 경로와 일치해야 한다.
- NPC: 준비된 기존 세 NPC는 현재 등급·초상·공개 여부·소속을 보존하고 상태 서술만 추가해야 한다. 차단 후보 세 건에는 Dossier payload가 없어야 하며, 현재 checker의 전체-ledger apply gate가 해소되기 전에는 Dossier payload를 live apply하지 않는다.
- Dossier: 21개 기존 codename이 모두 dry-run에서 `예상 update` 또는 멱등 `예상 unchanged`여야 한다.
- personality: 6개 observation은 immutable ID별 단일 `$addToSet` envelope이며 timestamp를 포함하지 않아야 한다.
- 경제: payload 전체에 경제·인벤토리·상점·주식·`master_items` mutation이 없어야 한다.
- 신규 wiki·시각 자산 공개 결정, NPC apply-ready gate, live DB mutation과 인증 브라우저 검증은 별도 실행 승인 전까지 남은 갭으로 유지한다.

## Verification Evidence

- 원본 113쪽에서 1,485개 기록과 31개 시각 프레임을 추출했고 빈 페이지·대체문자가 없음을 확인했다. 대표 시작·중간·종료 페이지와 선정 프레임을 시각 판독했다.
- `PECHORIN`, `RODION`, `BAZAROV` spec은 `parseFrontmatter → npcFrontmatterSchema → toDbNpc → npcDocSchema` round-trip을 통과했고 두 세션 ID가 모두 보존됐다.
- 보고서·wiki mirror의 15개 이미지 path/order/alt/caption parity, NPC ledger 구조, 31개 visual ledger, personality ready ledger와 6개 payload 관찰의 일치를 `check_lore_output.py`로 검증했다. NPC apply-ready 검사는 blocked 후보 3건을 payload target과 무관하게 요구하는 현재 checker 계약 때문에 실패했으며, 따라서 Dossier live apply 차단 상태를 유지한다.
- repository 전체 coverage/static payload/category/link/asset 감사가 통과했고 신규 coverage는 `docs/lore/README.md` 인덱스에 포함됐다.
- read-only seed dry-run에서 report/wiki payload 10건은 `session_reports` 신규 1건, `wiki_pages` 신규 4건·기존 5건으로 확인됐다. 신규 wiki 4건은 공개 결정 전 안전한 초안값인 `isPublic: false`로 유지한다. Dossier 21건과 personality observation 6건은 모두 기존 `characters`의 예상 update로 확인됐다.
- dry-run은 신규 위키가 아직 live에 없다는 구조화 참조 선행 조건을 확인했다. 현재 존재하는 기존 target 6개만 `relatedWikiSlugs`에 유지하자 report를 포함한 10건 전체가 blocker 없이 통과했다. 신규 3개 forward link는 typed 본문과 backlink에 보존했다.
- 번호 formatter와 제목 fallback, structured reference·lore link 관련 테스트 19건이 통과했다. personality update/seed normalization 테스트 13건도 통과했다.
- `pnpm --filter @stargate/shared-db build`, `pnpm typecheck`, `pnpm lint`, `git diff --check`가 통과했다.
- public payload 문자열에서 PDF·parser·payload·raw page/line·candidate-only·경제 no-op 내부 표현이 없음을 별도 패턴 검사했다.
- live `--execute`, push/deploy, 경제·인벤토리·주식 mutation, 인증 브라우저 확인은 수행하지 않았다. 따라서 audit status는 `partial`이며 공개 범위 결정, 실제 적용·DB 재조회·ERP 렌더와 신규 위키 3개의 구조화 forward edge는 남은 갭이다.
