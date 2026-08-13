---
title: NOSB-MINI-NEVED session sync coverage
category: session-sync
tags: [NOSB-MINI-NEVED, MINI06, 전사의-탄생, 네베드, stargate-lore]
updated: 2026-08-13
source: stargate-lore
---

# NOSB-MINI-NEVED 동기화 커버리지

이 문서는 사용자 제공 전·후편 보존본과 공개 기획 노트를 하나의 실제 플레이 기록으로 병합해 `MINI06: 전사의 탄생`의 보고서·wiki mirror·Dossier 세션 출현·성격 관찰·시각 자료 반영 범위를 추적하는 내부 감사 기록이다. 기획 노트와 실제 플레이가 충돌하는 부분은 플레이 로그를 우선하며, 노트에만 있는 설정은 후보로 분리한다.

## Session Coverage Identity

| sessionId | report payload | source availability | audit status |
|---|---|---|---|
| `NOSB-MINI-NEVED` | `StarGateV2/scripts/seed-payloads/nosb-mini-neved-sync.json` | available | complete |

## Source Profile

- 사용자 제공 파일 2종은 하나의 연속 세션이다. 파일명 전편은 내부 `MINI 1 · SESSION 01 · 2026-07-30`, 파일명 후편은 내부 `키아나 미니 - 전편 · 2026-08-02`로 표기되어 있어 파일명·내부 표제가 어긋나지만, 실제 기록 시각과 사건 연속성을 기준으로 `2026-07-30 21:46` ~ `2026-07-31 01:23` 뒤 `2026-08-02 20:00` ~ `2026-08-03 03:46` 순으로 병합한다.
- 첫 보존본: 106쪽, 1,450개 정규화 기록, SHA-256 `d5329448eb1ea94d131ce32230be41378caacb227916b44c4aaacc5542b765d2`.
- 둘째 보존본: 279쪽, 3,624개 정규화 기록, SHA-256 `1034c996ae38b209e21d65eada7e930159152f715782798435670c97fcd44ac0`.
- 텍스트 무결성: 첫 보존본 7,101줄·15,263단어, 둘째 보존본 18,692줄·40,559단어를 추출했고 대표 장면 페이지를 원문 렌더와 대조했다.
- 시각 자료: 1035x503 장면 프레임 97개와 대화 아바타를 분리 판독했다. 그중 서사의 시작·핵심 증거·대결·회복·현재 시점 쿠키를 대표하는 원본 장면 12개만 보고서와 mirror에 같은 순서로 사용한다.
- 공개 기획 노트 `389c1528d29e80969a35c669726ac003`의 인물·시나리오·AI 요약·메모를 보조 근거로 확인했다. 노트의 `코너가 개럿을 조종했다`는 추가 폭로는 실제 플레이에 나오지 않았으므로 정사 사실로 확정하지 않는다.
- 원본 종료 표제가 `노부스 오르도 / 키아나 미니세션 / 전사의 탄생 / 끝.`으로 일치하므로 최종 회차명은 `전사의 탄생`이다.
- 공개 정책: 신규 보고서는 `minRole: V`, mirror는 `isPublic: false`로 staging하고 별도 승인 뒤 같은 publication transaction에서 보고서 `U`, mirror 공개, 기존 공개 Dossier 링크를 반영한다.

## Canonical Anchor

- Session ID: `NOSB-MINI-NEVED`
- Report number: `MINI06`
- Report title: `작전 보고서 MINI06: 전사의 탄생`
- Report minimum role: `V` staging; `U` publication candidate
- Wiki mirror slug: `mini06-neved`
- 진행일: `2026-07-30` ~ `2026-08-03`
- 작전지: 미확인 도심, 노부스 오르도 치료실, 아일랜드 갈로글라 한너 클랜 공동체의 기억 공간
- 지도 좌표: 아일랜드 작전권 기준 `[47.7, 31.8]`, `estimated`; 정확한 공동체 위치는 로그에 수치로 제시되지 않았다.
- 주요 대상: 키아나 오 캘러핸, 데이비드 오 캘러핸, 악몽 줄루, ALPANO-3001, 갈로글라, 욤스비킹, 개럿 클라이맥
- 보고서 기록자: `NOVUS ORDO 사무국 기록통제실 연구원 M. Keane`
- 현재 상태: 저장소 payload·자산 준비 단계이며 live DB에는 미적용

## Structured Digest

