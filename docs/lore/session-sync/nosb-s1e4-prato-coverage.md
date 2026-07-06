---
title: NOSB-S1E4-PRATO session sync coverage
category: session-sync
tags: [NOSB-S1E4-PRATO-PART1, NOSB-S1E4-PRATO-PART2, S1E4, stargate-lore]
updated: 2026-07-06
source: stargate-lore
---

# NOSB-S1E4-PRATO Sync Coverage

이 문서는 공개 위키가 아니라 `stargate-lore` 동기화 감사를 위한 내부 coverage matrix다. 목적은 `NOSB-S1E4-PRATO-PART1` 및 `NOSB-S1E4-PRATO-PART2` 보존 로그에서 추출한 대상이 작전보고서, 위키, 카탈로그, Dossier, 관계 서사, 경제/주식 축 중 어디에 반영됐는지와 어디가 후보/미해결인지 분리하는 것이다.

## Source Profile

- Source: NOVUS ORDO `4부 · 메인` PDF, 93 pages, custom VTT export.
- Document id: `NO-MPTXPTER-U7PN`.
- Header timestamp: `2026-05-31 15:28:39`; ERP 진행일은 기존 프라토 1부 레코드와 맞춰 `2026-06-01`로 유지한다.
- Detected session key: `NOSB-S1E4-PRATO-PART1`; report number preset: regular `04`.
- Extraction: pdfplumber text extraction produced 1,375 source records; normalized parser output is 1,364 chat entries, 9 dice entries, 2 system/metadata entries.
- Visual check: rendered pages 1, 46, and 93 matched the VTT card layout, speaker/time boundaries, and session end marker.
- Parser warning: repeated FontBBox warnings were observed, but no empty pages or obvious Korean text corruption appeared in the representative render/text comparison.

## Current-session Anchor Set

| axis | anchor |
|---|---|
| session | `NOSB-S1E4-PRATO-PART1`, `작전 보고서 S1E4: 프라토 1부` |
| primary title | 오퍼레이션 프라토 |
| location | 브라질 미나스제라이스 바르지냐 인근, 브라질 군 공항, 바르지냐 오르도 중계기지 |
| main entity | 뒤집어진 양말 |
| main phenomenon | 인버전 위험, 광원 위장, 광원화 바이러스 약점 후보 |
| decisive contacts | 존 웡, 트웰브 잔여망, 미 공군, 브라질 당국, 세계이사회 |
| operation outcome | 개체 식별, 현장 투입, 이동식 합류, 비행체의 이동식 후미 충돌 |
| continuation boundary | 충돌 이후 교전·포획·닥터 모스 사망은 `NOSB-S1E4-PRATO-PART2` 소스 범위로 분리한다. |

## Part2 Source Profile

- Source: NOVUS ORDO `4부 · 메인` PDF, 157 pages, custom VTT export.
- Document id: `NO-MQDZR7X9-KYCE`.
- Header timestamp: `2026-06-14 16:21:07`; ERP 진행일은 기존 프라토 2부 레코드와 맞춰 `2026-06-15`로 유지한다.
- Detected session key: `NOSB-S1E4-PRATO-PART2`; report number preset: regular `04.5`.
- Extraction: bundled Python `pdfplumber` text extraction produced 97,924 characters across 157 pages. Local `pdftotext` was unavailable, so bundled runtime extraction was used.
- Visual check: rendered pages 1, 78, and 157 matched the VTT card layout, Part2 mid-log `뒤집어진 양말` cutscene image, and session end marker.
- Parser warning: repeated FontBBox warnings were observed, but representative render/text comparison showed no empty page or obvious Korean text corruption.

## Part2 Current-session Anchor Set

| axis | anchor |
|---|---|
| session | `NOSB-S1E4-PRATO-PART2`, `작전 보고서 S1E4: 프라토 2부` |
| primary title | 오퍼레이션 프라토, 챕터 2 |
| location | 브라질 미나스제라이스 바르지냐, 이동식 공중 전함, 바르지냐 라디오 시설 |
| main entity | 뒤집어진 양말 |
| main phenomenon | 광원화 바이러스, 인버전, 고주파 좌표 신호, 행동교정물질 반응 |
| decisive contacts | 네베드/타이거 감염자, 피펫, 마리아, 닥터 모스, 마가렛, 토와스키 |
| operation outcome | 뒤집어진 양말 무력화 및 회수 결정, 라디오 시설 일부 섭취 확인, 검은 연기 샘플 확보, 닥터 모스 사망 |
| continuation boundary | 닥터 모스 사망의 배후, 배신자 정체, 회수 후 격리/백신 연구 결과는 후속 소스 범위로 분리한다. |

