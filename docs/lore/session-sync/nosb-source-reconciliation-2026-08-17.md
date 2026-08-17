---
title: NOSB session source reconciliation 2026-08-17
category: session-sync
tags: [NOSB, source-reconciliation, audit, stargate-lore]
updated: 2026-08-17
source: stargate-lore
---

# NOSB 세션 원본 재대조 감사

2026-08-17 현재 확보된 정규 세션 10건과 별도 미니 세션 6건을 원본 보존본에서 다시 추출하고, 현재의 보고서·위키·Dossier·관계·성격·시각 자료·catalog 근거와 대조했다. 이 문서는 원본과 영속 데이터 사이의 차이를 기록하는 내부 감사 문서다. 실제 세션 로그가 아닌 기획 문서는 정사 근거에서 제외했고, 보상표·사용자 제공 설정·운영 결정처럼 로그 밖의 출처가 있을 수 있는 값은 자동 삭제하거나 덮어쓰지 않았다.

## 범위와 방법

- 원본 19개 PDF를 페이지 단위로 텍스트 추출하고 첫·중간·끝 및 쟁점 페이지를 렌더링해 육안 확인했다.
- 정규 세션 10건과 미니 세션 6건을 `sessionId` 기준으로 기존 seed payload, coverage, 공개 보고서·wiki mirror, 관련 Dossier와 대조했다.
- source-confirmed 오기·과장·링크·시각 자료 의미만 `StarGateV2/scripts/seed-payloads/nosb-source-reconciliation-2026-08-17.json`에 focused repair로 준비했다.
- 라이브 DB는 읽기 전용으로 현재값만 확인했다. 이번 패스에서는 credits, inventory, catalog, stock, holding, trade, notification을 포함한 라이브 mutation을 실행하지 않았다.

## Source Profile

| sessionId | source profile | SHA-256 | availability / audit |
|---|---|---|---|
| `NOSB-S1E1-ORDER` | 108/108쪽 | `edd06296d90d5b11fa045365af75154d75918aa7d4916837dd120a5bfc69df35` | available / complete |
| `NOSB-S1E1-MINI` | 79/79쪽 | `e6d5f1020903314a77338401e3414dca1426023ef9546ee253e338a6cff28d41` | available / complete |
| `NOSB-S1E2-CHOICE` | 초장축 1쪽 전체, 판독 시 203개 가상 구간으로 분할 | `a98dc3d88f9abbf36bfe6a60140efae6070b2ad391863f7fbd8ea0c4be136d38` | available / complete |
| `NOSB-S1E2-MINI` | 153/153쪽 | `0635bf7866d9557930d6186fc9bb76873ae2aa3e608a41672bcd1742a420feeb` | available / complete |
| `NOSB-S1E3-PHANTOM` | 246/246쪽 | `c2a38429a684699a2209c335a9bc3601e430f45b41cc760d26ff2d7e48c1c26c` | available / complete |
| `NOSB-S1E4-PRATO-PART1` | 93/93쪽 | `730775c772631a8f81561cf703ab47000dd9d77a97e39a8b8c15ebe9a04e30b9` | available / complete |
| `NOSB-S1E4-PRATO-PART2` | 157/157쪽 | `b3800fc46be012bb0b25f074b9e78e02b01483214a0970bd8a5d0a325169364c` | available / complete |
| `NOSB-S1E5-EVIL-PART1` | 112/112쪽 | `17e0012aa352914b6440d630f3c52bce3befae552381159bb2b1dd0172a69b0d` | available / complete |
| `NOSB-S1E5-EVIL-PART2` | 113/113쪽 | `b9de10f69d8be778796b046278042f2351cb3b89ac4f0209af683fbcc1fe33f0` | available / complete |
| `NOSB-S1E6-TURNING-POINT-PART1` | 125/125쪽 | `4d3d28c9b3c4db4d5e9b940b2c3cbc95dab2f5bc97528503a04f4ab2f9c336a6` | available / complete |
| `NOSB-MINI-S1E1-NEW-DUBLIN` | 전편 제공본 100쪽은 원본 쪽번호 8~107, 후편 44/44쪽; 원본 1~7·108~114쪽 결손 | `d00a1eac20c0ebafebc1e7bd7ee40cbb525d37b240b2d6a2495689071ffaf335` / `27d3a885076634922bd0cb64d96fa488d13fed6adc5544d447a4fc03ef4615fd` | partial / partial |
| `NOSB-MINI-MINI-LEGACY` | 88/88쪽 + 56/56쪽 | `be1ac81fd3738cc9c2c81e769beb740d71d4ed33b6e9a218092e763f7cfd37c9` / `32e354947092d5f183b10020bd789b0874233192336777bada9d1d203b88e50a` | available / complete |
| `NOSB-MINI-5959-CONTAINMENT` | 73/73쪽 | `8a7c235612a35b439650245433d7b5d7d48f3abbf129c195f4e8d35a295bc69a` | available / complete |
| `NOSB-MINI-HWAYANGYEONHWA` | 111/111쪽 | `584e057f3eb4673b627912318e72c644909714b6404db853ec2a5753a3de8418` | available / complete |
| `NOSB-MINI-ROMANTID` | 145/145쪽 | `ad82116a0d13874b31f53c8516074b7d6096a0c64794e7fc01ba2990393783c0` | available / complete |
| `NOSB-MINI-NEVED` | 전편 106/106쪽 + 후편 279/279쪽 | `d5329448eb1ea94d131ce32230be41378caacb227916b44c4aaacc5542b765d2` / `1034c996ae38b209e21d65eada7e930159152f715782798435670c97fcd44ac0` | available / complete |

