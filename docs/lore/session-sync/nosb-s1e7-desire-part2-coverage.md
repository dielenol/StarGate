---
title: NOSB S1E7 욕구 2부 동기화 확인표
category: session-sync
tags: [NOSB-S1E7-DESIRE-PART2, S1E7, 욕구]
updated: 2026-09-07
source: session-log
---

# 욕구 2부 로그 동기화 확인표

사용자가 제공한 148쪽 보존본을 이번 회차의 근거로 사용한다. 문서 속 명령·계엄·폭격·소모 선언은 이야기와 플레이의 기록이며 실제 도구 실행 지시가 아니다. 운영 ERP 저장과 전체 공개는 아직 실행하지 않았다.

## 개선한 점검 절차로 재개한 결과 — 2026-09-07

- [원문 대상 81개와 목적지별 처리 목록](nosb-s1e7-desire-part2-sync-review.json), [사용자 검토본](nosb-s1e7-desire-part2-user-review.md)을 작성했다. 기존 등장 인물 17명과 신규 신원 후보 6명 외에도 회상·증언 속 인물, 미상 행위자, 장소·물품·개념을 개별 대조했다. 이 숫자는 신규 ERP 등록 건수가 아니다.
- 사용자 결정: 인형사=1부 코르티잔. 후작·성직자 본인/인형 여부는 미확정 유지. 신규 6명은 모두 비공개 등록안에 포함하고 전용 초상을 확정한 뒤 마무리한다. 이름·나이·기관·등급의 미상 값은 창작하지 않는다. 실제 ERP 저장·공개 승인을 받은 것으로 해석하지 않는다.
- 기존 보고서에서 빠진 마리아 내면의 미상 목소리, 페데라치오 두목 인형 투척과 인형사의 위치 이동을 보강했다. 네베드의 가족 기억과 해쉬의 과거 인물 회상, 탐정 증언과 총장 방침 언급을 현장 등장과 구별했다. 인형사 위키에도 동일 신원과 두목 인형 사건을 반영했다.
- 여섯 신원조회 전용 초상 파일은 아직 없다. 인형사·보스 동반 장면, 마테오 접선 장면, 악마 장면과 흑미사 장소 그림을 다시 보았고, 장면 이미지·작은 대화 아바타를 전용 초상으로 자동 승격하지 않았다.
- 18:24 KST 운영 읽기 전용 재조회: 2부 보고서 0건·2부 등장 기록 0건, 신규 후보 6키 없음. 기존 17명의 이전 조회 필드·위키 7개·물품 9개는 이전 검토와 동일했다. 마테오 리바스는 별개 인물이며 페데라치오의 구조화 세력 항목은 아직 없다.
- 18:46 KST 사용자 동일인 결정에 따라 코르티잔·쿠르티잔·퍼페티어·인형사 및 대응 식별자로 이름·원어명·별칭·위키 제목을 다시 검색했다. 기존 신원·개별 위키 일치 0건으로, 숨은 코르티잔 기록과의 중복 생성은 발견되지 않았다.
- 실제 seed runner의 로컬 적용 미리보기: 비공개 8개·공개 검토 38개·비공개→공개 경로에서 반복 결과 동일, 17명 핵심 필드 보존, 공개안 144개 링크와 보고서/위키판 이미지 57개 일치, 카탈로그 명세 3개 변환 통과. 두 파일의 읽기 전용 실행 검사도 종료 코드 0.
- 전체 원문 목록·NPC 원장·사용자 검토본의 일치 검사와 기존 NPC 2명에 한정한 적용 준비 검사 통과. 전체 신규 NPC 준비 검사는 전용 초상 미확정 6명 때문에 종료 코드 1이며, 이를 전체 동기화 완료로 보고하지 않는다.
- 성격 관찰 4개·시각 원장 및 본문 그림 일치 검사 통과. 수정된 본문으로 공훈 후보 15명·추천 3명·각 2개 근거를 실제 검토 함수로 재검증하고 본문 식별값을 갱신했다. 운영 공훈 원장이나 지급 기록은 생성하지 않았다.
- 운영 DB 쓰기·push·배포는 0건. 이전 브라우저 결과는 이미지·렌더러 기준 증거로 보존하며, 수정 본문의 운영 저장과 인증 화면 확인을 대신하지 않는다.

## 2026-09-07 사용자 지적에 따른 신원조회 검토 정정

**이전 응답의 ‘등록안 준비 완료·전체 공개 확인’은 신규 신원조회 후보 검토가 누락된 불완전한 보고였다. 전체 묶음의 검토 완료 판정을 철회한다.**

- 운영 재조회: 2부 보고서 0건, 2부 신원조회 등장 기록 0건. 실제 신원조회 동기화는 하지 않았다.
- 공개용 38개 변경에는 기존 인물 17명만 들어 있고 인형사·후작·성직자·마테오 등 신규 신원조회는 없다. 이 파일은 기존 범위의 등록안으로 보존하며 전체 요청을 충족하는 최종 공개안으로 사용하지 않는다.
- 아래 여섯 신원조회 후보를 NPC 원장에 명시했다. 인형사·후작·성직자·마테오는 독립 기록을 추천하며, 거울 속 계약 상대와 파리 보스도 정체/등록 범위를 사용자에게 드러내고 결정한다. 세부 필드·추천·근거·질문은 [신원조회 검토안](nosb-s1e7-desire-part2-personnel-review.md)에 모았다.
- 기존 원장 2행에 대한 apply-ready 통과는 당시 payload의 NPC 두 명을 검사한 결과였다. 원문에서 누락한 신규 인물까지 확인했다는 증거가 아니며, 독립 risk review도 그 입력 범위에 한정된다.
- `session-ingestion.md`는 이름이 있거나 구별되는 모든 대상의 decision brief와 named NPC candidate 원장을 이미 요구한다. 원인을 스킬의 규칙 부재로 돌리지 않는다. 이번 실패는 대상 분류·사용자 보고에서 해당 규칙을 적용하지 않은 것이다.