## Part2 Coverage Matrix

| subject | source evidence | target surface | action | status |
|---|---|---|---|---|
| 프라토 2부 작전보고서 | p.2 title, p.12-p.14 missile reversal, p.65-p.67 high-frequency coordinates, p.130-p.143 behavior-correction/harpoon capture, p.149-p.156 aftermath | `session_reports.NOSB-S1E4-PRATO-PART2` | reportNumber `04.5` 유지, `뒤집어진 양말` image path를 full-frame report asset으로 보정, 관련 문서 명시 링크 추가, related wiki/personnel/catalog arrays 보강 | Applied |
| 프라토 2부 wiki mirror | report mirror content | `wiki_pages.s1e4-prato-part2` | report와 같은 full-frame image path 및 명시 링크 적용 | Applied |
| 바르지냐 라디오 시설 | p.65-p.67 좌표 신호, p.69-p.73 오염 라디오 시설 표적화, p.142-p.143 섭취/광원화 충돌 | `wiki_pages.varginha-radio-facility` | 독립 장소 위키 생성, 오염/섭취/후속 확인 대상 정리 | Applied |
| 바르지냐 오르도 중계기지 | Part1 base page + Part2 radio facility confirmation | `wiki_pages.varginha-ordo-relay-base` | Part2 확인 사항 섹션 추가, 라디오 시설과 동일성은 후보로 유지 | Applied |
| 뒤집어진 양말 | p.65-p.67 signal, p.137-p.143 capture/indigestion | `wiki_pages.inverted-sock` | 관련 문서 명시 링크에 라디오 시설, 행동교정물질, 검은 연기 샘플 추가 | Applied |
| 광원화 바이러스 | p.130-p.132 mental recovery/black smoke, p.143 behavior-correction collision | `wiki_pages.aurora-virus` | 관련 문서 명시 링크에 라디오 시설, 행동교정물질, 검은 연기 샘플, 감염자/피펫 추가 | Applied |
| 행동교정물질 | p.126-p.132 crown lineage discussion and injection, p.140-p.143 missile/collision | `master_items.behavior-correction-substance` | Part2 tags and notes added; no inventory grant or stock mutation | Applied |
| 광원화 검은 연기 샘플 | p.130-p.132 black smoke and sample acquisition | `master_items.aurora-virus-black-smoke-sample` | acquisition refined to Maria request + Pipette collection, tags expanded | Applied |
| 닥터 모스 | p.149-p.156 vaccine clue and death | `characters.DOCTOR_MOSS` | Part2 session appearance added; global status field not inferred because no shared character status enum was confirmed | Applied |
| 마가렛 / 사망 엔지니어 | p.43-p.44 first betrayal warning, p.153-p.156 warning before Moss death | `characters.MARGARET` | Part2 session appearance added; dead engineer remains unnamed and not created as a standalone character | Applied |
| 토와스키 / 스타크 | p.35-p.37 watch device adjustment and dummy target | `characters.TOWASKI`, `characters.CLOWN` | reciprocal sourced relation and Part2 session appearances added | Applied |
| 네베드 / 타이거 | p.130-p.132 behavior-correction injection and black smoke reaction | `characters.네베드`, `characters.TIGER298` | Part2 infection/recovery session appearances added | Applied |
| 피펫 | p.131 sample acquisition, p.138-p.139 harpoon use | `characters.PIPETTE` | Part2 sample/harpoon session appearance added | Applied |
| 해쉬 테거 | p.65-p.67 high-frequency coordinate analysis | `characters.INDEXER` | Part2 signal-analysis session appearance added | Applied |
| 마리아 | p.131 sample request, p.137-p.143 capture orders, p.149-p.152 Black Pyramid/recovery decision | `characters.MARIA` | Part2 command/capture session appearance added | Applied |
| 크로노스 | p.95-p.128 rollback thread, p.154 value/life prompt | `characters.TIME` | Part2 rollback session appearance added | Applied |
| dead engineer identity | p.43-p.44 and p.153-p.156 warnings | coverage only | identity, affiliation, and death context are insufficient for a Dossier | Candidate-only |

## Part2 Economy / Inventory / Stock Audit