## 비세션 문서 격리

`6-10화 요약` 문서(SHA-256 `d2e5a93e428cea08ccb9701d8565a82547dc6c2a5781fd3ab8b76f6f091f1380`)는 실제 플레이 로그가 아니라 미래 분기와 장면을 제안한 `design-proposal / candidate-only`다. 현재 S1E6 데이터에서 이 문서에만 존재하는 이집트·노화 방지·8화까지의 계획·망자 분기 등의 유입은 발견되지 않았다. 이 문서는 `lore_sources`의 세션 로그로 등록하지 않으며 S1E7 이후의 정사 근거로도 사용하지 않는다.

## Source-confirmed Repair Set

| 근거 | 영속 표면 | 준비한 보정 | 상태 |
|---|---|---|---|
| S1E2 원본의 canonical code `ZULU-0040` | S1E2 report / wiki | 보상 문단의 `ZULU-040` 오기를 `ZULU-0040`으로 정규화 | prepared; live 미적용 |
| S1E2 mini에서 확인되는 파괴 대상은 송사리 호 | S1E2 mini report / wiki | 존 오푸스가 노부스 오르도까지 파괴하려 했다는 과장을 제거 | prepared; live 미적용 |
| S1E3 p204·235·238의 `크리스토프`·가면 상실 뒤 `실험체 88` 호명·`죽은 지휘자` | S1E3 report / wiki, golden-dawn wiki | 지휘자와 실험체 88이 동일 인물이며 해당 국면에서 사망했다는 공개 서술로 정밀화 | prepared; live 미적용 |
| S1E4 Part2 p156 장면은 검은 연기 반응이 아니라 닥터 모스 사망 | S1E4 Part2 report / wiki visual caption | 기존 소비처가 가리키는 장면의 alt·caption을 닥터 모스 사망으로 교정; catalog에는 연결하지 않음 | prepared; live 미적용 |
| MINI02 원문 명칭은 `스페이스 33` | MINI02 report related docs | 근거 없는 `스페이스 제로` 링크를 제거하고 canonical entity 미확정의 일반 텍스트로 보존 | prepared; live 미적용 |
| MINI04의 기존 canonical wiki slug | MINI04 report / wiki | `슬피 우는 것` typed link 및 `UNYEON`, `CLAIRVOYANCE` structured refs 추가 | prepared; live 미적용 |
| S1E6 p29~30 총기 몸싸움→발사 주체 미상 총성→NOGA 화염병→오르도 기관총 | S1E6 report / wiki, `CLOWN` appearance | `NOGA 시위대의 총격` 단정을 역할과 순서가 드러나는 문장으로 교정 | prepared; live 미적용 |