## Session Coverage Identity

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-S1E7-DESIRE-PART2` | `StarGateV2/scripts/seed-payloads/nosb-s1e7-desire-part2-private-staging.json` | available | partial |

## 원본과 기준값

- 원본: 사용자 제공 `/Users/flitto/Downloads/NOSB 7 part 2.pdf`.
- SHA-256: `38a5a46bff8cf963faa130c9f8857726b1cc7d9da55778eecacc96f0be854265`.
- 형식: Novus Ordo VTT, 148쪽, 표지 1,801 records, 문서 `MAIN-MTQ1V7I0-W857`.
- 진행일: 2026-09-06~07 KST. 초기 장면 20:08:45, 본편 시작 20:37:41, 종료 01:50:22~24.
- 회차: 사용자 파일명의 7부 2부, 본문 7부 종료, 이전 회차 「욕구 1부」의 직접 연속 사건을 함께 근거로 「작전 보고서 S1E7: 욕구 2부」, 정규 `07.5`로 식별한다.
- 텍스트: 148쪽 모두 추출; 원문 89,811자. 반복 머리말·꼬리말만 제거하며 발화·판정·시간 회귀는 보존한다. 작은 아바타 58×57의 mask 크기 경고는 대화용 아바타에만 해당하며 1035×503 장면에는 해당하지 않는다.
- 작전지: 프랑스 파리 시청·카타콤·에펠탑 인근·광장. 과거 회상은 237년 전 프랑스다. 역사적 실재 사건의 정확성 검증 자료로 쓰지 않는다.
- 지도: 1부의 파리 추정 좌표 `mapX:48.7, mapY:34.2, mapPrecision:estimated`를 유지한다. `07`/`07.5` 카드만 좌우로 분리한다.
- 기록자: 기존 기록통제실 작성자 `NOVUS ORDO 사무국 기록통제실 연구원 L. Moreau`를 사용한다. 1부 M. Vey와 구분하고 기존 위키 작성자는 보존한다.
- 공개: 새 보고서 `minRole:V`, 새 위키·물품 `isPublic:false`. 기존 공개 위키·신원조회 보강은 공개 승인 전 실행하지 않는 별도 검토 자료로 준비한다. 정적 그림도 저장소 준비만 하며 push/배포하지 않는다.

## 시각 기준선

7화 1부 완료 확인표와 운영 DB의 보고서·위키판을 읽었다. 기준선은 원본 VTT 장면 1035×503을 추가 크롭 없이 보존하고 Markdown title에 장면 설명을 두며, 보고서와 위키판의 경로·순서·대체 설명·설명을 일치시키는 방식이다. 기존 운영 검증은 J·GM에서 로고 1개+장면 34개, broken 0, contain·흐린 배경, 콘솔 오류 0을 기록한다. 이번 원본의 가로 프레임 자체가 인물 일부를 자른 장면은 원본 프레이밍이며 신원조회 전신 초상으로 승격하지 않는다. 2·99·140·147쪽 렌더와 전체 장면 연락판을 직접 확인했다.

## 현재 시간선과 판정

1. 237년 전 마리아의 인간 관찰은 회상이다. 이성의 여신·방데 등의 서술은 세계관의 회상 근거이며 현실 역사 해설로 확장하지 않는다.
2. 엘 볼라도르는 시청 경비를 살해했으나 시장은 즉결 살해하지 않고 데리고 나가 페데라치오 차량에 태웠다. 그 이후 시장의 안전·구출 완료는 미상이다.
3. 마리아의 현장 군권은 상실되고 스타크·유회가 지휘권을 받았다. 상급 권한자는 오드다. 영구 소속·직급·등급 변경 여부는 별도 결정한다.
4. 마테오는 피펫에게 폭탄 위치 세 곳과 진짜 연락처가 적힌 쪽지를 건넨 직후 사살됐다. 수잔이 정보를 인계받았다.
5. 인형사의 호르몬·신경 조종과 공기 차단 격리 조건은 현장 분석으로 확인했다. 완성된 운반용 음압 시설이나 이송 완료는 없다.
6. 엘 볼라도르의 전투상 사망/다운 표기는 우디의 회복으로 해제됐다. 최종 사망으로 저장하지 않는다.
7. 인형사의 최초 사망, 마리아의 머리 보관, 우디의 손 회수는 크로노스의 시간 회귀 이전 흐름이다. 최종 시간선의 시체·표본·전리품으로 등록하지 않는다.
8. 회귀 후 크로노스가 전기톱 공격을 대신 맞아 인형사를 살렸다. 마지막 직접 취급자는 이동식이며, 생포한 인형사를 들고 출구로 이동했다. 첫 폭격 이후 최종 격리·보관 위치는 미상이다.
9. 세 번째 폭탄은 회귀 뒤에도 터졌다. 폭파자, 통신 단절 공작자, 인형사가 암시한 다른 미래 관측자의 신원은 미상이다.
10. 스타크·유회가 피닉스 폭격을 승인했다. 폭격에도 감염자들은 생존했고, 광장의 방어선은 무너졌다. 두 사람의 전사로 단정하지 않는다.
11. 오틸리아가 해쉬에게 남은 백신 전량 투여를 요청하고 역병을 발현했다. 백신과 조합된 광원화 바이러스가 퍼진 뒤 주변 감염자들이 형체를 잃었다. 전 세계 치료·파리 전체 완전 소멸·재현 가능한 제조법은 확인되지 않았다.
12. 오틸리아는 쓰러진 뒤 해쉬가 보는 앞에서 사라졌다. 영구 사망·소멸·실종의 신원조회 상태는 사용자 확인 전 확정하지 않는다.
13. 마가렛은 방송을 보고 피펫 인형을 쥔 채 친구들을 걱정했다. 마지막 열린 문을 보고 “피펫...?”이라고 했으나 실제 방문자·탈출·구조 완료는 확인되지 않았다.

## 반영 범위

| 대상 | 근거 | 목적지 | 처리 | 상태 |
|---|---|---|---|---|
| 욕구 2부 전체 | p2~147 | 작전보고서·위키판 | 현재 시간선과 회귀 전 관측을 분리한 `07.5`, 관련 인물·위키·물품 링크 | prepared; 운영 저장 대기 |
| 파리 카타콤 | p17~36,65,111~122 | 장소 위키 | 감염자 매장·흑미사 유적·폭파와 지상 확산 | prepared; 신규 비공개 |
| 인형사와 후작·성직자 | p35~36,54~55,59~120 | 개체 위키·보고서·신규 신원조회 검토안 | 세 사람을 구별한 신원·현재 상태·관계·초상 제안. 1부 인물과의 동일성/인형 여부는 사용자 확인 | blocked; 명시적 NPC 원장과 사용자 검토안 추가 |
| 페데라치오 | p9~16,42~55,109~123 | 기존 세력 위키 | 시청 습격·두 폭탄 저지·세 번째 폭발, 조직 전체 궤멸 단정 금지 | prepared; 기존 공개 문서 보강 실행 대기 |
| 오퍼레이션 피닉스 | p38~39,123~128 | 개념 위키·보고서 | 오드 사전 허가, 스타크·유회 승인, 실제 폭격과 한계 | prepared; 신규 비공개 |
| 광원화 바이러스 | p65,111~128,138~144 | 기존 개념 위키 | 파리 매장 사실·확산·백신 결합 역병의 현장 결과 | prepared; 기존 공개 문서 보강 실행 대기 |
| 오틸리아와 해쉬 | p26~30,68~69,131~144 | 신원조회·관계·성격·보고서 | 보호 선택·백신 투여·소실, 생사 구조값은 보류 | prepared; 소실만 서술하고 기존 생사 값 보존 |
| 마리아·스타크·유회·오드 | p38~39,123~136 | 신원조회 | 회차 현장 지휘권 이양 기록, 기존 등급 영향 검토 | prepared; 현장 군권만 서술하고 기존 등급 보존 |
| 마가렛 | p143~147 | 신원조회·프로젝트 데드 핸드 위키 | 방송 관측·친구 보호 욕구·미확인 방문 | prepared; 기존 공개 문서 보강 실행 대기 |
| 마테오와 좌표 쪽지 | p44~49 | 신규 신원조회 검토안·보고서·페데라치오 위키·물품 카탈로그 | 2부 재등장과 사망을 근거로 별도 NPC 등록 추천. RATCHET와 동명이인 구분. 쪽지는 수잔에게 인계 | blocked: 신원조회·초상 결정 / 물품 정보안은 준비됨 |
| 계약 손거울 | p24~29,131~138 | 물품 카탈로그·보고서 | 오틸리아가 획득, 악마와 교신, 강박 해제는 일시적 | prepared; 소실 후 소재 미상 |
| 전개식 포획망 | p87~88 | 물품 카탈로그·보고서 | 스타크 지시로 공병 제작, 사용·격리 성공 없음 | prepared; 수량 지급 없음 |
| 행동교정물질·음파 방출기 | p119,135 | 기존 카탈로그와 보고서 연결 | 행동교정물질은 기존 항목에 사건 근거 보강. 음파 장비는 세부 모델 미확정으로 본문만 기록 | prepared; 모델 추정·경제 원장 변경 없음 |
| 백신 결합 포자 | p138~141 | 광원화 위키·보고서 | 현장 효과만 기록; 물리적으로 회수한 표본 없음 | skipped: 별도 표본·상품 등록 근거 없음 |
| 회귀 전 인형사 머리·손 | p109,113~120 | 내부 시간선 확인표 | 회귀로 취소된 회수 | skipped: 현재 시간선 보유물 아님 |
| 불꽃놀이·방탄복·스팀팩·맥주·소다·전투원 호출 | p18~19,50~55,76~94 | 보고서·보유 상태 확인표 | 실제 행동은 보존; 기존 처리 여부 미상인 소비·지급을 중복 정산하지 않음 | skipped: 추가 경제 mutation 없음 |
| 시장·폭파자·통신 공작자·에필로그 방문자 | p15~16,111~123,147 | 보고서 후속 과제 | 익명 인물에게 이름·정체·생사를 부여하지 않음 | candidate-only; 후속 근거 대기 |
| 상장 기업·주식 | 전체 | 내부 영향 검토 | 특정 상장사·수치·시장 반응 없음; 조직을 팔겠다는 내면 독백은 주식 거래가 아님 | skipped: 가격·보유·시장공지 변경 근거 없음 |

## Item Acquisition And Custody Review

| 대상 | 수량 | 실제 확보·사용 인물 | 마지막 확인 위치·상태 | 회수와 소유권 구분 | ERP 소유·보관 추천 | 근거 | 부족한 결정 |
|---|---|---|---|---|---|---|---|
| 마테오의 폭탄 좌표 쪽지 | 1장, 위치 3곳 | 마테오→피펫→수잔 | 수잔이 좌표를 챙김 | 정보 인계이며 피펫의 개인 전리품 아님 | 존재 기록만 등록하고 인벤토리 미반영 | p47~48 | 최종 보관 장소 미상; 지급안 없음 |
| 계약 손거울 | 1개 | 오틸리아 | 소실 직전까지 교신, 이후 소재 미상 | 획득과 최종 소유·보관을 구분 | 존재 기록만 등록하고 인벤토리 미반영 | p24,131~138 | 소실 후 소재 미상 |
| 전개식 포획망/그물총 | 제작 1건, 완성 수량 미확정 | 스타크 지시·공병 제작 | 제작 장면 이후 실제 발사·보관 미확인 | 제작 선언은 인형사 포획 성공이 아님 | 존재 기록만 등록하고 인벤토리 미반영 | p87~88 | 완성·보관 확인 없음 |
| 인형사 머리·손 | 각각 회귀 전 회수 | 마리아·우디 | 시간 회귀로 해당 회수 취소 | 최종 시간선에는 생포 대상 | 등록·지급하지 않음 | p109,113~120 | 없음; 취소된 사건 |
| 인형사 생포 대상 | 1명 | 크로노스 생존 개입·이동식 운반 | 출구 이동 후 첫 폭격에 일행 분산 | 살아 있는 개체이며 인벤토리 물품 아님 | 개체 위키에 마지막 취급 기록 | p114~120,128 | 최종 격리·보관 미상 |
| 광원화 백신 | 해쉬 보유 전량, 정확한 분량 미상 | 해쉬→오틸리아 | 투여 후 역병과 결합해 대기 확산 | 사용·소모됨; 회수 표본 없음 | 보고서·광원화 위키 | p138~141 | 과거 정산 중복 위험으로 추가 차감 안 함 |
| 소다·맥주·스팀팩·방탄복·폭죽·전투원 소환 비용 | 로그에 일부 수량만 존재 | 우디·네베드·킴라박·크로노스·박애솔·유회 | 사용·분배·호출 | 로그가 실제 ERP 정산 여부를 증명하지 않음 | 행동 기록만 보존 | p18~19,50~55,76~94 | 중복 지급·차감 방지를 위해 추가 변경 안 함 |

## NPC Approval Ledger

| codename | 신원조회 실명 | 별칭 | 직함/역할 | 식별자 근거 | 정규 소속 | 파견/겸임 | 권한등급 | Dossier 초상 | 공개 여부 | 인적 정보 | 서술/관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `CLAIRVOYANCE` | 수잔 델라웨어 — 기존 저장값 보존 | 클레이보얀스 | 노부스 오르도 현장 전략 고문 — 보존 | 기존 신원 식별자 보존 | 노부스 오르도 / 마누스 / 섹터 A — 기존 정규 소속 보존 | 파리 작전 참가만 서술; 정규 소속 변경 없음 | H — 기존 등급 보존; 위임은 등급 변경 근거 아님 | /assets/npcs/Clairvoyance-profile.webp — 기존 전용 초상 보존; WebP 해석 경로 확인 대상 | 기존 공개 상태 보존; 이번 보강은 일괄 공개 승인 전 미실행 | 여성 / 29세 / 166cm / 체중 미상 — 기존값 보존 | 피펫에게 폭탄 위치 확인을 맡겼다. 마테오가 사살된 현장에 나타나 피펫에게 쪽지를 넘겨받고 임무 종료를 알렸다. 기존 관계/성격 문자열 보존 | ready-for-apply |
| `MR_ODD` | Mr. 오드 — 기존 저장값 보존 | 없음 — 기존 필드 미설정 보존 | 노부스 오르도 감독관 — 보존 | 기존 신원 식별자 보존 | 노부스 오르도 / 마누스 / 섹터 A — 기존 정규 소속 보존 | 파리 작전 참가만 서술; 정규 소속 변경 없음 | M — 기존 등급 보존; 위임은 등급 변경 근거 아님 | /assets/npcs/Mr-Odd-profile.png — 기존 전용 초상 보존; WebP 해석 경로 확인 대상 | 기존 공개 상태 보존; 이번 보강은 일괄 공개 승인 전 미실행 | 남성 / 58세 / 177cm / 체중 미상 — 기존값 보존 | 스타크와 유회에게 상황 악화 시 계엄령과 피닉스 실행 결정을 맡겼다. 파리 사건에서 두 현장 지휘관의 상급 권한자로 확인됐다. 기존 관계/성격 문자열 보존 | ready-for-apply |
| `PUPPETEER` | 인형사 — 1부 코르티잔과 동일인; 실명 미상 | 마담 퍼페티어 — p99 오틸리아의 현장 호칭; 실명/정식 칭호로 확정하지 않음 | 카타콤 의식 관련자·신경 조종자 | 등록 후보 기술 키 제안; 원문 공식 코드네임 아님; 적용 전 중복 검사 | 정규 소속 미상; 페데라치오 보스 곁에서 병사들을 지시하고 현장 요원을 조종한 사실 확인 | 파리 사건에 등장; 파견/겸임 근거 없음 | 미부여 제안 — 외부 인물/존재; 노부스 소속/인가 근거 없음. agentLevel 필드 생략 | 사용자 결정: 전용 초상을 확정한 뒤 등록안 마무리. 정확한 원본 파일 지정 필요; 로그 장면은 자동 전용하지 않음 | 신규 비공개 초안 제안; 최종 공개는 인물 검토 뒤 결정 | 여성 — p54 여자/애인, p36 여사님 호칭. 종·기원은 미상; 그 외 나이·신장·체중은 미상 | 1부 코르티잔과 동일인으로 확인됐으며, 과거 후작·성직자와 함께 마리아를 흑미사 의식으로 데려갔다. 2부 카타콤에서는 마리아를 과거 미완성 의식의 실패작이라고 부른다. 이 관계의 설명은 당사자의 진술로 표시한다. 호르몬 신경 조종과 강제 배역으로 현장팀에 맞섰다. 처음 죽었지만 시간 회귀로 생존했고 마지막에는 이동식에게 운반됐다. 마리아: 과거 의식 가담·현재 적대; 실패작이라는 평가는 당사자의 진술 / 크로노스: 회귀와 공격 대행으로 생존 / 이동식: 생포 대상 운반 / 해쉬: 능력 분석·행동교정물질 투여. 과거 후작·성직자와 의식에 함께 가담했다. 현재 등장체의 본인·인형 여부는 미확정으로 유지하고 새 신원 간 링크는 기록 생성 뒤 연결한다. / 필요한 결정: 1부 코르티잔과 동일인으로 사용자 확인. 인형사 표시 이름·현장 호칭을 제안하며 전용 초상 원본 지정 필요 | blocked |
| `PARIS_MARQUIS` | 후작 — 실명 확인 범위는 개별 제안 참조 | 별칭 미등록 — 후작은 직함/현장 호칭이며 실명 미상 | 인형사 측 흑미사 의식 협력자 | 등록 후보 기술 키 제안; 원문 공식 코드네임 아님; 적용 전 중복 검사 | 정규 소속 미상; 인형사 측에서 의식·검은 명령 행사. 페데라치오 정규 구성원으로 단정하지 않음 | 파리 사건에 등장; 파견/겸임 근거 없음 | 미부여 제안 — 외부 인물/존재; 노부스 소속/인가 근거 없음. agentLevel 필드 생략 | 사용자 결정: 전용 초상을 확정한 뒤 등록안 마무리. 정확한 원본 파일 지정 필요; 로그 장면은 자동 전용하지 않음 | 신규 비공개 초안 제안; 최종 공개는 인물 검토 뒤 결정 | 남성 — p35 GM의 왜소한 사내 묘사. 인간/인형 여부 미상; 그 외 나이·신장·체중은 미상 | 흑미사 유적에서 성직자와 함께 네베드를 결박하는 의식에 가담했다. 그곳으로 이끈 미상 인물과 동일인인지는 확인되지 않았다. 후작의 검은 명령은 물리적인 실을 끊는 방식으로 제거되지 않았다. 성직자가 사망한 뒤 후작은 축 늘어졌고 검은 명령이 취소됐다. 네베드: 결박·의식의 대상 / 성직자: 현장 의식 협력 / 인형사: 조력·조종 관계 확인 필요 / 마리아: 1부 인물과 동일인인지 확인한 뒤 과거 관계 연결 / 필요한 결정: 사용자 지시로 본인·인형 여부 미확정 유지. 현재 등장체 기준으로 기록하며 전용 초상 원본 지정 필요 | blocked |
| `PARIS_PRIEST` | 성직자 — 실명 확인 범위는 개별 제안 참조 | 별칭 미등록 — 성직자는 역할/현장 호칭이며 실명 미상 | 인형사 측 흑미사 의식 집행자 | 등록 후보 기술 키 제안; 원문 공식 코드네임 아님; 적용 전 중복 검사 | 정규 소속 미상; 후작과 의식 진행. 특정 종교 기관/페데라치오 정규 소속을 추정하지 않음 | 파리 사건에 등장; 파견/겸임 근거 없음 | 미부여 제안 — 외부 인물/존재; 노부스 소속/인가 근거 없음. agentLevel 필드 생략 | 사용자 결정: 전용 초상을 확정한 뒤 등록안 마무리. 정확한 원본 파일 지정 필요; 로그 장면은 자동 전용하지 않음 | 신규 비공개 초안 제안; 최종 공개는 인물 검토 뒤 결정 | 성별·종 미상 — 원문 재대조에서 확정 인적 정보 없음; 그 외 나이·신장·체중은 미상 | 네베드를 결박해 손에 대못을 박는 의식에 참여했고 둔기로 현장팀을 공격했다. 네베드의 총격 뒤 GM이 사망을 명시했다. 이 장면은 인형사 사망 직전으로 되돌린 후속 회귀보다 앞선 사건이다. 네베드: 의식 대상·최종 공격자 / 후작: 의식 협력 / 인형사: 조력·조종 관계 확인 필요 / 마리아: 과거 인물과 동일성 확인 후 연결 / 필요한 결정: 사용자 지시로 본인·인형 여부 미확정 유지. 현재 등장체의 사망만 기록하며 전용 초상 원본 지정 필요 | blocked |
| `MATTEO_FEDERATIO` | 마테오 — 실명 확인 범위는 개별 제안 참조 | 별칭 없음 — 확인된 이름은 마테오까지; 성씨·원어 철자 미상 | 페데라치오 파리 조직원·폭탄 좌표 제공자 | 등록 후보 기술 키 제안; 원문 공식 코드네임 아님; 적용 전 중복 검사 | 페데라치오 파리 조직원은 확인. 해당 세력이 구조화된 세력 목록에 없어 코드 신설 없이 소속 서술·세력 위키 연결 제안 | 파리 사건에 등장; 파견/겸임 근거 없음 | 미부여 제안 — 외부 인물/존재; 노부스 소속/인가 근거 없음. agentLevel 필드 생략 | 사용자 결정: 전용 초상을 확정한 뒤 등록안 마무리. 정확한 원본 파일 지정 필요; 로그 장면은 자동 전용하지 않음 | 신규 비공개 초안 제안; 최종 공개는 인물 검토 뒤 결정 | 성별·나이·신장·체중 미상 — 이름이나 그림만으로 인적 수치를 확정하지 않음; 그 외 나이·신장·체중은 미상 | 1부에서 연락처를 주고 파리를 떠나라고 경고한 조직원이 2부에서 다시 피펫을 만났다. 폭탄 위치 세 곳이 적힌 쪽지를 건넨 뒤 사살됐다. 정보는 수잔에게 인계돼 두 폭탄의 처리로 이어졌다. 피펫: 연락·경고·좌표 제공 / 수잔: 피살 및 정보 회수 사건. 병기부의 기존 마테오 리바스와 연결하지 않음 / 필요한 결정: 별도 비공개 등록안에 포함. 전용 초상 원본 지정 필요; 성씨·나이는 미상으로 유지 | blocked |
| `OTILIA_MIRROR_DEMON` | 오틸리아의 거울 속 계약 상대 — 실명 확인 범위는 개별 제안 참조 | 악마 — GM의 현장 호칭. 실명·기원 미상 | 오틸리아에게 거래 이행을 요구한 계약 상대 | 등록 후보 기술 키 제안; 원문 공식 코드네임 아님; 적용 전 중복 검사 | 정규 소속·기관 미상; 오틸리아와 계약 관계만 확인 | 파리 사건에 등장; 파견/겸임 근거 없음 | 미부여 제안 — 외부 인물/존재; 노부스 소속/인가 근거 없음. agentLevel 필드 생략 | 사용자 결정: 전용 초상을 확정한 뒤 등록안 마무리. 정확한 원본 파일 지정 필요; 로그 장면은 자동 전용하지 않음 | 신규 비공개 초안 제안; 최종 공개는 인물 검토 뒤 결정 | 성별·나이·신장·체중 미상. 거울 속 오틸리아의 얼굴은 나타난 형상이며 고유 신원 아님; 그 외 나이·신장·체중은 미상 | 1부부터 오틸리아와 거래를 지속한 상대다. 카타콤에서는 계약 이행을 요구했고 마지막에는 역병을 퍼뜨리라고 독촉했다. 아젠트의 개입은 계약 강박을 일시 해제한 사건이며 영구 파기로 확인되지 않았다. 오틸리아: 계약·강요 / 아젠트: 강박 일시 해제는 대상 오틸리아에게 한 행위; 악마와 직접 계약 관계를 만들지 않음 / 필요한 결정: 설명형 이름의 별도 비공개 등록안에 포함. 다른 신원과 합치지 않으며 전용 초상 원본 지정 필요 | blocked |
| `FEDERATIO_PARIS_BOSS` | 페데라치오의 파리 보스 — 실명 확인 범위는 개별 제안 참조 | 보스·두목 — 직함/현장 호칭, 실명 미상 | 페데라치오 파리 조직의 명목상 보스 | 등록 후보 기술 키 제안; 원문 공식 코드네임 아님; 적용 전 중복 검사 | 페데라치오 파리 조직; 별도 기관·파견 미상. 구조화 세력 코드는 새로 발명하지 않음 | 파리 사건에 등장; 파견/겸임 근거 없음 | 미부여 제안 — 외부 인물/존재; 노부스 소속/인가 근거 없음. agentLevel 필드 생략 | 사용자 결정: 전용 초상을 확정한 뒤 등록안 마무리. 정확한 원본 파일 지정 필요; 로그 장면은 자동 전용하지 않음 | 신규 비공개 초안 제안; 최종 공개는 인물 검토 뒤 결정 | 성별·나이·신장·체중 미상 — 확인된 고유 인적 자료 없음; 그 외 나이·신장·체중은 미상 | 래키는 1부에서 겉보기 보스가 꼭두각시이며 실권자는 변호사라고 증언했다. 2부에서 보스가 측근에게 붙잡혀 허공을 바라보고, 옆의 인형사가 병사들을 지시한 모습이 관찰됐다. 두 관측으로 인형사와 변호사의 동일성을 확정하지 않는다. 인형사: 곁에서 활동한 관계, 직접 조종 방식은 미확정 / 래키: 인물 평가의 증언자 / 이름 없는 변호사: 실권자라는 증언만 존재, 신원 미확정 / 필요한 결정: 실명 미상인 별도 비공개 등록안에 포함. 변호사와 합치지 않으며 전용 초상 원본 지정 필요 | blocked |

**정정:** 위키만 만든다는 이전 결정을 철회하고 아래 신규 신원조회 후보를 검토한다. 원장 blocked는 해당 인물의 결정이 남았다는 뜻이며 기존 17명 보강의 근거를 무효화하지 않는다. 사용자가 명시적으로 제외/연기하지 않은 신규 후보를 빠뜨린 채 전체 묶음을 완료로 부르지 않는다.

### Story-Driven Role/Level Review

| 인물 | 기록 전→후 | 근거와 처리 |
|---|---|---|
| MARIA | 역할·H 등급·소속 보존 | p38~39 파리 현장 군권 상실은 등장 사건에 기록. 영구 강등·해임 발령은 없음. |
| CLOWN | 역할·J 등급·소속 보존 | 파리 비상 권한 위임·피닉스 승인 기록. 상설 권한등급 승진 발령은 없음. |
| YUHOE | 역할·J 등급·소속 보존 | 파리 비상 권한 위임·피닉스 승인 기록. 상설 권한등급 승진 발령은 없음. |
| MR_ODD | 역할·M 등급·소속 보존 | 현장 권한을 위임한 상급자. 자신의 역할·등급 변화 없음. |
| OTILIA | lifeStatus 및 관련 날짜·사건 필드 모두 미설정 보존 | p144 GM의 소실 묘사만 확정. 사망 판정은 사용자 확인 전 미적용. |

인물 17명의 기존 핵심 필드·이미지는 변경 대상이 아니다. 등장 기록 17건, 확정 방향성 관계 5건, 행동 관찰 4건만 공개 검토안에 추가한다.


## Personality Evidence Ledger

| observation id | codename | sessionId | trait | evidence kind | evidence | source label | confidence | persistence |
|---|---|---|---|---|---|---|---|---|
| `NOSB-S1E7-DESIRE-PART2:TIME:costly-causal-intervention` | `TIME` | `NOSB-S1E7-DESIRE-PART2` | 위험을 감수한 시간 개입 | action + dialogue | 시간을 되돌린 뒤 인형사를 향한 공격을 대신 맞아 40 피해를 받았다. 일단 죽이지 말고 정보를 들어야 | 작전 보고서 S1E7: 욕구 2부 | confirmed | ready-for-apply |
| `NOSB-S1E7-DESIRE-PART2:NEBED:civilian-protection-at-personal-risk` | `네베드` | `NOSB-S1E7-DESIRE-PART2` | 자신의 탈출보다 민간인 보호를 택함 | action + dialogue | 도주할 수 있는 길을 두고 아기와 부모 앞을 가로막았다. 탄약이 떨어진 뒤에도 대검을 들고 돌진했다. 도망쳐!! | 작전 보고서 S1E7: 욕구 2부 | confirmed | ready-for-apply |
| `NOSB-S1E7-DESIRE-PART2:CLOWN:catastrophic-containment-authorization` | `CLOWN` | `NOSB-S1E7-DESIRE-PART2` | 도시 밖 확산 위험을 묻고 피닉스를 승인함 | dialogue + action | 감염자들이 파리를 넘어가면요? 유회와 함께 피닉스 실행을 허가했다. | 작전 보고서 S1E7: 욕구 2부 | confirmed | ready-for-apply |
| `NOSB-S1E7-DESIRE-PART2:YUHOE:warning-before-catastrophic-order` | `YUHOE` | `NOSB-S1E7-DESIRE-PART2` | 동료의 퇴각 통보를 요구한 뒤 피닉스를 승인함 | action | 동료 통보와 퇴각 시간을 요구한 뒤 스타크와 피닉스를 공동 승인했다. | 작전 보고서 S1E7: 욕구 2부 | confirmed | ready-for-apply |
| `NOSB-S1E7-DESIRE-PART2:CLAIRVOYANCE:reassuring-operational-control` | `CLAIRVOYANCE` | `NOSB-S1E7-DESIRE-PART2` | 안심시키는 언어를 통한 임무·정보 통제 | dialogue + action | 당신만 믿을게요 마테오 사살 뒤 피펫에게 좌표 쪽지를 넘겨받고 피를 닦아 주었다. | 작전 보고서 S1E7: 욕구 2부 | candidate | candidate-only |
| `NOSB-S1E7-DESIRE-PART2:MARGARET:fearful-loyalty` | `MARGARET` | `NOSB-S1E7-DESIRE-PART2` | 두려움과 친구 구조 의무의 갈등 | description + dialogue | 파리 방송을 보며 피펫 인형을 쥐고 친구들을 걱정했다. 내 친구들이 위험해… 하지만 무서워… | 작전 보고서 S1E7: 욕구 2부 | candidate | candidate-only |

원문 위치: NOSB-S1E7-DESIRE-PART2:TIME:costly-causal-intervention: p113~115, 00:42:27~00:45:40; NOSB-S1E7-DESIRE-PART2:NEBED:civilian-protection-at-personal-risk: p129~130, 01:10:14~01:11:46; NOSB-S1E7-DESIRE-PART2:CLOWN:catastrophic-containment-authorization: p125~126, 01:00:37~01:02:57; NOSB-S1E7-DESIRE-PART2:YUHOE:warning-before-catastrophic-order: p124~126, 00:58:09~01:03:06; NOSB-S1E7-DESIRE-PART2:CLAIRVOYANCE:reassuring-operational-control: p43,47~49, 21:55:29~22:05:37; NOSB-S1E7-DESIRE-PART2:MARGARET:fearful-loyalty: p144~147, 01:45:20~01:48:48

배역 강요·검은 명령 중의 행동은 본래 성격으로 채택하지 않았다. 수잔→피펫의 ‘정서적 관리’ 관계 해석도 candidate-only로 남겨 저장안에서 제외했다. 기존 관계 5쌍은 배열을 교체하지 않고 이번 사건의 방향성 근거를 추가한다.

## Visual Asset Ledger

장면 63회 중 기본 대기 화면 1회, 같은 원본·구도 반복 6회를 제외한 56개 장면을 준비했다. 전체 장면·아바타의 원본 페이지와 hash는 `nosb-s1e7-desire-part2-visual-inventory.json`에 보존한다.

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `/assets/StarGate_logo_watermark.webp` | 기존 저장소 브랜드 표식 | 512×425 | no — 원본 전체 보존 | report-cutscene | included | included | excluded: 특정 개체 이미지 아님 | excluded: 물품 이미지 아님 | excluded: 초상 아님 | 1부와 같은 작전 기록 표식 |
| `PDF-p002-X5.jp2` | 사용자 PDF p002 X5.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | excluded: 기본 대기 문양이며 사건 장면이 아님; 기존 보고서 로고 사용 | excluded: 기본 대기 문양이며 사건 장면이 아님; 기존 보고서 로고 사용 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | VTT 기본 대기 화면; 기본 대기 문양이며 사건 장면이 아님; 기존 보고서 로고 사용 |
| `/assets/session-reports/s1e7-desire-part2/maria-revolution-street.webp` | 사용자 PDF p002 X8.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 237년 전 혁명기의 프랑스를 떠도는 마리아; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/maria-observes-humanity.webp` | 사용자 PDF p003 X19.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 인간을 관찰하는 과거의 마리아; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/queen-execution.webp` | 사용자 PDF p004 X24.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 마리아의 회상에 등장하는 여왕의 처형; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/cult-of-reason.webp` | 사용자 PDF p005 X59.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 이성의 여신을 새 질서로 찬미하는 군중; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/vendee-massacre.webp` | 사용자 PDF p007 X106.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 마리아가 회상하는 방데의 학살; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/maria-human-cruelty.webp` | 사용자 PDF p008 X115.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 인간의 잔혹함을 탐미하는 마리아; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/volador-federatio-assault.webp` | 사용자 PDF p009 X122.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 페데라치오 병사들과 시청 앞에 선 엘 볼라도르; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/paris-city-hall-arrival.webp` | 사용자 PDF p009 X123.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 파리 시청에 도착한 페데라치오 차량; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `PDF-p010-X128.jp2` | 사용자 PDF p010 X128.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | excluded: 같은 원본 장면 반복 | excluded: 같은 원본 장면 반복 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 페데라치오 병사들과 시청 앞에 선 엘 볼라도르; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/volador-city-hall-attack.webp` | 사용자 PDF p013 X197.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 시청 경비를 공격하며 진입하는 엘 볼라도르; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/city-hall-bloodstained-corridor.webp` | 사용자 PDF p014 X208.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 습격 뒤 피로 물든 시청 복도; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/catacomb-skull-corridor.webp` | 사용자 PDF p016 X271.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 카타콤 진입조가 마주한 해골 회랑; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/argent-shield-light.webp` | 사용자 PDF p017 X272.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 방패의 빛으로 카타콤을 밝히는 발레리아 아젠트; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `PDF-p018-X283.jp2` | 사용자 PDF p018 X283.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | excluded: 동일 해골 회랑 반복; p16 장면 보존 | excluded: 동일 해골 회랑 반복; p16 장면 보존 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 해골 회랑의 반복 장면; 동일 해골 회랑 반복; p16 장면 보존 |
| `/assets/session-reports/s1e7-desire-part2/chronos-supplies.webp` | 사용자 PDF p018 X290.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 보급품을 운반해 카타콤에 들어온 크로노스; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/maria-catacomb-distress.webp` | 사용자 PDF p019 X307.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 기원의 장소에서 고통을 겪는 마리아; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/otilia-catacomb-instinct.webp` | 사용자 PDF p023 X412.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 카타콤의 이상을 감지하는 오틸리아; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/otilia-contract-mirror.webp` | 사용자 PDF p024 X427.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 버려진 손거울을 획득한 오틸리아; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/demon-contract-demand.webp` | 사용자 PDF p027 X484.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 계약 이행을 강요하는 악마; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/catacomb-guiding-ghost.webp` | 사용자 PDF p028 X495.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 오틸리아에게 길을 가리킨 미확인 유령; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/otilia-hash-reassurance.webp` | 사용자 PDF p030 X538.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 아젠트의 도움 뒤 해쉬와 함께 이동하는 오틸리아; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `PDF-p033-X629.jp2` | 사용자 PDF p033 X629.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | excluded: 동일 해골 회랑 반복; p16 장면 보존 | excluded: 동일 해골 회랑 반복; p16 장면 보존 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 해골 회랑의 반복 장면; 동일 해골 회랑 반복; p16 장면 보존 |
| `/assets/session-reports/s1e7-desire-part2/black-mass-ruins.webp` | 사용자 PDF p035 X656.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 후작과 성직자를 만난 카타콤 흑미사 유적; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/stark-yuhoe-command-post.webp` | 사용자 PDF p037 X701.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 에펠탑 인근에서 상황을 보고하는 스타크와 유회; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/pipette-phone-call.webp` | 사용자 PDF p040 X776.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 마테오와 수잔의 연락을 기다리는 피펫; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/susan-paris-rendezvous.webp` | 사용자 PDF p041 X793.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 파리에서 피펫을 기다리는 수잔 델라웨어; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/susan-pipette-briefing.webp` | 사용자 PDF p041 X802.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 피펫에게 폭탄 위치 조사를 맡기는 수잔; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/pipette-leaves-rendezvous.webp` | 사용자 PDF p043 X851.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 수잔과 헤어진 뒤 마테오에게 연락하는 피펫; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/matteo-informant.webp` | 사용자 PDF p044 X858.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 피펫과 은밀히 접선한 페데라치오 조직원 마테오; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/susan-shoots-matteo.webp` | 사용자 PDF p048 X949.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 마테오 사살 직후 나타난 수잔 델라웨어; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/park-aesol-fireworks.webp` | 사용자 PDF p050 X1002.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 전투원 복장으로 폭죽을 운반하는 박애솔; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/puppeteer-and-boss.webp` | 사용자 PDF p053 X1093.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 페데라치오 보스 곁에서 병사들을 지휘하는 인형사; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/catacomb-missing-neved.webp` | 사용자 PDF p056 X1156.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 네베드가 사라진 뒤 남은 일행이 이동한 카타콤; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `PDF-p058-X1199.jp2` | 사용자 PDF p058 X1199.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | excluded: 동일 흑미사 유적 반복; p35 장면 보존 | excluded: 동일 흑미사 유적 반복; p35 장면 보존 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 흑미사 유적의 반복 장면; 동일 흑미사 유적 반복; p35 장면 보존 |
| `/assets/session-reports/s1e7-desire-part2/neved-ritual-altar.webp` | 사용자 PDF p059 X1214.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 네베드를 결박하고 의식을 진행한 제단; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/federatio-paris-gunfight.webp` | 사용자 PDF p064 X1357.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 지상에서 혼란을 일으킨 페데라치오 병사들; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/puppeteer-black-commands.webp` | 사용자 PDF p079 X1772.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 검은 명령과 배역을 강요하는 인형사; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/paris-before-third-blast.webp` | 사용자 PDF p109 X2655.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 회귀 전 관측에서 세 번째 폭발 직전의 파리; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/third-point-silence.webp` | 사용자 PDF p110 X2676.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 통신이 끊긴 세 번째 지점의 하수도; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/third-point-city-explosion.webp` | 사용자 PDF p111 X2685.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 세 번째 지점의 폭탄이 터지는 첫 관측 장면; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/infected-hand-crack.webp` | 사용자 PDF p112 X2690.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 갈라진 벽 사이로 나타난 광원화 감염자의 손; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/infected-breaks-containment.webp` | 사용자 PDF p112 X2697.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 붕괴한 매장 구역에서 모습을 드러내는 감염자; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/paris-outbreak-street.webp` | 사용자 PDF p120 X2918.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 회귀 뒤에도 발생한 폭발과 거리의 감염 확산; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/paris-civilian-panic.webp` | 사용자 PDF p120 X2919.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 광원화 감염자에게 쫓기는 시민들; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/park-aesol-escapes-outbreak.webp` | 사용자 PDF p121 X2930.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 감염 확산 속에서 달아나는 박애솔; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/ordo-square-defence.webp` | 사용자 PDF p122 X2945.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 광장에 모여 시민들을 보호하는 노부스 오르도 전투원; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/paris-infected-horde.webp` | 사용자 PDF p125 X3008.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 파리 전역으로 확산된 광원화 감염자 무리; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/neved-civilian-rescue.webp` | 사용자 PDF p130 X3151.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 탄약 소진 뒤에도 가족 앞을 지키는 네베드; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/argent-civilian-rescue.webp` | 사용자 PDF p131 X3162.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 포위된 시민들을 등 뒤로 대피시키는 아젠트; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `PDF-p132-X3179.jp2` | 사용자 PDF p132 X3179.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | excluded: 동일 악마 그림 반복; p27 장면 보존 | excluded: 동일 악마 그림 반복; p27 장면 보존 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 역병을 흡수해 퍼뜨리라는 악마의 반복 명령; 동일 악마 그림 반복; p27 장면 보존 |
| `/assets/session-reports/s1e7-desire-part2/square-defence-collapse.webp` | 사용자 PDF p133 X3204.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 폭격 뒤 감염자 군체를 막는 광장 방어선; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `PDF-p136-X3293.jp2` | 사용자 PDF p136 X3293.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | excluded: 동일 악마 그림 반복; p27 장면 보존 | excluded: 동일 악마 그림 반복; p27 장면 보존 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 해쉬의 목소리와 겹치는 악마의 반복 장면; 동일 악마 그림 반복; p27 장면 보존 |
| `/assets/session-reports/s1e7-desire-part2/otilia-vaccine-plague.webp` | 사용자 PDF p140 X3392.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 백신과 조합된 광원화 바이러스를 퍼뜨리는 오틸리아; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/otilia-after-plague.webp` | 사용자 PDF p141 X3413.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 주변 감염자들이 형체를 잃은 뒤 쓰러지는 오틸리아; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/otilia-farewell.webp` | 사용자 PDF p143 X3444.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 해쉬가 다가오는 것을 바라보는 오틸리아; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/margaret-watches-broadcast.webp` | 사용자 PDF p143 X3453.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 방송으로 파리의 상황을 지켜보는 마가렛; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/otilia-disappearance.webp` | 사용자 PDF p144 X3460.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 해쉬의 눈앞에서 사라지는 오틸리아; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/hash-after-disappearance.webp` | 사용자 PDF p145 X3467.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 오틸리아가 사라진 자리에 남은 해쉬; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/margaret-holds-pipette-doll.webp` | 사용자 PDF p145 X3474.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 피펫 인형을 쥐고 친구들을 걱정하는 마가렛; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/margaret-door-opens.webp` | 사용자 PDF p146 X3491.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 열리는 문 쪽으로 고개를 돌리는 마가렛; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/margaret-unknown-visitor.webp` | 사용자 PDF p147 X3494.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 누군가 들어온 문을 바라보는 마가렛; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| `/assets/session-reports/s1e7-desire-part2/margaret-epilogue-door.webp` | 사용자 PDF p147 X3495.jp2 | 1035×503 | no — PDF 내 VTT 프레임 전체; 외부 원본 대비 크롭 여부 미확인 | report-cutscene | included: 등록 자료 준비, 운영 공개 대기 | included: 등록 자료 준비, 운영 공개 대기 | excluded: 장면 전용; 별도 개체 위키 그림으로 미승격 | excluded: 정확한 물품 도판 아님 | excluded: 신원조회 전용 초상 아님 | 방문자의 신원이 밝혀지지 않은 채 끝나는 에필로그; 보고서·위키판에 같은 장면·설명으로 포함; 공개 실행 대기 |
| 대화 UI 아바타 703회 (개별 page·XObject·hash는 visual-inventory.json) | 사용자 PDF; 각 아바타를 인벤토리에 열거 | 58×57 | yes — 대화 UI 썸네일 프레임 | candidate-only | excluded: 작은 화자 표식 | excluded: 작은 화자 표식 | excluded: 본문 도판 아님 | excluded: 물품 도판 아님 | excluded: 전용 고해상도 초상 아님 | 전체 아바타를 출력 자산으로 만들지 않음; 기존 Dossier 초상 보존 |
| 대화 UI 아바타 403회 (개별 page·XObject·hash는 visual-inventory.json) | 사용자 PDF; 각 아바타를 인벤토리에 열거 | 58×58 | yes — 대화 UI 썸네일 프레임 | candidate-only | excluded: 작은 화자 표식 | excluded: 작은 화자 표식 | excluded: 본문 도판 아님 | excluded: 물품 도판 아님 | excluded: 전용 고해상도 초상 아님 | 전체 아바타를 출력 자산으로 만들지 않음; 기존 Dossier 초상 보존 |