| axis | sourced observation | mutation decision |
|---|---|---|
| Credits/rewards | No explicit reward or credit grant in Part2 source | No credit ledger mutation |
| Inventory grants | 행동교정물질 was deployed as operation resource, but no personal retention or GM-approved inventory grant appears | No inventory mutation |
| Shop/equipment-shop | 토와스키 appears in a device adjustment/training cutscene, not a shop purchase or stock change | No shop mutation |
| Catalog | 행동교정물질 and 광원화 검은 연기 샘플 are research/catalog surfaces already present | Catalog lore/tags updated only |
| Stock market | 토와스키 company/person appears, but no market-visible price, ticker, public incident, or trade approval appears | No stock price/history/market-wire mutation |

## Lorebook Coverage Matrix

| subject | source evidence | target surface | action | status |
|---|---|---|---|---|
| 프라토 1부 작전보고서 | p.1 title, p.30-p.39 briefing, p.49-p.93 field approach | `session_reports.NOSB-S1E4-PRATO-PART1` | 기존 레코드 유지, reportNumber `04` 고정, 관련 문서 명시 링크 보정 | Applied in follow-up payload |
| 프라토 1부 wiki mirror | report payload and wiki mirror | `wiki_pages.s1e4-prato-part1` | comma-only 관련 문서를 renderer 명시 링크로 보정하고 작전보고서 시각 자료 block parity 유지 | Applied in follow-up payload |
| 뒤집어진 양말 | p.32-p.34 briefing, p.90-p.93 first contact | `wiki_pages.inverted-sock`, report related link | 기존 entity page와 연결, 1부에서는 최초 식별/위험성/충돌까지만 source-confirmed | Merged into existing surface |
| 광원화 바이러스 | p.73-p.78 status/weakness acquisition | `wiki_pages.aurora-virus`, report related link | 1부에서는 냉기 약점 후보와 작전소/감염성 현상 단서만 확인 | Merged; later reaction/sample facts require Part2 source |
| 존 웡 | p.3-p.4 Kimlee contact, Sector D and Moriarty mention; user-provided CIA profile image/fields | `characters.JOHN_WONG`, report/wiki/personnel links | CIA 고위 요원 Dossier 등록, 이미지 적용, Part1 report/wiki 관련 문서 명시 링크 연결, KIMLEE 관계/세션 등장 역링크 작성 | Applied in follow-up payload |
| 트웰브 잔여망 | p.30-p.32 briefing | report prose | 미국 비밀 정부 잔여망과 UFO 자료 이관 배경으로 보존 | Merged; no standalone page |
| 호주 사태와 파이브 아이즈 균열 | p.2-p.8 media/political pressure; user note: 지휘자 등장 세션 관련 사태 | report prose | 노부스 오르도 대외 압박 배경으로 보존; 독립 정리는 해당 세션 source pass에서 분리 | Merged; no standalone page |
| 바르지냐 작전소 사무국 연락 두절 | p.31 briefing | `wiki_pages.varginha-ordo-relay-base`, report/wiki related link | 작전 배경으로 보존하되 현장 거점/중계기지 독립 위키 생성, Part1 report/wiki mirror 관련 문서에 명시 링크 추가 | Applied in follow-up payload |
| 이동식 | p.17-p.23 internal scenes, p.87-p.93 sortie/first contact | `characters.LEE DONGSIK`, report participant/link | Dossier event link 유지, report visual role은 existing asset으로만 사용 | Applied |
| AGENT/NPC participants | speaker set and existing codename map | `characters.lore.appearsInEvents` | 확인된 참가자/등장 인물에 `NOSB-S1E4-PRATO-PART1` addToSet | Applied |
| 백진연/운연 sample scene | p.23-p.26 sample test | report context, catalog candidate | `극비 샘플 조직 54번`은 표본명/보관/효과가 불충분하고 사용자 지시상 우선 작전 배경으로만 보존 | Candidate-only; catalog pass deferred |
| 오르도 주, 식당/파스타 scene | p.1-p.2 cafeteria opening | report flavor only | 음식/주류 카탈로그로 승격하지 않음 | Skipped; episode-only |
| 행동교정물질 / ZULU-0040 왕관 | not directly confirmed in this PDF | existing S1E4/previous payloads | 프라토 1부 관련 문서에서 제거; Part2 or prior archive surfaces에서만 유지 | Corrected for Part1 |
| 토와스키 | not present in this PDF | existing Part2/personnel surface | 프라토 1부 관련 문서에서 제거 | Corrected for Part1 |
| Part2 surfaces | existing payload/DB only, not current PDF | `NOSB-S1E4-PRATO-PART2` records | 이번 source sync에서 재적용하지 않음 | Not touched by current-source pass |

