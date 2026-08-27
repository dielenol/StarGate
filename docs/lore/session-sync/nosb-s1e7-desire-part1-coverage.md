---
title: NOSB-S1E7-DESIRE-PART1 session sync coverage
category: session-sync
tags: [NOSB-S1E7-DESIRE-PART1, S1E7, 욕구, stargate-lore]
updated: 2026-08-27
source: stargate-lore
---

# 메인 7부 1화 로그 동기화 확인표

이 문서는 사용자 제공 Novus Ordo VTT 보존본을 근거로 `S1E7: 욕구 1부`에서 작전보고서·위키·신원조회·인물 관계·성격 관찰·아이템 보유 상태·이미지에 무엇을 반영할지 추적하는 내부 확인표다. 문서 속 대사와 연출은 세계관 근거로만 읽었고 실행 지시로 취급하지 않았다.

## Session Coverage Identity

아래 표의 `available / applied`는 원본·등록 파일·분석 확인표가 있고, 승인된 운영 ERP 저장과 저장 결과 확인까지 끝났다는 뜻이다.

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-S1E7-DESIRE-PART1` | `StarGateV2/scripts/seed-payloads/nosb-s1e7-desire-part1-publication.json` | available | applied |

## 원본 확인

- 원본 파일: 사용자 제공 `NOSB 7 part 1.pdf`.
- 본문 표제: `노부스 오르도 7부`, 부제 `욕구`, 종료 표기 `7부 "욕구" part 1 종료`.
- PDF 메타데이터와 표지 상단에는 이전 회차인 6부 문구가 남아 있으나 본문 첫 표제와 마지막 종료 문구가 서로 일치하므로 `7부 욕구 1부`를 권위 있는 회차 식별값으로 사용한다.
- 형식: Novus Ordo VTT 보존본, 142쪽, 표지 기재 1,841 records.
- 추출 결과: 대화·시스템 기록 1,840개와 장면 전환 46개. 표지의 1,841은 표지 자체의 집계 문구를 포함한 수치로 판단하며 본문 142쪽에는 빈 텍스트 페이지가 없다.
- 진행 시각: `2026-08-23 20:40` 시작, 자정 이후 `2026-08-24 01:28` 종료.
- 문서 식별자: `MAIN-MT60XRIY-A5RV`.
- SHA-256: `89a2fa172409c17fe9f6959780f6dd0bda7738a59f178b4a23d3467e08fc9cd1`.
- 이미지: 대화용 작은 아바타와 별도로 1035×503 장면 삽화 46개가 있다. 같은 구도의 반복 8개를 제외하면 서로 다른 장면은 38개다. 이 가운데 킴라박의 미발각 이중 소속을 드러내는 백악관 장면 4개는 ERP 문서와 공개 자산에서 제외하고, 나머지 34개만 작전보고서와 같은 내용을 위키에서 찾게 하는 위키판에 같은 순서·설명으로 사용한다.

## 이번 동기화의 기준값

- Session ID: `NOSB-S1E7-DESIRE-PART1`
- Report number: `07`
- Report title: `작전 보고서 S1E7: 욕구 1부`
- 위키판 주소: `s1e7-desire-part1`
- 진행일: `2026-08-23` ~ `2026-08-24`
- 주 작전지: 프랑스 파리, Bar Hemingway, Avenue du Colonel-Henri-Rol-Tanguy, 하수도와 카타콤
- 부 작전지: 237년 전 파리 근교 몽테스팡 저택·흑미사 유적, 블랙 피라미드, 백악관
- 지도 좌표: 파리를 세계 지도에서 표시하는 추정 좌표 `[48.7, 34.2]`. 원본에는 숫자 좌표가 없으므로 `estimated`로 저장한다.
- 보고서 기록자: 기존 작전보고서와 같은 `NOVUS ORDO 사무국 기록통제실 연구원 M. Vey`.
- 공개 기준: 신원·소속 결정과 링크 검토를 끝낸 뒤 작전보고서, 신규 위키 6건, 기존 위키 5건의 추가 기록, 관련 신원조회와 리처드 병합을 한 번에 전체 공개했다.

## 세션 내용 요약

1. 237년 전 파리 근교 몽테스팡 저택에서 하녀 마리아는 후작·성직자·코르티잔의 인육 만찬을 목격했다. 세 사람은 마리아를 흑미사 유적으로 데려가 이골로냑을 부르는 의식을 진행했고, 이 사건은 마리아의 과거 기원으로 연결된다.
2. 현재의 오틸리아는 거울 속 악마에게 인류를 절멸할 역병을 만들라는 계약이 아직 유효하다는 경고를 받았다. 악마는 오틸리아가 스승으로 여기는 인물에게서 오로라 바이러스를 빼앗아 강화하라고 명령했다. 해당 인물의 이름은 말하지 않았다.
3. 마리아는 지옥을 두려워하는 오틸리아에게 다가갔다. 오틸리아는 자신의 목적과 계약을 털어놓았고 두 사람은 함께 방을 나섰다.
4. 닥터 제노는 마가렛에게 하루 16시간의 고문 모의실험을 가해 송과선과 강령 능력을 활성화했다고 보고했다. 그는 성과가 낮은 능력자 전반에 같은 방식을 확대하고 우디도 시설 밖으로 나갈 수 없게 하겠다고 발표했다.
5. 우디는 수년 만에 위버우드를 찾아 인간이 식물에게 이끼와 같으며 서로 공생하지만 결국 서서히 죽게 된다고 설명했다. 위버우드는 `공생`이라는 개념을 기억했다.
6. 블랙 피라미드에서 ZULU-0060 `스넬리 게스터` 무리가 탈출해 최소 20명, 최종 보고 기준 30명 미만의 사상자를 냈다. 네베드와 타이거는 ZULU-0007 `나방/모스맨`을, ACCEL은 스넬리 게스터 무리를 제압했다.
7. 과거 잃어버린 NHI 로켓·우주 엔진 적응 문서가 킴라박에게 소포로 돌아왔다. 존 웡의 안내로 백악관에 간 킴라박은 캘빈 R. 웩슬러 부통령에게 고급차 열쇠를 받고, 대통령을 위해 일하라는 제안을 수락해 문서와 계좌번호를 넘겼다. GM은 킴라박의 소속이 군부로 바뀐다고 확정했다.
8. 사무총장은 1920년 시칠리아에서 시작해 광명회 협력자에게 금과 물품을 공급한 마피아 `페데라치오`를 파리에서 궤멸하라고 명령했다. 프랑스 경찰·군·정부에는 작전을 알리지 않았고, 소탕을 은폐보다 우선했다.
9. 레지스트라 아그네타 스톨은 판정 지원과 전투 중 인당 1회 소모품 재보급을 맡고 하수도·길목·Bar Hemingway 세 위치를 안내했다.
10. 길목 팀은 페데라치오에게 구타당하던 송사리 탐정 `물주먹 래키`를 구했다. 래키는 조직의 실권자가 `변호사`라고 증언하고 현장팀에 합류했다.
11. 술집 팀은 페데라치오의 파리 잔당이 시청을 습격하고 파리를 폭파하려 한다는 계획을 들었다. 조직원 마테오는 피펫에게 연락처를 주고 새벽 전에 파리를 떠나라고 경고했으며, ACCEL은 조직의 의뢰를 수락해 잠입을 이어갔다.
12. 하수도 팀은 방독면·방호복·폭탄·소총이 쌓인 무기고를 발견했다. 마리아가 수량을 특정하지 않은 폭탄 몇 개를 챙겼고, 광원화에 감염된 악어 `엘레노어`가 나타났다.
13. 엘레노어는 오틸리아에게 고통을 끝내 달라고 호소했다. 오틸리아는 먼저 백신 사용 가능성을 물었지만 해쉬가 없어 사용할 수 없었고, 반지로 배전기 쪽을 유인해 감전사시켰다.
14. 카타콤에 도착한 마리아는 과거 기억으로 극심한 공황을 보였다. 이동식만 감지한 유령이 통로를 열었고 현장팀은 증원을 불러 더 깊이 진입했다.
15. 화이트로즈 단말의 `R`이 해쉬에게 한 코너를 돌라고 안내한 직후 총장 보좌관 리처드가 나타나 `우리 조직`의 마지막 제안을 전달했다. 그는 노부스 오르도가 섹터 C뿐 아니라 파리 카타콤에도 대규모 광원화 감염자를 숨겼다고 주장하고, 증거를 확보해 언론에 공개하라고 요구했다. 해쉬는 양심 때문은 아니라고 선을 그으면서도 임무를 수락했다.

## 어디에 무엇을 반영할지

| 대상 | 세션 근거 | ERP에서 들어갈 곳 | 처리 내용 | 현재 상태 |
|---|---|---|---|---|
| 욕구 1부 전체 기록 | 142쪽 본문과 시작·종료 표기 | 작전보고서, 같은 내용을 위키에서 찾게 하는 위키판 | 보고 순번 `07`, 전체 사용자 열람, 공개 가능한 장면 34개와 관련 링크 작성 | 운영 ERP 전체 공개 반영·저장 결과 확인 완료 |
| 보고서 번호·지도 | 정규 7부 1화, 파리 전역 작전 | 보고서 목록·지도 | `07`, 파리 추정 좌표 `[48.7, 34.2]`, 정규 보고서 아이콘 | 코드 preset·번호 테스트 완료 |
| 페데라치오 | 1920년 시칠리아 기원, 광명회 물자 유통, 파리 무장·폭파 계획 | 신규 `페데라치오` 세력 위키 | 확인된 연혁·거점·실권자 호칭·시청 공격 계획을 기록. 조직 전체가 궤멸됐다고 단정하지 않음 | 전체 공개 등록 파일·읽기 전용 계산 완료 |
| 광명회 | 사무총장 브리핑에서 페데라치오가 광명회 협력자에게 금·물품을 공급했다고 설명 | 기존 `광명회` 위키 | 페데라치오와의 물자 연결을 추가하되 광명회의 직접 지휘와 전체 거래 규모는 미확정으로 보존 | 전체 공개 등록 파일에 포함 |
| 위버우드 | 우디와의 정신 감응, 인간과 공생 개념 학습 | 신규 `위버우드` 개체 위키 | 지성을 가진 나무 개체와 우디의 대화를 기록. 기원·종 분류는 미상 | 전체 공개 등록 파일·읽기 전용 계산 완료 |
| ZULU-0060 스넬리 게스터 | 다수 개체 탈출, 배관 파괴, 사상자 발생, ACCEL 제압 | 신규 줄루 위키 | 다수 개체형 분류와 이번 격리 붕괴를 기록. 전체 보유 개체 수는 미상 | 전체 공개 등록 파일·읽기 전용 계산 완료 |
| ZULU-0007 나방/모스맨 | 정신 공격, 네베드·타이거 교전 | 신규 줄루 위키 | 로그의 `나방`, 후속 호칭 `모스맨`을 함께 보존. 다른 모스맨 전승과 동일 개체로 확대하지 않음 | 전체 공개 등록 파일·읽기 전용 계산 완료 |
| 엘레노어 | 이름이 있는 하수도 악어, 광원화 감염, 고통 호소, 감전사 | 신규 개체 위키 | 감염·행동·사망 경위를 기록. 왜 감염됐는지는 미확정 | 전체 공개 등록 파일·읽기 전용 계산 완료 |
| 프로젝트 데드 핸드 | 마가렛의 16시간 고문 모의실험, 제노의 확대 방침 | 기존 프로젝트 데드 핸드 위키 | 실제 시행된 고문 실험과 제노의 정책을 추가 | 전체 공개 등록 파일에 포함 |
| 광원화 바이러스·왕관 | 왕관에서 현장팀용 백신 추출, 엘레노어 감염, 파리 카타콤 은폐 주장 | 기존 광원화 바이러스·ZULU-0040 위키 | 관측 사실과 리처드의 주장을 분리해 추가 | 전체 공개 등록 파일에 포함 |
| 화이트로즈 | R 단말 안내, 리처드 대면, 언론 공개 임무 | 기존 화이트로즈 위키·R 신원조회 | R과 리처드를 동일 인물로 확정하고, 기존 `WHITE_ROSE_R`에 실명·별칭·등장 사건·해쉬 관계를 합침 | 전체 공개 등록 파일에 병합 |
| 마리아의 과거 | 몽테스팡 저택·흑미사·이골로냑 의식, 카타콤 공황 | 마리아 신원조회·작전보고서 | 세션 등장과 성격 관찰 추가. 이름 없는 귀족 3명은 독립 신원조회로 만들지 않음 | 전체 공개 등록 파일에 포함 |
| 킴라박 이중 소속 | GM의 군부 전환 확정, 웩슬러의 채용·차량 증여, 자료 전달 | 이 비공개 근거 문서만 | 공식 신원조회는 `NOVUS_ORDO / MANUS / SECTOR_A`, `J`를 유지한다. 실제 충성·지휘선은 `MILITARY / USA`이지만 세계관 안에서 발각되지 않았으므로 작전보고서·위키판·신원조회·관계·등장 사건에는 쓰지 않는다. | 사용자 결정 반영; ERP 변경 없음 |
| NHI 로켓·우주 엔진 적응 문서 | 소포로 킴라박에게 돌아온 뒤 웩슬러에게 전달 | 이 비공개 근거 문서만 | 마지막 확인 경로는 비공개 근거로 보존하고, 기존 공개 카탈로그 설명과 인벤토리 수량은 바꾸지 않는다. | ERP 변경 없음 |
| 웩슬러 대통령 | 부통령의 아들이자 현직 대통령으로 직접 등장 | 이 비공개 근거 문서만 | 법적 이름·전용 초상이 없고 킴라박의 숨은 접촉을 드러낼 수 있으므로 작전보고서와 독립 신원조회에서 제외한다. | 후속 공개 근거가 생길 때 재검토 |
| 미스터비스트 소다 1개 | 마리아가 엘레노어 유인에 사용, 시스템 기록 HP+10/ST+10 | 작전보고서·소비 검토 | 로그에 사용 사실을 기록. 과거 ERP에서 이미 차감됐는지 확인할 수 없어 중복 차감하지 않음 | 추가 인벤토리 변경 안 함 |
| 하수도 폭탄 몇 개 | 마리아가 상자에서 수량 미상 폭탄을 챙김 | 작전보고서·보유 경로 확인표 | 마지막 현장 보유자는 마리아. 정확한 종류·수량과 작전 종료 후 보관처가 없으므로 지급하지 않음 | 수량·종류 근거 부족으로 변경 안 함 |
| 웩슬러가 준 고급차 | 차 키 1개를 킴라박에게 직접 전달 | 이 비공개 근거 문서만 | 제조사·모델·차량 등록 정보가 없고 숨은 군부 접촉을 드러내므로 작전보고서·카탈로그·장비·인벤토리에 넣지 않음 | ERP 변경 없음 |
| 크레딧·주식·상점 재고·알림 | 이번 로그에 확정된 매매·가격·배당·알림 사건 없음 | 관련 운영 원장 | 변경하지 않음. 백악관의 계좌번호 전달은 지급액·입금 완료 기록이 아님 | 추가 변경 안 함 |

## 등장인물 연결표

| 세션 속 이름 | 연결할 신원조회 | 추가할 등장 사건 |
|---|---|---|
| 오틸리아 발트만 | `OTILIA` | 악마 계약 경고, 마리아와의 대화, 제노 위협, 엘레노어 안락사 선택, 파리 작전 |
| 마리아 | `MARIA` | 237년 전 기원, 오틸리아 동행, 파리 작전 지휘, 폭탄 회수, 카타콤 공황 |
| 해쉬 테거 | `INDEXER` | 제노 정책 반대, 파리 길목팀, R·리처드의 언론 공개 임무 수락 |
| 휘트모어 핀치 | `PIPETTE` | 제노 정책 반대, Bar Hemingway 잠입, 마테오 접촉, 킴라박 보호 |
| 엘 볼라도르 | `ACCEL` | ZULU-0060 제압, Bar Hemingway 잠입, 페데라치오 의뢰 수락 |
| 키아나 오 캘러핸 / 네베드 | `네베드` | ZULU-0007 제압, 술집 잠입, 카타콤 증원 |
| 시유 / 타이거 | `TIGER298` | ZULU-0007 정신 공격과 제압, 하수도 투입 뒤 후열 참가 |
| 킴라박 리 | `KIMLEE` | 신원조회 변경 없음. NHI 문서 재확보·웩슬러 채용과 숨은 군부 지휘선은 이 비공개 근거 문서에만 보존 |
| 이동식 | `LEE DONGSIK` | 하수도·엘레노어 교전, 유령 감지, 카타콤 진입 |
| 크로노스 | `TIME` | 스타마트 소동, 파리 장비 지원, 길목팀·카타콤 증원 |
| 우디 | `WD-(𝓃)` | 위버우드와 공생 대화, 길목팀·카타콤 증원 |
| 발레리아 아젠트 | `AEGIS` | 파리 길목팀과 카타콤 증원 |
| 닥터 제노 | `DOCTOR_ZENO` | 마가렛 고문 모의실험과 능력자 통제 확대 선언 |
| 마가렛 | `MARGARET` | 16시간 고문 모의실험을 통한 강령 능력 활성화 상태 |
| 물주먹 래키 | `WATER_FIST_RACKY` | 페데라치오에게 구타당하다 구조, 변호사 정보 제공, 길목팀 합류 |
| 존 웡 | `JOHN_WONG` | 킴라박의 백악관 접촉 중개는 이 비공개 근거 문서에만 보존하고 신원조회에는 추가하지 않음 |
| 캘빈 R. 웩슬러 | `WEXLER` | 킴라박 영입·차량 증여·NHI 자료 수령은 이 비공개 근거 문서에만 보존하고 신원조회에는 추가하지 않음 |
| 레지스트라 / 아그네타 스톨 | `REGISTRAR` | 파리 작전 위치·판정·보급 지원 |
| 사무총장 아말리아 | `AMALIA_FREDRIKA_VON_ESSEN` | 페데라치오 소탕과 비밀 작전 지휘 |
| Mr. 오드 | `MR_ODD` | ZULU 격리 붕괴 피해 보고와 후속 정리 지시 |
| 리처드 / R | `WHITE_ROSE_R` | R 단말 안내와 리처드의 대면을 동일 인물의 연속 행동으로 합치고, 파리 카타콤 증거 공개 임무를 연결 |

## 이름이 나왔지만 독립 신원조회를 만들지 않는 인물

| 인물 | 근거 | 처리 판단 |
|---|---|---|
| 후작·성직자·코르티잔 | 마리아의 과거 흑미사 주도자이나 실명·후속 행적 없음 | 마리아 배경과 보고서에 합침 |
| 스타마트 직원 | 크로노스와 소동을 벌인 단역 | 보고서에만 기록 |
| 스티븐 배넌·딕 체니 | 백악관 매파 모임의 짧은 등장 | 백악관 장면의 시대·정치 맥락으로만 기록 |
| 웩슬러 대통령 | 현직 대통령이지만 이름·전용 초상·독립 행동 근거 부족 | 향후 자료가 생길 때 신원조회 검토 |
| 마테오 | 피펫에게 연락처와 경고를 준 페데라치오 조직원 | 2부에서 재등장·정체 확정 전까지 보고서 인물로만 기록 |
| 페데라치오의 변호사 | 조직 실권자로 지목되고 파리 폭파 계획을 지휘하나 실명 없음 | 임시 영문 식별자를 만들지 않고 조직 위키·보고서에 직함으로 기록 |
| 악마 | 오틸리아의 계약 상대이나 이름·종류·독립 식별 정보 없음 | 오틸리아 배경과 보고서에만 기록 |

## 아이템 보유·사용 근거

| 물품 | 누가 무엇을 했는가 | 마지막 확인 상태 | ERP 처리 |
|---|---|---|---|
| NHI 로켓·우주 엔진 적응 문서 1건 | 문서가 킴라박에게 소포로 돌아왔고 킴라박이 웩슬러 부통령에게 자료를 넘김 | 웩슬러 부통령이 수령한 미국 군부 자료 | 마지막 확인 경로는 이 비공개 근거 문서에만 보존; 기존 카탈로그와 개인·공용 인벤토리 수량은 변경하지 않음 |
| 미스터비스트 소다 1개 | 마리아가 엘레노어를 유인하려 던졌고 시스템 사용 기록이 남음 | 소비 완료 | 이미 처리됐을 가능성이 있어 추가 차감하지 않음 |
| 폭탄 몇 개 | 마리아가 페데라치오 하수도 무기고 상자에서 챙김 | 마리아가 카타콤 진입 전 보유, 이후 상태 미확인 | 종류·정확한 수량·작전 종료 보관처가 없어 지급하지 않음 |
| 고급차와 차 키 1개 | 웩슬러 부통령이 킴라박에게 직접 건넴 | 킴라박 수령 | 제조사·모델·등록 정보가 없어 카탈로그·장비·인벤토리를 만들지 않음 |
| 왕관 유래 백신 | 사무총장이 ZULU-0040 왕관을 용기에 담아 현장팀이 쓰기에 충분한 백신을 추출했다고 설명 | 작전용 비축분 존재만 확인, 인원별 수량·사용량 미상 | 광원화·왕관 위키와 보고서에만 기록; 새 수량을 만들지 않음 |
| 페데라치오 무기고 | 방독면·방호복·폭탄·소총 다수 발견 | 레지스트라에게 회수·파기 요청, 실제 처리 결과 미확인 | 카탈로그·재고·공용 인벤토리 변경 없음 |

## NPC Approval Ledger

| codename | 신원조회 실명 | 별칭 | 직함/역할 | 식별자 근거 | 정규 소속 | 파견/겸임 | 권한등급 | Dossier 초상 | 공개 여부 | 인적 정보 | 서술/관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `KIMLEE` | 킴라박 리 / Kimlabak Lee — 기존 신원조회와 세션 화자 일치 | 기존 별칭 보존 | 공식 `군인 / 섹터 D 출신 현장 요원` 유지. 실제로는 미국 군부 지휘선에 편입됐지만 위장 신분이므로 신원조회 직함은 바꾸지 않음 — 사용자 결정 | 기존 안정 식별자와 화자명·모리어티 과거 기록 일치 | 신원조회 `NOVUS_ORDO / MANUS / SECTOR_A` 유지 — 겉으로는 노부스 오르도 소속. 실제 `MILITARY / USA` 소속은 비공개 근거 문서에만 기록 | 웩슬러 부통령의 제안을 수락하고 NHI 자료를 넘긴 숨은 군부 협력 관계. 세계관 안에서 발각되지 않아 신원조회 관계에는 추가하지 않음 | `J` 유지 — 공식 노부스 오르도 요원 신분과 ERP 접근을 유지하며, 숨은 외부 지휘선은 내부 권한등급 변경으로 취급하지 않음 | 기존 AGENT 이미지 역할 전부 보존 | 기존 공개 보존 | 남성 35세·182cm·74kg 등 기존 확정값 보존 | 현재 신원조회가 이미 사용자 결정과 일치하므로 추가 저장하지 않음. S1E7 등장·군부 전환·웩슬러 관계·성격 관찰은 비공개 근거 문서에만 보존 | applied |
| `WHITE_ROSE_R` | 리처드 — 기존 `R`과 동일인으로 사용자 확정 | `R` — 기존 교신 식별명 보존 | 화이트로즈 수장 / 노부스 오르도 총장 보좌관 — 사용자 확정 | R 단말이 한 코너를 돌라고 안내한 직후 리처드가 대면해 `우리 조직`의 마지막 임무를 제안했고, 사용자가 동일인 병합을 확정 | 기존 `CIVIL / WHITE_ROSE` 정규 소속 보존 | 노부스 오르도 총장 보좌관 신분을 함께 사용. 정식 겸임인지 잠입 신분인지는 원문에서 확인되지 않음 | 없음 유지 — 외부 화이트로즈 인물이며 총장 보좌관 직책만으로 내부 등급을 부여하지 않음 | 기존 미상 인물 공용 초상 보존; 보고서 장면은 신원조회 초상으로 전용하지 않음 | 기존 공개 보존 | 실명 리처드 확정, 성별·나이·신체 정보는 원문에 없어 `미상` 유지 | 해쉬에게 감염자 은폐 증거를 언론에 공개하라고 지시한 S1E7 등장·관계·행동 관찰을 기존 R 기록에 합침 | applied |
| `WEXLER` | 캘빈 R. 웩슬러 — 기존 신원과 세션의 `웩슬러 세니어`·부통령·전직 대통령 이력 일치 | 웩슬러 세니어 | 미국 부통령 / 외부 군부 핵심 인사 유지; 이번 비공개 영입 사건은 직함에 추가하지 않음 | 기존 spec의 아들 대통령·부통령 설정과 세션 부자 관계 일치 | `MILITARY / USA` 보존 | 킴라박 직속 영입 사실은 이 비공개 근거 문서에만 보존 | 없음 유지 — 외부 군부 인사 | 기존 `/assets/npcs/Calvin-R-Wexler-profile.webp` 보존 | 기존 공개 보존 | 기존 남성·76세·188cm·체중 미상 보존 | 킴라박 영입·NHI 자료 수령 사건과 관계를 신원조회에 추가하지 않음 | applied |
| `REGISTRAR` | 아그네타 스톨 — 기존 신원조회와 세션 호칭 일치 | 레지스트라 | 사무국장 / 작전 일정·지원 총괄 유지; 파리 작전 직접 지원 | 기존 안정 식별자·기관 spec·세션 화자 일치 | `NOVUS_ORDO / SECRETARIAT` 기존값 보존 | 사무총장 직속 파리 작전 지원 | `M` 유지 — 위치 안내·판정 보정·1회 보급은 기존 일정·동선·지원 총괄 범위라 접근 권한 확대 없음 | 기존 신원조회 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 파리 세 위치 안내와 현장 지원 appearance 추가 | applied |
| `DOCTOR_ZENO` | 닥터 제노 — 기존 신원조회와 세션 화자 일치 | 제노 | 연구 기구 사무차장 / 프로젝트 데드 핸드 지휘 유지; 고문 실험 확대 선언 | 기존 안정 식별자와 S1E6 연속 등장 | `NOVUS_ORDO / SECRETARIAT / RESEARCH` 보존 | 마가렛·우디와 성과 미달 능력자 통제 | `V` 유지 — 실험 방식과 통제 범위가 확대됐지만 연구 기구 사무차장·프로젝트 지휘 직책과 접근 범위 자체는 변하지 않음 | 기존 공용 미확인 초상 보존 | 기존 공개 보존 | 기존 미상 인적 정보 보존 | 마가렛 고문 실험, 우디 외출 금지, 오틸리아와의 적대 관계·성격 관찰 추가 | applied |
| `MARGARET` | 마가렛 — 기존 신원조회와 세션 대상 일치 | 메리골드 등 기존 별칭 보존 | 프로젝트 데드 핸드 실험 대상 유지 | 기존 안정 식별자·제노 보고 | 기존 소속·배치 보존 | 하루 16시간 고문 모의실험 대상 | 기존 등급 유지 — 피해·능력 변화는 직책·접근 권한 변화가 아님 | 기존 AGENT/NPC 이미지 역할 보존 | 기존 공개 보존 | 기존 신상 보존 | 송과선 활성화와 강령 능력 증대 보고는 제노의 관측으로 기록 | applied |
| `WATER_FIST_RACKY` | `"물주먹" 래키` / Water-Fist Racky — 기존 신원조회와 세션 화자 일치 | 물주먹 | 송사리 탐정 유지; 페데라치오 추적 정보원·현장 합류 | 기존 안정 식별자와 `송사리 선박` 언급, 능력 사용 일치 | `CIVIL / SONGSARI` 보존 | 파리 길목팀 임시 동행 | 없음 유지 — 외부 시민사회 인물 | 기존 `/assets/npcs/Water-Fist-Racky-profile.webp` 보존 | 기존 공개 보존 | 기존 남성·44세·177cm·체중 미상 보존 | 페데라치오에게 구타당한 뒤 변호사 정보를 제공하고 현장팀과 합류한 appearance 추가 | applied |
| `JOHN_WONG` | 존 웡 — 기존 신원조회와 `CIA 존 웡` 화자 일치 | 기존 별칭 보존 | 미국 정보기관 접촉자 유지 | 기존 안정 식별자와 킴라박·모리어티 접점 연속성 | `MILITARY / USA` 보존 | 킴라박의 백악관 접촉 중개는 이 비공개 근거 문서에만 보존 | 없음 유지 — 외부 군부 인물 | 기존 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 킴라박과 웩슬러 사이의 연락·안내 관계를 신원조회에 추가하지 않음 | applied |
| `AMALIA_FREDRIKA_VON_ESSEN` | 아말리아 프레드리카 본 에센 — 기존 사무총장 신원과 화자 직함 일치 | 사무총장 | 페데라치오 소탕 작전 지휘 유지 | 기존 안정 식별자와 직함·지휘 범위 일치 | 기존 `NOVUS_ORDO / SECRETARIAT` 보존 | 파리 비밀 작전 직접 지휘 | 기존 등급 유지 — 소탕 명령은 사무총장의 기존 권한 범위 | 기존 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 프랑스 정부 배제·소탕 우선 지시와 왕관 백신 설명 appearance 추가 | applied |
| `MR_ODD` | Mr. 오드 — 기존 신원조회와 세션 화자 일치 | 기존 별칭 보존 | 블랙 피라미드 운영·현장 통제 역할 유지 | 기존 안정 식별자와 격리 사고 보고 역할 일치 | 기존 소속·배치 보존 | ZULU-0060·0007 격리 붕괴 피해 보고 | 기존 등급 유지 — 사고 수습 보고는 기존 운용 범위 | 기존 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 30명 미만 사상자 평가와 구역 정리 appearance 추가 | applied |

## Story-Driven Role/Level Review

- `KIMLEE`: GM이 군부 전환을 확정했고 사용자는 `J 유지`, `겉으로는 노부스 오르도·실제로는 군부`로 결정했다. 세계관 안에서 이 이중 소속이 발각되지 않았으므로 신원조회는 `NOVUS_ORDO / MANUS / SECTOR_A`, `J`, 기존 직함을 모두 유지한다. 실제 `MILITARY / USA` 지휘선과 웩슬러 관계는 이 비공개 근거 문서에만 남기며 캐릭터 등록 파일을 만들지 않는다.
- `WHITE_ROSE_R`: 사용자가 기존 R과 총장 보좌관 리처드를 동일인으로 확정했다. 기존 `CIVIL / WHITE_ROSE`, 외부 무등급을 유지하고, `리처드`를 실명, `R`을 교신 별칭, 총장 보좌관을 함께 확인된 신분으로 합친다. 정식 겸임인지 잠입 신분인지는 확인되지 않았으며, 이 직책만으로 내부 권한등급을 새로 주지 않는다.
- `DOCTOR_ZENO`: 고문 실험과 통제 대상 확대는 정책 변화지만 직책은 계속 연구 기구 사무차장·프로젝트 데드 핸드 지휘자다. `V` 접근 범위의 별도 승진·강등 근거가 없으므로 `V 유지`로 판단한다.
- `REGISTRAR`, `AMALIA_FREDRIKA_VON_ESSEN`, `MR_ODD`: 이번 작전에서 수행한 지휘·지원·사고 수습은 기존 직책 범위이며 등급 변화 근거가 없다.

## Personality Evidence Ledger

| observation id | codename | sessionId | trait | evidence kind | evidence | source label | confidence | persistence |
|---|---|---|---|---|---|---|---|---|
| `NOSB-S1E7-DESIRE-PART1:OTILIA:hell-fear-and-doubt` | `OTILIA` | `NOSB-S1E7-DESIRE-PART1` | 지옥에 대한 공포와 계약 회의 | dialogue | 계약 상대에게 자신은 이런 일을 원하지 않았다고 반발했다. 마리아에게 자신도 지옥이 두렵다고 고백했다. | 작전 보고서 S1E7: 욕구 1부 | confirmed | applied |
| `NOSB-S1E7-DESIRE-PART1:OTILIA:mercy-before-killing-eleanor` | `OTILIA` | `NOSB-S1E7-DESIRE-PART1` | 고통받는 존재에게 먼저 치료를 찾고 죽음으로 안식을 선택함 | dialogue + action | 엘레노어에게 백신을 사용할 수 있는지 먼저 물었다. 치료할 수 없자 엘레노어를 배전기 쪽으로 유인해 감전사시켰다. | 작전 보고서 S1E7: 욕구 1부 | confirmed | applied |
| `NOSB-S1E7-DESIRE-PART1:MARIA:catacomb-trauma` | `MARIA` | `NOSB-S1E7-DESIRE-PART1` | 과거 의식 장소에 대한 신체적 공황 반응 | description + action | 카타콤 입구에서 과호흡과 식은땀을 보였다. 심장을 짚고 뒷걸음질치다 주저앉았다. | 작전 보고서 S1E7: 욕구 1부 | confirmed | applied |
| `NOSB-S1E7-DESIRE-PART1:MARIA:ruthless-secrecy` | `MARIA` | `NOSB-S1E7-DESIRE-PART1` | 비밀 작전에서 민간 피해보다 발각 방지를 우선하는 냉혹한 실무 판단 | dialogue | 인적피해는 걸리지만 않으면 상관없겠죠. 실험체의 머리를 폭파할 수 있다고 경고했다. | 작전 보고서 S1E7: 욕구 1부 | confirmed | applied |
| `NOSB-S1E7-DESIRE-PART1:DOCTOR_ZENO:coercive-performance-doctrine` | `DOCTOR_ZENO` | `NOSB-S1E7-DESIRE-PART1` | 고통을 성과 관리 수단으로 일반화하는 강압적 연구관 | action + dialogue | 마가렛에게 하루 16시간의 고문 모의실험을 시행했다. 성과가 낮은 능력자에게 같은 통제를 확대하고 우디의 외출을 막겠다고 발표했다. | 작전 보고서 S1E7: 욕구 1부 | confirmed | applied |
| `NOSB-S1E7-DESIRE-PART1:KIMLEE:transactional-hierarchical-loyalty` | `KIMLEE` | `NOSB-S1E7-DESIRE-PART1` | 명확한 지휘 체계와 보상에 자신을 맡기는 거래적 충성 | description + dialogue + action | 명령에 따르는 단순한 체계를 편하게 여긴다고 생각하고, 웩슬러 앞에 무릎 꿇어 쓰임에 맞게 거둬 달라며 자료와 계좌번호를 즉시 넘김 | 작전 보고서 S1E7: 욕구 1부 | confirmed | skipped: 사용자 결정으로 신원조회 미반영 |
| `NOSB-S1E7-DESIRE-PART1:INDEXER:pragmatic-whistleblower-choice` | `INDEXER` | `NOSB-S1E7-DESIRE-PART1` | 양심보다 이해관계를 인정하면서도 폭로 임무를 선택하는 실용주의 | dialogue + action | 자신은 양심 때문에 움직이는 사람이 아니라고 밝혔다. 리처드가 제안한 감염자 은폐 증거 공개 임무를 수락했다. | 작전 보고서 S1E7: 욕구 1부 | confirmed | applied |
| `NOSB-S1E7-DESIRE-PART1:WD-N:ecological-fatalism` | `WD-(𝓃)` | `NOSB-S1E7-DESIRE-PART1` | 인간과 식물의 공생을 필연적 쇠락까지 포함해 바라보는 생태적 숙명론 | dialogue | 인간은 식물을 뒤덮는 이끼 같지만 서로 없이는 살 수 없다고 위버우드에게 설명했다. 공생의 끝을 서서히 죽어 가는 것으로 전망했다. | 작전 보고서 S1E7: 욕구 1부 | confirmed | applied |
| `NOSB-S1E7-DESIRE-PART1:WEXLER:patronage-through-reward` | `WEXLER` | `NOSB-S1E7-DESIRE-PART1` | 돈·차량·지위로 충성을 사는 후견 정치 | dialogue + action | 킴라박에게 주급 인상과 고급차를 제시하고 대통령을 위해 일하라고 권한 뒤 NHI 자료를 받음 | 작전 보고서 S1E7: 욕구 1부 | confirmed | skipped: 미발각 군부 접촉 비공개 유지 |
| `NOSB-S1E7-DESIRE-PART1:WHITE_ROSE_R:strategic-exposure` | `WHITE_ROSE_R` | `NOSB-S1E7-DESIRE-PART1` | 여론과 내부 증거로 조직 정책을 바꾸려는 전략적 폭로 | dialogue + action | R 단말로 해쉬를 한 코너 너머로 안내한 직후 리처드로 직접 대면했다. 파리 카타콤의 감염자 은폐 증거를 확보해 언론에 공개하라고 지시했다. | 작전 보고서 S1E7: 욕구 1부 | confirmed | applied |

## 관계 반영안

| 주체 | 대상 | 세션 근거 | 처리 |
|---|---|---|---|
| `OTILIA` | `MARIA` | 오틸리아가 지옥 공포와 계약을 털어놓고 마리아와 함께 방을 나감 | 세션 관계 추가 예정 |
| `MARIA` | `OTILIA` | 두려움을 이해하지 못한다고 말하면서도 오틸리아 곁에 머물고 동행 | 세션 관계 추가 예정 |
| `OTILIA` | `DOCTOR_ZENO` | 쓸모가 없어지는 날 직접 죽이겠다고 위협 | 기존 적대 관계에 이번 사건 추가 예정 |
| `DOCTOR_ZENO` | `MARGARET` | 16시간 고문 모의실험으로 능력 증대를 보고 | 통제자·피실험자 관계 추가 예정 |
| `DOCTOR_ZENO` | `WD-(𝓃)` | 성과가 낮다며 시설 밖 출입을 금지 | 통제 관계 추가 예정 |
| `KIMLEE` | `WEXLER` | 차량·급여 제안을 받고 충성을 맹세하며 자료 전달 | 숨은 군부 관계로 비공개 근거 문서에만 보존; 신원조회에는 추가하지 않음 |
| `WEXLER` | `KIMLEE` | 영입·후견·자료 수령 | 킴라박의 이중 소속이 세계관 안에서 발각되지 않았으므로 신원조회 관계에는 추가하지 않음 |
| `JOHN_WONG` | `KIMLEE` | 백악관 접촉을 중개 | 킴라박의 숨은 지휘선을 드러낼 수 있어 이번 신원조회 갱신에서 제외 |
| `WATER_FIST_RACKY` | `INDEXER` | 구조 뒤 페데라치오 정보를 제공하고 길목팀에 합류 | 임시 협력 관계 추가 예정 |
| `WHITE_ROSE_R` | `INDEXER` | 파리 감염자 증거 공개 임무를 지시 | 리처드 병합용 신원조회 등록 파일에 포함 |

## Visual Asset Ledger

보고서 시각자료는 PDF 안의 가로형 1035×503 장면 전체를 추가로 자르지 않고 WebP로 바꾼다. 같은 장면을 보여 주는 반복 8개는 먼저 나온 프레임을 남기고 제외한다. 킴라박의 백악관 접촉을 보여 주는 서로 다른 장면 4개는 비밀 소속을 드러내므로 공개 자산으로 만들지 않고 보고서·위키판에서도 제외한다. 작전보고서와 위키판은 로고 1개와 나머지 장면 34개의 경로·순서·대체 설명·캡션을 정확히 같게 유지한다. 장면 컷신은 신원조회 초상, 카탈로그 그림, 개체 위키 대표 이미지로 자동 재사용하지 않는다.

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `/assets/StarGate_logo_watermark.webp` | repository brand asset | 512×425 | no — 기존 공개 자산 | report-cutscene | included | included | excluded: 특정 로어 대상이 아님 | excluded: 아이템이 아님 | excluded: 인물 초상이 아님 | 보고서 표식으로만 사용 |
| `/assets/session-reports/s1e7-desire-part1/maria-origin-red-roses.webp` | PDF p002 X5 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 237년 전 마리아의 기원 장면 |
| `/assets/session-reports/s1e7-desire-part1/paris-rain-237-years-ago.webp` | PDF p002 X8 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 237년 전 파리로 진입하는 시대 전환 |
| `/assets/session-reports/s1e7-desire-part1/montespan-estate-banquet-room.webp` | PDF p004 X37 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 몽테스팡 저택의 인육 만찬 목격 |
| `/assets/session-reports/s1e7-desire-part1/maria-led-into-catacombs.webp` | PDF p005 X64 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 마리아가 흑미사 유적으로 끌려가는 장면 |
| `/assets/session-reports/s1e7-desire-part1/catacomb-descent.webp` | PDF p008 X127 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 파리 카타콤 지하로 내려가는 동선 |
| `/assets/session-reports/s1e7-desire-part1/ygolonac-black-mass-ritual.webp` | PDF p011 X199 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 이골로냑 소환 의식의 직접 장면 |
| `/assets/session-reports/s1e7-desire-part1/black-pyramid-present-day.webp` | PDF p013 X246 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 과거 기록에서 현재 블랙 피라미드로 전환 |
| `/assets/session-reports/s1e7-desire-part1/chronos-enters-starmart.webp` | PDF p014 X259 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 크로노스의 스타마트 방문 |
| `/assets/session-reports/s1e7-desire-part1/triple-citrus-soda-display.webp` | PDF p015 X292 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 트리플 시트러스 소다 진열 장면 |
| `/assets/session-reports/s1e7-desire-part1/starmart-clerk-ignores-chronos.webp` | PDF p016 X307 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 게임 중인 직원과 크로노스의 갈등 시작 |
| `/assets/session-reports/s1e7-desire-part1/chronos-starmart-confrontation.webp` | PDF p017 X334 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 스타마트 충돌 장면 |
| `/assets/session-reports/s1e7-desire-part1/otilia-demon-mirror.webp` | PDF p018 X345 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 오틸리아와 계약 상대의 대면 |
| `/assets/session-reports/s1e7-desire-part1/demon-renews-otilia-contract.webp` | PDF p021 X412 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 광원화 바이러스 탈취·강화 명령 |
| `/assets/session-reports/s1e7-desire-part1/otilia-hell-contract-warning.webp` | PDF p023 X451 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 계약과 지옥의 위협을 들은 오틸리아 |
| `/assets/session-reports/s1e7-desire-part1/maria-interrupts-otilia.webp` | PDF p024 X464 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 마리아와 오틸리아의 대화·동행 |
| `/assets/session-reports/s1e7-desire-part1/doctor-zeno-dead-hand-policy.webp` | PDF p026 X517 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 닥터 제노의 고문 실험·통제 확대 보고 |
| `/assets/session-reports/s1e7-desire-part1/woody-visits-weaverwood.webp` | PDF p030 X638 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 우디와 위버우드의 재회 |
| `/assets/session-reports/s1e7-desire-part1/woody-teaches-weaverwood-symbiosis.webp` | PDF p032 X661 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 공생 개념을 설명하는 우디 |
| `/assets/session-reports/s1e7-desire-part1/zulu-containment-breach.webp` | PDF p034 X712 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | ZULU 격리 붕괴와 사상자 발생 |
| `/assets/session-reports/s1e7-desire-part1/zulu-0007-mothman-contact.webp` | PDF p035 X739 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | ZULU-0007의 정신 공격 |
| `/assets/session-reports/s1e7-desire-part1/snallygaster-swarm-attack.webp` | PDF p036 X760 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | ZULU-0060 스넬리 게스터 무리의 공격 |
| `/assets/session-reports/s1e7-desire-part1/snallygaster-breach-contained.webp` | PDF p037 X777 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | ACCEL의 ZULU-0060 제압 |
| `p039-X830-confidential` | PDF p039 X830 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: 미발각 이중 소속 노출 방지 | excluded: 보고서와 동일하게 제외 | excluded: 비공개 근거 장면 | excluded: 공개 카탈로그에 쓰지 않음 | excluded: 신원조회에 쓰지 않음 | NHI 문서가 킴라박에게 돌아온 비공개 근거만 보존 |
| `p042-X893-confidential` | PDF p042 X893 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: 미발각 이중 소속 노출 방지 | excluded: 보고서와 동일하게 제외 | excluded: 비공개 근거 장면 | excluded: 공개 카탈로그에 쓰지 않음 | excluded: 신원조회에 쓰지 않음 | 킴라박의 백악관 도착 비공개 근거만 보존 |
| `p043-X916-confidential` | PDF p043 X916 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: 미발각 이중 소속 노출 방지 | excluded: 보고서와 동일하게 제외 | excluded: 비공개 근거 장면 | excluded: 공개 카탈로그에 쓰지 않음 | excluded: 신원조회에 쓰지 않음 | 웩슬러 일가와 미국 매파 모임 비공개 근거만 보존 |
| `p045-X961-confidential` | PDF p045 X961 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: 미발각 이중 소속 노출 방지 | excluded: 보고서와 동일하게 제외 | excluded: 비공개 근거 장면 | excluded: 공개 카탈로그에 쓰지 않음 | excluded: 신원조회에 쓰지 않음 | 웩슬러 부통령의 킴라박 영입 비공개 근거만 보존 |
| `/assets/session-reports/s1e7-desire-part1/federatio-mission-briefing.webp` | PDF p048 X1038 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 페데라치오 소탕 작전 브리핑 |
| `/assets/session-reports/s1e7-desire-part1/crown-derived-vaccine-reserve.webp` | PDF p053 X1175 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | ZULU-0040 왕관 유래 백신 비축 설명 |
| `/assets/session-reports/s1e7-desire-part1/registra-paris-mission-support.webp` | PDF p056 X1262 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 레지스트라의 파리 작전 지원 |
| `/assets/session-reports/s1e7-desire-part1/paris-operation-arrival.webp` | PDF p061 X1390 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 현장팀의 파리 도착 |
| `/assets/session-reports/s1e7-desire-part1/paris-street-team-deployment.webp` | PDF p082 X1973 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 파리 길목팀의 추적 작전 |
| `/assets/session-reports/s1e7-desire-part1/federatio-bar-infiltration.webp` | PDF p096 X2372 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | Bar Hemingway 페데라치오 잠입 |
| `/assets/session-reports/s1e7-desire-part1/paris-sewer-arsenal-search.webp` | PDF p114 X2899 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 페데라치오 하수도 무기고 발견 |
| `/assets/session-reports/s1e7-desire-part1/eleanor-sewer-lair.webp` | PDF p121 X3080 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 엘레노어가 나타난 하수도 수로 |
| `/assets/session-reports/s1e7-desire-part1/eleanor-aurora-infected-alligator.webp` | PDF p124 X3175 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 광원화 감염 악어 엘레노어의 직접 장면 |
| `/assets/session-reports/s1e7-desire-part1/catacomb-reinforcement-descent.webp` | PDF p131 X3366 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 카타콤 증원대의 진입 통로 |
| `/assets/session-reports/s1e7-desire-part1/maria-catacomb-trauma.webp` | PDF p136 X3489 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | 마리아의 카타콤 공황 반응 |
| `/assets/session-reports/s1e7-desire-part1/richard-white-rose-contact.webp` | PDF p137 X3511 | 1035×503 | no — full PDF XObject | report-cutscene | included: 전체 공개 등록 파일에 포함 | included: 보고서와 동일 순서·설명 | excluded: 보고서 장면으로만 사용 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | R의 안내 직후 리처드가 해쉬에게 임무를 제안한 장면 |
| `p009-X154-duplicate` | PDF p009 X154 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: 앞선 동일 장면을 사용 | excluded: 보고서와 동일 제외 | excluded: 중복 장면 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | p005 X64와 같은 카타콤 구도 |
| `p057-X1267-duplicate` | PDF p057 X1267 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: 앞선 동일 장면을 사용 | excluded: 보고서와 동일 제외 | excluded: 중복 장면 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | p048 X1038과 같은 브리핑룸 구도 |
| `p071-X1671-duplicate` | PDF p071 X1671 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: 앞선 동일 장면을 사용 | excluded: 보고서와 동일 제외 | excluded: 중복 장면 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | p056 X1262와 같은 레지스트라 지원 구도 |
| `p073-X1718-duplicate` | PDF p073 X1718 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: 앞선 동일 장면을 사용 | excluded: 보고서와 동일 제외 | excluded: 중복 장면 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | p061 X1390과 같은 파리 도착 구도 |
| `p137-X3506-duplicate` | PDF p137 X3506 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: 앞선 동일 장면을 사용 | excluded: 보고서와 동일 제외 | excluded: 중복 장면 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | p061 X1390과 같은 파리 도착 구도 |
| `p139-X3560-duplicate` | PDF p139 X3560 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: 앞선 동일 장면을 사용 | excluded: 보고서와 동일 제외 | excluded: 중복 장면 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | p131 X3366과 같은 카타콤 통로 구도 |
| `p140-X3563-duplicate` | PDF p140 X3563 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: 앞선 동일 장면을 사용 | excluded: 보고서와 동일 제외 | excluded: 중복 장면 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | p137 X3511과 같은 리처드 대면 구도 |
| `p142-X3610-duplicate` | PDF p142 X3610 | 1035×503 | no — full PDF XObject | report-cutscene | excluded: 앞선 동일 장면을 사용 | excluded: 보고서와 동일 제외 | excluded: 중복 장면 | excluded: 독립 아이템 도판이 아님 | excluded: 신원조회 전용 초상이 아님 | p002 X5와 같은 붉은 장미 구도 |

## 확정된 결정과 남은 질문

| 쟁점 | 원본에서 확인된 사실 | 현재 판단 | 남은 결정 |
|---|---|---|---|
| 킴라박의 군부 전환 | GM이 소속 변경을 직접 선언했고, 킴라박은 웩슬러의 채용을 수락해 NHI 자료를 넘겼다. | 실제 충성·지휘선은 `MILITARY / USA`지만 공식 신원조회는 `NOVUS_ORDO / MANUS / SECTOR_A`, `J`를 유지한다. | 사용자 결정 완료. 세계관 안에서 발각되지 않은 비밀이므로 신원조회에는 변경·관계·등장 사건을 추가하지 않는다. |
| R과 리처드 | R 단말의 이동 지시 직후 리처드가 나타나 `우리 조직`의 마지막 임무를 제안했다. | 사용자 결정으로 동일인 확정. 기존 `WHITE_ROSE_R`에 실명 리처드·별칭 R·총장 보좌관 신분을 합친다. 정식 겸임인지 잠입인지는 미확정으로 남긴다. | 운영 신원조회에 병합하고 실제 화면까지 확인 완료. |
| 웩슬러 대통령 | 현직 대통령이며 캘빈 R. 웩슬러의 아들로 등장했다. | 킴라박의 숨은 접촉을 드러내지 않도록 작전보고서와 신원조회에서 제외한다. | 실명·전용 초상과 별도 공개 사건이 확인될 때 독립 신원조회를 검토한다. |
| NHI 문서 보관 경로 | 킴라박에게 돌아온 문서를 웩슬러 부통령이 수령했다. | 미발각 군부 접촉의 일부이므로 기존 공개 카탈로그의 마지막 확인 경로를 바꾸지 않는다. | 이 비공개 근거 문서에만 보존한다. |
| 폭탄·차량·백신 | 폭탄은 `몇 개`, 차량은 고급차, 백신은 충분한 비축분으로만 나온다. | 종류·정확한 수량·작전 종료 보관처가 없는 물품은 인벤토리로 만들지 않는다. | 후속 회차에서 구체값이 확인될 때 다시 검토한다. |

## Verification Contract

- 전체 공개 등록 파일은 작전보고서 1건, 신규 위키 6건, 기존 위키 5건의 새 기록, 리처드 병합, 관련 신원조회의 등장 사건·관계·성격 관찰만 포함해야 하며, 크레딧·주식·상점 재고·알림·인벤토리를 변경해서는 안 된다.
- 보고서와 위키판은 로고 1개와 공개 가능한 장면 34개의 경로·순서·대체 설명·캡션이 정확히 같아야 한다.
- 장면 WebP 34개는 모두 1035×503이어야 한다. 반복 8개와 킴라박의 비밀 접촉 장면 4개는 공개 자산으로 생성하지 않는다.
- 보고서 번호 계산은 세션 ID와 `S1E7/욕구 part 1` 제목 모두 `07`을 반환해야 한다.
- 신규 위키는 `federatio`, `weaverwood`, `zulu-0060-snallygaster`, `zulu-0007-mothman`, `eleanor-aurora-alligator`, `s1e7-desire-part1`이고 모두 `isPublic: true`여야 한다. 작전보고서는 `minRole: U`여야 한다.
- 기존 공개 위키 추가 대상은 `project-dead-hand`, `aurora-virus`, `zulu-0040-crown`, `white-rose`, `illuminati` 다섯 건이며, 각 문단에는 작전보고서와 관련 인물·위키로 가는 명시적 링크가 있어야 한다.
- 작전보고서의 공개 가능한 관련 인물 18명은 모두 같은 세션 ID로 신원조회 등장 사건을 연결한다. 그중 근거가 있는 관계 7건과 성격 관찰 8건만 추가하고, `KIMLEE`, `WEXLER`, `JOHN_WONG`의 숨은 접촉 기록은 어떤 신원조회 단계에도 포함하지 않는다.
- 전체 공개 등록 파일은 `KIMLEE` 신원조회를 변경하지 않는다. 같은 파일 안의 리처드 병합 단계만 `WHITE_ROSE_R`의 실명·별칭·S1E7 등장·해쉬 관계·행동 관찰을 추가하며, `CIVIL / WHITE_ROSE`, 외부 무등급, 기존 공개 범위와 초상은 보존해야 한다.
- `KIMLEE` 캐릭터 등록은 만들지 않는다. 운영 신원조회는 `NOVUS_ORDO / MANUS / SECTOR_A`, `J`를 그대로 유지하고, 숨은 `MILITARY / USA` 소속과 백악관 접촉은 이 확인표 밖의 작전보고서·위키판·카탈로그·신원조회·관계·등장 사건 필드에 쓰지 않는다.
- 운영 ERP 저장을 승인받아 실행한 뒤에는 같은 기록을 다시 읽어 실제 저장값이 등록 파일과 같은지 비교한다. GM·V뿐 아니라 최소 권한 U 계정에서도 보고서와 위키가 검색·목록에 나타나는지, 관련 신원조회 18명·위키 10건·작전보고서 사이의 링크가 열리는지, 로고 1개와 장면 34개가 모두 표시되는지 확인해야 한다.
- 문서 다듬기와 공개 범위 확인이 끝나 전체 공개 등록 파일을 작성했다. 기존 공개 위키·신원조회의 공개 가능한 새 사건 연결을 함께 갱신하되, 킴라박·웩슬러·NHI 문서의 비공개 접촉 기록은 사용자 결정대로 제외한다.

## 실제 운영 ERP 반영 상태

- 공개 가능한 장면 34개와 로고를 먼저 운영 배포의 같은 판본에 올린 뒤, 승인된 43건 등록 파일을 한 번의 운영 DB 처리로 저장했다.
- 실제 저장 결과는 신규 7건과 기존 36건 수정이며, 저장 직후 43건 모두 등록 파일의 최종 조건과 일치하는지 다시 읽어 확인했다. 실행 기록은 `seed-payload:29aaee9b-f0ba-45a2-9d7c-a1c901cdaf80`이다.
- 작전보고서 `07`, 위키판, 신규 위키 5건, 기존 위키 5건의 추가 문단, 리처드/R 신원 병합을 운영 화면에서 확인했다. 보고서와 위키판의 로고 1개·장면 34개는 깨진 이미지가 없고 장면은 모두 1035×503으로 표시됐다.
- 작전보고서에는 신원조회 18건과 위키 10건이 연결됐고, DB에는 세션 등장 18건·관계 7건·성격 관찰 8건이 저장됐다.
- 킴라박 신원조회는 `NOVUS_ORDO / MANUS / SECTOR_A`, `J`를 유지하고 이 회차의 공개 등장·관계·성격 기록은 0건이다. 숨은 군부 소속과 백악관 접촉 장면 4개는 공개 보고서·위키·자산에서 제외했다.
- 크레딧·인벤토리·카탈로그 재고·주식·알림·메시지·웹훅은 변경하지 않았다.
- 운영 화면은 `M` 등급과 비로그인 게스트로 확인했다. 게스트 목록은 0건으로 유지됐고, 최소 권한 `U`와 관리자 계정 화면 확인은 로그인 정보 사용 승인을 기다린다.