1. 검은 `악몽` 줄루가 미확인 도심을 습격했다. 현장팀은 시민을 대피시키고 대전차 미사일 공격을 지원했으나 키아나를 포함한 여러 인원이 의식불명에 빠졌다.
2. 치료를 맡은 굿 닥터는 신체 상태가 안정적이라고 판단했다. 데이비드 오 캘러핸이 도착했고, 현장팀은 기억 부담을 분산하는 `ALPANO-3001`로 키아나의 기억에 진입했다.
3. 기억 속 갈로글라 공동체에서 열여덟 살 키아나는 청년 전사대장 개럿 클라이맥과 강제 약혼 관계에 놓여 있었다. 은퇴 전사 엔다 클라이맥은 죽은 사이먼 오 캘러핸의 후계자로 키아나를 지목했다.
4. 익명 편지는 사이먼 피살과 내부 협력자를 경고했다. 붙잡힌 욤스는 욤스비킹이 크루아던과 카다던을 노리고 있으며 내부 협력자는 `오딘의 아이`, 비밀 편지는 적외선으로 읽는다고 증언했다.
5. 현장팀은 마리아가 확보한 적외선 조명을 사용하고 사냥꾼 로니·양조업자 노스터·네린·엔다를 조사했다. 야수화 주사를 맞은 딩고의 사체, 사라진 주사액, 비어 있는 금고가 연결됐다.
6. 노스터는 개럿이 자신에게 약물을 먹이고 야수화 주사액 한 병을 훔쳤다고 증언했다. 이후 그는 석궁에 맞아 사망했고, 현장에는 욤스비킹의 늑대인간·곰인간 전승을 설명하는 쪽지가 남았다.
7. 로니는 사이먼의 치명상이 거대한 발톱과 청년 전사의 칼에 의해 생겼다고 증언했다. 개럿의 방에서는 동일한 석궁 볼트, 적외선 비밀 편지, `S.C.`가 새겨진 사이먼의 칼이 발견됐다.
8. 키아나는 성인식에서 욤스를 죽이는 대신 쇠사슬만 끊었다. 개럿은 욤스를 쏘고 데이비드가 죽었다고 거짓말한 뒤 키아나에게 야수화 주사를 강요했다.
9. 키아나는 `전사는 죽이는 사람이 아니라, 지키는 사람이야`라는 사이먼의 가르침을 선택했다. 현장팀이 증거를 제시하자 개럿은 키아나를 인질로 잡고 힘에 의한 새 질서를 제안했다.
10. 개럿은 자신에게 야수화 주사를 놓고 곰인간으로 변했다. 현장팀은 다리를 제압하고 엔다가 건넨 세포 억제제를 투여해 인간으로 되돌렸다.
11. 회복된 기억에서는 개럿이 사이먼을 찌르고 키아나를 강으로 추격한 사실이 드러났다. 악몽의 검은 토끼 파편은 키아나의 죄책감과 공포를 이용했지만, 현장팀은 얼어붙은 기억에 진입해 손을 내밀고 키아나를 끌어냈다.
12. 현실에서 키아나가 깨어난 뒤 검은 점액 형태의 악몽 파편이 도주하려 했다. 마리아가 붙잡았고 피펫이 플라스크에 봉인했다. 미스터 오드는 임무 성공을 선언했고, 현장 기록상 이 자리에 있던 전원은 200,000 크레딧을 즉시 지급받았다.
13. 과거 쿠키에서 데이비드와 갈 무직은 부상한 욤스를 케이시 레이서 측 회수자에게 넘겼다. 현재 쿠키에서는 갈로글라의 코너와 욤스비킹의 스벤이 노부스 오르도 아래 동맹을 선언했고, 섹터 B 경호원으로 살아남은 개럿이 키아나의 사진을 보관하고 있음이 드러났다.

## Lorebook Coverage Matrix

| subject | source evidence | target surface | action | status |
|---|---|---|---|---|
| 전·후편 전체 기록 | 두 보존본의 연속 시각과 종료 표제 | `session_reports.NOSB-MINI-NEVED`, `wiki_pages.mini06-neved` | 하나의 `MINI06` 보고서와 mirror로 병합; 12개 시각 자료 parity | payload-ready |
| 보고서 번호·지도 카드 | 종료 표제 `전사의 탄생`, 아일랜드 갈로글라 기억 작전 | `lib/format/session-report.ts`, report map | `MINI06` preset·제목 fallback·지도 카드 배치 추가 | implementation-ready |
| 악몽 줄루 | 도심 습격, 기억 침입, 검은 토끼·점액 파편 | 기존 `wiki_pages.zulu`, report | 기존 wiki 본문은 미변경하고 구조화 참조와 보고서 서술만 추가 | reviewed-no-action |
| 노부스 오르도 | ALPANO-3001 운용, 보상 지급, 갈로글라·욤스비킹 동맹 쿠키 | 기존 `wiki_pages.novus-ordo`, report | 기존 wiki 본문은 미변경하고 구조화 참조와 보고서 서술만 추가 | reviewed-no-action |
| ALPANO-3001 | 다인 기억 다이브 장치와 치료 운용 | report | 정식 자산 번호·보관·재사용 조건이 부족해 전용 wiki/catalog 미생성 | candidate-only |
| 갈로글라·욤스비킹 | 기억 속 적대와 현재 시점 동맹 선언 | `MILITARY` external sub-org, report | `GALLOGLA`·`JOMSVIKING`을 MANUS 섹터가 아닌 군부 외부 하위 조직으로 정적 분류; faction/institution DB row는 미생성 | implementation-ready |
| 개럿 클라이맥 | 사이먼 살해, 야수화, 제압 후 현재 생존·섹터 B 경호 | report, `GARRETT_CLIMAC` | 공개·외부 무등급 Dossier create-only payload, generic unknown portrait, confirmed source-side relations | payload-ready |
| 사이먼 오 캘러핸 | 키아나의 선대 전사·교사, 개럿에게 피살 | report, `SIMON_OCALLAHAN` | 공개·외부 무등급 Dossier와 `DECEASED` 상태 확정, generic unknown portrait | payload-ready |
| 코너·스벤·네린·엔다·에바·로니·노스터 | 가족·지도자·증언자·피해자 역할 | report, NPC Dossiers | 공개·외부 무등급 Dossier 7건; 노스터만 `DECEASED`, 나머지 미확인 생존 상태는 구조화하지 않음 | payload-ready |
| 굿 닥터·닥터 박 | 치료 및 기억 다이브 지원 | report, NPC candidates | 정확한 정규 신원·직책·소속·등급 매칭 불가로 미생성 | blocked |
| 욤스·갈 무직 | 포로와 비밀 협력자·경비 역할 | report, `YOMS`·`GAL_MUJIK` | 화자명을 별칭·안정 식별자로 보존하고 각각 `JOMSVIKING`·`GALLOGLA` 공개 Dossier 생성 | payload-ready |
| `soda` | 시스템 기록상 크로노스가 1개 사용 | report, `master_items.soda`, economy candidate | 소비 사실은 보고서에 기록; 인벤토리 수량 차감은 exact baseline과 별도 승인 전 미실행 | approval-required |
| 200,000 크레딧 보상 | 현장 기록상 이 자리에 있던 전원에게 즉시 지급 완료 | report only | 정사 서술만 보존하고 사용자 지시에 따라 ERP 원장 보정·후속 확인·경제 mutation을 영구 제외 | reviewed-no-action |
| 필스너·적외선 조명·세포 억제제·야수화 주사 | 조사·증거 확인·전투 수습 중 사용 | report | 정식 catalog identity·소유권·잔량·회수 상태 불충분으로 catalog/inventory 미변경 | reviewed-no-action |
| 크루아던·카다던·사이먼의 칼 | 갈로글라·욤스비킹 전승과 증거 | report | 정식 catalog 공개 범위와 회수 상태 불명으로 미생성 | candidate-only |
| 코너 배후 조종설 | 공개 기획 노트 추가 폭로 | internal candidate | 실제 플레이에 직접 등장하지 않아 보고서·Dossier·관계에 미반영 | candidate-only |