## Dossier Event Link Pass

| visible name in source | canonical target | action | status |
|---|---|---|---|
| Mr.오드 | `MR_ODD` | add `NOSB-S1E4-PRATO-PART1` | Applied |
| 킴라박 리 | `KIMLEE` | add `NOSB-S1E4-PRATO-PART1` | Applied |
| 스타크 일로니손 | `CLOWN` | add `NOSB-S1E4-PRATO-PART1` | Applied |
| 츠키시로 쿠즈하 [유회] | `YUHOE` | add `NOSB-S1E4-PRATO-PART1` | Applied |
| 마리아 | `MARIA` | add `NOSB-S1E4-PRATO-PART1` | Applied |
| 마가렛 | `MARGARET` | add `NOSB-S1E4-PRATO-PART1` | Applied |
| 수잔 델라웨어 | `CLAIRVOYANCE` | add `NOSB-S1E4-PRATO-PART1` | Applied |
| 휘트모어 핀치 / 피펫 | `PIPETTE` | add `NOSB-S1E4-PRATO-PART1` | Applied |
| 해쉬 테거 | `INDEXER` | add `NOSB-S1E4-PRATO-PART1` | Applied |
| 키아나 오 캘러핸 | `네베드` | add `NOSB-S1E4-PRATO-PART1` | Applied |
| 시유 | `TIGER298` | add `NOSB-S1E4-PRATO-PART1` | Applied |
| 크로노스 | `TIME` | add `NOSB-S1E4-PRATO-PART1` | Applied |
| 백진연 / 운연 | `UNYEON` | add `NOSB-S1E4-PRATO-PART1` | Applied |
| 오틸리아 발트만 | `OTILIA` | add `NOSB-S1E4-PRATO-PART1` | Applied |
| 우디 (03) | `WD-(𝓃)` | add `NOSB-S1E4-PRATO-PART1` | Applied |
| 빅보이 / 박애솔 | `BIG BOY` | add `NOSB-S1E4-PRATO-PART1` | Applied |
| 닥터 모스 | `DOCTOR_MOSS` | add `NOSB-S1E4-PRATO-PART1` | Applied |
| 이동식 | `LEE DONGSIK` | add `NOSB-S1E4-PRATO-PART1` | Applied |
| 존 웡 | `JOHN_WONG` | create Dossier and add `NOSB-S1E4-PRATO-PART1` | Applied |

## Relationship Narrative Candidates

| from | to | beat | persistence target | status |
|---|---|---|---|---|
| 킴라박 리 | 존 웡 | 미국 측 접촉자가 섹터 D와 모리어티 대령을 언급하고 연락처를 남김 | operation report prose, `KIMLEE`/`JOHN_WONG` Dossier `lore.relations`, `lore.sessionAppearances` | Applied |
| Mr. 오드 | 현장팀 | 트웰브 잔여망 자료와 바르지냐 개체 회수 지시를 전달 | operation report, Dossier event links | Applied |
| 해쉬 테거 | 마가렛 | 외부활동/행동 풍부화 관찰 및 보호적 동행 | `INDEXER`/`MARGARET` Dossier `lore.relations`, `lore.sessionAppearances` | Applied in follow-up payload |
| 백진연/운연 | 극비 샘플 조직 54번 | 약품 테스트 중 검은 연기와 재생 반응 관찰 | coverage/catalog candidate | Candidate-only |
| 닥터 모스 | 이동식 | 이동식 공중 전함을 호출하고 바르지냐 중계기지 좌표로 출격 | operation report, Dossier event links | Applied |

## Economy / Inventory / Stock Audit

| axis | sourced observation | mutation decision |
|---|---|---|
| Credits/rewards | No explicit reward or credit grant in current PDF | No credit ledger mutation |
| Inventory grants | No GM-approved item retention or personal grant | No inventory mutation |
| Shop/equipment-shop | No shop stock or purchase/consumption approval | No shop mutation |
| Catalog sample | `극비 샘플 조직 54번` appears but lacks stable slug/name/effect/storage; user elected to pass for now | Candidate-only; no `master_items` row |
| Stock market | No listed-company event is source-confirmed in this PDF | No stock price/history/market-wire mutation |