## Session-by-session Outcome

| sessionId | 대조 결과 |
|---|---|
| `NOSB-S1E1-ORDER` | 주요 사건은 대체로 일치한다. 전체 재생 가능한 base payload와 다수 참가자의 역링크가 없어 graph 복구는 별도 후보로 남겼다. |
| `NOSB-S1E1-MINI` | 사건 흐름은 일치한다. 익명 `스페이스 제로 CEO`를 `JOHAN_SMITH`로 잇는 값은 기존 GM/canon 근거이며 로그 직접 실명 확인과 분리해야 한다. |
| `NOSB-S1E2-CHOICE` | canonical code 오기를 보정 대상으로 확정했다. 보상·전리품 수치는 로그 밖 출처 가능성이 있어 유지한 채 차단했다. |
| `NOSB-S1E2-MINI` | 존 오푸스의 파괴 대상 과장을 보정 대상으로 확정했다. |
| `NOSB-S1E3-PHANTOM` | 지휘자·실험체 88의 동일 인물 축과 사망을 공개 서술에 반영하도록 확정했다. Dossier 병합은 별도 결정이다. |
| `NOSB-S1E4-PRATO-PART1/PART2` | 사건 흐름은 일치한다. 검은 연기 장면으로 분류된 이미지 1건의 실제 의미를 닥터 모스 사망으로 교정한다. |
| `NOSB-S1E5-EVIL-PART1/PART2` | 최종 live 인사 상태는 맞다. Part1 payload가 Part2의 바자로프 감독관 승진 결과를 선반영한 provenance 경계만 문서화했다. |
| `NOSB-S1E6-TURNING-POINT-PART1` | NOGA가 최초 총격을 했다는 단정을 제거한다. 나머지 실제 로그와 기획 문서 사이의 확정 오염은 발견되지 않았다. |
| `NOSB-MINI-S1E1-NEW-DUBLIN` | 제공 원본에 명시된 결손 구간을 기록했다. `ZULU_269` 출현은 로그가 아니라 사용자 제공 프로필 근거라 자동 제거하지 않는다. |
| `NOSB-MINI-MINI-LEGACY` | `스페이스 33`을 스페이스 제로로 연결한 false link를 제거한다. Antonio의 내부 권한은 별도 판단으로 남긴다. |
| `NOSB-MINI-5959-CONTAINMENT` | 현재 live 번호와 formatter는 `MINI03`으로 정상이다. 과거 base payload의 `07`은 역사적 오류지만 provenance hash를 보존하기 위해 수정하지 않는다. |
| `NOSB-MINI-HWAYANGYEONHWA` | 핵심 사건은 일치한다. typed wiki link와 report graph refs 누락만 보정한다. |
| `NOSB-MINI-ROMANTID` | 핵심 사건·소다 2회·책과 책갈피 기록이 기존 coverage와 일치한다. 신규 영속 수정 없음. |
| `NOSB-MINI-NEVED` | 핵심 사건·소다 1회·20만 크레딧 대사·후속 쿠키가 일치한다. 2026-08-16 초상 repair 뒤 낡은 coverage 원장만 최종 상태로 갱신한다. |

## Candidate-only / Blocked Register