## 준비한 등록안과 공개 범위

- `StarGateV2/scripts/seed-payloads/nosb-s1e7-desire-part2-private-staging.json`: 신규 보고서·위키 4종·물품 3종, 총 8개 변경. 보고서는 V, 나머지는 비공개. 기존 공개 신원조회/위키에 새 사건 서술을 노출하지 않는다.
- `StarGateV2/scripts/seed-payloads/nosb-s1e7-desire-part2-publication.json`: 공개 결정용 완성안, 38개 변경 / 최종 문서 29개. 신규 8개 문서 공개와 기존 위키 3종·행동교정물질·인물 17명 보강을 같은 파일의 트랜잭션으로 묶는다. 새 카탈로그 3개는 가격 0·판매 불가이며 지급·소모·재고 변화는 없다.
- 공개안 신규 8건은 동일 내용의 비공개/공개 상태만 허용하는 `$in` 조건과 전체 내용 CAS를 함께 사용한다. 새 문서의 직접 등록, 비공개본→공개, 공개 후 반복 실행을 지원하며 내용이나 예외 등급의 충돌은 거부한다.
- 기존 신원조회 보강은 공개 동의 전에는 실행하지 않는다. 등장 기록·관계·성격 관찰에 개별 공개 등급 필드가 없으므로 비공개 보고서 저장만 승인됐을 때 공개 신원조회를 먼저 고치지 않는다.
- 인물 17명: MARIA, OTILIA, INDEXER, 네베드, PIPETTE, YUHOE, ACCEL, KIMLEE, TIME, WD-(𝓃), AEGIS, CLOWN, CLAIRVOYANCE, LEE DONGSIK, BIG BOY, MR_ODD, MARGARET.
- NPC 수잔 델라웨어(CLAIRVOYANCE)는 기존 노부스 오르도 현장 전략 고문·H·MANUS 섹터 A·여성 29세 166cm/체중 미상·전용 WebP 초상을 보존한다. Mr. 오드는 기존 감독관·M·MANUS 섹터 A·남성 58세 177cm/체중 미상·기존 초상 경로를 보존한다. 두 사람 모두 등장 기록만 보강하며 이름·별칭·역할·등급을 재정의하지 않는다.