## Asset Disposition

| asset role | source observation | action | status |
|---|---|---|---|
| report-cutscene | PDF contains VTT cards and character thumbnails, not standalone report illustrations | Do not extract or reuse as report art | Skipped |
| entity/report image | User-provided original full-frame `뒤집어진 양말` image, 1024x1536 | Re-encoded to `public/assets/wiki/entities/inverted-sock.webp`, `public/assets/session-reports/s1e4-prato/inverted-sock-close-contact.webp`, and cache-busting report visual `public/assets/session-reports/s1e4-prato/inverted-sock-full-frame.webp`; report/wiki inline figure CSS keeps foreground image contained while filling frame whitespace with the same image as a blurred backdrop | Applied |
| catalog preview | No exact sample/item preview for `극비 샘플 조직 54번` | Do not assign preview image | Candidate-only |
| personnel image | User-provided CIA profile image for 존 웡, 832x1216 RGBA | Re-encoded to `public/assets/npcs/John-Wong-profile.webp`; stored in `characters.JOHN_WONG.previewImage` and `lore.mainImage` | Applied |

## ERP Gap Map

| target | status | issue | action |
|---|---|---|---|
| `/erp/sessions/report` | verified | Part1 record exists and is updated; explicit related links include Part2/wiki/personnel targets including JOHN_WONG and `varginha-ordo-relay-base`; `뒤집어진 양말` visual uses full-frame asset path | DB re-read and authenticated render verification completed on 2026-07-06 |
| `/erp/wiki` | verified | Part1 wiki mirror exists and is updated; report images are mirrored with full-frame asset path; explicit related links include JOHN_WONG and `varginha-ordo-relay-base`; new Varginha place wiki exists | DB re-read and authenticated render verification completed on 2026-07-06 |
| `/erp/wiki/catalog` | no-action | Current PDF lacks approved catalog item fields | Keep unchanged |
| `/erp/personnel` | verified | Event links are idempotently added for confirmed existing records; `INDEXER` <-> `MARGARET` relation/session appearance now structured | DB re-read and relation-tab authenticated render verification completed on 2026-07-06 |
| `/erp/stock` | no-action | No stock-visible event | Keep unchanged |
| economy surfaces | no-action | No approved economy mutation | Keep unchanged |
| John Wong | verified | Canonical Dossier registered as `JOHN_WONG`; CIA contact is now classified as `MILITARY` / `USA` after the military sub-org alignment pass | Personnel render and reverse graph links verified |
| sample 54 | candidate-only | No stable item fields or registration approval; user elected to pass for now | Keep as operation background only until new source/GM decision |

## Applied Writes In This Pass

- Follow-up payload: `StarGateV2/scripts/seed-payloads/zz-s1e4-prato-part1-link-hygiene.json`.
- Follow-up payload: `StarGateV2/scripts/seed-payloads/zz-s1e4-prato-john-wong-dossier-linkage.json`.
- Follow-up payload: `StarGateV2/scripts/seed-payloads/personnel-military-usa-noga-alignment-2026-07-03.json`.
- Follow-up payload: `StarGateV2/scripts/seed-payloads/zz-s1e4-prato-varginha-relation-image-fit.json`.
- Follow-up payload: `StarGateV2/scripts/seed-payloads/zz-s1e4-prato-part2-source-sync.json`.
- NPC spec: `StarGateV2/docs/spec/npc/john-wong.md`.
- NPC asset: `StarGateV2/public/assets/npcs/John-Wong-profile.webp`.
- Report image asset: `StarGateV2/public/assets/session-reports/s1e4-prato/inverted-sock-full-frame.webp`.
- Renderer fix: `StarGateV2/lib/wiki-render.ts` now treats explicit-link labels as plain text and supports bracketed labels.
- Renderer figure fit fix: `StarGateV2/lib/wiki-render.ts`, `StarGateV2/app/(erp)/erp/sessions/report/[id]/page.module.css`, and `StarGateV2/app/(erp)/erp/wiki/[id]/page.module.css` now preserve the full foreground image and fill wide frame whitespace with the same image as a blurred backdrop.
- Report detail link target fix: `StarGateV2/app/(erp)/erp/sessions/report/[id]/page.tsx` now includes non-current report targets so `[[report:...]]` links render as report anchors instead of raw markup.
- Report map label fix: `StarGateV2/app/(erp)/erp/sessions/report/ReportsClient.tsx` now gives `04` and `04.5` separate label centers so their expanded cards do not overlap on the shared Varginha point.
- Coverage note: `docs/lore/session-sync/nosb-s1e4-prato-coverage.md`.
- README index update: `docs/lore/README.md`.