## Dossier Event Link Pass

| source name | canonical target | action | status |
|---|---|---|---|
| 키아나 오 캘러핸 / 네베드 | `네베드` | 기억 치료 대상, 갈로글라 전사 선택, 악몽 극복 | ready-for-publication |
| 데이비드 오 캘러핸 | `SANDMAN` | 누나의 기억 다이브와 코너 저지, 끝까지 손을 놓지 않음 | ready-for-publication |
| 오틸리아 발트만 | `OTILIA` | 기억 조사·가족사 확인·현장 수습 | ready-for-publication |
| 이동식 | `LEE DONGSIK` | 기억 공간 조사와 개럿 제압 | ready-for-publication |
| 마리아 | `MARIA` | 적외선 조명 확보, 기억 조사, 악몽 파편 회수 | ready-for-publication |
| 크로노스 | `TIME` | 기억 공간 조사, 소다 1개 사용 | ready-for-publication |
| 시유 / 타이거 | `TIGER298` | 기억 공간 조사와 키아나 구조 | ready-for-publication |
| 발레리아 아젠트 | `AEGIS` | 기억 공간 조사와 개럿 전투 | ready-for-publication |
| 휘트모어 핀치 | `PIPETTE` | 기억 다이브 지원과 악몽 파편 봉인 | ready-for-publication |
| 미스터 오드 | `MR_ODD` | 임무 통제와 200,000 크레딧 즉시 지급 | ready-for-publication |
| 케이시 레이서 | `CASEY_RACER` | 과거 쿠키에서 욤스 회수 연락망으로 언급 | ready-for-publication |
| 개럿·사이먼·코너·네린·엔다·에바·로니·노스터·욤스·스벤·갈 무직 | `GARRETT_CLIMAC`·`SIMON_OCALLAHAN`·`CONNOR_OCALLAHAN`·`NERIN_OCALLAHAN`·`ENDA_CLIMAC`·`EVA_HANNER`·`RONNIE_KEANE`·`NOSTER`·`YOMS`·`SVEN_TROELBEIN`·`GAL_MUJIK` | 신규 공개 Dossier 11건, report/mirror 정규 링크와 source-side 관계·세션 출현 추가 | ready-for-apply |
| 굿 닥터·닥터 박 | no canonical target | 화자명과 기능만 report prose에 보존; 정규 신원·부서가 매칭되지 않아 Dossier 미생성 | blocked |

## Relationship Narrative Candidates

| from | to | beat | confidence | persistence target | status |
|---|---|---|---|---|---|
| `네베드` | `SANDMAN` | 데이비드가 기억 다이브와 현실에서 누나의 손을 끝까지 놓지 않음 | confirmed | 기존 양측 가족 관계가 이미 있어 새 relation 미추가; session appearance로만 보존 | reviewed-no-action |
| `네베드` | `MARIA` | 마리아가 기억 조사와 악몽 파편 회수에 참여 | confirmed | 별도 지속 관계로 확장할 근거가 부족해 session appearance로만 보존 | reviewed-no-action |
| `SANDMAN` | `CASEY_RACER` | 과거 쿠키에서 데이비드가 욤스를 케이시 측 회수자에게 넘김 | confirmed | 기존 양측 협력 관계가 있어 새 relation 미추가 | reviewed-no-action |
| `GARRETT_CLIMAC` | `네베드` | 강제 약혼·가스라이팅·인질·살해 시도 뒤 현재 사진 보관 | confirmed | Garrett source-side relation | ready-for-apply |
| `GARRETT_CLIMAC` | `SIMON_OCALLAHAN` | 사이먼 살해와 키아나 추격 | confirmed | Garrett/Simon source-side relations | ready-for-apply |
| `CONNOR_OCALLAHAN` | `SANDMAN` | 코너가 진입을 막고 데이비드가 대치해 현장팀 진입 시간을 벌음 | confirmed | Connor source-side relation | ready-for-apply |
| `CONNOR_OCALLAHAN` | `SVEN_TROELBEIN` | 과거 적대 뒤 현재 노부스 오르도 산하 동맹 선언 | confirmed | Connor/Sven source-side relations | ready-for-apply |
| `GAL_MUJIK` | `SANDMAN`·`YOMS` | 데이비드와 함께 부상한 욤스를 회수망으로 인계 | confirmed | Gal source-side relations | ready-for-apply |
| `YOMS` | `네베드` | 키아나가 성인식에서 살해를 거부하고 쇠사슬만 절단 | confirmed | Yoms source-side relation | ready-for-apply |