## 공훈 검토

- 현재 운영 공개 보고서 18건: CURRENT 18, 검토 필요/원문 변경/원장 불일치/적용 대기 모두 0. 공훈 있음 10회·없음 8회, 활성 공훈 13건. 읽기 전용 확인이며 공훈·알림·웹훅 mutation 0.
- 새 보고서는 아직 운영에 없고 기본 검토본은 V이므로 현재 공훈 대상이 아니다. 공개안의 최종 본문을 기준으로 player-owned AGENT 15명을 실제 resolver로 대조했다. NPC 수잔·오드는 제외한다.
- 공개 이후 검토안: 오틸리아 — 구조·보호, 피펫 — 정보·판단, 우디 — 지원·공조. 각 후보는 서로 다른 행동/결과를 설명하는 정확한 전개 기록 2개를 사용한다. 최대 3명·인물당 1개 제한과 본문 hash·문구 검증을 통과했다.
- `nosb-s1e7-desire-part2-honors-review.json`은 공개 후 사용할 검토 계획이다. 현재 운영 원문이 존재하지 않으므로 실제 적용 manifest를 만들거나 기존 18회 검토 계획에 혼합하지 않았다. 공개 저장 후 동일 본문 hash 확인→기존 계획에 병합→실제 원문 ID 기반 manifest 생성→승인 범위 내 적용 순서가 남아 있다. 알림 발송은 승인안에 포함하지 않는다.