## Post-write Verification

- Seed payload dry-run: 20 payloads all resolved to existing update targets.
- Seed payload write: `session_reports.NOSB-S1E4-PRATO-PART1`, `wiki_pages.s1e4-prato-part1`, and 18 `characters` records updated with `textIntegrity: ok`.
- DB re-read: report `_id=6a462ca158ca8c543f61b6a3`, wiki `_id=6a462ca158ca8c543f61b6a4`.
- Report fields: `reportNumber=04`, `updatedAt=2026-07-03T00:00:00.000Z`, `locationLabel=브라질 미나스제라이스 / 바르지냐`, `mapPrecision=estimated`.
- Wiki fields: `category=작전 보고서`, `isPublic=true`, tags include `NOSB-S1E4-PRATO-PART1`, `S1E4`, `프라토`, `바르지냐`, `뒤집어진양말`, `광원화바이러스`.
- Explicit link target check: `NOSB-S1E4-PRATO-PART2`, `wiki_pages.inverted-sock`, `wiki_pages.aurora-virus`, `characters.MR_ODD`, `characters.KIMLEE`, `characters.DOCTOR_MOSS`, and `characters.LEE DONGSIK` exist.
- Dossier event re-read: all 18 checked codenames include `NOSB-S1E4-PRATO-PART1`; missing set is empty.
- Related-section cleanup: Part1 related sections no longer contain unsupported `행동교정물질`, `ZULU-0040`, or `토와스키` anchors.
- Catalog/economy boundary check: `master_items` has 0 rows matching `극비 샘플 조직 54번`; no catalog/economy/stock mutation was introduced.
- Public prose scan: `check_lore_output.py --public-text` passed for the saved report/wiki text; raw local path, source filename, parser name, payload wording, and no-op economy/stock language were not found.
- Browser-authenticated ERP render verification: `/erp/sessions/report/6a462ca158ca8c543f61b6a3` and `/erp/sessions/report/6a462ca158ca8c543f61b6a5` render the `뒤집어진 양말` images from 1024x1536 full-frame assets with preserved 0.667 ratio; `/erp/wiki/6a462ca158ca8c543f61b6a7` infobox uses `object-fit: contain` for the same asset.
- John Wong payload dry-run/write: direct `node --experimental-strip-types scripts/upsert-seed-payload.ts` was used because `pnpm run` was blocked by the workspace `approve-builds` policy; `characters.JOHN_WONG` inserted, `KIMLEE`, Part1 report, and Part1 wiki updated.
- John Wong DB re-read: `characters.JOHN_WONG` exists with `factionCode=MILITARY`, `department=USA`, `previewImage=/assets/npcs/John-Wong-profile.webp`, `lore.mainImage=/assets/npcs/John-Wong-profile.webp`, `appearsInEvents=["NOSB-S1E4-PRATO-PART1"]`, 1 relation, and 1 session appearance.
- Reverse graph re-read: `KIMLEE` now has a sourced `JOHN_WONG` relation and Part1 session appearance; Part1 report/wiki related sections include `[[personnel:JOHN_WONG|존 웡]]` and no longer leave 존 웡 as a candidate-only prose note.
- Renderer/link hygiene: explicit report/personnel labels are rendered as anchors rather than raw `[[...]]` markup; bracketed personnel labels remain parseable.
- Part1 wiki mirror image parity: `/erp/wiki/6a462ca158ca8c543f61b6a4` retains the two report visuals from `/assets/session-reports/s1e4-prato/...` in local Markdown image form.
- Browser-authenticated ERP render verification after the John Wong pass: `/erp/wiki/6a462ca158ca8c543f61b6a4`, `/erp/sessions/report/6a462ca158ca8c543f61b6a3`, and `/erp/personnel/6a47640a58ca8c543f6207da` passed with admin credentials. No raw `[[report:...]]`/`[[personnel:...]]` markup or localhost wiki URL text remained; Part2 report and John Wong anchors resolved; John Wong image loaded as 832x1216.
- Render screenshots: `/Users/flitto/.codex/tmp/stargate-lore-prato-john-wong/wiki-part1.png`, `/Users/flitto/.codex/tmp/stargate-lore-prato-john-wong/report-part1.png`, `/Users/flitto/.codex/tmp/stargate-lore-prato-john-wong/john-wong-dossier.png`.
- Military sub-org alignment dry-run/write: `personnel-military-usa-noga-alignment-2026-07-03.json` keeps `JOHN_WONG`/`WEXLER` under `MILITARY` + `USA` and `PERK_ESHHALL` under `MILITARY` + `NOGA`. The prior `IGRIT` NOGA classification was corrected because the New Dublin/Neon Valkyrie record only supports an IGRIT-to-NOGA backer/cleanup implication, not direct NOGA membership.
- IGRIT realignment dry-run/write: `personnel-igrit-new-dublin-realignment-2026-07-04.json` updated `IGRIT` to `CIVIL` + `NEW_DUBLIN`, removed `IGRIT` from `factions.MILITARY.notableMembers`, removed `IGRIT` from the military wiki related line, and added a NOGA wiki note that IGRIT is not confirmed as a NOGA member.
- IGRIT realignment DB re-read: `IGRIT` is `CIVIL/NEW_DUBLIN`; `NOGA` has only `PERK_ESHHALL`; `factions.MILITARY.notableMembers` is `WEXLER`, `JOHN_WONG`, `PERK_ESHHALL`; the NOGA wiki includes the non-membership classification note.
- Browser-authenticated ERP render verification after IGRIT realignment: `/erp/personnel?group=CIVIL&sub=NEW_DUBLIN`, `/erp/personnel?group=MILITARY&sub=NOGA`, `/erp/personnel/6a2991383128f81ed58ead0c`, and `/erp/wiki/6a29913a3128f81ed58ead10` passed with admin credentials and no console errors.
- IGRIT/New Dublin render screenshots: `/Users/flitto/.codex/tmp/stargate-lore-igrit-new-dublin/personnel-civil-new-dublin.png`, `/Users/flitto/.codex/tmp/stargate-lore-igrit-new-dublin/personnel-military-noga.png`, `/Users/flitto/.codex/tmp/stargate-lore-igrit-new-dublin/igrit-dossier-new-dublin.png`, `/Users/flitto/.codex/tmp/stargate-lore-igrit-new-dublin/wiki-noga-igrit-note.png`.
- Varginha/relation/image-fit payload dry-run/write: `zz-s1e4-prato-varginha-relation-image-fit.json` inserted `wiki_pages.varginha-ordo-relay-base`, updated Part1 report/wiki image path and related links, and updated `INDEXER`/`MARGARET` relation/session appearance records.
- Varginha/relation/image-fit DB re-read: report related wiki slugs are `aurora-virus`, `inverted-sock`, `varginha-ordo-relay-base`; Part1 report/wiki use `/assets/session-reports/s1e4-prato/inverted-sock-full-frame.webp`; Part1 wiki has a single `JOHN_WONG` related entry; `INDEXER` and `MARGARET` each have one reciprocal Part1 relation and one Part1 session appearance.
- Public prose scan after Varginha/relation/image-fit pass: `check_lore_output.py --public-text` passed for saved Part1 report, Part1 wiki mirror, and `varginha-ordo-relay-base` wiki content.
- Browser-authenticated ERP render verification after Varginha/relation/image-fit pass: `/erp/sessions/report/6a462ca158ca8c543f61b6a3` and `/erp/wiki/6a462ca158ca8c543f61b6a4` render the `뒤집어진 양말` image as 1024x1536 full-frame foreground at preserved 0.667 ratio with `object-fit: contain` and non-cropped blurred frame backdrop; `/erp/wiki/6a4b050199f4aaa100f4ed68` renders Varginha confirmed/candidate sections and report/wiki/personnel links; `/erp/personnel/69eb10114a0f897d60868ec0` and `/erp/personnel/69f196acf7691fd29260a5d0` relation tabs render the reciprocal `보호적 동행` relation.
- Render screenshots: `/Users/flitto/.codex/tmp/stargate-lore-prato-varginha/final-report-part1.png`, `/Users/flitto/.codex/tmp/stargate-lore-prato-varginha/final-wiki-part1.png`, `/Users/flitto/.codex/tmp/stargate-lore-prato-varginha/final-wiki-varginha.png`, `/Users/flitto/.codex/tmp/stargate-lore-prato-varginha/final-personnel-indexer-relations.png`, `/Users/flitto/.codex/tmp/stargate-lore-prato-varginha/final-personnel-margaret-relations.png`.
- Part2 source extraction: `/Users/flitto/Downloads/NOSB 4-2.pdf` was extracted with bundled Python `pdfplumber`; representative renders were checked for pages 1, 78, and 157.
- Part2 payload dry-run/write: `zz-s1e4-prato-part2-source-sync.json` updated 17 existing records and inserted `wiki_pages.varginha-radio-facility` (`_id=6a4b491099f4aaa100f4efc3`). All write verifications returned `textIntegrity: ok`.
- Part2 DB re-read: `session_reports.NOSB-S1E4-PRATO-PART2` is `_id=6a462ca158ca8c543f61b6a5`, `reportNumber=04.5`, `updatedAt=2026-07-06T00:00:00.000Z`, uses `/assets/session-reports/s1e4-prato/inverted-sock-full-frame.webp`, and has no localhost/raw markdown-link leakage.
- Part2 wiki DB re-read: `s1e4-prato-part2`, `inverted-sock`, `aurora-virus`, `varginha-radio-facility`, and `varginha-ordo-relay-base` all have explicit renderer links and no broken `[[report:...|[...](...)]` wrapper.
- Part2 catalog DB re-read: `behavior-correction-substance` has `NOSB-S1E4-PRATO-PART2` and 광원화/뒤집어진양말 tags; `aurora-virus-black-smoke-sample` records Maria request plus Pipette collection and follow-up observation notes.
- Part2 Dossier DB re-read: `INDEXER`, `PIPETTE`, `MARIA`, `MARGARET`, `TIME`, `네베드`, `TIGER298`, `DOCTOR_MOSS`, `TOWASKI`, and `CLOWN` each have a sourced `NOSB-S1E4-PRATO-PART2` session appearance; `TOWASKI` and `CLOWN` have reciprocal `장비 조정` relations.
- Part2 public prose scan: `check_lore_output.py --public-text` passed for saved Part2 report, Part2 wiki pages, catalog text, and Dossier extracts.
- Part2 browser-authenticated ERP render verification: using `admin / admin1234`, `/erp/sessions/report/6a462ca158ca8c543f61b6a5`, `/erp/wiki/6a462ca158ca8c543f61b6a6`, `/erp/wiki/6a4b491099f4aaa100f4efc3`, `/erp/wiki/6a4b050199f4aaa100f4ed68`, both catalog item pages, and the Doctor Moss/Towaski/Margaret/Pipette session appearance tabs rendered without raw `[[...]]` markup or console/page errors.
- Part2 report image verification: report detail image `뒤집어진 양말` loads `/assets/session-reports/s1e4-prato/inverted-sock-full-frame.webp` at natural size 1024x1536 with `object-fit: contain`, preserving the 0.667 source ratio inside the report frame.
- Part2 map render verification: `/erp/sessions/report` shows both `04` and `04.5`; after label fix the actual label boxes are `x=442.875,w=240` and `x=706.875,w=240`, overlap `0`.
- Part2 render screenshots: `/Users/flitto/.codex/tmp/stargate-lore-prato-part2/render-final/report-part2.png`, `/Users/flitto/.codex/tmp/stargate-lore-prato-part2/render-final/wiki-part2.png`, `/Users/flitto/.codex/tmp/stargate-lore-prato-part2/render-final/wiki-radio.png`, `/Users/flitto/.codex/tmp/stargate-lore-prato-part2/render-final/wiki-relay.png`, `/Users/flitto/.codex/tmp/stargate-lore-prato-part2/render-final/catalog-black-smoke.png`, `/Users/flitto/.codex/tmp/stargate-lore-prato-part2/render-final/catalog-behavior.png`, `/Users/flitto/.codex/tmp/stargate-lore-prato-part2/render-final/personnel-doctor-moss.png`, `/Users/flitto/.codex/tmp/stargate-lore-prato-part2/render-final/personnel-towaski.png`, `/Users/flitto/.codex/tmp/stargate-lore-prato-part2/render-final/personnel-margaret.png`, `/Users/flitto/.codex/tmp/stargate-lore-prato-part2/render-final/personnel-pipette.png`, `/Users/flitto/.codex/tmp/stargate-lore-prato-part2/render-final/report-map.png`.