## Economy And Stock Decision

- credits: 세션 기록상 현장에 있던 전원은 `200,000` 크레딧을 즉시 지급받았다. 이 사실은 정사 서술로만 보존한다. 사용자 지시에 따라 수령자·기존 지급 여부 조사, ledger backfill, 알림과 후속 경제 operation을 모두 제외한다.
- inventory: 시스템 기록상 `TIME`이 `soda` 1개를 사용했다. live 수량 baseline과 장착 여부, operation id를 확인하고 별도 승인받기 전 차감하지 않는다.
- catalog/shop: `soda` 구조화 참조만 사용한다. 필스너·적외선 조명·야수화 주사·세포 억제제·두 전승 검은 정식 catalog identity가 없어 신규 row·가격·재고를 만들지 않는다.
- stock: 세션에서 상장사 실적·공시·시장 반응으로 환산할 수 있는 사건이 없어 no-action.
- notifications, SAN, HP, 상태효과: 세션 서술 외 영속 mutation 없음.

## NPC Approval Ledger

| codename | 신원조회 실명 | 별칭 | 직함/역할 | 식별자 근거 | 정규 소속 | 파견/겸임 | 권한등급 | Dossier 초상 | 공개 여부 | 인적 정보 | 서술/관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `네베드` | 키아나 오 캘러핸(기존 ERP 신원) | 네베드(기존 ERP) | 요원 / 기억 치료 대상 / 갈로글라 전사 선택 | 세션 화자와 기존 실명·가족 관계 일치 | 기존 `NOVUS_ORDO` 소속 보존 | 기억 다이브와 갈로글라 과거 회상; 정규 보직 불변 | `G` 유지(개인 서사와 전사 선택은 오르도 직책·접근 권한 변경이 아님) | 기존 Dossier 초상 보존; 컷신 재사용 없음 | 기존 공개 보존 | 기존 신상 보존 | 세션 출현과 자기결정 성격 관찰만 additive 반영 | ready-for-apply |
| `SANDMAN` | 데이비드 오 캘러핸(기존 ERP 신원) | 샌드맨(기존 ERP) | 뉴 더블린 감독관 유지 / 기억 다이브 지원자 | 세션 실명·누나 관계와 기존 Dossier 일치 | 기존 `NOVUS_ORDO` 소속 보존 | 누나 구조와 코너 저지는 임시 행동 | `G` 유지(감독관 직책은 기존 반영 상태이며 이번 가족 구조는 추가 지휘권 변동이 아님) | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 출현과 보호적 위험 감수 관찰만 additive 반영 | ready-for-apply |
| `OTILIA` | 오틸리아 발트만(기존 ERP 신원) | 기존 ERP 별칭 보존 | 과학자 / 기억 조사 참여 | 세션 화자와 기존 Dossier 일치 | 기존 소속 보존 | ALPANO 기억 다이브 일시 참가 | `G` 유지(일시 치료 참여는 정규 직책·접근 권한 변경이 아님) | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 appearance만 additive 반영 | ready-for-apply |
| `LEE DONGSIK` | 이동식(기존 ERP 신원) | 기존 ERP 별칭 보존 | 현장 요원 / 기억 조사 참여 | 세션 화자와 기존 Dossier 일치 | 기존 소속 보존 | 기억 다이브 일시 참가 | `U` 유지(현장 참가가 정규 직책·접근 권한을 바꾸지 않음) | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 appearance만 additive 반영 | ready-for-apply |
| `MARIA` | 마리아(기존 ERP 신원) | 기존 ERP 별칭 보존 | 현장 요원 / 기억 조사·파편 회수 | 세션 화자와 기존 Dossier 일치 | 기존 소속 보존 | 기억 다이브와 사후 회수 일시 참가 | `H` 유지(회수 행동은 정규 직책·접근 권한 변경이 아님) | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 appearance만 additive 반영 | ready-for-apply |
| `TIME` | 크로노스(기존 ERP 신원) | 기존 ERP 별칭 보존 | 현장 요원 / 기억 조사 참여 | 세션 화자와 기존 Dossier 일치 | 기존 소속 보존 | 기억 다이브 일시 참가 | `G` 유지(현장 참가와 소다 사용은 직책·접근 권한 변경이 아님) | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 appearance만 additive 반영; 인벤토리 별도 승인 | ready-for-apply |
| `TIGER298` | 시유(기존 ERP 신원) | 타이거(기존 ERP) | 현장 요원 / 기억 조사 참여 | 세션 화자와 기존 Dossier 일치 | 기존 소속 보존 | 기억 다이브 일시 참가 | `J` 유지(현장 참가가 정규 직책·접근 권한을 바꾸지 않음) | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 appearance만 additive 반영 | ready-for-apply |
| `AEGIS` | 발레리아 아젠트(기존 ERP 신원) | 아젠트(기존 ERP) | 현장 요원 / 기억 조사·전투 참여 | 세션 화자와 기존 Dossier 일치 | 기존 소속 보존 | 기억 다이브 일시 참가 | `J` 유지(현장 전투는 정규 직책·접근 권한 변경이 아님) | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 appearance만 additive 반영 | ready-for-apply |
| `PIPETTE` | 휘트모어 핀치(기존 ERP 신원) | 피펫(기존 ERP) | 과학자 / 기억 다이브·파편 봉인 지원 | 세션 화자와 기존 Dossier 일치 | 기존 소속 보존 | ALPANO 보조와 사후 봉인 | `J` 유지(실험 지원은 정규 보직·접근 권한 변경이 아님) | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 appearance만 additive 반영 | ready-for-apply |
| `MR_ODD` | Mr. 오드(기존 ERP 신원) | 기존 ERP 별칭 보존 | 임무 통제 / 보상 지급 | 세션 화자와 기존 Dossier 일치 | 기존 소속 보존 | 세션 사후 통제 | `M` 유지(보상 지급은 기존 통제 역할이며 보직·권한 변동이 아님) | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 appearance만 additive 반영; credit ledger 후속 작업 제외 | ready-for-apply |
| `CASEY_RACER` | Casey Racer(기존 ERP 신원) | 기존 ERP 별칭 보존 | 욤스비킹 연락망 / 과거 쿠키 회수자 | 세션 실명과 기존 David 협력 관계 일치 | 기존 외부 소속 보존 | 과거 욤스 회수 연락 | 외부 인원이라 agentLevel 미저장 | 기존 Dossier 초상 보존 | 기존 공개 보존 | 기존 신상 보존 | 세션 appearance만 additive 반영 | ready-for-apply |
| `GARRETT_CLIMAC` | 개럿 클라이맥 (`Garrett Climac`) | 별칭 없음 | 갈로글라 청년 전사대장, 강제 약혼자, 현재 섹터 B 경호원 | 실명·가족사·범행·현재 쿠키 생존 확인 | `MILITARY / GALLOGLA` | 섹터 B 경호 역할은 확인, 정식 고용 주체 미확인 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 남성, 도리스의 아들, 얼굴 흉터·야수화 이력 확인 | 키아나·사이먼 관계와 세션 출현 반영 | ready-for-apply |
| `SIMON_OCALLAHAN` | 사이먼 오 캘러핸 (`Simon O'Callahan`) | 별칭 없음 | 갈로글라 전사 / 키아나의 선대·교사 | 공개 기획 노트와 기억 로그 일치 | `MILITARY / GALLOGLA` | 사망자; 현재 파견 없음 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 남성, 당시 20세·188cm; `DECEASED` 확정 | 키아나 보호·개럿 피살 관계 반영 | ready-for-apply |
| `CONNOR_OCALLAHAN` | 코너 오 캘러핸 (`Connor O'Callahan`) | 별칭 없음 | 갈로글라 지도자 / 키아나·데이비드의 부친 | 로그 가족 호칭과 현재 동맹 장면 | `MILITARY / GALLOGLA` | 욤스비킹과 오르도 산하 동맹 선언 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 가족 관계 확인; 배후 조종설은 미확인 | David 대치·Sven 동맹 관계 반영 | ready-for-apply |
| `NERIN_OCALLAHAN` | 네린 오 캘러핸 (`Nerin O'Callahan`) | 별칭 없음 | 키아나·데이비드의 모친 | 로그 가족 호칭 | `MILITARY / GALLOGLA` | 기억 속 주민 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 현재 상태 미확인 | 자녀 관계와 세션 출현 반영 | ready-for-apply |
| `ENDA_CLIMAC` | 엔다 클라이맥 (`Enda Climac`) | 별칭 없음 | 은퇴한 전설적 전사 / 개럿의 조모 | 실명·89세·가족 호칭 확인 | `MILITARY / GALLOGLA` | 은퇴 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 당시 89세, 도리스의 모친; 현재 상태 미확인 | Garrett 가족·Kiana 후계 관계 반영 | ready-for-apply |
| `EVA_HANNER` | 에바 한너 (`Eva Hanner`) | 별칭 없음 | 갈로글라 한너 클랜 지도자 | 성인식 회의와 로그 호칭 | `MILITARY / GALLOGLA` | 클랜 지도부 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 현재 상태 미확인 | 세션 출현만 반영 | ready-for-apply |
| `RONNIE_KEANE` | 로니 킨 (`Ronnie Keane`) | 별칭 없음 | 사냥꾼 / 사이먼 사망 증언자 | 로그 실명·직업·증언 | `MILITARY / GALLOGLA` | 기억 속 조사 협조 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 현재 상태 미확인 | Simon 증언 관계와 세션 출현 반영 | ready-for-apply |
| `NOSTER` | 노스터 (기록명; 전체 법적 이름 미확인) | 별칭 없음 | 양조업자 / 야수화 주사 절도 피해자 | 로그 호칭·직업·증언 | `MILITARY / GALLOGLA` | 기억 속 조사 협조 후 피살 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 전체 법적 이름 미확인; `DECEASED` 확정 | Garrett 증언 관계와 세션 출현 반영 | ready-for-apply |
| `GOOD_DOCTOR` | 신원 미확인 | 굿 닥터(로그 호칭) | 치료실 의료진 | 치료 장면 화자명 | 정규 소속 미확인 | 키아나 치료 | 정규 직책·접근 권한 미확인 | 고해상도 Dossier 초상 미확정 | 사용자 공개 결정 필요 | 실명·성별·부서 미확인 | treatment prose candidate | blocked |
| `DOCTOR_PARK` | 신원 미확인 | 닥터 박(로그 호칭) | 기억 다이브 지원 의료진 | 후반 기억 다이브 화자명 | 정규 소속 미확인 | ALPANO 지원 | 정규 직책·접근 권한 미확인 | 고해상도 Dossier 초상 미확정 | 사용자 공개 결정 필요 | 실명·부서 미확인 | memory-dive prose candidate | blocked |
| `YOMS` | 욤스 (기록명; 실명 미확인) | 별칭 없음 | 욤스비킹 포로·정보원 | 포로 장면 화자명 | `MILITARY / JOMSVIKING` | 갈로글라 포로, 이후 회수 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 실명·직위·현재 상태 미확인 | Kiana 구조·Gal 회수 관계 반영 | ready-for-apply |
| `SVEN_TROELBEIN` | 스벤 트로엘베인 (`Sven Troelbein`) | 별칭 없음 | 욤스비킹 지도자 | 현재 쿠키 동맹 선언 | `MILITARY / JOMSVIKING` | 노부스 오르도 산하 동맹 선언 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 추가 신상 미확인 | Connor 동맹 관계 반영 | ready-for-apply |
| `GAL_MUJIK` | 갈 무직 (기록명; 실명 미확인) | 별칭 없음 | 갈로글라 경비 / 비밀 협력자 | 성인식 우회로·과거 쿠키 화자명 | `MILITARY / GALLOGLA` | 욤스 회수 지원 | 외부 인원이라 agentLevel 미저장 | 공용 미상 인물 초상 | 공개 | 실명·직위 상세·현재 상태 미확인 | David 협력·Yoms 회수 관계 반영 | ready-for-apply |
| `NIGHTMARE_FRAGMENT` | 인물 대상 아님 | 검은 토끼 / 검은 점액 | 악몽 줄루 파편 | 기억·현실 장면 변형과 피펫 식별 | 줄루 개체 | 마리아 회수·피펫 봉인 | 인물 권한등급 해당 없음 | Dossier 초상 대상 아님 | 인물 공개 여부 해당 없음 | 인간 신상 대상 아님 | report prose only | blocked |

