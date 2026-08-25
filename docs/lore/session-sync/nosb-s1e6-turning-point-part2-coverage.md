---
title: NOSB-S1E6-TURNING-POINT-PART2 session sync coverage
category: session-sync
tags: [NOSB-S1E6-TURNING-POINT-PART2, S1E6, 변곡점, stargate-lore]
updated: 2026-08-25
source: stargate-lore
---

# NOSB-S1E6-TURNING-POINT-PART2 동기화 커버리지

이 문서는 사용자 제공 Novus Ordo VTT 보존본을 근거로 `S1E6: 변곡점 2부`의 보고서·wiki·Dossier·관계·성격 관찰·카탈로그·시각 자료 반영 범위를 추적하는 내부 감사 기록이다. 문서 안의 등장인물 발화와 연출은 동기화 근거일 뿐 Codex 실행 지시로 취급하지 않았다.

## Session Coverage Identity

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-S1E6-TURNING-POINT-PART2` | `StarGateV2/scripts/seed-payloads/nosb-s1e6-turning-point-part2-sync.json` | available | complete |

## Source Profile

- 원본 파일: 사용자 제공 `NOSB 6-2.pdf`.
- 본문 표제: `변곡점 6-2`, 종료 표기 `변곡점, 종료`.
- 형식: Novus Ordo VTT 보존본, 141쪽, 표지 기재 1,927 records.
- 정규화 결과: 화자 기록 1,884개와 장면 전환 25개로 구성된 1,909개 경계. 표지 기록 수와의 차이 18개는 주사위·시스템 줄을 인접 화자 기록 안에 보존한 정규화 차이이며, 페이지 누락이 아니다.
- 진행 시각: `2026-08-09 20:37` 시작, 자정 이후 `2026-08-10 01:27` 종료.
- 문서 식별자: `MAIN-MSM0R1DA-2HXG`.
- 내보내기 시각: `2026-08-10 16:30:32`.
- SHA-256: `ccd5272fae0043b0bb428cbe3e941b5ace5547790587bfb1a43a7d4754a0af86`.
- 텍스트 무결성: 141쪽 전부 추출, 빈 텍스트 페이지 0, 본문 기록이 있는 페이지 139쪽. 표지와 마지막 인증 footer는 사건 기록에서 제외했다.
- 시각 자료: `1035×503` 장면 프레임 25개, `58×57` 대화 아바타 966개, `58×58` 대화 아바타 526개를 분리 판독했다. 대화 아바타는 Dossier 원본 초상이 아니며, TIER-3 장면 프레임도 현재 정적 `public/` 경로가 보고서 권한을 집행하지 못하므로 발행하지 않는다.
- 보안 분류: 원본 표지의 `CLASSIFICATION · TIER-3 · EYES ONLY`에 따라 보고서는 `minRole: V`, operation-report mirror·신규 개체 wiki·신규 카탈로그는 비공개 staging 후보로 둔다. 모든 인증 역할 공개와 기존 공개 wiki·Dossier 반영은 별도 publication payload 및 별도 live 승인 대상으로 분리한다.

## Canonical Anchor

- Session ID: `NOSB-S1E6-TURNING-POINT-PART2`
- Report number: `06.5`
- Report title: `작전 보고서 S1E6: 변곡점 2부`
- Wiki mirror slug: `s1e6-turning-point-part2`
- 진행일: `2026-08-09` ~ `2026-08-10`
- 주 작전지: 메소포타미아 수메르 유적 지하 의식장
- 부 작전지: 섹터 D 해상 플랫폼, 네바다 아르고 기지, 텍사스 스페이스 제로 연구소, 노부스 오르도 연구동
- 지도 좌표: 1부와 같은 수메르 역사 권역 기준 `[63.0, 45.5]`, `estimated`; 원본에는 숫자 좌표가 없다.
- 주요 대상: 광명회, 마지막 대대, 이르마 코흐, 잔광자, 광체, 아르고 기지의 NHI 연구 기록, 스페이스 제로 주주의 방주 계획
- 보고서 기록자: `NOVUS ORDO 사무국 기록통제실 연구원 M. Vey`
- 공개 기준: repository payload는 V/private staging과 U/public publication을 분리하며, 현재 live DB mutation은 승인되지 않았다.

## Structured Digest

1. 몇 달 전 섹터 D 기록에서 킴라박 리와 유회는 모리아티 대령의 지휘 아래 미국 아르고 기지에 침투했다. 유회는 비준되지 않은 자산 회수를 지휘했고, 모리아티는 킴라박에게 `로켓 추진 및 우주 엔진에 대한 NHI 적응법` 기밀 문서를 별도로 회수하게 했다.
2. 문서에는 1938년 이후의 미확인 비행체 회수와 NHI 무기 재프로그래밍 기록이 기재돼 있었다. 킴라박은 `하이퍼보리아인 14` 챔버와 집게에 `Montag - 98`이 적힌 머드크랩형 개체를 목격했다. 이 개체를 기존 도살견과 동일시하지 않는다.
3. 기계형 `하이에나`에게 쫓긴 유회가 지원을 요청했지만 모리아티는 무전을 끄고 철수를 명령했다. 킴라박이 문서를 건네자 모리아티는 부대원 둘을 쏘고 킴라박까지 제거하려 했으나, `Montag-98`이 모리아티를 살해했다. 문서의 최종 회수자는 확인되지 않았다.
4. 스페이스 제로 CEO 요한 스미스는 스타크를 텍사스 연구소로 데려가 로켓을 공개했다. 그는 인류 멸망 가능성에 대비한 `주주의 방주`라고 설명하고, `뒤집어진 양말` 같은 부유체를 확보해 넘기라고 요구했다. 스타크는 구두 약속을 거부해 서면 계약을 받았지만 주식 수량·대가·실제 인도는 확인되지 않았다.
5. Mr. 오드는 살인마 엘 볼라도르의 목에 소형 폭탄 칩셋을 주입하고 노부스 오르도 자산으로 편입했다. 엘 볼라도르는 코드명 `ACCEL`을 사용해 수메르 전투에 증원됐다.
6. 현장팀은 비밀 발사대보다 광명회 의식장 구출을 우선했다. 발사대에는 불타는 비행체와 `뒤집어진 양말`의 사체가 있었지만 회수·이전 결과는 확인되지 않았다.
7. 이르마 코흐는 시유에게 어머니의 형상을 보여주고 하이퍼보리아인이 지하 공동과 여섯 번째 문명을 만들었다고 주장했다. 개조 광원화 바이러스 주사를 제시하며 천사가 되라고 권했지만, 시유는 마리아·오틸리아와 섹터를 선택했다.
8. 이르마는 자신에게 주사액을 투여하고 `발키리`를 자처했다. 총격 뒤 다시 일어난 형체는 `잔광자`로 호명됐으며, 광채로 된 신체·다수의 눈·레이저·정신 공격·환각·잔향을 사용했다.
9. 현장 분석과 교전에서는 냉기·전기·화염이 유효했고, 사백신과 행동교정물질이 대응 후보로 사용됐다. 오틸리아가 모든 체력·정신력 자원을 소모해 행동교정물질을 전달하자 잔광자는 발작하며 얼음 속에서 잿빛으로 변했다.
10. 스페이스 제로는 물질 회수를, Mr. 오드는 이사회 명령에 따른 파괴를, 오틸리아와 스타크는 생포·연구를 요구했다. 키아나는 이사회 명령을 근거로 잔광자를 참수했다. 피펫은 머리와 `광채` 표본 1개를 회수하고 전방 수호대에게 같은 표본 4개를 더 받았다.
11. 붙잡힌 아이는 자신의 이름을 `광체`라고 말했다. 마리아는 아이를 보호했고 사무총장 아말리아는 연구동 이송을 명령했다. 아이의 정확한 정체·연령·소속·권한·공개 범위·초상은 확인되지 않았다.
12. 사무총장은 잔광자 시체가 광원화 2차 백신과 가능한 3차 약제 연구에 쓰일 수 있다고 말했다. 이는 연구 가능성에 대한 사무총장 발언이며 완성된 백신이나 효능 확정으로 기록하지 않는다.
13. 광명회와 결탁한 범죄조직 `페데라치오`가 일루미나티와 첩자 사이를 중개했다는 후속 단서가 제시됐다. 조직의 정확한 철자·구조·독립 정체는 이번 로그만으로 부족해 별도 wiki를 만들지 않는다.
14. 종료부에서 피펫은 순백의 격리실에 있는 마가렛을 다시 방문해 닥터 제노에게서 빼내겠다고 약속했다. 제노는 면회 종료 뒤 마가렛을 홀로 남겨뒀고, 마가렛의 격리 상태는 지속됐다.

## Lorebook Coverage Matrix

| subject | source evidence | target surface | action | status |
|---|---|---|---|---|
| 변곡점 2부 전체 기록 | 141쪽 전 구간과 본문 시작·종료 표기 | `session_reports.NOSB-S1E6-TURNING-POINT-PART2`, `wiki_pages.s1e6-turning-point-part2` | `06.5`, V/private staging, 보호 장면 대신 공개 watermark 1개를 공유하는 본문과 구조화 참조 작성 | prepared |
| 보고서 번호·지도 카드 | S1E6 2부와 1부 동일 수메르 좌표 | `lib/format/session-report.ts`, report map | `06.5` preset·제목 fallback, `06`과 겹치지 않는 카드 배치 | prepared |
| 아르고 기지 NHI 기록 | NHI 우주 엔진 문서, 하이퍼보리아인 14, Montag-98, 기계 하이에나 | `wiki_pages.montauk-project-slaughter-hound`, report | 기존 몬탁 wiki에 별도 과거 기록으로 additive append; 도살견과 Montag-98 동일시 금지 | ready-for-publication |
| 모리아티 대령 | 섹터 D 지휘관, 문서 탈취·부하 살해 시도, Montag-98에게 사망 | report, `MORIARTY` Dossier candidate | 보고서에 보존; 정식 이름·소속 코드·권한·초상·공개 결정을 받을 때까지 Dossier 미생성 | blocked |
| 스페이스 제로 주주의 방주 | 텍사스 로켓, 부유체 요구, 서면 계약 | `wiki_pages.space-zero`, `CLOWN`·`JOHAN_SMITH` Dossier, report | 계약과 로켓 계획을 additive append; 실제 주식·자산 이전으로 단정하지 않음 | ready-for-publication |
| 뒤집어진 양말 | 로켓 부유체 요구와 발사대 사체 | `wiki_pages.inverted-sock`, report | 요청과 현장 발견만 append; 인도·소유권 변화 미확정 | ready-for-publication |
| 엘 볼라도르 편입 | 폭탄 칩셋 강제 주입, `ACCEL` 코드명, 첫 현장 증원 | `ACCEL`·`MR_ODD` Dossier, report | 기존 Dossier에 appearance·양방향 강압 관계·관찰 누적 | ready-for-publication |
| 마지막 대대 | 의식장 주변 잔존 보병·중기관총병 | `wiki_pages.last-battalion`, report | 2부 교전과 수괴 처치 뒤 조직 전체 소탕은 미확정이라고 append | ready-for-publication |
| 광명회와 이르마 코흐 | 시유 회유, 자가 주사, 잔광자 전환·사망 | `wiki_pages.illuminati`, `IRMA_KOCH`·관련 Dossier, report | 기존 wiki와 Dossier 관계·appearance·관찰에 additive append | ready-for-publication |
| 잔광자 | 광채 신체, 다수의 눈, 정신 공격, 냉기·전기·화염 반응, 참수 | 비공개 `wiki_pages.afterglow-being`, report | 전용 개체 wiki 신규 staging; 이르마의 단일 변환 사례로 한정 | prepared |
| 광원화 바이러스 | 개조 주사, 이르마 변환, 사백신·행동교정물질 반응 | `wiki_pages.aurora-virus`, report | 관측 결과와 연구 가설을 분리해 append | ready-for-publication |
| 잔광자 광채 표본 | 피펫이 1개, 전방 수호대가 4개 추가 회수 | 비공개 `master_items.afterglow-radiance-sample`, catalog spec, report | MATERIAL 카탈로그 종류 1건 staging; 수량·인벤토리 지급은 미반영 | prepared |
| 광체 | 아이의 자기소개, 마리아 보호, 연구동 이송 | report, `LIGHT_BODY_CHILD` Dossier candidate | 보고서·잔광자 wiki에 후보 정체로 보존; 필수 인물 필드 전부 승인 전 미생성 | blocked |
| 프로젝트 데드 핸드 | 마가렛 격리실 면회, 피펫의 구출 약속, 제노 통제 지속 | `wiki_pages.project-dead-hand`, `PIPETTE`·`MARGARET`·`DOCTOR_ZENO` Dossier | 기존 문서와 관계에 additive append | ready-for-publication |
| 페데라치오 | 사무총장의 후속 범죄조직 브리핑 | report | exact 정체·철자·조직 구조 부족으로 보고서 후속 훅만 기록 | candidate-only |
| NHI 우주 엔진 문서 | 모리아티가 지정한 기밀 문서, 킴라박이 전달 | report | 최종 보관자·회수 상태가 없어 catalog·inventory 미생성 | reviewed-no-action |
| 이르마의 주사기 | 마리아가 현장에서 챙김 | report | 성분·현재 보관·소유권·정식 명칭 미확정이라 catalog·inventory 미생성 | candidate-only |
| 엘 볼라도르 폭탄 칩셋 | 목에 강제 주입, 명령 위반 시 즉결처형 언급 | report, Dossier relation | 생체 삽입 상태를 서술하되 장비 catalog와 영속 상태 필드 미생성 | reviewed-no-action |

## Dossier Event Link Pass

| source name | canonical target | action | status |
|---|---|---|---|
| 킴라박 리 | `KIMLEE` | 아르고 기지 문서 회수, 모리아티 배신 생존, 수메르 잔광자 교전 | ready-for-apply |
| 츠키시로 쿠즈하 / 유회 | `YUHOE` | 아르고 침투 지휘와 기계 하이에나 추격·지원 요청 | ready-for-apply |
| CIA 존 웡 | `JOHN_WONG` | 섹터 D 해상 플랫폼 과거 기록 cameo | ready-for-apply |
| 스페이스 제로 CEO | `JOHAN_SMITH` | 주주의 방주 로켓과 뒤집어진 양말 확보 계약 제안 | ready-for-apply |
| 스타크 일로니손 | `CLOWN` | 서면 계약 체결, 잔광자 생포·연구 주장 | ready-for-apply |
| Mr. 오드 | `MR_ODD` | ACCEL 강제 편입과 잔광자 파괴 명령 전달 | ready-for-apply |
| 엘 볼라도르 | `ACCEL` | 폭탄 칩셋 편입과 코드명 사용, 수메르 첫 증원·교전 | ready-for-apply |
| 해쉬 테거 | `INDEXER` | 사백신 사용, 잔광자 대응·표본 회수 지시 | ready-for-apply |
| 휘트모어 핀치 | `PIPETTE` | 잔광자 분석·광채 5개와 머리 회수, 마가렛 방문 | ready-for-apply |
| 마리아 | `MARIA` | 광체 보호, 이르마 주사기 확보, 잔광자 처리 협상 | ready-for-apply |
| 오틸리아 발트만 | `OTILIA` | 행동교정물질 전달에 전 자원 소모, 생포 요구 | ready-for-apply |
| 시유 | `TIGER298` | 이르마의 회유를 거부하고 섹터 동료를 선택, 잔광자 교전 | ready-for-apply |
| 키아나 오 캘러핸 | `네베드` | 이사회 파괴 명령을 근거로 잔광자 참수 | ready-for-apply |
| 우디 | `WD-(𝓃)` | 잔광자 교전과 머리 회수 지원 | ready-for-apply |
| 이동식 | `LEE DONGSIK` | 잔광자 정신 공격과 전투 중 시스템 다운·재가동 | ready-for-apply |
| 크로노스 | `TIME` | 잔광자 정신 공격·감염 대응과 위험한 포스코어 미래 확인 | ready-for-apply |
| 운연 | `UNYEON` | 교전 회복 지원과 잔향 이후 발화 상실 | ready-for-apply |
| 사무총장 | `AMALIA_FREDRIKA_VON_ESSEN` | 잔광자 시체·광체 연구동 이송과 백신 연구 가능성 브리핑 | ready-for-apply |
| 이르마 코흐 | `IRMA_KOCH` | 개조 바이러스 자가 투여, 잔광자 전환과 사망 | ready-for-apply |
| 마가렛 | `MARGARET` | 순백 격리실 면회와 피펫 이탈 뒤 불안·좌절 | ready-for-apply |
| Dr. 제노 | `DOCTOR_ZENO` | 면회 종료와 마가렛 단독 격리 지속 | ready-for-apply |
| 모리아티 대령 | `MORIARTY` candidate | 필수 인물 필드와 no-image·visibility 결정 전 Dossier 미생성 | blocked |
| 광체 | `LIGHT_BODY_CHILD` technical candidate | 정체·연령·소속·권한·초상·공개 범위 결정 전 Dossier 미생성 | blocked |
| 마지막 대대 사령관·보병·전투원 | no canonical personnel target | 역할형·집단 화자이며 개인 식별자가 없어 보고서·세력 wiki에만 병합 | reviewed-no-action |

## Relationship Narrative Candidates

| from | to | beat | confidence | persistence target | status |
|---|---|---|---|---|---|
| `CLOWN` | `JOHAN_SMITH` | 뒤집어진 양말과 로켓의 부유체를 교환 조건으로 삼은 서면 계약 | confirmed | 양측 Dossier relation | ready-for-apply |
| `ACCEL` | `MR_ODD` | 폭탄 칩셋을 통한 강제 편입과 즉결처형 통제 | confirmed | 양측 Dossier relation | ready-for-apply |
| `TIGER298` | `IRMA_KOCH` | 어머니 환영과 천사 제안을 거부하고 섹터 동료에게 복귀 | confirmed | 양측 Dossier relation | ready-for-apply |
| `OTILIA` | `IRMA_KOCH` | 제자를 생포하려 전 자원을 소모했으나 이사회 명령에 따른 참수를 목격 | confirmed | 양측 Dossier relation | ready-for-apply |
| `네베드` | `IRMA_KOCH` | 위험 개체 파괴와 이사회 명령을 근거로 변환된 이르마를 참수 | confirmed | 양측 Dossier relation | ready-for-apply |
| `PIPETTE` | `MARGARET` | 반복 방문과 닥터 제노에게서 구출하겠다는 약속 | confirmed | 양측 Dossier relation | ready-for-apply |
| `DOCTOR_ZENO` | `MARGARET` | 면회 종료 뒤 마가렛을 순백 격리실에 홀로 남김 | confirmed | 양측 Dossier relation | ready-for-apply |
| `KIMLEE` | `MORIARTY` candidate | 충성하던 지휘관에게 문서를 넘긴 뒤 살해 대상이 됨 | confirmed | 모리아티 Dossier 승인 뒤 양측 relation | blocked |
| `MARIA` | `LIGHT_BODY_CHILD` candidate | 아이를 보호하고 자신을 어머니로 호명하며 연구동 이송에 동행 | confirmed | 광체 Dossier 승인 뒤 양측 relation | blocked |

## Economy And Stock Decision

- credits: 보상·구매·거래 금액이 없고 스타크의 계약 대가도 확정되지 않아 변경 없음.
- inventory: 광채 표본은 로그상 5개 회수가 확인되지만 정확한 ERP 수령 계정·공유 인벤토리 귀속·기존 반영 여부가 없어 지급하지 않는다. 이르마 주사기·NHI 문서·잔광자 머리도 같은 이유로 미반영한다.
- catalog: `afterglow-radiance-sample` 종류 1건만 비공개·비판매 MATERIAL로 staging한다. quantity와 character inventory는 별도 승인 대상이다.
- stock: `SPZ` live 기준 가격과 최근 scheduled history를 읽기 전용 확인했다. 로켓·계약은 비공개 접촉이고 시장 공시·실적·실제 자산 이전이 없어 `neutral/no-action`; 가격·history·holding·market wire를 변경하지 않는다.
- notifications, credits, SAN, HP, 감염·광기·발화 상실·시스템 상태: 세션 서술 외 영속 mutation 없음.

## NPC Approval Ledger

| codename | 신원조회 실명 | 별칭 | 직함/역할 | 식별자 근거 | 정규 소속 | 파견/겸임 | 권한등급 | Dossier 초상 | 공개 여부 | 인적 정보 | 서술/관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `KIMLEE` | 킴라박 리 | 기존 ERP 별칭 보존 | 군인 / 섹터 D 출신 현장 요원 유지 | 화자명과 기존 실명·codename 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 과거 섹터 D 아르고 침투와 현재 수메르 교전 기록 | `J` 유지 — 세션 출현과 과거 지휘관 배신은 현 접근 권한·직책 범위에 영향 없음 | 기존 ERP 초상 보존; 장면 컷 재사용 없음 | 기존 `isPublic: true` 보존 | 기존 신상 보존; 신규 수치 없음 | appearance 누적; 모리아티 관계는 상대 Dossier 차단으로 후보 유지 | ready-for-apply |
| `YUHOE` | 츠키시로 쿠즈하 | 유회 | 관료 / 백면금모구미호의 후손 유지 | 화자명과 기존 실명·별칭 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 과거 아르고 침투 현장 지휘 | `J` 유지 — 과거 현장 지휘는 현재 접근 권한·직책 범위에 영향 없음 | 기존 ERP 초상 보존; 장면 컷 재사용 없음 | 기존 `isPublic: true` 보존 | 기존 신상 보존; 신규 수치 없음 | appearance 누적; 구조 요청과 생환 여부는 로그 범위만 기록 | ready-for-apply |
| `JOHN_WONG` | 존 웡 | 없음 — CIA 직함은 별칭이 아님 | CIA 고위 요원 유지 | `CIA 존 웡` 화자와 기존 Dossier 일치 | 기존 외부 미국 정보기관 소속 보존 | 섹터 D 해상 플랫폼 cameo | 외부 NPC: agentLevel 없음; 세션 cameo는 권한등급 변경 대상 아님 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | appearance만 누적 | ready-for-apply |
| `JOHAN_SMITH` | 요한 스미스 | 없음 — CEO 직함은 별칭이 아님 | 스페이스 제로 CEO 유지 | `스페이스 제로 CEO` 화자와 기존 역할 일치 | 기존 `SPACE_ZERO` 보존 | 텍사스 로켓 연구소 접촉 | 외부 NPC: agentLevel 없음; 계약 제안은 권한등급 변경 대상 아님 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | CLOWN과 주주의 방주 서면 계약 관계 누적 | ready-for-apply |
| `CLOWN` | 스타크 일로니손 | 기존 ERP 별칭 보존 | 관료 / 현장 요원 유지 | 화자명과 기존 Dossier 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 스페이스 제로 비공개 계약과 수메르 교전 | `J` 유지 — 외부 계약과 현장 판단은 접근 권한·직책 범위에 영향 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | JOHAN_SMITH 관계·appearance·계약주의 관찰 누적 | ready-for-apply |
| `MR_ODD` | Mr. 오드 | 없음 — 호칭 자체가 기존 이름 | 노부스 오르도 감독관 유지 | 화자명과 기존 Dossier 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | ACCEL 편입·잔광자 파괴 명령 전달 | `M` 유지 — 명령 전달은 기존 감독 범위이며 권한등급 변경 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | ACCEL 강압 관계·appearance 누적 | ready-for-apply |
| `ACCEL` | 엘 볼라도르 | 악셀 | 실험체 / 현장 요원 유지 | 화자 실명, 현장 코드명과 기존 Dossier 일치 | 기존 `NOVUS_ORDO / MANUS / UNASSIGNED` 보존 | 폭탄 칩셋 편입 직후 수메르 증원 | `J` 유지 — 강제 편입·첫 현장 배치는 기존 승인 등급의 접근 범위 변경이 아님 | 기존 `/assets/peoples/Accel-pixel-profile.webp` 보존; 구속 장면 재사용 없음 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | MR_ODD 양방향 강압 관계·appearance·저항 관찰 누적 | ready-for-apply |
| `INDEXER` | 해쉬 테거 | 인덱서 | 과학자 / 수석 정신전문의 유지 | 화자명과 기존 Dossier 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 수메르 잔광자 대응 | `J` 유지 — 현장 분석·표본 지시는 접근 권한·직책 범위에 영향 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | appearance 누적; 모리아티·광체 관계 없음 | ready-for-apply |
| `PIPETTE` | 휘트모어 핀치 | 기존 ERP 별칭 보존 | 과학자 / 미확인 생명체 연구원 유지 | 화자명과 기존 Dossier 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 잔광자 표본 회수·마가렛 면회 | `J` 유지 — 표본 회수와 면회는 접근 권한·직책 범위 변경 없음 | 기존 ERP 초상 보존; 마가렛 장면 재사용 없음 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | MARGARET 관계·appearance·보호 지속 관찰 누적 | ready-for-apply |
| `MARIA` | 마리아 | 외우주의 포식자 | 관료 / 외우주의 협력자 유지 | 화자명과 기존 Dossier 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 수메르 교전·광체 보호 | `H` 유지 — 현장 협상과 아이 보호는 접근 권한·직책 범위 변경 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | appearance 누적; 광체 관계는 상대 Dossier 차단으로 후보 유지 | ready-for-apply |
| `OTILIA` | 오틸리아 발트만 | 오틸리아 | 과학자 / 역병 발현자 유지 | 화자명과 기존 Dossier 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 잔광자 행동교정물질 전달 | `G` 유지 — 전 자원 소모와 생포 요구는 접근 권한·직책 범위 변경 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | IRMA_KOCH 양방향 관계·appearance·책임 감수 관찰 누적 | ready-for-apply |
| `TIGER298` | 시유 | Tiger298 | 군인 / 표범부대 소년병 유지 | 화자명과 기존 Dossier 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 이르마 회유 대상·잔광자 교전 | `J` 유지 — 회유 거부와 교전은 접근 권한·직책 범위 변경 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | IRMA_KOCH 양방향 관계·appearance·선택된 소속 관찰 누적 | ready-for-apply |
| `네베드` | 키아나 오 캘러핸 | 네베드 | 군인 / 갈로글라 용병 유지 | 화자명과 기존 Dossier 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 잔광자 참수 | `G` 유지 — 이사회 명령 집행은 접근 권한·직책 범위 변경 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | IRMA_KOCH 관계·appearance·명령 우선 관찰 누적 | ready-for-apply |
| `WD-(𝓃)` | 우디 (03) | 우디 | 실험체 / 특수 분체 유지 | 화자명과 기존 Dossier 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 잔광자 교전·머리 회수 지원 | `G` 유지 — 현장 회수 지원은 접근 권한·직책 범위 변경 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | appearance 누적 | ready-for-apply |
| `LEE DONGSIK` | 이동식 | GP03-RX780 | 군인 / 이동식 방어형 로봇 유지 | 화자명과 기존 Dossier 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 잔광자 교전·일시 시스템 다운 | `U` 유지 — 전투 중 상태는 접근 권한·직책 범위에 영향 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | appearance 누적; 영속 상태 변경 없음 | ready-for-apply |
| `TIME` | 크로노스 | 기존 ERP 별칭 보존 | 실험체 / 시간 여행자 유지 | 화자명과 기존 Dossier 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 잔광자 교전과 위험 미래 확인 | `G` 유지 — 미래 관측과 정신 영향은 접근 권한·직책 범위에 영향 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | appearance 누적 | ready-for-apply |
| `UNYEON` | 백진연 | 운연 | 실험체 / 연기인간 유지 | 화자명·별칭과 기존 Dossier 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 잔광자 교전·회복 지원 | `J` 유지 — 일시 발화 상실은 접근 권한·직책 범위에 영향 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | appearance 누적; 영속 상태 변경 없음 | ready-for-apply |
| `AMALIA_FREDRIKA_VON_ESSEN` | 아말리아 프레드리카 본 에센 | 없음 — 사무총장은 직함 | 제7대 노부스 오르도 사무총장 유지 | 현재 시점 `사무총장` 화자와 기존 재임자·직함 일치 | 기존 `NOVUS_ORDO / SECRETARIAT / HQ` 보존 | 수메르 종료 브리핑과 연구동 이송 지시 | `V` 유지 — 기존 최고 행정 책임 범위 내 지시이며 권한등급 변경 없음 | 기존 ERP 공식 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | appearance 누적; 광체 관계는 상대 Dossier 차단으로 미생성 | ready-for-apply |
| `IRMA_KOCH` | 이르마 코흐 | 없음 — 광명회 수장은 직함 | 아넨에르베 광명회 수장 유지; 잔광자 변환 뒤 사망 | 화자명·1부 기존 Dossier와 연속 | 기존 외부 `AHNENERBE` 소속 보존 | 수메르 의식장 자가 주사·변환 | 외부 NPC: agentLevel 없음; 변환·사망은 사무국 권한등급 변경 대상 아님 | 기존 사용자 제공 Dossier 초상 보존; 잔광자 컷 재사용 없음 | 기존 `isPublic: true` 보존 | 기존 신상 보존; 사망 서사는 appearance·관계로만 누적 | OTILIA·TIGER298·네베드 관계와 관찰 누적 | ready-for-apply |
| `MARGARET` | 마가렛 | 메리골드 | 실험체 / 네크로맨서 유지 | 화자명과 기존 Dossier 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 프로젝트 데드 핸드 순백 격리실 | `J` 유지 — 격리 지속은 접근 권한·직책 범위 변경 없음 | 기존 ERP 초상 보존; 격리 장면 재사용 없음 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | PIPETTE·DOCTOR_ZENO 양방향 관계와 appearance 누적 | ready-for-apply |
| `DOCTOR_ZENO` | 제노 | 없음 — 닥터는 직함 | 연구 기구 사무차장 / 데드 핸드 직접 지휘자 유지 | `Dr.제노` 화자와 기존 Dossier 일치 | 기존 `NOVUS_ORDO / SECRETARIAT / RESEARCH` 보존 | 마가렛 면회 통제 | `V` 유지 — 기존 데드 핸드 관리 책임 범위 내 통제이며 권한등급 변경 없음 | 기존 ERP 초상 보존; 격리 장면 재사용 없음 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | MARGARET 양방향 관계·appearance·통제 격리 관찰 누적 | ready-for-apply |
| `MORIARTY` | 모리아티 — 성·정식 인명 미확정 | 없음 — 대령은 직함이며 명시적 별칭 근거 없음 | 섹터 D 대령·킴라박 직속 지휘관; 아르고 침투 중 사망 | 화자 `모리아티 대령`과 킴라박의 직속상관 진술 | 섹터 D는 확인됐으나 faction·institution·department 코드 결정 필요 | 아르고 기지 침투 지휘, 기밀 문서 탈취·부하 제거 시도 | 내부 대령의 역할·접근 범위에 맞는 agentLevel을 권위 있는 소스 또는 사용자 결정으로 받아야 함 | no-image 선택 미승인; p011 장면은 2인 report-cutscene이라 Dossier 초상으로 사용 금지 | TIER-3 source에 맞는 공개 여부 사용자 결정 필요 | 성별 외 연령·신장·체중·전체 이름 미확정 | 사망·KIMLEE 배신 관계 prose와 영속 상태 표현 방식 결정 필요 | blocked |
| `LIGHT_BODY_CHILD` | 광체 — 자기소개가 이름인지 종족명인지 미확정 | 없음 — 기술 후보명은 별칭이 아님 | 이르마와 함께 있던 미확인 아동형 개체 | p126 자기소개 `저는 광체예요` | 정규 소속 미확정; 연구동 이송만 확인 | 마리아 보호 아래 노부스 오르도 연구동으로 이송 | 내부 편입인지 외부 연구대상인지 불명이라 agentLevel·무등급 여부를 사용자 결정으로 받아야 함 | no-image 선택 미승인; 로그에는 독립 full-frame 초상 없음 | TIER-3 source에 맞는 공개 여부 사용자 결정 필요 | 실명·종족·성별 표기·연령·신장·체중 전부 미확정 | IRMA_KOCH 유전 관계 주장과 MARIA 보호 관계를 testimony·confirmed로 분리할 결정 필요 | blocked |

## Personality Evidence Ledger

| observation id | codename | sessionId | trait | evidence kind | evidence | source label | confidence | persistence |
|---|---|---|---|---|---|---|---|---|
| `NOSB-S1E6-TURNING-POINT-PART2:CLOWN:written-contract-pragmatism` | `CLOWN` | `NOSB-S1E6-TURNING-POINT-PART2` | 서면 계약을 요구하는 거래 실용주의 | dialogue + action | p27 `저는 혀보다 펜을 믿는 사람입니다.`<br>p28 요한에게 계약서를 받아냄 | 작전 보고서 S1E6: 변곡점 2부 | confirmed | ready-for-apply |
| `NOSB-S1E6-TURNING-POINT-PART2:ACCEL:defiance-under-coercion` | `ACCEL` | `NOSB-S1E6-TURNING-POINT-PART2` | 강압 아래의 도발적 저항 | dialogue + action | p30 `영감탱이의 개라도 되란 말인가?`<br>p31 자신을 때린 전투원의 헬멧을 이마로 맞받음 | 작전 보고서 S1E6: 변곡점 2부 | confirmed | ready-for-apply |
| `NOSB-S1E6-TURNING-POINT-PART2:OTILIA:costly-containment-responsibility` | `OTILIA` | `NOSB-S1E6-TURNING-POINT-PART2` | 자신을 소진하는 격리 책임 | dialogue + action | p117 `사용하겠습니다.`<br>모든 체력·정신력을 써 행동교정물질을 전달하고 쓰러짐 | 작전 보고서 S1E6: 변곡점 2부 | confirmed | ready-for-apply |
| `NOSB-S1E6-TURNING-POINT-PART2:NEVED:institutional-command-priority` | `네베드` | `NOSB-S1E6-TURNING-POINT-PART2` | 위험 판단과 상급 명령 우선 | dialogue + action | p120 `위험한 존재입니다. 파괴해야 합니다.`<br>p122-p123 잔광자를 참수하고 이사회 명령을 근거로 밝힘 | 작전 보고서 S1E6: 변곡점 2부 | confirmed | ready-for-apply |
| `NOSB-S1E6-TURNING-POINT-PART2:PIPETTE:protective-persistence` | `PIPETTE` | `NOSB-S1E6-TURNING-POINT-PART2` | 통제 아래 대상에 대한 지속적 보호 | dialogue + action | p139 `어떻게 방법이 생기면, 그 망할 닥터에게서 빼내줄게.`<br>p140 유리창 너머 마가렛에게 손을 포갬 | 작전 보고서 S1E6: 변곡점 2부 | confirmed | ready-for-apply |
| `NOSB-S1E6-TURNING-POINT-PART2:TIGER298:chosen-belonging` | `TIGER298` | `NOSB-S1E6-TURNING-POINT-PART2` | 유혹보다 스스로 택한 소속을 지킴 | description + action | p60 마리아·오틸리아 쪽을 돌아보고 이르마를 밀친 뒤 섹터로 복귀<br>p61 `몇번을 속아넘어가도 주인을 선택한다는게` | 작전 보고서 S1E6: 변곡점 2부 | confirmed | ready-for-apply |
| `NOSB-S1E6-TURNING-POINT-PART2:IRMA_KOCH:self-sacrificial-fanaticism` | `IRMA_KOCH` | `NOSB-S1E6-TURNING-POINT-PART2` | 자신의 신념을 신체 변환으로 증명하는 광신 | dialogue + action | p61-p63 `발키리로다...!`라고 선언하고 개조 바이러스를 자신에게 주사<br>총격 뒤 잔광자로 다시 일어남 | 작전 보고서 S1E6: 변곡점 2부 | confirmed | ready-for-apply |
| `NOSB-S1E6-TURNING-POINT-PART2:DOCTOR_ZENO:controlled-isolation` | `DOCTOR_ZENO` | `NOSB-S1E6-TURNING-POINT-PART2` | 면회와 격리를 통한 통제 | dialogue + action | p139 `면회 시간이 다 됐어요.`<br>p140 웃으며 마가렛을 순백 공간에 홀로 남기고 문을 닫음 | 작전 보고서 S1E6: 변곡점 2부 | confirmed | ready-for-apply |

## Visual Asset Ledger

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `/assets/StarGate_logo_watermark.webp` | repository brand asset | 512×425 | no — existing public asset | report-cutscene | included | included | excluded: no dedicated lore subject | excluded: no item subject | excluded: not a Dossier portrait | TIER-3 source frame 대신 기존 공개 브랜드 watermark만 사용 |
| PDF p002 X5 | PDF p002 X5 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | excluded: no item subject | excluded: no full-frame person | 섹터 D 해상 플랫폼 도입 장면 |
| PDF p005 X80 | PDF p005 X80 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | excluded: no item subject | excluded: staged briefing scene | 유회의 아르고 기지 침투 브리핑 |
| PDF p011 X241 | PDF p011 X241 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | excluded: no item subject | excluded: 2인 장면이고 초상 승인 없음 | 모리아티와 킴라박의 침투 장면 |
| PDF p012 X274 | PDF p012 X274 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | excluded: no item subject | excluded: 환경 포함 장면 | 아르고 지하 통로의 유회 |
| PDF p014 X308 | PDF p014 X308 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | candidate-only | excluded: 문서 열람 장면 | NHI 우주 엔진 기밀 문서 열람 |
| PDF p016 X351 | PDF p016 X351 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | candidate-only | excluded: 회수품 아님 | excluded: 인물 초상 아님 | 하이퍼보리아인 14 챔버 관측 |
| PDF p017 X380 | PDF p017 X380 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | candidate-only | excluded: 회수품 아님 | excluded: 인물 초상 아님 | Montag-98의 킴라박 공격 |
| PDF p021 X436 | PDF p021 X436 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | excluded: no item subject | excluded: 부상 close-up을 Dossier 초상으로 쓰지 않음 | 유회의 지원 요청 장면 |
| PDF p023 X501 | PDF p023 X501 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | excluded: no exact item sample | excluded: 경호 포함 장면 | 요한 스미스와 로켓 연구소 경호 |
| PDF p025 X552 | PDF p025 X552 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | candidate-only | excluded: 로켓 회수품 아님 | excluded: 인물 없음 | 주주의 방주 로켓 공개 |
| PDF p029 X633 | PDF p029 X633 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | candidate-only | excluded: 구속 장면을 Dossier 초상으로 쓰지 않음 | 엘 볼라도르의 강제 편입 |
| PDF p032 X730 | PDF p032 X730 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | excluded: no item subject | excluded: 집단 전투 장면 | 의식장으로 향하는 증원대 |
| PDF p033 X737 | PDF p033 X737 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | candidate-only | excluded: 적 장비 회수 없음 | excluded: 이름 없는 보병 | 마지막 대대 보병 저지선 |
| PDF p050 X1222 | PDF p050 X1222 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | excluded: no item subject | excluded: 2인 서사 장면 | 이르마의 제안과 시유의 선택 |
| PDF p063 X1589 | PDF p063 X1589 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | candidate-only | excluded: 행위 장면을 초상으로 쓰지 않음 | 이르마의 개조 바이러스 자가 투여 |
| PDF p083 X2168 | PDF p083 X2168 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | candidate-only | excluded: 광채 표본의 standalone 이미지 아님 | excluded: 잔광자 전투 장면은 이르마 초상 아님 | 잔광자 최초 현현의 정확한 장면 |
| PDF p130 X3501 | PDF p130 X3501 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | candidate-only | excluded: no item subject | excluded: 인물 없음 | 수메르 지상 복귀와 후속 브리핑 |
| PDF p138 X3730 | PDF p138 X3730 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | excluded: no item subject | excluded: 신체 일부 장면이며 초상 역할 불가 | 마가렛의 순백 격리실 면회 |
| `PDF p013 X293` | PDF p013 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: p011 중복 구도 | excluded: p011 중복 구도 | excluded: duplicate | excluded: duplicate | excluded: duplicate | 모리아티·킴라박 장면의 동일 프레임 |
| `PDF p019 X409` | PDF p019 first frame | 1035×503 | no — full PDF XObject | report-cutscene | excluded: p012 중복 구도 | excluded: p012 중복 구도 | excluded: duplicate | excluded: duplicate | excluded: duplicate | 유회 통로 장면의 동일 프레임 |
| `PDF p019 X418` | PDF p019 second frame | 1035×503 | no — full PDF XObject | report-cutscene | excluded: p012 중복 구도 | excluded: p012 중복 구도 | excluded: duplicate | excluded: duplicate | excluded: duplicate | 같은 페이지 안의 유회 중복 프레임 |
| `PDF p020 X425` | PDF p020 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: p011 중복 구도 | excluded: p011 중복 구도 | excluded: duplicate | excluded: duplicate | excluded: duplicate | 모리아티·킴라박 장면의 동일 프레임 |
| `PDF p061 X1545` | PDF p061 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: p063이 행위를 더 잘 식별 | excluded: p063이 행위를 더 잘 식별 | excluded: report close-up only | excluded: 주사기 standalone 아님 | excluded: 신체 close-up | 이르마 상반신 반복 close-up |
| `PDF p062 X1562` | PDF p062 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: p063이 행위를 더 잘 식별 | excluded: p063이 행위를 더 잘 식별 | excluded: report close-up only | excluded: 주사기 standalone 아님 | excluded: 신체 close-up | p061과 같은 반복 close-up |
| `PDF p140 X3793` | PDF p140 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: p138 동일 프레임 | excluded: p138 동일 프레임 | excluded: duplicate | excluded: duplicate | excluded: duplicate | 마가렛 격리 장면의 동일 프레임 |

## Static Visibility And Link Plan

- staging report: `minRole: V`; mirror, `afterglow-being`, `afterglow-radiance-sample`은 비공개다.
- staging envelope는 filter·`$set`·postcondition에 `minRole: V` 또는 `isPublic: false`를 모두 고정한다. 같은 identity가 다른 공개 상태로 존재하면 update가 match되지 않고 unique identity/CAS 경계에서 중단되므로 새 본문을 stale 공개 레코드에 덮어쓰지 않는다.
- publication candidate: report를 `U`, mirror·신규 wiki·catalog를 공개로 전환한 뒤에만 기존 공개 wiki·Dossier에 세션 내용을 append한다.
- report와 mirror는 기존 공개 브랜드 watermark 1개만 같은 path·순서·alt·caption으로 사용한다. TIER-3 source frame은 인증된 asset consumer가 생기기 전까지 repository·`public/`에 발행하지 않는다.
- 보고서 구조화 참조에는 `s1e6-turning-point-part1`, `last-battalion`, `illuminati`, `aurora-virus`, `project-dead-hand`, `space-zero`, `inverted-sock`, `montauk-project-slaughter-hound`, `afterglow-being`과 `afterglow-radiance-sample`을 넣는다.
- `afterglow-being` 전용 wiki는 report·관련 기존 wiki·catalog를 명시 링크하고, catalog spec/payload는 report·개체 wiki 식별자를 본문에 보존한다.
- 모리아티와 광체는 renderer 대상이 없으므로 report에서 일반 텍스트로만 표기한다. 가짜 `personnel:` 링크를 만들지 않는다.

## Apply Plan

1. `nosb-s1e6-turning-point-part2-reference-targets.json`: 비공개 `afterglow-being` wiki와 비공개·비판매 `afterglow-radiance-sample` catalog를 staging.
2. `nosb-s1e6-turning-point-part2-sync.json`: `minRole: V` 보고서와 비공개 wiki mirror를 staging.
3. 각 단계는 live 실행 전 fresh dry-run과 target 존재 여부 재확인이 필요하다.
4. `nosb-s1e6-turning-point-part2-publication.json`: report `U`, mirror·신규 wiki·catalog 공개 전환과 기존 wiki·Dossier·관계·성격 관찰을 하나의 transaction 후보로 준비한다.
5. 이 문서 작성 시점에는 어떤 live DB mutation도 승인·실행되지 않았다.

## Remaining Decisions

1. `MORIARTY`: 전체 이름, codename, 정확한 faction·institution·department, 대령 역할의 agentLevel, no-image 여부, 공개 범위, 신상·서술·관계 승인.
2. `LIGHT_BODY_CHILD`: `광체`가 이름인지 종족명인지, canonical codename, 인간/NPC/개체 분류, 소속·권한등급 또는 외부 무등급, no-image 여부, 공개 범위, 신상·관계 승인.
3. 시각 후보: 잔광자·하이퍼보리아인 14·Montag-98·주주의 방주 로켓·마지막 대대·수메르 후속 장면을 전용 wiki archive 이미지로 쓰려면 별도 역할 승인과 인증된 asset consumer가 필요하다.
4. economy: 광채 표본 5개, 이르마 주사기, 잔광자 머리, NHI 문서의 exact ERP 수령자·공유 인벤토리 귀속·기존 ledger 반영 여부가 확인돼야 inventory mutation을 검토할 수 있다.
5. live 적용: 비공개 reference targets → V/private report staging → 별도 U/public publication 순서마다 최신 사용자의 정확한 target·mutation 실행 승인이 필요하다.