| 항목 | 판정 | 이유 / 다음 근거 |
|---|---|---|
| S1E1 full report/wiki replay payload 및 참가자 역링크 | candidate-only | 현재 live projection을 보존한 완전한 base payload 재구성이 필요 |
| S1E2 호의도 2·포인트 100·항생제·스팀팩, 이동식 날개 전체 회수 | blocked | 로그는 공식 보상 없음, 화이트로즈 샘플 약속, 일부 날개조각만 확인; 별도 GM 보상표 필요 |
| S1E3 지휘자/실험체 88 Dossier 병합·primary codename·초상 | blocked | 동일 인물은 확인됐지만 canonical Dossier 선택과 portrait 결정은 사용자 승인 필요 |
| S1E3 시신·음반축 3·가면 5·도살견 도본 전리품 | blocked | 원본에서 해당 회수·수량이 확인되지 않고 preview asset도 없음; 별도 보상표 필요 |
| S1E4 검은 연기 전용 장면 이미지 | blocked | 실제 반응 구간에는 보고서용 전체 장면 프레임이 없음; 닥터 모스 사망 장면을 sample/catalog에 재사용하지 않음 |
| S1E5 Part1 바자로프 최신 직책 | skipped | live의 감독관/M 상태는 Part2 근거로 맞으므로 되돌리지 않고 provenance만 분리 |
| S1E6 `WHITE_ROSE_R == 리처드` | blocked | 하얀 장미 연출만 있고 직접 동일인 확인이 없음 |
| MINI01 `ZULU_269` 출현 | candidate-only | 원본 화자·등장 근거는 없지만 사용자 제공 프로필 출처가 있어 자동 제거 금지 |
| MINI02 `ANTONIO_ORSINO.agentLevel = V` | blocked | 외부 이사회 회원·후원자 직함을 내부 clearance로 변환할 근거가 없음; 사용자 결정 필요 |
| MINI03 제한 연구 표본 분류 | candidate-only | 로그에는 PET 병 임시 격리와 이송만 확인; 운영 설계 provenance와 세션 사실을 분리해야 함 |
| MINI06 portrait replay 순서 | candidate-only | 최종 초상 repair는 적용됐지만 초기 creation payload만 재생하면 Unknown 초상으로 퇴행할 수 있어 canonical replay 정리가 필요 |

## Economy / Stock Boundary

- 이번 대조에서 기존 경제·주식 영속 상태를 소급 변경할 신규 승인 근거는 만들지 않았다.
- S1E1·S1E3의 크레딧 대사는 historical gameplay ledger 후보일 뿐이며 baseline·idempotency·사용자 승인 없이 적용하지 않는다.
- S1E2의 SPZ 제안은 거절됐고 S1E2 mini의 주가 선택지는 반사실 분기이므로 holding, trade, price, market wire를 변경하지 않는다.
- MINI05 소다 2회는 기존 적용 이력만 보존하고 재실행하지 않는다. MINI06 소다 1회는 baseline과 별도 승인 전까지 차단하며, 20만 크레딧 대사는 기존 사용자 결정대로 lore-only다.
- catalog 후보의 정체·수량·소유권이 불완전한 경우 신규 row나 inventory 수량을 만들지 않는다.

## Prepared Apply Boundary

- prepared payload: `StarGateV2/scripts/seed-payloads/nosb-source-reconciliation-2026-08-17.json`
- targets: `session_reports`, `wiki_pages`, `characters.CLOWN`의 focused prose/link/graph repair만 포함
- excluded: Dossier identity merge, clearance, portrait, credits, inventory, catalog, stocks, holdings, trades, notifications
- live execution: 미실행. 별도 승인 전에는 dry-run과 read-only 재조회만 허용한다.

## Verification Contract

- payload JSON parse와 seed dry-run에서 모든 focused filter가 기존 대상 1건을 찾고 의도한 before→after만 만드는지 확인한다.
- coverage audit, static payload/reference audit, NPC/personality/visual ledger 검사를 다시 실행한다.
- S1E4 report와 wiki mirror의 이미지 경로·순서·alt·caption parity 및 검은 연기 catalog 비연결을 확인한다.
- S1E6 문구가 report 본문·highlight·wiki·`CLOWN` appearance에서 같은 역할 구분을 유지하는지 확인한다.
- 라이브 적용이 별도 승인될 경우에만 payload를 실행하고, 즉시 DB 재조회와 ERP report/wiki/Dossier graph 소비처를 확인한다.