## Story-Driven Role/Level Review

- `SANDMAN`: 뉴 더블린 감독관은 기존 Dossier 상태다. 이번 세션의 가족 구조와 코너 저지는 임시 행동이며 새 지휘권·접근 범위를 부여하지 않아 `G` 유지.
- `네베드`: 갈로글라 전사로서 자기 길을 선택했지만 이는 오르도 정규 보직 변경이 아니므로 `G` 유지.
- `MR_ODD`: 작전 통제와 보상 지급은 기존 권한 범위이므로 `M` 유지.
- 나머지 기존 오르도 인원: 기억 다이브 참여·조사·봉인은 세션 임무이고 지속 직책·승진·강등 근거가 없어 기존 등급 유지.
- `CASEY_RACER`와 신규 갈로글라·욤스비킹 인물: 외부 인원이라 agentLevel을 추정하지 않는다.
- `GARRETT_CLIMAC`: 현재 섹터 B 경호 역할은 확인되지만 노부스 오르도 정규 인사인지 외부 경호 계약인지 불명이다. `MILITARY / GALLOGLA` 외부 인물로 생성하며 agentLevel을 저장하지 않는다.

## Personality Evidence Ledger

| observation id | codename | sessionId | trait | evidence kind | evidence | source label | confidence | persistence |
|---|---|---|---|---|---|---|---|---|
| `NOSB-MINI-NEVED:NEVED:self-directed-protection` | `네베드` | `NOSB-MINI-NEVED` | 강요된 역할을 자기 선택으로 재정의 | dialogue / action | `전사는 죽이는 사람이 아니라, 지키는 사람이야.`; 욤스의 쇠사슬만 끊고 살해를 거부한 뒤 개럿의 강요와 가스라이팅을 거부함; `이제는 저만의 길을 찾을 시간이 온 것이겠죠.` | 작전 보고서 MINI06: 전사의 탄생 | confirmed | ready-for-apply |
| `NOSB-MINI-NEVED:SANDMAN:protective-risk-taking` | `SANDMAN` | `NOSB-MINI-NEVED` | 가족 보호를 위한 위험 감수 | dialogue / action | `꼭 누나를 구해주세요!`; 코너를 붙잡아 현장팀이 키아나에게 갈 시간을 벌고 기억 다이브 종료까지 손을 놓지 않음 | 작전 보고서 MINI06: 전사의 탄생 | confirmed | ready-for-apply |