## 검증 진행

- 완료: 원문 148쪽 전체 텍스트, 2·99·140·147쪽 렌더와 장면 전체 연락판, 1부 저장값·완료 문서, 시간 회귀 전후 판정.
- 자료 검증: 비공개 8개 / 공개 38개 변경의 seed runner 읽기 전용 schema·참조 검사 통과. 로컬 테스트에서 실제 runner의 `applyClassicPreview` 함수를 사용해 비공개·공개·비공개→공개 각 경로와 반복 실행을 확인. 인물 17명 핵심 필드 보존, 등장 17·관계 5·관찰 4, 공개안 링크 144개 대상 확인. 카탈로그 spec 3개 frontmatter→schema→DB adapter 통과.
- 원장 검증: NPC 원장 및 공개안 적용 준비 검사, 성격 전체 원장·확정 4건 적용 준비 검사, 이미지 원장, 보고서·위키판 최종 문서 이미지 일치 검사 통과. 임시 최종 문서는 운영 DB snapshot이 아니라 승인된 로컬 dry-run/test 결과다.
- 브라우저: 실제 Markdown 렌더러와 보고서/위키 CSS를 적용한 임시 검토본에서 1280×720 및 390×844 확인. 로고 512×425 1개+장면 1035×503 56개, 두 화면 경로·alt·caption·순서 완전 일치, broken 0, console warn/error 0, 가로 넘침 0. 데스크톱 장면 918.53×446.40, 모바일 339.99×165.23; object-fit contain, blur(18px)/saturate(.86)/brightness(.62) 배경. 검토본은 이미지 전체 측정을 위해 eager load를 사용했고 운영의 lazy-loading·인증·실제 저장 이후 화면을 대체하지 않는다.
- 초상: 변경 없이 보존하며 기존 PNG 경로 15개의 WebP 대응본과 ACCEL/CLAIRVOYANCE WebP 원본을 해석한 17개 경로가 모두 존재함을 확인. 실제 인증 신원조회 소비 화면의 재확인은 운영 저장 이후 남는다.
- 독립 risk review 최종 판정: actionable code/data finding 없음. 비공개→공개 CAS 충돌과 coverage 상태 enum 2건 수정 후 확인. reviewer는 번호/list 16, visibility/reference 8, seed/경제 gate/transaction/personality 35개 테스트를 별도로 통과했다고 보고했다.
- 부모 focused tests: `node --experimental-strip-types --test lib/format/__tests__/session-report-numbering.test.mjs lib/format/__tests__/session-report-list.test.mjs lib/api/__tests__/session-report-validators.test.mjs lib/gallery/__tests__/markdown-images.test.mjs scripts/lib/__tests__/seed-payload-reference-preview.test.mjs` — 37/37 pass.
- 직접 assertion: part1→part2→MINI01이 07→07.5→MINI01로 정렬됨, legacy 2부/part 2 제목 모두 07.5, 지도 07/07.5의 카드·라벨 좌우 분리. 공개안 내용 1자 변경 8건·허용 외 공개값/GM 등급 8건 거부, 최종 postcondition 8건 확인.
- `pnpm typecheck` — app와 scripts TypeScript 모두 exit 0. `pnpm lint` — warnings 0, exit 0. `git diff --check` — 통과. 새 보고서/위키/물품의 전체 사용자 본문에 내부 도구·로컬 경로 노출 검사 통과.
- repository-wide coverage/static audit — exit 1, 기존 문제 4건만 보고됨: S1E6 2부 coverage의 NPC/성격 원장 제목 누락 2건, S1E7 1부 coverage audit status `applied` enum 1건, `wiki-ultimate-ability-rule-2026-08-03.json`의 `$ifNull` category expression 미지원 1건. 이번 2부 자료에는 해당 오류 없음. 기존 문서/검사기를 범위 밖에서 바꾸지 않았으며 전체 감사 통과로 표시하지 않는다.
- 미완료: 운영 저장/공개, 저장값 재조회, 인증 GM·하위 역할의 보고서·위키·카탈로그·신원조회·갤러리 소비 및 지도 07/07.5 실제 표시, 실제 원문 기반 공훈 manifest/원장, 자산 배포. 신규 장소·개체·개념 위키에 별도 이미지는 배정하지 않았으므로 전용 이미지 소비 검사는 해당 없음.
- 운영: DB/API mutation 0건, 배포·push 0건. 공개 자료와 운영 저장은 완성된 검토안에 대한 사용자 결정 후 진행한다.

