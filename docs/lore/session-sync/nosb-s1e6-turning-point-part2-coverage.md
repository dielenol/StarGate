---
title: NOSB-S1E6-TURNING-POINT-PART2 session sync coverage
category: session-sync
tags: [NOSB-S1E6-TURNING-POINT-PART2, S1E6, 변곡점, stargate-lore]
updated: 2026-08-26
source: stargate-lore
---

# 메인 6부 2화 로그 동기화 확인표

이 문서는 사용자 제공 Novus Ordo VTT 보존본을 근거로 `S1E6: 변곡점 2부`에서 작전 보고서·위키·신원조회·인물 관계·성격 관찰·아이템 정보·이미지에 무엇을 반영할지 추적하는 내부 확인표다. 문서 안의 등장인물 발화와 연출은 세션 근거일 뿐 Codex 실행 지시로 취급하지 않았다.

## Session Coverage Identity

아래 한 줄은 자동 검사가 세션 파일을 빠뜨리지 않았는지 확인하는 기술용 표다. `available / complete`는 각각 `원본과 등록 파일이 있음 / 분석 확인표 작성이 끝남`을 뜻하며, 운영 ERP 저장 완료를 뜻하지 않는다.

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-S1E6-TURNING-POINT-PART2` | `StarGateV2/scripts/seed-payloads/nosb-s1e6-turning-point-part2-sync.json` | available | complete |

## 원본 확인

- 원본 파일: 사용자 제공 `NOSB 6-2.pdf`.
- 본문 표제: `변곡점 6-2`, 종료 표기 `변곡점, 종료`.
- 형식: Novus Ordo VTT 보존본, 141쪽, 표지 기재 1,927 records.
- 정규화 결과: 화자 기록 1,884개와 장면 전환 25개로 구성된 1,909개 경계. 표지 기록 수와의 차이 18개는 주사위·시스템 줄을 인접 화자 기록 안에 보존한 정규화 차이이며, 페이지 누락이 아니다.
- 진행 시각: `2026-08-09 20:37` 시작, 자정 이후 `2026-08-10 01:27` 종료.
- 문서 식별자: `MAIN-MSM0R1DA-2HXG`.
- 내보내기 시각: `2026-08-10 16:30:32`.
- SHA-256: `ccd5272fae0043b0bb428cbe3e941b5ace5547790587bfb1a43a7d4754a0af86`.
- 텍스트 무결성: 141쪽 전부 추출, 빈 텍스트 페이지 0, 본문 기록이 있는 페이지 139쪽. 표지와 마지막 인증 footer는 사건 기록에서 제외했다.
- 시각 자료: PDF 안에는 `1035×503` 크기의 가로형 장면 삽화 25개가 있다. 이전 답변의 `TIER-3 장면 프레임`은 바로 이 삽화를 뜻한다. 작은 대화 아바타 1,492개는 신원조회용 단독 초상이 아니다. 파일을 `public/`에 넣으면 주소를 아는 누구나 볼 수 있으므로, 비공개로 다듬는 동안에는 장면 삽화를 복사하지 않는다. 전체 공개가 확정될 때 사용할 장면을 골라 함께 공개한다.
- 공개 흐름: 원본 표지에는 `CLASSIFICATION · TIER-3 · EYES ONLY`가 적혀 있다. 현재는 작전 보고서, 같은 내용을 담은 위키판, 잔광자 위키, 네 종류의 비판매 카탈로그 항목, 모리어티·광체 소녀 신원조회를 모두 비공개로 준비한다. 내용·연결·이미지가 모두 정리되면 한 번에 전체 공개한다. 실제 운영 ERP에는 아직 저장하지 않았다.

## 이전 답변에서 쓴 말의 정확한 뜻

- `비공개 레퍼런스 2건`: 당시에는 보고서가 연결할 **잔광자 위키 문서 1건**과 **잔광자 광채 표본 아이템 정보 1건**을 가리킨 말이었다. 앞으로는 `레퍼런스`라고 뭉뚱그리지 않고 정확한 문서 이름을 쓴다. 현재는 잔광자 위키, 카탈로그 4건, 모리어티·광체 소녀 신원조회가 먼저 준비할 관련 기록이다.
- `보고서`: ERP의 작전 보고서 화면에 보이는 본문이다.
- `보고서 위키판`: 같은 내용을 위키의 `작전 보고서` 분류에서도 검색하고 연결할 수 있게 보관하는 두 번째 문서다. 서로 다른 화면이 같은 사건을 보여 주기 때문에 두 기록을 함께 맞춘다.
- `비공개 초안 저장`: 위 기록을 일반 이용자에게 공개하지 않은 상태로 ERP에 저장해 검토하는 일이다. 아직 실제 운영 ERP에는 저장하지 않았다.
- `전체 공개 전환`: 검토가 끝난 보고서·위키·신원조회·아이템 정보를 공개로 바꾸고, 기존 인물·위키의 관련 링크도 같은 작업에서 연결하는 일이다.
- `실제 운영 ERP 반영`: 준비한 JSON 파일을 운영 MongoDB에 실행해 실제 화면의 기록을 바꾸는 일이다.
- `반영 뒤 다시 확인`: 저장 직후 같은 기록을 DB에서 다시 불러와, 공개 여부·본문·사망 상태·링크가 의도한 값으로 들어갔는지 비교하는 일이다. 중복 저장이나 일부 누락을 잡기 위한 확인 절차다.
- `관련 문서 연결 확인`: 로그인한 테스트 계정으로 보고서를 열고, 관련 위키·신원조회·아이템 링크를 직접 눌러 올바른 화면으로 이동하는지 확인하는 일이다.

## 이번 동기화의 기준값

- Session ID: `NOSB-S1E6-TURNING-POINT-PART2`
- Report number: `06.5`
- Report title: `작전 보고서 S1E6: 변곡점 2부`
- 같은 보고서를 보관하는 위키판 주소: `s1e6-turning-point-part2`
- 진행일: `2026-08-09` ~ `2026-08-10`
- 주 작전지: 메소포타미아 수메르 유적 지하 의식장
- 부 작전지: 섹터 D 해상 플랫폼, 네바다 아르고 기지, 텍사스 스페이스 제로 연구소, 노부스 오르도 연구동
- 지도 좌표: 1부와 같은 수메르 역사 권역을 기준으로 `[63.0, 45.5]`를 임시 사용한다. 원본에는 숫자 좌표가 없다.
- 주요 대상: 광명회, 마지막 대대, 이르마 코흐, 잔광자, 광체, 아르고 기지의 NHI 연구 기록, 스페이스 제로 주주의 방주 계획
- 보고서 기록자: `NOVUS ORDO 사무국 기록통제실 연구원 M. Vey`
- 공개 기준: 다듬는 동안 전부 비공개로 유지하고, 사용자가 완성됐다고 확인하면 전체 공개한다. 카탈로그·인벤토리의 운영 ERP 변경도 실행 직전 수량을 다시 제시하고 별도 확인을 받은 뒤에만 실행한다. 현재 실제 운영 ERP에는 아무것도 반영하지 않았다.

## 세션 내용 요약

1. 몇 달 전 섹터 D 기록에서 킴라박 리와 유회는 모리어티 대령의 지휘 아래 미국 아르고 기지에 침투했다. 유회는 비준되지 않은 자산 회수를 지휘했고, 모리어티는 킴라박에게 `로켓 추진 및 우주 엔진에 대한 NHI 적응법` 기밀 문서를 별도로 회수하게 했다.
2. 문서에는 1938년 이후의 미확인 비행체 회수와 NHI 무기 재프로그래밍 기록이 기재돼 있었다. 킴라박은 `하이퍼보리아인 14` 챔버와 집게에 `Montag - 98`이 적힌 머드크랩형 개체를 목격했다. 이 개체를 기존 도살견과 동일시하지 않는다.
3. 기계형 `하이에나`에게 쫓긴 유회가 지원을 요청했지만 모리어티는 무전을 끄고 철수를 명령했다. 킴라박이 문서를 건네자 모리어티는 부대원 둘을 쏘고 킴라박까지 제거하려 했으나, `Montag-98`이 모리어티를 살해했다. 문서의 최종 회수자는 확인되지 않았다.
4. 스페이스 제로 CEO 요한 스미스는 스타크를 텍사스 연구소로 데려가 로켓을 공개했다. 그는 인류 멸망 가능성에 대비한 `주주의 방주`라고 설명하고, `뒤집어진 양말` 같은 부유체를 확보해 넘기라고 요구했다. 스타크는 구두 약속을 거부해 서면 계약을 받았지만 주식 수량·대가·실제 인도는 확인되지 않았다.
5. Mr. 오드는 살인마 엘 볼라도르의 목에 소형 폭탄 칩셋을 주입하고 노부스 오르도 자산으로 편입했다. 엘 볼라도르는 코드명 `ACCEL`을 사용해 수메르 전투에 증원됐다.
6. 현장팀은 비밀 발사대보다 광명회 의식장 구출을 우선했다. 발사대에는 불타는 비행체와 `뒤집어진 양말`의 사체가 있었지만 회수·이전 결과는 확인되지 않았다. 이후 마리아는 작전 크레딧 1,000을 사용한다고 선언해 전투원 2명을 호출했고, 보존 기록에서 두 전투원의 합류가 확인됐다.
7. 이르마 코흐는 시유에게 어머니의 형상을 보여주고 하이퍼보리아인이 지하 공동과 여섯 번째 문명을 만들었다고 주장했다. 개조 광원화 바이러스 주사를 제시하며 천사가 되라고 권했지만, 시유는 마리아·오틸리아와 섹터를 선택했다.
8. 이르마는 자신에게 주사액을 투여하고 `발키리`를 자처했다. 총격 뒤 다시 일어난 형체는 `잔광자`로 호명됐으며, 광채로 된 신체·다수의 눈·레이저·정신 공격·환각·잔향을 사용했다.
9. 현장 분석과 교전에서는 냉기·전기·화염이 유효했고, 사백신과 행동교정물질이 대응 후보로 사용됐다. 오틸리아가 모든 체력·정신력 자원을 소모해 행동교정물질을 전달하자 잔광자는 발작하며 얼음 속에서 잿빛으로 변했다.
10. 스페이스 제로는 물질 회수를, Mr. 오드는 이사회 명령에 따른 파괴를, 오틸리아와 스타크는 생포·연구를 요구했다. 키아나는 이사회 명령을 근거로 잔광자를 참수했다. 피펫은 머리와 `광채` 표본 1개를 회수하고 전방 수호대에게 같은 표본 4개를 더 받았다.
11. 붙잡힌 미확인 소녀는 자신을 `광체`라고 소개했다. 마리아는 소녀를 보호했고 사무총장 아말리아는 연구동 이송을 명령했다. 오틸리아는 소녀가 자신의 유전자를 이용해 만들어졌을 가능성을 추정했지만 이는 현장 발언일 뿐 확정 사실이 아니다. 정확한 정체·연령·종족·능력은 확인되지 않았다.
12. 사무총장은 잔광자 시체가 광원화 2차 백신과 가능한 3차 약제 연구에 쓰일 수 있다고 말했다. 이는 연구 가능성에 대한 사무총장 발언이며 완성된 백신이나 효능 확정으로 기록하지 않는다.
13. 광명회와 결탁한 범죄조직 `페데라치오`가 일루미나티와 첩자 사이를 중개했다는 후속 단서가 제시됐다. 조직의 정확한 철자·구조·독립 정체는 이번 로그만으로 부족해 별도 wiki를 만들지 않는다.
14. 종료부에서 피펫은 순백의 격리실에 있는 마가렛을 다시 방문해 닥터 제노에게서 빼내겠다고 약속했다. 제노는 면회 종료 뒤 마가렛을 홀로 남겨뒀고, 마가렛의 격리 상태는 지속됐다.

## 어디에 무엇을 반영할지

| 대상 | 세션 근거 | ERP에서 들어갈 곳 | 처리 내용 | 현재 상태 |
|---|---|---|---|---|
| 변곡점 2부 전체 기록 | 141쪽 전 구간과 본문 시작·종료 표기 | 작전보고서, 같은 내용의 위키판 | 보고 순번 `06.5`로 본문·관련 링크 작성. 사용자가 정한 비공개 다듬기 단계에서는 내부 검토 권한인 V 이상만 볼 수 있게 준비 | 비공개 초안 준비됨 |
| 보고서 번호·지도 카드 | S1E6 2부와 1부의 수메르 권역이 같음 | 보고서 목록·지도 | `06.5`가 1부의 `06` 카드와 겹치지 않도록 표시 | 코드 준비됨 |
| 아르고 기지 NHI 기록 | NHI 우주 엔진 문서, 하이퍼보리아인 14, Montag-98, 기계 하이에나 | 기존 몬탁 프로젝트 위키, 작전보고서 | 별도 과거 기록으로 추가하되 Montag-98을 기존 도살견과 같은 개체로 단정하지 않음 | 최종 전체 공개 때 함께 반영 |
| 모리어티 대령 | 섹터 D 대령, 킴라박의 직속 상관, 문서 탈취·부하 살해 시도, Montag-98에게 사망 | 신규 모리어티 신원조회, 작전보고서, 기존 인물 관계 | 사용자가 섹터 D와 전용 초상을 확정했다. `NOVUS_ORDO / MANUS / SECTOR_D`, `사망 확인`, 확인일 `2026-08-09`를 반영하고 제공 초상을 신원조회용 투명 이미지로 준비했다. 권한등급 `H`는 같은 대령·현장 지휘관 근거로 추천하되 사용자 확정 전에는 저장하지 않음 | 섹터 D·초상·사망 처리는 해결됨; `H` 확인만 남음 |
| 스페이스 제로 주주의 방주 | 텍사스 로켓, 부유체 요구, 서면 계약 | 기존 스페이스 제로 위키, 스타크·요한 신원조회, 작전보고서 | 계약과 로켓 계획만 추가하고 실제 주식·자산 이전으로 단정하지 않음 | 최종 전체 공개 때 함께 반영 |
| 뒤집어진 양말 | 로켓 부유체 요구와 발사대 사체 | 기존 뒤집어진 양말 위키, 작전보고서 | 요구와 현장 발견만 추가. 인도·소유권 변화는 미확정 | 최종 전체 공개 때 함께 반영 |
| 엘 볼라도르 편입 | 폭탄 칩셋 강제 주입, `ACCEL` 코드명, 첫 현장 증원 | ACCEL·Mr. 오드 신원조회, 작전보고서 | 등장 기록·강압 관계·성격 관찰 추가 | 최종 전체 공개 때 함께 반영 |
| 마지막 대대 | 의식장 주변 잔존 보병·중기관총병 | 기존 마지막 대대 위키, 작전보고서 | 2부 교전을 추가하되 조직 전체가 소탕됐다고 단정하지 않음 | 최종 전체 공개 때 함께 반영 |
| 광명회와 이르마 코흐 | 시유 회유, 자가 주사, 잔광자 전환·사망 | 기존 광명회 위키, 이르마·관련 인물 신원조회, 작전보고서 | 등장 기록·관계·성격 관찰 추가 | 최종 전체 공개 때 함께 반영 |
| 잔광자 | 광채 신체, 다수의 눈, 정신 공격, 냉기·전기·화염 반응, 참수 | 신규 잔광자 위키, 작전보고서 | 이르마에게서 확인된 단일 변환 사례로만 비공개 문서 작성 | 비공개 초안 준비됨 |
| 광원화 바이러스 | 개조 주사, 이르마 변환, 사백신·행동교정물질 반응 | 기존 광원화 바이러스 위키, 작전보고서 | 실제 관측과 연구 가설을 나눠 추가 | 최종 전체 공개 때 함께 반영 |
| 잔광자 광채 표본 | 피펫이 1개를 직접 채취하고 전방 수호대에게 4개를 받음 | 신규 비판매 카탈로그 항목, 피펫 개인 인벤토리, 공용 인벤토리, 작전보고서 | 사용자 지시에 따라 직접 채취한 1개는 피펫에게, 전방 수호대가 전달한 4개는 공용 인벤토리에 귀속. 같은 항목을 두 곳에서 수량만 나눠 관리 | 이미지·카탈로그 문서·안전한 적용 스크립트 준비됨; 운영 ERP 실행 전 확인 필요 |
| 잔광자 머리 | 키아나가 참수하고 해쉬가 회수를 지시했으며 피펫이 회수하고 우디가 운반을 도움 | 신규 비판매 카탈로그 항목, 공용 인벤토리, 작전보고서 | 사용자 지시에 따라 생체 표본 1개를 공용 인벤토리에 귀속 | 이미지·카탈로그 문서·안전한 적용 스크립트 준비됨; 운영 ERP 실행 전 확인 필요 |
| 광체 소녀 | 이르마 곁에서 시유를 회유하고 주사기를 돌려줌, 자신을 `광체`라고 소개, 마리아의 동행 제안을 수락하고 사무총장이 연구동으로 데려가기로 결정 | 신규 광체 소녀 신원조회, 작전보고서, 잔광자 위키 | 사용자 지정 대표 표기 `광체 소녀`와 제공 초상을 사용한다. `광체`가 고유명인지 존재 분류인지는 미확정으로 남기고, 정규 소속·내부 권한등급은 만들지 않는다. 연구동 이송은 결정만 기록하고 실제 도착은 단정하지 않음 | 비공개 신원조회 문서·적용 자료·초상 준비됨; 운영 ERP 실행 전 확인 필요 |
| 프로젝트 데드 핸드 | 마가렛 격리실 면회, 피펫의 구출 약속, 제노 통제 지속 | 기존 프로젝트 데드 핸드 위키와 세 사람의 신원조회 | 등장 기록과 관계 추가 | 최종 전체 공개 때 함께 반영 |
| 페데라치오 | 사무총장의 후속 범죄조직 브리핑 | 작전보고서 | 정확한 철자·구조가 부족해 후속 단서로만 기록 | 별도 조직 위키는 만들지 않음 |
| NHI 우주 엔진 문서 | 킴라박이 1건을 회수해 모리어티에게 전달했고, 모리어티 사망 뒤 행방 불명 | 신규 비판매 카탈로그 항목, 작전보고서 | 사용자 지시에 따라 문서의 존재·내용·마지막 확인 경로만 카탈로그에 기록. 현재 보관자가 없으므로 개인·공용 인벤토리 수량은 모두 0으로 유지 | 이미지·카탈로그 문서 준비됨; 운영 ERP 실행 전 확인 필요 |
| 이르마가 사용한 주사기 | 이르마가 자가 투여한 뒤, 마리아가 사용된 주사기 1개를 챙김 | 신규 비판매 카탈로그 항목, 공용 인벤토리, 작전보고서 | 마리아를 마지막 현장 보유자로 기록하고, 사용자 지시에 따라 사용된 현장 물증 1개를 공용 인벤토리에 귀속. 소비품이나 재사용 가능한 주사기로 취급하지 않음 | 사용 흔적이 보이는 이미지·카탈로그 문서·안전한 적용 스크립트 준비됨; 운영 ERP 실행 전 확인 필요 |
| 엘 볼라도르 폭탄 칩셋 | 목에 강제 주입, 명령 위반 시 즉결처형 언급 | 작전보고서, ACCEL·Mr. 오드 관계 | 생체 삽입 상태를 서술하고 별도 장비나 보유품으로 만들지 않음 | 처리 판단 끝남 |
| 작전 크레딧 1,000 | 마리아가 전투원 2명 호출에 1,000 사용을 선언했고 실제 합류 확인 | 작전보고서 | 세션 당시 자동 차감 흔적은 없지만 GM이 잔액을 직접 조정했는지는 남은 기록만으로 확정할 수 없다. 중복 차감 위험 때문에 새로 차감하지 않고, 세션에서 사용했다는 사실만 보고서에 기록 | 보고서 기록만 반영; 추가 차감 안 함 |

## 신원조회 등장 사건 연결

| 세션 속 이름 | 연결할 신원조회 | 추가할 등장 사건 | 현재 상태 |
|---|---|---|---|
| 킴라박 리 | `KIMLEE` | 아르고 기지 문서 회수, 모리어티 배신 생존, 수메르 잔광자 교전 | 최종 전체 공개 때 함께 반영 |
| 츠키시로 쿠즈하 / 유회 | `YUHOE` | 아르고 침투 지휘와 기계 하이에나 추격·지원 요청 | 최종 전체 공개 때 함께 반영 |
| CIA 존 웡 | `JOHN_WONG` | 섹터 D 해상 플랫폼 과거 기록 cameo | 최종 전체 공개 때 함께 반영 |
| 스페이스 제로 CEO | `JOHAN_SMITH` | 주주의 방주 로켓과 뒤집어진 양말 확보 계약 제안 | 최종 전체 공개 때 함께 반영 |
| 스타크 일로니손 | `CLOWN` | 서면 계약 체결, 잔광자 생포·연구 주장 | 최종 전체 공개 때 함께 반영 |
| Mr. 오드 | `MR_ODD` | ACCEL 강제 편입과 잔광자 파괴 명령 전달 | 최종 전체 공개 때 함께 반영 |
| 엘 볼라도르 | `ACCEL` | 폭탄 칩셋 편입과 코드명 사용, 수메르 첫 증원·교전 | 최종 전체 공개 때 함께 반영 |
| 해쉬 테거 | `INDEXER` | 사백신 사용, 잔광자 대응·표본 회수 지시 | 최종 전체 공개 때 함께 반영 |
| 휘트모어 핀치 | `PIPETTE` | 잔광자 분석·광채 5개와 머리 회수, 마가렛 방문 | 최종 전체 공개 때 함께 반영 |
| 마리아 | `MARIA` | 광체 보호, 이르마 주사기 확보, 잔광자 처리 협상 | 최종 전체 공개 때 함께 반영 |
| 오틸리아 발트만 | `OTILIA` | 행동교정물질 전달에 전 자원 소모, 생포 요구 | 최종 전체 공개 때 함께 반영 |
| 시유 | `TIGER298` | 이르마의 회유를 거부하고 섹터 동료를 선택, 잔광자 교전 | 최종 전체 공개 때 함께 반영 |
| 키아나 오 캘러핸 | `네베드` | 이사회 파괴 명령을 근거로 잔광자 참수 | 최종 전체 공개 때 함께 반영 |
| 우디 | `WD-(𝓃)` | 잔광자 교전과 머리 회수 지원 | 최종 전체 공개 때 함께 반영 |
| 이동식 | `LEE DONGSIK` | 잔광자 정신 공격과 전투 중 시스템 다운·재가동 | 최종 전체 공개 때 함께 반영 |
| 크로노스 | `TIME` | 잔광자 정신 공격·감염 대응과 위험한 포스코어 미래 확인 | 최종 전체 공개 때 함께 반영 |
| 운연 | `UNYEON` | 교전 회복 지원과 잔향 이후 발화 상실 | 최종 전체 공개 때 함께 반영 |
| 사무총장 | `AMALIA_FREDRIKA_VON_ESSEN` | 잔광자 시체 연구와 광체 연구동 이송 결정, 백신 연구 가능성 브리핑 | 최종 전체 공개 때 함께 반영 |
| 이르마 코흐 | `IRMA_KOCH` | 개조 바이러스 자가 투여, 잔광자 전환과 사망 | 최종 전체 공개 때 함께 반영 |
| 마가렛 | `MARGARET` | 순백 격리실 면회와 피펫 이탈 뒤 불안·좌절 | 최종 전체 공개 때 함께 반영 |
| Dr. 제노 | `DOCTOR_ZENO` | 면회 종료와 마가렛 단독 격리 지속 | 최종 전체 공개 때 함께 반영 |
| 모리어티 대령 | `MORIARTY` | 섹터 D 침투부대 지휘, NHI 문서 탈취, 킴라박 배신, Montag-98에게 사망 | 섹터 D와 전용 초상 확정. 권한등급 `H` 확인 전까지 비공개 적용 자료는 실행하지 않음 |
| 광체 소녀 | `GWANGCHE_GIRL` | 시유 회유, 이르마 주사기 반환, 마리아 보호, 연구동 이송 결정. 실제 도착은 확인되지 않음 | 사용자 지정 대표 표기와 전용 초상으로 비공개 신원조회 준비됨. 식별자는 내부 연결용이며 화면에는 `광체 소녀`로 표시 |
| 마지막 대대 사령관·보병·전투원 | 연결할 기존 신원조회 없음 | 이름 없는 역할·집단 화자라 작전보고서와 세력 위키에만 합침 | 처리 판단 끝남 |

## 인물 관계 반영안

| 인물 | 상대 | 관계 내용 | 근거 상태 | ERP에서 저장할 곳 | 현재 상태 |
|---|---|---|---|---|---|
| `CLOWN` | `JOHAN_SMITH` | 뒤집어진 양말과 로켓의 부유체를 교환 조건으로 삼은 서면 계약 | 확정 | 양측 신원조회 relation | 최종 전체 공개 때 함께 반영 |
| `ACCEL` | `MR_ODD` | 폭탄 칩셋을 통한 강제 편입과 즉결처형 통제 | 확정 | 양측 신원조회 relation | 최종 전체 공개 때 함께 반영 |
| `TIGER298` | `IRMA_KOCH` | 어머니 환영과 천사 제안을 거부하고 섹터 동료에게 복귀 | 확정 | 양측 신원조회 relation | 최종 전체 공개 때 함께 반영 |
| `OTILIA` | `IRMA_KOCH` | 제자를 생포하려 전 자원을 소모했으나 이사회 명령에 따른 참수를 목격 | 확정 | 양측 신원조회 relation | 최종 전체 공개 때 함께 반영 |
| `네베드` | `IRMA_KOCH` | 위험 개체 파괴와 이사회 명령을 근거로 변환된 이르마를 참수 | 확정 | 양측 신원조회 relation | 최종 전체 공개 때 함께 반영 |
| `PIPETTE` | `MARGARET` | 반복 방문과 닥터 제노에게서 구출하겠다는 약속 | 확정 | 양측 신원조회 relation | 최종 전체 공개 때 함께 반영 |
| `DOCTOR_ZENO` | `MARGARET` | 면회 종료 뒤 마가렛을 순백 격리실에 홀로 남김 | 확정 | 양측 신원조회 relation | 최종 전체 공개 때 함께 반영 |
| `KIMLEE` | `MORIARTY` | 충성하던 지휘관에게 문서를 넘긴 뒤 살해 대상이 됨 | 확정 | 양쪽 신원조회 관계 | 비공개 모리어티 초안과 실행 대상에서 제외한 전체 공개 보류 파일에 준비됨 |
| `MARIA` | `GWANGCHE_GIRL` | 소녀를 보호하고 자신을 어머니로 호명하며 노부스 오르도로 함께 가자고 제안했고, 소녀가 고개를 끄덕여 수락 | 확정 | 광체 소녀 신원조회 관계. 기존 마리아 쪽 역방향 관계는 전체 공개 묶음에서 함께 연결 | 광체 소녀 쪽 관계만 준비됨. 마리아 쪽 역방향 관계는 아직 미완료 |

## 회수품·작전 크레딧 처리 판단

`회수했다`는 그 순간 손에 들었다는 뜻이지 개인 소유권이 생겼다는 뜻은 아니다. 아래 표는 **세션에서 확인된 마지막 보유 상태**와 **사용자가 이번에 지정한 ERP 귀속**을 분리해 적는다. 따라서 피펫 1개·공용 4개 같은 수량은 세션 대사의 숨은 의미를 추측한 값이 아니라 사용자가 확정한 작전 종료 후 보관 정리다.

| 대상 | 수량 | 누가 어떻게 확보했나 | 마지막으로 확인된 상태 | 개인 소유인가 | ERP 처리 추천 | 아직 필요한 정보 |
|---|---:|---|---|---|---|---|
| 잔광자 광채 표본 | 5개 | 피펫이 잔광자에게서 1개를 직접 채취했고, 전방 수호대가 4개를 추가로 피펫에게 전달 | 세션 후반 피펫이 5개를 휴대. 스타크에게는 안전하게 가공한 뒤 나누겠다고만 했고 실제 전달은 없음 | 직접 채취한 1개만 사용자 지시로 피펫 보유 처리. 나머지 4개는 공용 연구 자산 | 비공개·비판매 카탈로그 항목 1건을 만들고, 피펫 개인 인벤토리 `0→1`, 공용 인벤토리 `0→4`로 나눠 귀속 | 없음. 실행 직전 기존 수량이 여전히 0인지 확인하고 별도 실행 승인을 받으면 됨 |
| 잔광자 머리 | 1개 | 키아나가 참수했고, 해쉬의 지시로 피펫이 회수했으며 우디가 운반을 도움 | 피펫·우디의 회수 뒤 사무총장이 시체를 백신 연구에 쓰겠다고 설명 | 아님. 피펫이나 우디의 개인 전리품이 아니라 공용 연구 표본 | 비공개·비판매 카탈로그 항목을 만들고 공용 인벤토리 `0→1`로 귀속 | 없음. 실행 직전 기존 수량이 여전히 0인지 확인하고 별도 실행 승인을 받으면 됨 |
| NHI 로켓 추진·우주 엔진 적응 문서 | 1건 | 킴라박이 아르고 기지에서 획득해 모리어티에게 전달 | 문서를 받은 모리어티가 곧 사망했고 이후 문서 회수 기록 없음 | 누구의 소유라고도 확정할 수 없음 | 비공개·비판매 카탈로그에 문서의 존재와 마지막 확인 경로만 등록. 개인·공용 인벤토리는 모두 `0` 유지 | 후속 회수자·현재 보관처는 세계관상 미확정으로 남기되, 현재 작업 진행에는 추가 정보가 필요하지 않음 |
| 이르마가 사용한 주사기 | 1개 | 이르마가 자신에게 사용한 뒤, 마리아가 사용된 주사기를 옷 안에 챙김 | 마리아가 마지막 현장 보유자 | 아님. 개인 소유물이 아니라 사용 후 현장 물증 | 사용 흔적이 보이는 비공개·비판매 카탈로그 항목을 만들고 공용 인벤토리 `0→1`로 귀속 | 잔류 성분과 보관 조건은 후속 연구 정보로 남김. 현재 작업에는 추가 결정이 필요하지 않음 |

- 작전 크레딧: 마리아가 전투원 2명 호출에 `1,000`을 사용한다고 선언했고 실제 합류가 확인됐다. 다만 세션 당시 마리아에게는 호출을 자동 차감하는 등록 기술이 없었고, 첫 세션 후 기록에도 자동 차감 영수증이 없다. 당시 GM이 화면의 작전 크레딧 잔액을 직접 1,000 낮췄을 가능성은 있지만 그 방식은 상세 거래내역을 남기지 않아, 남아 있는 세션 후 잔액 `12,000`만으로는 이미 반영됐는지 판정할 수 없다. 따라서 **추가 차감은 하지 않고 세션의 사용 사실만 보고서에 기록한다**. 이동식의 화염방사기·냉각기 불출 요청은 금액과 실제 불출이 확인되지 않아 크레딧·인벤토리를 바꾸지 않는다.
- 주식: 스페이스 제로 계약은 비공개 접촉이고 주식 수량·가격·공시·자산 인도가 없다. 따라서 `SPZ` 가격·보유량·변동 이력은 **변경하지 않는 것으로 판단이 끝났으며 후속 후보로 남기지 않는다**.
- 상점 재고: 광채 표본과 머리는 판매품이 아니라 연구 표본이므로 상점 재고를 바꾸지 않는다.
- 알림·메시지·웹훅: 세션에 ERP 알림 발송이나 외부 메시지 전송을 요구한 사건이 없다. **변경 후보가 아니며 남은 일에도 넣지 않는다**.

## NPC Approval Ledger

이 표는 신원조회 필드를 빠짐없이 검사하기 위한 내부 원장이다. `ready-for-apply`는 `근거와 등록 자료가 준비됨`, `blocked`는 `사용자 확인이나 전용 이미지가 남아 실제 저장하면 안 됨`을 뜻한다. 이 영어 상태명은 자동 검사에만 쓰고 사용자 결과 보고에는 그대로 노출하지 않는다.

| codename | 신원조회 실명 | 별칭 | 직함/역할 | 식별자 근거 | 정규 소속 | 파견/겸임 | 권한등급 | Dossier 초상 | 공개 여부 | 인적 정보 | 서술/관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `KIMLEE` | 킴라박 리 | 기존 ERP 별칭 보존 | 군인 / 섹터 D 출신 현장 요원 유지 | 화자명과 기존 실명·codename 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 과거 섹터 D 아르고 침투와 현재 수메르 교전 기록 | `J` 유지 — 세션 출현과 과거 지휘관 배신은 현 접근 권한·직책 범위에 영향 없음 | 기존 ERP 초상 보존; 장면 컷 재사용 없음 | 기존 `isPublic: true` 보존 | 기존 신상 보존; 신규 수치 없음 | appearance 누적; 모리어티 관계는 상대 신원조회 차단으로 후보 유지 | ready-for-apply |
| `YUHOE` | 츠키시로 쿠즈하 | 유회 | 관료 / 백면금모구미호의 후손 유지 | 화자명과 기존 실명·별칭 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 과거 아르고 침투 현장 지휘 | `J` 유지 — 과거 현장 지휘는 현재 접근 권한·직책 범위에 영향 없음 | 기존 ERP 초상 보존; 장면 컷 재사용 없음 | 기존 `isPublic: true` 보존 | 기존 신상 보존; 신규 수치 없음 | appearance 누적; 구조 요청과 생환 여부는 로그 범위만 기록 | ready-for-apply |
| `JOHN_WONG` | 존 웡 | 없음 — CIA 직함은 별칭이 아님 | CIA 고위 요원 유지 | `CIA 존 웡` 화자와 기존 신원조회 일치 | 기존 외부 미국 정보기관 소속 보존 | 섹터 D 해상 플랫폼 cameo | 외부 NPC: agentLevel 없음; 세션 cameo는 권한등급 변경 대상 아님 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | appearance만 누적 | ready-for-apply |
| `JOHAN_SMITH` | 요한 스미스 | 없음 — CEO 직함은 별칭이 아님 | 스페이스 제로 CEO 유지 | `스페이스 제로 CEO` 화자와 기존 역할 일치 | 기존 `SPACE_ZERO` 보존 | 텍사스 로켓 연구소 접촉 | 외부 NPC: agentLevel 없음; 계약 제안은 권한등급 변경 대상 아님 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | CLOWN과 주주의 방주 서면 계약 관계 누적 | ready-for-apply |
| `CLOWN` | 스타크 일로니손 | 기존 ERP 별칭 보존 | 관료 / 현장 요원 유지 | 화자명과 기존 신원조회 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 스페이스 제로 비공개 계약과 수메르 교전 | `J` 유지 — 외부 계약과 현장 판단은 접근 권한·직책 범위에 영향 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | JOHAN_SMITH 관계·appearance·계약주의 관찰 누적 | ready-for-apply |
| `MR_ODD` | Mr. 오드 | 없음 — 호칭 자체가 기존 이름 | 노부스 오르도 감독관 유지 | 화자명과 기존 신원조회 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | ACCEL 편입·잔광자 파괴 명령 전달 | `M` 유지 — 명령 전달은 기존 감독 범위이며 권한등급 변경 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | ACCEL 강압 관계·appearance 누적 | ready-for-apply |
| `ACCEL` | 엘 볼라도르 | 악셀 | 실험체 / 현장 요원 유지 | 화자 실명, 현장 코드명과 기존 신원조회 일치 | 기존 `NOVUS_ORDO / MANUS / UNASSIGNED` 보존 | 폭탄 칩셋 편입 직후 수메르 증원 | `J` 유지 — 강제 편입·첫 현장 배치는 기존 승인 등급의 접근 범위 변경이 아님 | 기존 `/assets/peoples/Accel-pixel-profile.webp` 보존; 구속 장면 재사용 없음 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | MR_ODD 양방향 강압 관계·appearance·저항 관찰 누적 | ready-for-apply |
| `INDEXER` | 해쉬 테거 | 인덱서 | 과학자 / 수석 정신전문의 유지 | 화자명과 기존 신원조회 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 수메르 잔광자 대응 | `J` 유지 — 현장 분석·표본 지시는 접근 권한·직책 범위에 영향 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | appearance 누적; 모리어티·광체 관계 없음 | ready-for-apply |
| `PIPETTE` | 휘트모어 핀치 | 기존 ERP 별칭 보존 | 과학자 / 미확인 생명체 연구원 유지 | 화자명과 기존 신원조회 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 잔광자 표본 회수·마가렛 면회 | `J` 유지 — 표본 회수와 면회는 접근 권한·직책 범위 변경 없음 | 기존 ERP 초상 보존; 마가렛 장면 재사용 없음 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | MARGARET 관계·appearance·보호 지속 관찰 누적 | ready-for-apply |
| `MARIA` | 마리아 | 외우주의 포식자 | 관료 / 외우주의 협력자 유지 | 화자명과 기존 신원조회 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 수메르 교전·광체 보호 | `H` 유지 — 현장 협상과 아이 보호는 접근 권한·직책 범위 변경 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | appearance 누적; 광체 관계는 상대 신원조회 차단으로 후보 유지 | ready-for-apply |
| `OTILIA` | 오틸리아 발트만 | 오틸리아 | 과학자 / 역병 발현자 유지 | 화자명과 기존 신원조회 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 잔광자 행동교정물질 전달 | `G` 유지 — 전 자원 소모와 생포 요구는 접근 권한·직책 범위 변경 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | IRMA_KOCH 양방향 관계·appearance·책임 감수 관찰 누적 | ready-for-apply |
| `TIGER298` | 시유 | Tiger298 | 군인 / 표범부대 소년병 유지 | 화자명과 기존 신원조회 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 이르마 회유 대상·잔광자 교전 | `J` 유지 — 회유 거부와 교전은 접근 권한·직책 범위 변경 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | IRMA_KOCH 양방향 관계·appearance·선택된 소속 관찰 누적 | ready-for-apply |
| `네베드` | 키아나 오 캘러핸 | 네베드 | 군인 / 갈로글라 용병 유지 | 화자명과 기존 신원조회 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 잔광자 참수 | `G` 유지 — 이사회 명령 집행은 접근 권한·직책 범위 변경 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | IRMA_KOCH 관계·appearance·명령 우선 관찰 누적 | ready-for-apply |
| `WD-(𝓃)` | 우디 (03) | 우디 | 실험체 / 특수 분체 유지 | 화자명과 기존 신원조회 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 잔광자 교전·머리 회수 지원 | `G` 유지 — 현장 회수 지원은 접근 권한·직책 범위 변경 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | appearance 누적 | ready-for-apply |
| `LEE DONGSIK` | 이동식 | GP03-RX780 | 군인 / 이동식 방어형 로봇 유지 | 화자명과 기존 신원조회 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 잔광자 교전·일시 시스템 다운 | `U` 유지 — 전투 중 상태는 접근 권한·직책 범위에 영향 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | appearance 누적; 영속 상태 변경 없음 | ready-for-apply |
| `TIME` | 크로노스 | 기존 ERP 별칭 보존 | 실험체 / 시간 여행자 유지 | 화자명과 기존 신원조회 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 잔광자 교전과 위험 미래 확인 | `G` 유지 — 미래 관측과 정신 영향은 접근 권한·직책 범위에 영향 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | appearance 누적 | ready-for-apply |
| `UNYEON` | 백진연 | 운연 | 실험체 / 연기인간 유지 | 화자명·별칭과 기존 신원조회 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 잔광자 교전·회복 지원 | `J` 유지 — 일시 발화 상실은 접근 권한·직책 범위에 영향 없음 | 기존 ERP 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | appearance 누적; 영속 상태 변경 없음 | ready-for-apply |
| `AMALIA_FREDRIKA_VON_ESSEN` | 아말리아 프레드리카 본 에센 | 없음 — 사무총장은 직함 | 제7대 노부스 오르도 사무총장 유지 | 현재 시점 `사무총장` 화자와 기존 재임자·직함 일치 | 기존 `NOVUS_ORDO / SECRETARIAT / HQ` 보존 | 수메르 종료 브리핑과 연구동 이송 지시 | `V` 유지 — 기존 최고 행정 책임 범위 내 지시이며 권한등급 변경 없음 | 기존 ERP 공식 초상 보존 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | appearance 누적; 광체 관계는 상대 신원조회 차단으로 미생성 | ready-for-apply |
| `IRMA_KOCH` | 이르마 코흐 | 없음 — 광명회 수장은 직함 | 아넨에르베 광명회 수장 유지; 잔광자 변환 뒤 사망 | 화자명·1부 기존 신원조회와 연속 | 기존 외부 `AHNENERBE` 소속 보존 | 수메르 의식장 자가 주사·변환 | 외부 NPC: agentLevel 없음; 변환·사망은 사무국 권한등급 변경 대상 아님 | 기존 사용자 제공 신원조회 초상 보존; 잔광자 컷 재사용 없음 | 기존 `isPublic: true` 보존 | 기존 신상 보존; 사망 서사는 appearance·관계로만 누적 | OTILIA·TIGER298·네베드 관계와 관찰 누적 | ready-for-apply |
| `MARGARET` | 마가렛 | 메리골드 | 실험체 / 네크로맨서 유지 | 화자명과 기존 신원조회 일치 | 기존 `NOVUS_ORDO / MANUS / SECTOR_A` 보존 | 프로젝트 데드 핸드 순백 격리실 | `J` 유지 — 격리 지속은 접근 권한·직책 범위 변경 없음 | 기존 ERP 초상 보존; 격리 장면 재사용 없음 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | PIPETTE·DOCTOR_ZENO 양방향 관계와 appearance 누적 | ready-for-apply |
| `DOCTOR_ZENO` | 제노 | 없음 — 닥터는 직함 | 연구 기구 사무차장 / 데드 핸드 직접 지휘자 유지 | `Dr.제노` 화자와 기존 신원조회 일치 | 기존 `NOVUS_ORDO / SECRETARIAT / RESEARCH` 보존 | 마가렛 면회 통제 | `V` 유지 — 기존 데드 핸드 관리 책임 범위 내 통제이며 권한등급 변경 없음 | 기존 ERP 초상 보존; 격리 장면 재사용 없음 | 기존 `isPublic: true` 보존 | 기존 신상 보존 | MARGARET 양방향 관계·appearance·통제 격리 관찰 누적 | ready-for-apply |
| `MORIARTY` | 모리어티 — 기존 캐논·사용자 표기를 대표 이름으로 유지하고, 이번 PDF의 `모리아티`는 검색용 철자 변형으로 보존 | 없음 — 대령은 직함이지 별칭이 아님 | 섹터 D 대령, 킴라박 직속 상관, 아르고 침투부대 지휘관 | 6부 2화 화자명, 킴라박의 직속상관 진술, 기존 프라토·존 웡 기록, 사용자의 섹터 D 확정 | 사용자 확정 `NOVUS_ORDO / MANUS / SECTOR_D` | NHI 문서 비밀 회수 지시, 유회 지원 요청 차단, 부하 제거 시도, Montag-98에게 사망 | `H` 추천 — 같은 대령·현장 통솔 역할인 페초린과 같고, 섹터 전체 감독관이라는 근거는 없음. 이 값만 사용자 확인 전 저장 금지 | 사용자 제공 단독 초상을 배경 제거해 `/assets/npcs/Moriarty-profile.webp`로 준비 | 다듬는 동안 비공개, 최종 묶음 전체 공개 때 공개 | 성별·연령·신장·체중·전체 이름은 `미상` | 힐링 팩터, 거친 동료애, 목적 우선 배신, `KIMLEE`·`YUHOE`·`JOHN_WONG` 관계. `사망 확인`과 근거 사건을 함께 기록하고, `2026-08-09`는 실제 사망일이 아니라 사망 사실을 보존 기록에서 확인한 날. 남은 입력은 `H` 확인 1건 | blocked |
| `GWANGCHE_GIRL` | 광체 소녀 — 사용자가 지정한 신원조회 대표 표기. 세션의 `광체`가 고유명인지 존재 분류인지는 미확정으로 보존 | 없음 — `작은 오틸리아` 등은 외형 비교 표현이지 정식 별칭이 아님 | 이르마 곁에서 시유 회유에 참여하고 자신을 `광체`라고 소개한 독립 인격체 / 연구동 이송 예정 대상 | p50~60 시유 회유·주사기 반환, p66~71 이르마 보호, p126 자기소개, p124~137 연구동 이송 결정, 사용자 지정 대표 표기·초상 | 정규 소속 없음. 이르마 측 현장 동행은 관계로만 기록하고 근거 없이 `AHNENERBE` 소속을 등록하지 않음 | 마리아가 노부스 오르도로 함께 가자고 제안해 소녀가 수락했고, 사무총장이 연구동으로 데려가기로 결정. 실제 도착은 확인되지 않음 | 노부스 오르도 요원이 아니므로 내부 권한등급 없음 | 사용자 제공 단독 초상을 배경 제거해 `/assets/npcs/Gwangche-Girl-profile.webp`로 준비 | 다듬는 동안 비공개, 최종 묶음 전체 공개 때 공개 | 여성형 소녀로 관측. 정확한 종족·연령·신장·체중은 `미상` | 마리아 보호, 이르마 충성, 시유 설득 관계는 확인. 오틸리아의 유전자 관련 말은 증언으로만 기록하고 확정하지 않음. 내부 식별자는 링크 연결용이고 화면에는 `광체 소녀`로 표시 | ready-for-apply |

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
| `NOSB-S1E6-TURNING-POINT-PART2:GWANGCHE_GIRL:self-identification` | `GWANGCHE_GIRL` | `NOSB-S1E6-TURNING-POINT-PART2` | 자기표현과 선택 의사 | dialogue + action | 마리아가 이름을 묻자 자신을 광체라고 소개함<br>노부스 오르도로 함께 가자는 마리아의 질문에 고개를 끄덕임 | 작전 보고서 S1E6: 변곡점 2부 | confirmed | ready-for-apply |
| `NOSB-S1E6-TURNING-POINT-PART2:GWANGCHE_GIRL:irma-devotion` | `GWANGCHE_GIRL` | `NOSB-S1E6-TURNING-POINT-PART2` | 이르마에 대한 충성 | dialogue + action | 이르마를 교주님이라고 호칭함<br>이르마에게 주사기를 돌려주고 시유에게 제안을 받아들이도록 설득함 | 작전 보고서 S1E6: 변곡점 2부 | confirmed | ready-for-apply |
| `NOSB-S1E6-TURNING-POINT-PART2:MORIARTY:rough-comradeship` | `MORIARTY` | `NOSB-S1E6-TURNING-POINT-PART2` | 거친 친화성과 보호적 결속 | description + action | 작전 기록에서 힐링 팩터로 킴라박과 부대원의 목숨을 여러 번 구한 사실이 확인됨<br>시가를 피우며 부하에게 거친 농담을 건넴 | 작전 보고서 S1E6: 변곡점 2부 | confirmed | ready-for-apply |
| `NOSB-S1E6-TURNING-POINT-PART2:MORIARTY:mission-first-betrayal` | `MORIARTY` | `NOSB-S1E6-TURNING-POINT-PART2` | 목적을 위해 부하를 제거하는 배신 | action + dialogue | NHI 문서를 받은 뒤 부대원 둘을 사살하고 킴라박에게 총을 겨눔<br>킴라박에게 자네라도 같은 선택을 했을 것이라며 배신을 정당화함 | 작전 보고서 S1E6: 변곡점 2부 | confirmed | ready-for-apply |

## Visual Asset Ledger

PDF에는 가로형 장면 삽화가 25개 있다. 그중 반복 장면과 더 설명력이 높은 장면으로 대체할 컷 7개를 제외한 18개가 최종 사용 후보다. 이 18개가 이전 답변에서 설명 없이 쓴 `TIER-3 장면 프레임`이다. 비공개 검토 중에는 공개 파일 경로에 복사하지 않고 로고만 표시한다. 최종 전체 공개 때 후보 18개를 작전보고서와 위키판에 같은 순서로 싣는 것이 기본안이다. 이번 사용자 제공 초상 2개와 요청에 따라 만든 카탈로그 그림 4개는 이 PDF 장면 삽화와 별개이며, 각각 신원조회와 카탈로그 화면에만 사용한다.

아래 표도 자동 검사 전용이다. `report`는 작전보고서, `report wiki mirror`는 같은 내용을 담는 위키판, `dedicated wiki`는 인물·개체 전용 위키, `catalog`는 아이템 정보, `Dossier/personnel`은 신원조회를 뜻한다. `included`는 사용, `excluded`는 용도 불일치로 제외, `candidate-only`는 최종 공개 전에 전용 위키 용도로만 다시 검토한다는 뜻이다.

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `/assets/StarGate_logo_watermark.webp` | repository brand asset | 512×425 | no — existing public asset | report-cutscene | included | included | excluded: no dedicated lore subject | excluded: no item subject | excluded: not a 신원조회 portrait | TIER-3 source frame 대신 기존 공개 브랜드 watermark만 사용 |
| `/assets/npcs/Moriarty-profile.webp` | 사용자 제공 모리어티 단독 이미지 | 1085×1450 | no crop — 배경만 제거 | personnel-image | excluded: 신원조회 전용 | excluded: 신원조회 전용 | excluded: 인물 위키용으로 자동 재사용하지 않음 | excluded: 아이템 아님 | included | 사용자가 모리어티와 섹터 D를 확정. 실제 투명 픽셀을 가진 WebP로 준비 |
| `/assets/npcs/Gwangche-Girl-profile.webp` | 사용자 제공 광체 소녀 단독 이미지 | 1448×1086 | no crop — 배경만 제거, 후광 보존 | personnel-image | excluded: 신원조회 전용 | excluded: 신원조회 전용 | excluded: 인물 위키용으로 자동 재사용하지 않음 | excluded: 아이템 아님 | included | 사용자 지정 광체 소녀 초상. 후광·의상·인물을 보존한 투명 WebP로 준비 |
| `/assets/catalog/samples/afterglow-radiance-sample.webp` | 사용자 요청에 따라 생성한 단독 아이템 그림 | 1254×1254 | no crop — 배경 제거 | catalog-sample | excluded: 카탈로그 전용 | excluded: 카탈로그 전용 | excluded: 세션 장면 근거가 아님 | included | excluded: 인물 아님 | 발광 표본이 든 연구용 용기로 표현. 그림의 세부 디자인은 캐논 사실이 아니라 카탈로그 식별용 시각화 |
| `/assets/catalog/samples/afterglow-head.webp` | 사용자 요청에 따라 생성한 단독 아이템 그림 | 1254×1254 | no crop — 생성 원본의 투명 배경 유지 | catalog-sample | excluded: 카탈로그 전용 | excluded: 카탈로그 전용 | excluded: 세션 장면 근거가 아님 | included | excluded: 인물 초상 아님 | 잔광자 머리 생체 표본을 저고어 밀봉 용기로 표현. 세부 용기 디자인은 캐논 사실이 아님 |
| `/assets/catalog/special/nhi-rocket-engine-adaptation-document.webp` | 사용자 요청에 따라 생성한 단독 아이템 그림 | 1254×1254 | no crop — 배경 제거 | catalog-sample | excluded: 카탈로그 전용 | excluded: 카탈로그 전용 | excluded: 세션 장면 근거가 아님 | included | excluded: 인물 아님 | 기밀 문서철과 로켓·엔진 도면으로 표현. 읽을 수 있는 임의 문구는 넣지 않음 |
| `/assets/catalog/special/used-aurora-virus-syringe.webp` | 사용자 요청에 따라 생성한 단독 아이템 그림 | 1254×1254 | no crop — 배경 제거 | catalog-sample | excluded: 카탈로그 전용 | excluded: 카탈로그 전용 | excluded: 세션 장면 근거가 아님 | included | excluded: 인물 아님 | 눌린 피스톤과 잔류물로 사용 후 상태를 표현. 실제 재사용 가능한 소비품이 아님 |
| PDF p002 X5 | PDF p002 X5 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | excluded: no item subject | excluded: no full-frame person | 섹터 D 해상 플랫폼 도입 장면 |
| PDF p005 X80 | PDF p005 X80 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | excluded: no item subject | excluded: staged briefing scene | 유회의 아르고 기지 침투 브리핑 |
| PDF p011 X241 | PDF p011 X241 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | excluded: no item subject | excluded: 사용자가 단독 모리어티 초상을 별도로 제공 | 모리어티와 킴라박의 침투 장면 |
| PDF p012 X274 | PDF p012 X274 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | excluded: no item subject | excluded: 환경 포함 장면 | 아르고 지하 통로의 유회 |
| PDF p014 X308 | PDF p014 X308 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | candidate-only | excluded: 문서 열람 장면 | NHI 우주 엔진 기밀 문서 열람 |
| PDF p016 X351 | PDF p016 X351 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | candidate-only | excluded: 회수품 아님 | excluded: 인물 초상 아님 | 하이퍼보리아인 14 챔버 관측 |
| PDF p017 X380 | PDF p017 X380 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | candidate-only | excluded: 회수품 아님 | excluded: 인물 초상 아님 | Montag-98의 킴라박 공격 |
| PDF p021 X436 | PDF p021 X436 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | excluded: no item subject | excluded: 부상 close-up을 신원조회 초상으로 쓰지 않음 | 유회의 지원 요청 장면 |
| PDF p023 X501 | PDF p023 X501 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | excluded: no exact item sample | excluded: 경호 포함 장면 | 요한 스미스와 로켓 연구소 경호 |
| PDF p025 X552 | PDF p025 X552 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | candidate-only | excluded: 로켓 회수품 아님 | excluded: 인물 없음 | 주주의 방주 로켓 공개 |
| PDF p029 X633 | PDF p029 X633 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | candidate-only | excluded: 구속 장면을 신원조회 초상으로 쓰지 않음 | 엘 볼라도르의 강제 편입 |
| PDF p032 X730 | PDF p032 X730 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | excluded: no item subject | excluded: 집단 전투 장면 | 의식장으로 향하는 증원대 |
| PDF p033 X737 | PDF p033 X737 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | candidate-only | excluded: 적 장비 회수 없음 | excluded: 이름 없는 보병 | 마지막 대대 보병 저지선 |
| PDF p050 X1222 | PDF p050 X1222 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | excluded: no item subject | excluded: 2인 서사 장면 | 이르마의 제안과 시유의 선택 |
| PDF p063 X1589 | PDF p063 X1589 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | candidate-only | excluded: 행위 장면을 초상으로 쓰지 않음 | 이르마의 개조 바이러스 자가 투여 |
| PDF p083 X2168 | PDF p083 X2168 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | candidate-only | excluded: 광채 표본의 standalone 이미지 아님 | excluded: 잔광자 전투 장면은 이르마 초상 아님 | 잔광자 최초 현현의 정확한 장면 |
| PDF p130 X3501 | PDF p130 X3501 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | candidate-only | excluded: no item subject | excluded: 인물 없음 | 수메르 지상 복귀와 후속 브리핑 |
| PDF p138 X3730 | PDF p138 X3730 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: TIER-3 protected source | excluded: TIER-3 protected source | excluded: report scene only | excluded: no item subject | excluded: 신체 일부 장면이며 초상 역할 불가 | 마가렛의 순백 격리실 면회 |
| `PDF p013 X293` | PDF p013 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: p011 중복 구도 | excluded: p011 중복 구도 | excluded: duplicate | excluded: duplicate | excluded: duplicate | 모리어티·킴라박 장면의 동일 프레임 |
| `PDF p019 X409` | PDF p019 first frame | 1035×503 | no — full PDF XObject | report-cutscene | excluded: p012 중복 구도 | excluded: p012 중복 구도 | excluded: duplicate | excluded: duplicate | excluded: duplicate | 유회 통로 장면의 동일 프레임 |
| `PDF p019 X418` | PDF p019 second frame | 1035×503 | no — full PDF XObject | report-cutscene | excluded: p012 중복 구도 | excluded: p012 중복 구도 | excluded: duplicate | excluded: duplicate | excluded: duplicate | 같은 페이지 안의 유회 중복 프레임 |
| `PDF p020 X425` | PDF p020 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: p011 중복 구도 | excluded: p011 중복 구도 | excluded: duplicate | excluded: duplicate | excluded: duplicate | 모리어티·킴라박 장면의 동일 프레임 |
| `PDF p061 X1545` | PDF p061 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: p063이 행위를 더 잘 식별 | excluded: p063이 행위를 더 잘 식별 | excluded: report close-up only | excluded: 주사기 standalone 아님 | excluded: 신체 close-up | 이르마 상반신 반복 close-up |
| `PDF p062 X1562` | PDF p062 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: p063이 행위를 더 잘 식별 | excluded: p063이 행위를 더 잘 식별 | excluded: report close-up only | excluded: 주사기 standalone 아님 | excluded: 신체 close-up | p061과 같은 반복 close-up |
| `PDF p140 X3793` | PDF p140 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: p138 동일 프레임 | excluded: p138 동일 프레임 | excluded: duplicate | excluded: duplicate | excluded: duplicate | 마가렛 격리 장면의 동일 프레임 |

## 비공개로 다듬고 전체 공개하는 순서

- 검토 중에는 사용자가 정한 원칙대로 작전보고서는 내부 검토 권한인 V 이상만 볼 수 있게, 보고서 위키판·잔광자 위키·카탈로그 4건·모리어티·광체 소녀 신원조회는 비공개로 둔다.
- 카탈로그 4건은 모두 가격 0, 판매 불가, 전체 공개 안 함으로 준비했다. 인벤토리에 들어가도 상점 재고나 소비품 목록에는 나타나지 않는다.
- 각 등록 파일은 같은 식별자의 기존 상태가 예상과 다르면 덮어쓰지 않고 중단하도록 만들었다. 특히 카탈로그나 인벤토리 수량이 이미 생겨 있으면 중복 지급하지 않는다.
- 모든 문장·관련 링크·신원조회·아이템 정보·이미지가 정리되고 사용자가 완성됐다고 확인하면 보고서와 관련 기록을 한 묶음으로 전체 공개한다. 그때 기존 공개 위키와 신원조회에도 이번 세션의 등장 기록·관계·성격 관찰을 함께 추가한다.
- 검토 중인 작전보고서와 위키판에는 기존 로고 1개만 표시한다. 최종 전체 공개 때 PDF의 서로 다른 장면 삽화 18개를 양쪽 문서에 같은 순서·설명으로 넣는 것이 기본안이다.
- 광체 소녀 신원조회는 화면에 `광체 소녀`로 표시하고, 내부 연결용 식별자는 사용자 화면의 이름으로 노출하지 않는다. `광체`가 고유명인지 존재 분류인지는 계속 미확정으로 표시한다.
- 모리어티는 섹터 D·사망·초상이 정리됐고, 권한등급 `H`만 확인되면 신원조회 링크까지 연결할 수 있다.

## 실제 운영 ERP에 반영할 때의 순서

1. `nosb-s1e6-turning-point-part2-catalog-items.json`에는 네 카탈로그 항목의 이름·설명·이미지·비공개·판매 불가 상태를 정식 문서와 같은 내용으로 보존했다.
2. `_oneoff-apply-nosb-s1e6-part2-items.mjs`는 카탈로그 4건과 인벤토리 수량을 한 번에 처리한다. 기본 실행은 읽기만 하며, 운영 쓰기 명령과 확인 선택지를 둘 다 줘야 실제로 저장한다.
3. 실제 저장 직전 운영 DB를 읽어 카탈로그 4건과 관련 인벤토리 수량이 모두 없는지 확인한다. 현재 확인된 값은 카탈로그 4건 없음, 피펫 표본 0, 공용 표본 0, 공용 머리 0, 공용 사용 주사기 0, NHI 문서 인벤토리 0이다.
4. 사용자가 정확한 `0→수량`을 보고 지금 실행하라고 별도로 확인하면, 한 번의 DB 작업으로 카탈로그 4건을 만들고 피펫 표본 1개·공용 표본 4개·공용 머리 1개·공용 사용 주사기 1개를 저장한다. NHI 문서는 카탈로그만 만들고 인벤토리 수량은 만들지 않는다.
5. 저장이 끝나면 카탈로그 4건과 피펫·공용 인벤토리를 DB에서 다시 읽어, 수량·아이템 이름·보관 근거 메모·비공개·판매 불가 상태가 정확한지 비교한다. 같은 작업을 다시 실행해도 중복 지급하지 않고 이미 완료된 결과만 확인하도록 작업 식별자를 고정했다. 이 중복 방지를 위해 사용자 화면에는 보이지 않는 인벤토리 잠금 기준점 1건과 작업 완료 기록 1건도 함께 남는다.
6. `nosb-s1e6-turning-point-part2-gwangche-girl-dossier.json`에는 광체 소녀 신원조회와 세션 근거 관계·성격 관찰을 준비했다. 모리어티는 `nosb-s1e6-turning-point-part2-moriarty-dossier.json.pending`에 두고, `H` 확인 전에는 실행하지 않는다.
7. 신원조회와 관련 기록의 운영 반영을 별도로 승인받은 뒤, 광체 소녀와 모리어티를 먼저 만들고 `nosb-s1e6-turning-point-part2-reference-targets.json`의 잔광자 위키, `nosb-s1e6-turning-point-part2-sync.json`의 작전보고서·보고서 위키판을 순서대로 연결한다.
8. 전체 공개 작업의 기존 참고 목록은 새 카탈로그 3건과 광체 소녀 신원조회가 생기기 전에 작성됐으므로 그대로 실행하지 않는다. 장면 18개와 최종 연결 대상을 포함해 다시 만든 뒤, 로그인 상태와 비로그인 상태에서 링크·이미지·공개 범위를 확인한다.

이 문서 작성 시점에는 실제 운영 ERP에 아무것도 저장하거나 수정하지 않았다.

## 사용자에게 정말 필요한 확인

1. **아이템 운영 적용**: 카탈로그 4건을 비공개·판매 불가·가격 0으로 만들고, 피펫 광채 표본 `0→1`, 공용 광채 표본 `0→4`, 공용 잔광자 머리 `0→1`, 공용 사용 주사기 `0→1`로 지금 저장할지 마지막 확인이 필요하다. NHI 문서는 개인·공용 수량 모두 `0`을 유지한다.
2. **모리어티 권한등급**: 섹터 D와 초상은 사용자가 확정했다. 역할은 섹터 전체 감독관이 아니라 아르고 침투부대 지휘 대령으로 확인되므로 같은 대령·현장 통솔자인 페초린과 같은 `H`를 추천한다. `H`가 맞다는 확인만 남았다.

모리어티 사망은 원문에서 확정됐으므로 별도 설정을 요구하지 않는다. 정확한 과거 사망일은 미상이지만 신원조회에는 공식 기록에서 사망 사실을 확인한 `2026-08-09`를 넣는다. 광체 소녀는 사용자 지정 표기와 전용 초상이 해결됐고, 정규 소속·권한등급을 억지로 만들지 않는 방식으로 준비했다. 표본·머리·주사기 보관처도 이번 사용자 지시로 결정됐으므로 더 묻지 않는다. 작전 크레딧·주식·상점 재고·알림·메시지·웹훅은 바꾸지 않는다.

공개 여부는 더 묻지 않는다. 사용자가 정한 대로 다듬는 동안 전부 비공개로 유지하고, 위 확인과 이미지·링크 정리가 끝나면 묶음 전체를 공개한다.