## Visual Asset Ledger

| asset | source | source dimensions | source-frame crop | source role | report | report wiki mirror | dedicated wiki | catalog | Dossier/personnel | decision/evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| `/assets/session-reports/neved/nightmare-street.webp` | 첫 보존본 도심 습격 원본 장면 | 1035×503 | no | report-cutscene | included | included | excluded: 전용 wiki 없음 | excluded: catalog 대상 아님 | excluded: 초상 대상 아님 | 악몽 줄루의 최초 습격을 보여 주는 전체 프레임 |
| `/assets/session-reports/neved/memory-dive-chamber.webp` | 첫 보존본 ALPANO 치료실 원본 장면 | 1035×503 | no | report-cutscene | included | included | excluded: 전용 wiki 없음 | excluded: 장치 규격 미확정 | excluded: 초상 대상 아님 | 기억 다이브 진입 조건을 보여 주는 전체 프레임 |
| `/assets/session-reports/neved/young-kiana-training.webp` | 첫 보존본 갈로글라 훈련 원본 장면 | 1035×503 | no | report-cutscene | included | included | excluded: 전용 wiki 없음 | excluded: catalog 대상 아님 | excluded: 초상 재사용 금지 | 열여덟 살 키아나의 기억 환경을 보여 주는 전체 프레임 |
| `/assets/session-reports/neved/hidden-letter-evidence.webp` | 둘째 보존본 적외선 편지 원본 장면 | 1035×503 | no | report-cutscene | included | included | excluded: 전용 wiki 없음 | excluded: 증거품 catalog 미확정 | excluded: 초상 대상 아님 | 개럿의 배신을 입증한 현장 증거 전체 프레임 |
| `/assets/session-reports/neved/kernahar-ritual.webp` | 둘째 보존본 케르나허 원본 장면 | 1035×503 | no | report-cutscene | included | included | excluded: 전용 wiki 없음 | excluded: catalog 대상 아님 | excluded: 초상 재사용 금지 | 키아나가 선택을 내리는 성인식 전체 프레임 |
| `/assets/session-reports/neved/garrett-hostage.webp` | 둘째 보존본 인질 장면 원본 | 1035×503 | no | report-cutscene | included | included | excluded: 전용 wiki 없음 | excluded: 주사기 catalog 미확정 | excluded: 초상 재사용 금지 | 개럿의 야수화 강요와 인질 상황 전체 프레임 |
| `/assets/session-reports/neved/garrett-crossbow-fight.webp` | 둘째 보존본 석궁 교전 원본 | 1035×503 | no | report-cutscene | included | included | excluded: 전용 wiki 없음 | excluded: 석궁 소유권 미확정 | excluded: 초상 재사용 금지 | 개럿과 현장팀의 교전을 보여 주는 전체 프레임 |
| `/assets/session-reports/neved/garrett-betrays-simon.webp` | 둘째 보존본 살해 기억 원본 | 1035×503 | no | report-cutscene | included | included | excluded: 전용 wiki 없음 | excluded: 증거품 catalog 미확정 | excluded: 초상 재사용 금지 | 사이먼 피살의 진실이 회복된 전체 프레임 |
| `/assets/session-reports/neved/kiana-frozen-memory.webp` | 둘째 보존본 얼어붙은 기억 원본 | 1035×503 | no | report-cutscene | included | included | excluded: 전용 wiki 없음 | excluded: catalog 대상 아님 | excluded: 초상 재사용 금지 | 악몽이 키아나를 고립시킨 핵심 심상 전체 프레임 |
| `/assets/session-reports/neved/kiana-rescue-hands.webp` | 둘째 보존본 구조 원본 장면 | 1035×503 | no | report-cutscene | included | included | excluded: 전용 wiki 없음 | excluded: catalog 대상 아님 | excluded: 초상 재사용 금지 | 현장팀이 키아나를 끌어올리는 결말 전체 프레임 |
| `/assets/session-reports/neved/memory-dive-return.webp` | 둘째 보존본 현실 귀환 원본 | 1035×503 | no | report-cutscene | included | included | excluded: 전용 wiki 없음 | excluded: catalog 대상 아님 | excluded: 초상 대상 아님 | 기억 다이브 종료와 현실 복귀 전체 프레임 |
| `/assets/session-reports/neved/garrett-sector-b-cookie.webp` | 둘째 보존본 현재 쿠키 원본 | 1035×503 | no | report-cutscene | included | included | excluded: 전용 wiki 없음 | excluded: catalog 대상 아님 | excluded: 초상 재사용 금지 | 살아남은 개럿의 현재 섹터 B 배치를 보여 주는 전체 프레임 |
| `source-only:first-large-frame-group` | 첫 보존본 미선정 장면 프레임 13개 | 1035×503 | no | candidate-only | candidate-only: 핵심 서사 12컷에 중복 | candidate-only: 보고서와 동일 사유 | excluded: 전용 wiki 없음 | excluded: 정식 catalog 대상 없음 | excluded: 대화 맥락 포함 컷신은 초상 아님 | 전수 검토했으나 중복·전환·배경 프레임이라 source-only 유지 |
| `source-only:second-large-frame-group` | 둘째 보존본 미선정 장면 프레임 72개 | 1035×503 | no | candidate-only | candidate-only: 핵심 서사 12컷에 중복 | candidate-only: 보고서와 동일 사유 | excluded: 전용 wiki 없음 | excluded: 정식 catalog 대상 없음 | excluded: 대화 맥락 포함 컷신은 초상 아님 | 전수 검토했으나 중복·전환·보조 전투 프레임이라 source-only 유지 |
| `source-only:chat-avatar-58x57-group` | 두 보존본의 58x57 대화 아바타 633개 | 58×57 | no | candidate-only | excluded: 장면 맥락·해상도 부족 | excluded: 보고서와 동일 사유 | excluded: 개체 archive 아님 | excluded: catalog 대상 아님 | candidate-only: 저해상도라 Dossier 품질 기준 미달 | 화자 식별에만 사용하고 공개 자산으로 복제하지 않음 |
| `source-only:chat-avatar-58x58-group` | 두 보존본의 58x58 대화 아바타 377개 | 58×58 | no | candidate-only | excluded: 장면 맥락·해상도 부족 | excluded: 보고서와 동일 사유 | excluded: 개체 archive 아님 | excluded: catalog 대상 아님 | candidate-only: 저해상도라 Dossier 품질 기준 미달 | 화자 식별에만 사용하고 공개 자산으로 복제하지 않음 |
| `/assets/npcs/Unknown-Person-profile.webp` | 사용자 승인 공용 미상 인물 초상 | 1084×1451 | no | personnel-image | excluded: 인물별 장면이 아님 | excluded: 보고서와 동일 사유 | excluded: 개체 archive 아님 | excluded: catalog 대상 아님 | included: 신규 11 Dossier preview/main | 개별 고해상도 초상이 없는 공개 인물에 공용 placeholder 사용; 기존 공개 파일을 재사용하며 새 이미지 생성 없음 |