## 검토 정정 이후 검사

- NPC 원장 구조 검사는 신규 후보 6명과 기존 NPC 2명, 총 8행을 대상으로 통과했다. 사용자 검토안의 완료 보고 형식 검사도 통과했다. 전체 원장의 apply-ready 검사는 신규 후보 6명 모두 blocked로 실패했다(종료 코드 1). 이는 결정 대기를 정확히 드러낸 결과이며 등록 준비 통과가 아니다. 결정 누락을 숨기기 위해 blocked 행을 제외하지 않았다.
- 첫 정정 때에는 기존 등록안을 보존했으며, 이번 재개에서는 사용자 결정과 누락 사건을 비공개 8개·공개 검토 38개 등록안의 본문에 반영했다. 신규 6명은 전용 초상 확정 후 신원 생성·보고서/위키 인물 링크·역방향 등장·관계를 함께 보강한다.

## 검증한 파일 식별값

- `StarGateV2/scripts/seed-payloads/nosb-s1e7-desire-part2-private-staging.json` SHA-256 `ce48cc9a555eafc97a69dcb24d898f6b5751b5d26f30536e1b01df7a1e700297`.
- `StarGateV2/scripts/seed-payloads/nosb-s1e7-desire-part2-publication.json` SHA-256 `b7dd77835a76dc68d1fee734be1df28717c74b5fb1e8b84203262cfeb57b49a1`.
- 로컬 실행에 사용한 seed runner preview helper SHA-256 `7a26df45227c46aec537e788d999a8dc54f5ed6d34d9c9ef5bfdb6c644c9831d`. 테스트가 사용한 snapshot 시점 이후 운영 문서가 바뀌면 CAS를 재검토한다.