## Visual Selection Summary

- 보고서와 operation-report wiki mirror는 위 12개 `/assets/...` 경로를 동일한 순서·alt·caption으로 사용한다.
- 모든 공개 파일은 원본 1035x503 프레임을 자르지 않고 WebP로 변환한다. 장면 프레임은 Dossier 초상이나 catalog 미리보기로 재사용하지 않는다.
- 신규 생성 이미지와 외부 검색 이미지는 사용하지 않는다. 신규 Dossier 11건은 기존 사용자 승인 공용 미상 인물 초상을 사용한다.

## Execution Order And Replay Contract

1. `nosb-mini-neved-new-npcs.json`: 공개 Dossier 11건을 create-only 단일 transaction으로 생성한다. 각 payload에는 최초 `personalityObservations: []`가 있어 같은 codename이 이미 존재하면 runner가 갱신 대신 fail-closed하며, 성공 후 이 파일을 재실행하지 않는다. `SIMON_OCALLAHAN`·`NOSTER`만 완전한 `DECEASED` 증거 묶음을 갖고 나머지 9명은 생사를 추정하는 필드를 저장하지 않는다.
2. 신규 11건 독립 재조회 뒤 `nosb-mini-neved-sync.json`을 실행해 보고서 본문과 mirror 본문을 한 파일 transaction으로 upsert한다. 각 filter는 `$set` 전체 필드를 exact baseline으로 포함하므로 같은 identity의 충돌 문서가 선행되면 unique-index 충돌로 중단한다. `minRole: V`, `isPublic: false`, `createdAt`은 `$setOnInsert`라 publication 뒤 exact-content staging 재실행이 공개 상태를 강등하지 않는다.
3. staging 적용·독립 재조회 뒤 `nosb-mini-neved-publication.json`을 fresh dry-run한다.
4. publication 파일은 mirror 공개 → 보고서 `U` → 기존 공개 Dossier 11건 세션 출현 → 성격 관찰 2건 순으로 한 transaction에서 처리한다. 첫 두 envelope는 staging의 제목·본문·시각 자료·참조·지도·기록자 전 필드를 exact CAS하고, Dossier filter는 같은 sessionId appearance의 선행 삽입을 차단하며 exact appearance·event id·tag postcondition만 재실행 no-op으로 인정한다. payload 대상 Dossier의 apply-ready 검증은 `nosb-mini-neved-npc-apply.md` focused 원장을 사용한다.
5. 각 파일의 domain transaction과 `lore_sources`·`lore_ingestion_runs` 감사는 runner 계약을 따른다. 보고서에는 `provenanceSourceIds`가 연결되고, 구조화 참조 무결성 확인 과정에서 기존 related wiki·personnel·catalog target의 `__sessionReportReferenceLockAt`가 갱신될 수 있다. 파일 간 원자성은 없고, 실패 audit은 domain rollback 뒤 남을 수 있다.
6. 이번 패스에서는 저장소 준비·read-only 검증만 수행하며 live execute는 별도 exact 승인 전 금지한다.
7. `TIME` 소다 차감은 별도 경제 operation 후보로 유지한다. 200,000 크레딧은 사용자 지시에 따라 후속 조사와 ERP ledger mutation 대상에서 완전히 제외한다.

## Verification Record

- 두 보존본 385쪽을 텍스트 추출하고 실제 기록 시각·종료 표제로 하나의 세션 identity를 확정했다.
- 대표 페이지 6, 36, 151, 195, 236, 278의 렌더를 원문 레이아웃과 대조했고, 97개 대형 장면 프레임과 대화 아바타를 분리 검토했다.
- 공개 기획 노트의 인물·시나리오·AI 요약·메모·추가 폭로를 대조해 실제 플레이 미등장 내용은 후보로 분리했다.
- live `stargate` read-only dry-run에서 신규 codename 11건이 모두 0건이며 create-only `예상 insert`임을 확인했다. 보고서·mirror는 아직 0건이고, 신규 Dossier 생성 전 staging dry-run은 새 personnel target 11건만 `missing`으로 차단돼 실행 순서 gate가 작동했다.
- 11개 spec↔payload adapter parity, 외부 agentLevel 미저장, `SIMON_OCALLAHAN`·`NOSTER`만 갖는 사망 증거 3필드 완전성을 확인했다.
- NPC ready·personality·visual/report-mirror·coverage/static/public prose 검증, 조직 분기 테스트 2건, 아이콘 감사 113종·37 route, 대상 ESLint, `pnpm typecheck`, `git diff --check`를 통과했다.
- 인증된 `http://localhost:43849` 데스크톱 브라우저에서 `/erp/personnel`과 `/erp/factions`의 `GALLOGLA`·`JOMSVIKING` 군부 하위 카드, 갈로글라·욤스비킹 접선 경로를 확인했다. 두 화면 모두 1280px viewport에서 문서 가로 넘침과 콘솔 오류가 없었다.

## Remaining Decisions

- `TIME`의 `soda` 1개 차감은 exact live baseline·장착 여부·감사 operation을 확인하고 별도 승인받는다.
- 200,000 크레딧은 정사 서술만 유지하며 수령자 확인·ledger backfill·알림 등 후속 경제 작업을 하지 않는다.
- `ALPANO-3001`, 크루아던·카다던의 전용 wiki/catalog 승격은 식별자·공개 범위 결정 뒤 진행한다. 갈로글라·욤스비킹은 정적 외부 하위 조직으로 분류하되 별도 faction/institution DB row는 만들지 않는다.
- 코너의 배후 조종설은 플레이 로그에 직접 등장하거나 사용자가 정사로 승인하기 전 내부 후보로 유지한다.
- 신규 공개 Dossier 11건 생성, V staging과 U publication live 적용, DB 재조회, 역할별 report→wiki/personnel/catalog 및 역참조, 조직 카드·이미지 consumer 검증은 별도 운영 승인 뒤 수행한다.
